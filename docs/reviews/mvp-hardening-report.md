# MVP Hardening Report

```yaml
Title: mvp-hardening-report.md
Version: 1.0
Status: Final
Owner: Founder/CTO
Last Updated: 2026-07-29
Depends On:
  - docs/reviews/phase-13-review.md
Related ADRs: []
```

A cross-cutting readiness check performed after Phase 13, before starting Phase 14 (PWA/Mobile) - not a roadmap phase, no new features. The question this answers: is the MVP (Phase 0-13) actually ready for real use, or does it just pass its own regression scripts? Scope, per explicit direction: end-to-end scenario timing, API contract consistency, frontend code-level resilience (loading/empty/error/retry), real performance measurement, technical-debt scanning, and a security re-verification. Visual/interactive browser testing remains out of scope - no browser-automation tool is available in this session (the same disclosed limitation every phase review since Phase 10 has carried) - everything below is either a real, executed HTTP/DB check or a direct source-code read, never a guess about what the UI looks like.

---

## 1. End-to-End Scenario Verification

`scripts/verify-mvp-hardening.mjs` (new) - a single, real, timed run of the full first-time-user journey: register → login → verify workspace exists → connect (Mock Connector) → first message → inbox list → search → create + trigger an automation rule → create + trigger an `ai.classification`-conditioned rule → notification → logout → confirm session actually revoked (refresh fails) → re-login. **13/13 checks passing.**

One real bug was caught and fixed *in the test script itself* while building this: the first logout/refresh check initially failed because the script wasn't replaying the httpOnly session cookie Node's `fetch` doesn't auto-jar (unlike a browser) - once fixed to capture and replay `login`'s `Set-Cookie`, the check correctly confirmed logout really does revoke the session server-side (`refresh` after `logout` fails). This is recorded because it's exactly the kind of "test bug that looks like a product bug" this hardening pass exists to catch and not misreport.

## 2. Real Performance Measurements

Measured, not estimated - three consecutive runs against the local dev stack (Postgres, Redis, BullMQ all warm):

| Metric | Measured (typical) | Target | Status |
|---|---:|---:|---|
| Register | 220-510 ms | < 1000 ms | ✅ (argon2 hashing dominates - by design, ADR for password hashing cost) |
| Login | 90-125 ms | < 500 ms | ✅ |
| First message (connector → visible in inbox) | ~180 ms* | < 5000 ms | ✅ |
| Inbox list (`GET /v1/conversations`) | 9-17 ms | n/a | ✅ |
| Search (`GET /v1/search`) | 6-16 ms | < 200 ms | ✅ |
| Rule creation (`POST /v1/rules`) | 9-11 ms | n/a | ✅ |
| Rule execution (message → tagged, observable) | ~175-185 ms* | < 500 ms | ✅ |
| AI enrichment (message → `ai.classification`-conditioned rule fires) | ~175-190 ms* | < 2000 ms | ✅ |
| Logout | 12-22 ms | n/a | ✅ |
| Re-login | 84-101 ms | < 500 ms | ✅ |

*Three metrics marked `*` (first message, rule execution, AI enrichment) are measured by polling every 150ms until the effect is observable via a GET, since these happen asynchronously over BullMQ - the reported number is a ceiling dominated by the poll interval, not the true processing latency, which is very likely well under 50ms given every other synchronous endpoint in the table responds in single-digit-to-low-double-digit milliseconds. Disclosed as a measurement-methodology limit, not a performance claim - a WebSocket-driven measurement (subscribing to `message.received`/`rule.executed` instead of polling) would give the true number and is flagged as future work if precise async latency ever needs to be reported externally.

