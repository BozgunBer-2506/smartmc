# Phase 9 Review

```yaml
Title: phase-9-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-27
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0012
  - ADR-0013
```

A point-in-time comparison of the actual Phase 9 (Smart Inbox) implementation against `PRODUCT.md`, `ARCHITECTURE.md` Section 13, `DATABASE.md` Section 6.6, and `ROADMAP.md` - the ninth in the standing per-phase review practice, and the first phase since Phase 3 to extend the domain model (`Conversation`, `Contact`/`ContactIdentity`) rather than add a connector. This is where the product stops being "an aggregator" and starts being Smart Message Center, per `ROADMAP.md`'s own framing of this phase.

---

## What Was Built

- **Unified priority scoring** (`packages/shared/src/priority-score.ts`) - a rule-based, fully explainable signal (base score + VIP bonus + urgency-keyword bonus), computed once at message-ingestion time (`events.processor.ts`) and stored on both `Message` (implicitly, via the conversation update) and `Conversation.priorityScore` (the conversation's highest-scored message, so one urgent/VIP message keeps a thread surfaced after quieter follow-ups arrive). Deliberately not AI-derived, per `PRODUCT.md`'s "the rule-based score alone must remain a fully usable signal on its own."
- **VIP handling** - `Contact.isVip` already existed in the schema since Phase 3 (unused until now); `PATCH /v1/contacts/{id}` gives it a real read/write surface, and it now feeds priority scoring directly.
- **Archive, Categories, Filters** - `Conversation.isArchived`/`category` (both user-set, `PATCH /v1/conversations/{id}`), and `GET /v1/conversations` accepts `archived`/`category`/`vip`/`unread` query filters, sorted by priority then recency.
- **Unread manager / "Needs You" count** - `Conversation.lastReadAt` (null means every message is unread), `POST /v1/conversations/{id}/read`, and `GET /v1/conversations/summary` computing a *trustworthy* count (`PRODUCT.md` UI Principles) - unread **and** (VIP sender or priority score above a threshold), never a raw unread badge.
- **IdentityGraph fuzzy-match confidence scoring, suggestion queue, and manual merge/split** (`ARCHITECTURE.md` Section 13.3/13.6, `DATABASE.md` Section 6.6, ADR-0013) - the exact-match-only version from Phase 3 gets its human-in-the-loop layer:
  - `findMergeCandidates()` (`packages/identity/src/matching.ts`) - a simple, fully explainable matching signal (normalized display-name equality/substring), not an ML/NLP model.
  - `IdentityMatchingService` (`apps/api/src/identity/`) - a periodic sweep (10 min) that persists candidates as `IdentityMergeSuggestion` rows and expires unreviewed ones after 7 days (anti-fatigue, `ARCHITECTURE.md` Section 13.6).
  - `IdentityController` - `GET /v1/identity/merge-suggestions`, `POST .../approve`, `POST .../reject` - every suggestion sits `pending` until a human decides; there is no auto-apply path.
  - `approveMergeSuggestion()`/`rejectMergeSuggestion()` (`packages/identity/src/merge.ts`) - approval reassigns `ContactIdentity`/`Message` rows, soft-deletes the absorbed `Contact`, and writes an immutable `IdentityMergeLog` row in the same transaction.
  - `splitContact()` (`packages/identity/src/split.ts`) and `POST /v1/contacts/{id}/split` (`ContactsController`) - the first-class recovery action `ARCHITECTURE.md` Section 13.6.1 requires ("even if a user does approve [a merge] in error... a split is a first-class, immediately-available action, not a support escalation"), writing an immutable `IdentitySplitLog` row.
- **A "Possible duplicate contacts" panel, filters, archive/category controls, and a "Needs You" count in `apps/web`'s Inbox** - functional, matching the existing spartan inline-style UI fidelity every prior phase has used (no design system yet - tracked, `STATUS.md` gap #12).
- **`docs/reviews/phase-9-review.md`'s own regression check** (`verify-phase9.mjs`) - 22 real, end-to-end checks: priority scoring (base/urgency/VIP), needs-you count, mark-read, archive/category filters, and the full merge-suggestion lifecycle (generate → approve → merge → split, and generate → reject → no merge) against the actual running API and Postgres.

## No New ADR - Executing an Already-Decided Architecture

The Prisma schema's own `Contact` model comment has said since Phase 3: *"confidence scoring and the merge-suggestion queue are Phase 9 additions."* `DATABASE.md` Section 6.6 already fully specified `identity_merge_suggestions`/`identity_merge_log`/`identity_split_log`'s columns, and ADR-0013 already settled the governing rule ("every candidate match short of an exact deterministic match requires human confirmation, regardless of confidence score"). This phase implements that pre-existing decision; it does not make a new one. The one implementation-level choice this phase *did* make - the matching signal itself (normalized display-name comparison, not a more sophisticated model) - is exactly the kind of thing `DATABASE.md` Section 6.6 explicitly left open ("the operational detail... is an implementation-level concern flagged in `ARCHITECTURE.md` Section 13.7, not fully specified at the schema level"), so it's disclosed below as a simplification, not elevated to an ADR.

## Verified

- `pnpm --filter @smc/scripts verify:phase9` - 22/22 checks passing, real end-to-end: a plain message scores the base (10); an urgency-keyword message scores >= 30; toggling a contact VIP via the real API makes their next message score >= 60; the "Needs You" count reflects an unread VIP conversation and drops to correct after marking read; archive/category `PATCH` and the corresponding `GET` filters round-trip correctly; two identically-named contacts created via two real mock-connector sends produce a real persisted merge suggestion (via a dev-only manual trigger for `IdentityMatchingService`, `POST /dev/identity-matching/run` - excluded from `v1` versioning, the same `dev/(.*)` pattern `/dev/mock-connector/send` already uses); approving it merges the contacts (identities and messages reassigned, one contact soft-deleted); splitting the merged contact restores two contacts; a second pair's suggestion, when rejected instead, leaves both contacts untouched.
- `certify:mock-connector` (16/16), `certify:telegram-connector` (14/14, 2 skips), `certify:discord-connector` (15/15, 1 skip), `certify:slack-connector` (15/15, 1 skip), `certify:email-connector` (15/15, 1 skip), `verify:phase3` (11/11), `verify:auth` (16/16), `verify:soft-delete`, `verify:telegram`, `verify:discord`, `verify:slack`, `verify:email` all re-run clean - no regressions from the schema/ingestion-pipeline changes.
- `pnpm lint`/`pnpm typecheck`/`pnpm build` all pass clean across the whole monorepo.

## Deliberate Simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | The fuzzy-matching signal is normalized display-name equality/substring comparison only - no shared-conversation-participant signal, no cross-provider handle-similarity signal, no phonetic/typo-tolerant matching. | `DATABASE.md` Section 6.6 leaves the exact signal set as an implementation-level concern; this is deliberately the smallest version that produces genuine, explainable suggestions, not a placeholder - a real product would likely add more signals over time as `matchingSignals`' `jsonb` shape already accommodates. | **Deferred** - additive, not a breaking change, when real usage shows the current signal misses too much or over-triggers. |
| 2 | `findMergeCandidates()` is O(n²) in the number of Contacts per workspace. | Acceptable at this product's current scale, the same "don't build for a scale not yet reached" principle every prior phase applies. | **Deferred** until a real workspace's contact count makes this measurably slow. |
| 3 | The suggestion-pair dedup (`DATABASE.md` Section 6.6's partial unique index scoped to `status = 'pending'`) is enforced at the application level (a query-then-create check in `IdentityMatchingService`), not a database constraint - this project has no migrations mechanism beyond `prisma db push`, which cannot express a partial index without a raw SQL migration step this phase doesn't introduce. | A real, disclosed gap: a race between two concurrent matching sweeps could in principle create a duplicate pending suggestion. At a 10-minute interval this is effectively single-flight in practice. | **Deferred** until a real migrations mechanism exists (or until this project moves off `db push`), whichever comes first. |
| 4 | Splitting a Contact whose two `ContactIdentity` rows share the *same* provider moves every message from that provider to the new Contact, not just the messages from the specific identity being split off - `Message` has no direct per-sender provider/externalId of its own to join on more precisely than `Conversation.providerId`. | Disclosed directly in `splitContact()`'s own doc comment. Correct in the common case (a merge across two *different* providers, the scenario ADR-0013's "two Ahmets" example itself describes); the same-provider case is a narrower, real limitation. | **Deferred** - would require `Message` to carry its own sender-identity reference, a larger schema change not justified by current usage. |
| 5 | VIP status is carried forward on both merge (survives onto the primary contact if either side was VIP) and split (copied to the new contact) - `DATABASE.md` Section 6.6 explicitly leaves "how shared history... divides" as an implementation-level concern. | A reasonable, disclosed default answer to a question the spec deliberately left open. | **Accepted**, not a gap. |
| 6 | Categories are free-form, user-set text with no fixed taxonomy or auto-categorization. | `PRODUCT.md`'s "Categories" checklist item doesn't specify a taxonomy; auto-categorization is an AI-adjacent feature this project's own principle ("AI is optional, never load-bearing," Phase 13) defers well past this phase. | **Deferred**. |
| 7 | The "Needs You" priority threshold (30) and urgency-keyword list are fixed constants, not per-workspace configurable. | A reasonable first default; real usage would inform tuning, and `AUTOMATION_ENGINE.md`'s Phase 10 rule engine is the natural place for user-configurable thresholds to eventually live, not a one-off settings screen now. | **Deferred** to Phase 10 or whenever real usage demands it. |
| 8 | The Inbox UI's filter/archive/category/merge-suggestion controls are functional but match the existing spartan inline-style fidelity (no design system) - already a tracked gap. | Consistent with `packages/ui`/theme consolidation being deferred to this exact phase per `STATUS.md` gap #12's own note - revisited now only in the sense that it wasn't blocking; not resolved. | **Deferred**, same as before - see gap #12. |

## Already-Tracked Gaps, Still Open (not new)

| # | Finding | First noted |
|---|---|---|
| 9 | `packages/ui`/`apps/marketing-site` theme consolidation. | STATUS.md gap #12 |
| 10 | No staging environment. | STATUS.md gap #13 |
| 11 | Discord/Slack/Email connectors remain unverified live (postponed/blocked on external setup). | STATUS.md gaps #9/#14/#16 |
| 12 | `Tag`/`MessageTag` (`DATABASE.md` Section 6.11) still not implemented - "Labels/folders mapped to Tags" (Phase 8) remains deferred; this phase's "Categories" is a separate, simpler free-text field, not a reuse of the Tag model. | STATUS.md gap #17 |

**TODOs**: none - grepped `packages/identity/src`, `packages/shared/src/priority-score.ts`, `apps/api/src/identity`, and `scripts/verify-phase9.mjs` for `TODO`/`FIXME`/`HACK`/`XXX`, zero matches, consistent with every prior phase.

**Confirmed on-track, no deviation**: every merge/split is transactional and audit-logged (`IdentityMergeLog`/`IdentitySplitLog`, both append-only, no `updatedAt`/`deletedAt`); soft-delete correctly applies to the absorbed `Contact` on merge (confirmed via `verify:soft-delete` and `verify-phase9.mjs` both passing after this phase's schema changes); UUIDv7 for every new row; no automatic merge occurs for anything short of an exact `(provider, externalId)` match, per ADR-0013's hard boundary - confirmed by `verify-phase9.mjs`'s explicit reject-path test showing two contacts remain distinct when a human declines.

## Security Considerations

- The merge-suggestion review surface and contact split/VIP endpoints are all `JwtAuthGuard`-protected and workspace-scoped (`requireOwnSuggestion`/workspace-filtered `findFirst` calls throughout) - no suggestion or contact from another workspace is ever visible or actionable, the same multi-tenancy discipline every prior endpoint follows.
- `matchingSignals` stores only human-legible evidence (normalized names), never raw signal weights, per `ARCHITECTURE.md` Section 13.8 - nothing new to redact or protect beyond what's already displayed on the suggestion card itself.
- The dev-only `POST /dev/identity-matching/run` trigger has no auth guard, matching `/dev/mock-connector/send`'s existing precedent - both are excluded from `v1` versioning and exist purely for deterministic testing, not a production surface.

## Decision Rule Applied

Same rule as every prior phase: implement now only what's more expensive to retrofit later; defer everything else to its already-assigned scope. The merge-suggestion queue, confidence scoring, and audit logging were implement-now by necessity - `DATABASE.md`/ADR-0013 already committed to this exact design, and retrofitting audit-log tables after real merges had already happened without one would be far more expensive than building it now. The matching signal's simplicity (Simplification #1) and the O(n²) scan (Simplification #2) are genuine "smallest real version" choices, not corners cut silently.

## Future Work

- Add richer matching signals (shared-conversation participants, cross-provider handle similarity) once the current simple signal's suggestion quality is observed against real usage.
- Move suggestion-pair dedup to a real partial unique database index once this project has a migrations mechanism beyond `prisma db push` (Simplification #3).
- Give `Message` its own sender-identity reference to make same-provider splits precise (Simplification #4).
- Make the "Needs You" priority threshold and urgency-keyword list configurable, likely via `AUTOMATION_ENGINE.md`'s Phase 10 rule engine rather than a standalone settings surface (Simplification #7).
- Implement `Tag`/`MessageTag` platform-wide (still tracked from Phase 8).
- Complete Discord/Slack/Email's own live verifications (tracked separately).

## Outcome

Smart Inbox exists: unified priority scoring, VIP handling, archive/category filters, a trustworthy "Needs You" count, and IdentityGraph's full fuzzy-match/merge-suggestion/split lifecycle, all real and end-to-end verified (22/22 in `verify-phase9.mjs`) against the actual running API and database - not stubbed, not simulated. This phase executed an architecture already committed to in Phase 3/ADR-0013/`DATABASE.md`, rather than deciding a new one, so no ADR was needed. The product's own stated transition - from "an aggregator" to "Smart Message Center" - is now backed by working code, not just documentation.
