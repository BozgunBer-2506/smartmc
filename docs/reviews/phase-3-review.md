# Phase 3 Review

```yaml
Title: phase-3-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-18
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0012
  - ADR-0013
  - ADR-0015
```

A point-in-time comparison of the actual Phase 3 (Identity & Messaging Foundation) implementation against `PRODUCT.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, all ADRs current at the time, and `ROADMAP.md` - the third in the standing per-phase review practice (`docs/reviews/phase-1-review.md`, `docs/reviews/phase-2-review.md` came before it). Per explicit direction for this phase: implementation-first, no architecture redesign, no new technologies, no new documentation beyond an ADR where a genuine architectural decision required one. This report follows that same discipline.

---

## What Was Built

The pipeline `Mock Connector → Message → IdentityGraph → Conversation → Inbox → Realtime → Notification`, run for the first time behind real per-user authentication instead of Phase 1's shared `DEV_WORKSPACE_ID` fixture:

- `GET /v1/conversations`, `GET /v1/conversations/{id}/messages` - the real Postgres-backed Inbox read model, `JwtAuthGuard`-protected, workspace scope always taken from verified JWT claims, never a route/query parameter
- `GET /v1/notifications` - a real, queryable notification list, same scoping rule
- `POST /dev/mock-connector/send` extended with optional Bearer-token resolution: a valid token ingests into that user's real workspace; no token falls back to `DEV_WORKSPACE_ID` (preserves the existing dev-testing path); an invalid token is rejected with `401`, never silently downgraded to the dev fixture
- The WebSocket gateway now authenticates every connection via JWT at connect time (`handshake.auth.token`, falling back to the `Authorization` header), joins the caller to their own verified workspace room, and disconnects immediately on a missing or invalid token - replacing Phase 1's client-supplied `?workspaceId=` query parameter
- A shared `TokenService` (`apps/api/src/auth/token.service.ts`) centralizing JWT verification, used identically by the HTTP guard, the WebSocket gateway, and the mock connector's optional-auth path, so there is exactly one place that decides what a valid access token looks like
- A real `apps/web` login/register form and an authenticated Inbox (conversation list, message history pane, notifications list, live toasts on `notification.created`, a mock-message trigger) - the Phase 3 demo script is now something a person can click through in a browser, not just something a script asserts against `curl`

All verified live via `pnpm --filter @smc/scripts verify:phase3` (11/11 checks) - register, an unauthenticated socket is rejected, an authenticated socket connects, a mock message ingested with a real Bearer token produces both `message.received` and `notification.created` over that socket, the sender resolves to a name through IdentityGraph, all three new REST reads confirm durability, and a second, unrelated user's `GET /v1/conversations` is proven empty (workspace isolation) - not just typechecked. `verify:auth` (16/16) and `verify:soft-delete` were re-run and remain clean, confirming no regression from the refactor described below.

## The One Real Architectural Deviation

`API.md` Section 10.3 frames the inbox read path as "primarily GraphQL" (per ADR-0003's REST-by-default-except-where-GraphQL-adds-value stance). No GraphQL server exists anywhere in this codebase, and standing one up now to serve two read endpoints would be new infrastructure - directly contradicting this phase's explicit "do not introduce new technologies" instruction. Recorded via [ADR-0015](adr/0015-rest-inbox-read-path-for-phase-3.md): Phase 3 implements the inbox read path as plain REST (`ConversationsController`), consistent with everything else already built. `API.md` itself is not rewritten - only the ADR records the deviation and its time-bounded rationale. GraphQL remains the Phase 9 (Smart Inbox) target, where enough real read complexity (filters, unified cross-connector feed) will exist to justify it.

## Deliberately Deferred (ROADMAP.md Phase 3 checklist items left unchecked, not silently dropped)

| Item | Status |
|---|---|
| Workspace/account model as public CRUD (`POST /v1/workspaces`, `GET /v1/workspaces/{id}/members`) | Not implemented - not required by this phase's stated Definition of Done; Phase 2's internal registration-time creation remains the only path |
| Linked Accounts model | Not implemented - structure-only item explicitly deferred to Phase 4-5 territory in `ROADMAP.md`'s own text |
| Tags | Not implemented - no consumer of tags exists yet (that's Phase 8's IMAP labels-to-tags mapping and Phase 9's categories) |
| Folders | Not implemented - same reasoning as Tags |
| Search shell | Not implemented - `ROADMAP.md` itself scoped this to "structure, indexing not required yet," and even the structure wasn't needed to satisfy the demo script |
| User preferences (silent hours, VIP list structure) | Not implemented - first real consumer is Phase 11's Notification Engine |

None of these block the phase's stated Definition of Done, which was scoped explicitly around the 7-step demo script, not the full item list.

## New Findings From This Review

### Deliberate simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | `GET /v1/notifications` has no cursor pagination and no mark-read/unread state. | `Notification` (`DATABASE.md` Section 6.14) has no `readAt` column in the currently-implemented schema subset, and no consumer needs pagination yet at real-world Phase-3 data volumes. | **Deferred** to whichever phase first needs read-state (most likely Phase 11, Notification Engine) - noted here so the missing column is a deliberate, tracked gap rather than a rediscovery. |
| 2 | The Mock Connector's dev-fixture Organization/Workspace upsert (`events.processor.ts`) is now conditionally scoped to `payload.workspaceId === DEV_WORKSPACE_ID` rather than running unconditionally for every inbound message. | Before this phase, every message - including ones now destined for a real user's real workspace - triggered an upsert against the dev fixture's IDs, which was harmless only because no real workspaces existed yet to collide with. Scoping it was necessary, not optional, once real per-user workspaces exist. | **Fixed as part of this phase**, not deferred - this is exactly the kind of thing more expensive to retrofit later, since leaving it unconditional would have been silently harmless right up until it wasn't. |
| 3 | `AuthException`/`authError` (Phase 2, `auth/`-scoped) was renamed to `HttpException`-wrapping `httpError()` and moved to `common/http-error.ts`. | Phase 3 needed the same RFC 7807-shaped error helper in `conversations/`, `notifications/`, and `mock-connector/`, none of which are auth-domain code; keeping it under `auth/` would have meant either duplicating it or having non-auth modules import from `auth/`. | **Mechanical rename, not a redesign** - same behavior, same call sites updated, verified by the unchanged `verify:auth` pass rate (16/16). |

### Already-tracked gaps, still open (not new, restated because Phase 3 makes them load-bearing for more real user data)

| # | Finding | First noted |
|---|---|---|
| 4 | Real ESLint/Prettier config and Husky pre-commit hooks - every `lint` script is still `echo "(no lint configured yet)"`. | Phase 1 review, item flagged again in Phase 2 review; now the project's oldest unresolved item across three phases. |
| 5 | No DB role separation / RLS - now guards real per-user conversation/message/notification data, not just mock-connector test rows. | Phase 1 review, items 7/11. |
| 6 | `packages/database`'s Prisma schema remains a pragmatic subset of `DATABASE.md`'s full spec - `LinkedAccount`, IdentityGraph's confidence-scoring/merge-suggestion tables (`identity_merge_suggestions`, ADR-0013) are still spec-only. | Phase 1/2 reviews; unchanged this phase since Phase 3 explicitly excluded fuzzy matching/merge suggestions per its own instructions. |

**TODOs**: none - grepped `apps/` and `packages/` for `TODO`/`FIXME`/`HACK`/`XXX`, zero matches, consistent with Phase 1 and Phase 2.

**Confirmed on-track, no deviation**: IdentityGraph exact-match-only resolution (ADR-0012/0013 - no fuzzy matching, no merge suggestions, no auto-merge beyond exact match, all correctly absent from this phase's code), WebSocket subscriptions scoped to authenticated users only (this phase's explicit requirement, verified live via the unauthenticated-socket-rejected check), workspace isolation across REST reads (verified live via the second-user check), UUIDv7 for every new row, RFC 7807 error shape preserved through the rename, and modularity - `ConversationsModule`/`NotificationsModule` each import only `AuthModule`, no cross-module coupling introduced.

## Decision Rule Applied

Same rule as Phase 1 and Phase 2: implement now only what's more expensive to retrofit later; defer everything else to its already-assigned phase. This phase's two "implement now" items were the ADR-0015 REST decision (documentation had to reflect what was actually buildable without new infrastructure) and the dev-fixture upsert scoping fix (item 2 above - a latent collision risk that was free to close immediately and not free to discover later). Every other finding was either already correctly scoped out by `ROADMAP.md`'s own Phase 3 checklist or a disclosed, reasoned simplification - nothing was pulled forward, nothing was silently dropped.

## Outcome

The first end-to-end authenticated user experience is complete and verified live, in both automated scripts and the actual browser UI: a real person registers, logs in, sends a mock message, sees it appear in their own Inbox in real time without a page refresh, sees the sender resolved to a name through IdentityGraph, sees a notification surface for it, and can open the conversation to see its full history - the Phase 3 demo script, achieved. One ADR recorded a real, time-bounded deviation from previously-stated documentation. Three deliberate simplifications and three already-tracked gaps are on record with explicit reasoning, not hidden. Tagged `v0.3.0-phase3`.