No target was missed. Search in particular - relying on a live-computed `to_tsvector` (`docs/reviews/phase-12-review.md`'s disclosed simplification, not a persisted GIN-indexed column) - comfortably clears its 200ms target at current data volume.

## 3. API Quality Audit

- **RFC 7807 error shape**: verified consistent globally - `ProblemDetailsFilter` (`apps/api/src/common/problem-details.filter.ts`) is registered as a single global exception filter (`main.ts`) and every thrown `HttpException` (via the `httpError()` helper used uniformly across all 17 controllers) is normalized through it. No controller bypasses it. ✅
- **Auth guard coverage**: audited every `@Controller`/`@Get`/`@Post`/`@Patch`/`@Delete` across all 17 controllers. Every endpoint that should require a session has `@UseGuards(JwtAuthGuard)` (either per-method or, in six newer controllers, once at the class level - both patterns coexist, functionally equivalent, a minor stylistic inconsistency, not a bug). The only unguarded endpoints are correctly unguarded by design: OAuth callback redirects (Discord/Slack `GET callback`), webhook receivers verified by their own signature/secret instead of a bearer token (Telegram webhook, Slack events), the `/dev/*` debug endpoints (already excluded from `v1` versioning and documented since Phase 1/9), and `/health`. **No unintended auth bypass found.** ✅
- **Workspace isolation**: not re-derived from scratch here - already carries real, repeated evidence across every phase's regression script (`verify-phase3.mjs`'s "a second user's workspace has no visibility," `verify-phase9.mjs`, `verify-phase12.mjs`'s identical check for search). Re-ran all of them as part of this pass; all still pass. ✅
- **Validation consistency**: two coexisting, both-correct patterns - `class-validator` DTOs (Auth) vs. manual `if (!x) throw httpError(...)` (Conversations, Rules, AI, Notification Preferences, Search) - each already justified inline in its own controller's comments (nested/recursive bodies like a rule's condition tree don't fit class-validator's decorator model well). Not a bug, but worth naming as a real inconsistency a future contributor should know is deliberate, not accidental.
- **Pagination/sorting/filtering - the most significant finding of this audit**: `API.md` Section 4 specifies **cursor-based pagination everywhere, no offset pagination anywhere in the contract**, plus a `?sortBy=`/`?order=` convention. **Actual implementation matches neither.** Every list endpoint instead uses a silent, hardcoded `take` cutoff with no cursor and no way to reach anything past it: `GET /v1/notifications` (`take: 50`), `GET /v1/rules/:id/executions` (`take: 50`), `GET /v1/search/*` (`take: 50`), `GET /v1/ai/credits/ledger` (`take: 50`). Two endpoints are worse - **fully unbounded, no limit at all**: `GET /v1/rules` and `GET /v1/contacts`. Sorting is hardcoded per-endpoint (e.g. conversations by priority-then-recency) with no `?sortBy=` support anywhere. **This is a real, repo-wide gap between the documented API contract and the shipped implementation** - harmless at current dev/demo data volumes, but a genuine correctness bug the moment any workspace's rule count, contact count, or notification history exceeds 50 (or, for rules/contacts, exceeds whatever a single unbounded query can still return acceptably fast). **Not fixed in this pass** - implementing real cursor pagination across every list endpoint is a systemic API-contract change, not a bug fix, and is flagged below as the top-priority item for a dedicated pass before Phase 14 ships to any real multi-user workspace.
- **Optimistic locking transport**: `API.md` Section 8 specifies `ETag`/`If-Match` HTTP conditional-request headers for `version`-columned resources. The actual implementation (`RulesController.update`) instead checks `version` as a request-body field against `updateMany({ where: { version } })` - functionally correct (a stale write still correctly 409s), but not the documented HTTP-native transport. Same category as the pagination finding: a real, disclosed deviation from the contract, not a functional bug. **Not fixed in this pass**, same reasoning.

## 4. Frontend Code Review (loading / empty / error / retry / rollback)

Read directly (no browser available) - `AuthForm.tsx`, `Inbox.tsx`, `Rules.tsx`, `PasswordInput.tsx`, `page.tsx`:

- **`AuthForm.tsx`**: solid. Real `submitting` loading state (button text changes, disabled), real `error` state (rendered, cleared on mode switch), form resubmission is the natural retry path. No gaps found.
- **`page.tsx`**: a `booting` state shows "Loading..." during the silent-refresh-on-mount check before deciding whether to show the login form or the Inbox. No gap found.
- **`Rules.tsx`**: has real `loading`/`error` state for the rule list, real per-action error handling (create/toggle/delete/test/save-preferences all `try/catch` into a shared `error` banner), a real empty state ("No rules yet"). No gap found.
- **`Inbox.tsx` - one real bug found and fixed**: the main conversation-list fetch (`refreshConversations`) silently swallowed every failure (`.catch(() => [])`) and set an empty array - **indistinguishable from the genuine "you have no conversations yet" empty state**. A backend outage, an expired session, or a network blip would have shown the exact same "None yet - send a mock message above" message as a brand-new, correctly-working account. This directly violates the same "never show a misleading state" principle this project has enforced everywhere else (the "Needs You" count's own trustworthiness requirement, `PRODUCT.md`). **Fixed**: `refreshConversations` now tracks a `conversationsError` state; a real failure renders a distinct red error banner with a "Retry" button, and the "None yet" message only shows when the fetch actually succeeded and the list is genuinely empty. Verified via `pnpm --filter @smc/web typecheck`/`lint` (clean) and the full regression suite (all still passing - this fix touches only the failure path, not the success path any script exercises).
- **Other `Inbox.tsx` fetches** (notifications, needs-you count, merge suggestions, AI credit balance) still use the same silently-swallowed-error pattern (`.catch(() => undefined)`, 16 remaining instances). These are lower-stakes than the primary conversation list (each has a visible fallback that doesn't claim false certainty - e.g. the AI credit badge just doesn't render if the fetch fails, rather than showing "0 credits" and implying something false) - **not fixed in this pass**, flagged as a smaller, lower-priority version of the same pattern for a future cleanup, not re-litigated here since fixing all 16 individually is closer to a UI overhaul than a bug fix.
- **Optimistic updates**: none exist in the current UI (every mutation waits for the server response before updating local state) - so there is no rollback behavior to audit; this is a non-finding, not a gap.

## 5. Technical Debt Scan

Grepped the entire repo (`apps/`, `packages/`, `scripts/`, excluding `node_modules`/`dist`/`.next`):

| Pattern | Matches in real source | Notes |
|---|---:|---|
| `TODO` / `FIXME` / `XXX` / `HACK` | 0 | Clean - consistent with every prior phase review's own finding. |
| `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` | 0 | Clean. |
| `eslint-disable` | 6 | All legitimate, narrow, and already commented in place: `react-hooks/exhaustive-deps` on three genuinely mount-only effects, `no-alert` on one real user-facing confirm dialog, `no-console` on two intentional startup/config log lines. |
| `: any` / `as any` / `<any>` | 2 (real source) | Both in `packages/database/src/soft-delete.ts`, both already disclosed as unavoidable given Prisma's extension-typing limits (existing ESLint warnings, not errors) - not new findings. Every other `any` match was in auto-generated `.next/types/**` build artifacts, not real source. |

**Conclusion: the codebase carries essentially zero silent technical debt.** Every marker that exists is already disclosed at its own site.

## 6. Security Re-Verification

- **Auth bypass**: none found (Section 3 above).
- **Workspace isolation**: confirmed still enforced (Section 3 above, re-running existing regression evidence).
- **Secret logging**: grepped every `console.log`/`logger.log`/`logger.debug` call site in `apps/api/src` against `password|token|secret|credential|apikey|api_key` - **zero matches**. Also confirmed no controller logs `req.body` wholesale (which could leak a password field) - only Slack's webhook signature-verification code even references `req.body`, and only to read it, never to log it.
- **Rate limiting - a real, previously-undisclosed gap**: `API.md` Section 9 fully specifies per-credential sliding-window rate limiting via Redis token buckets, tiered by plan, with dedicated tighter limits for expensive endpoints (AI, bulk export) called out explicitly by name. **None of this is implemented.** The only rate-limiting in the codebase is `LoginThrottleService`, scoped narrowly to repeated failed login attempts (a real, working, but different mechanism - brute-force protection, not general API throttling). This means, today, an authenticated caller can call any endpoint - including every `/v1/ai/*` endpoint, which consumes real (if currently free) credits - at unlimited request volume with no `429` ever returned. **Not fixed in this pass** (implementing Redis token buckets is unambiguously a new feature, not a bug fix, per this pass's own scope boundary) - flagged as the single highest-priority item to build before any real multi-tenant traffic, ranked above the pagination gap because it's an actual abuse vector, not just a scale limitation.
- **Connector credential leakage**: re-confirmed `LinkedAccount.credentialsRef` is only ever a UUID pointer in every API response that includes it (conversations, connector-connect responses) - the encrypted `SecretRecord` payload itself is never serialized into any HTTP response anywhere in the codebase (grepped for `ciphertext`/`SecretRecord` usage outside `credentials-store.service.ts` - none found). Consistent with ADR-0016's design and every prior phase's clean finding here.

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `Inbox.tsx`'s conversation-list fetch failure was indistinguishable from a genuine empty inbox | Real bug (trust/correctness) | **Fixed** this pass |
| 2 | Test script (`verify-mvp-hardening.mjs`) didn't replay the session cookie, producing a false negative on the logout-revocation check | Test bug, not a product bug | **Fixed** this pass |
| 3 | No general API rate limiting exists (`API.md` Section 9 fully specified, not implemented) - only login-attempt throttling | Real gap, security-adjacent | **Deferred** - flagged top priority, out of this pass's "no new features" scope |
| 4 | No real cursor pagination anywhere (`API.md` Section 4 fully specified, not implemented) - hardcoded `take` limits everywhere, two endpoints (`GET /v1/rules`, `GET /v1/contacts`) fully unbounded | Real gap, correctness-at-scale | **Deferred** - flagged second priority, same reasoning |
| 5 | Optimistic locking uses a body-field version check instead of the documented `ETag`/`If-Match` transport | Real, minor contract deviation | **Deferred** - functionally correct today, low priority |
| 6 | 16 remaining `.catch(() => undefined)` sites in `Inbox.tsx` beyond the one fixed | Real, minor UX gap | **Deferred** - each has a non-misleading fallback already |
| 7 | Validation pattern inconsistency (class-validator vs. manual) across controllers | Style inconsistency, not a bug | **Accepted**, already individually justified |

**No blocking issues found.** The MVP is real: every core user journey (register → connector → inbox → search → automation → AI → notification → logout/login) works end-to-end with real, measured performance well inside target, zero silent technical debt, and no auth/isolation/secret-handling failures. The two deferred findings worth real attention before meaningful production traffic are rate limiting (security-adjacent) and cursor pagination (correctness-at-scale) - both real, both out of this pass's no-new-features scope, both flagged with enough detail to become their own small, scoped pieces of work whenever the project is ready for them. **Phase 14 can proceed.**
