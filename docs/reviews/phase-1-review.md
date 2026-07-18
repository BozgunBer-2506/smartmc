# Phase 1 Review

```yaml
Title: phase-1-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-18
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0007
  - ADR-0009
  - ADR-0012
  - ADR-0013
```

A point-in-time comparison of the actual Phase 1 implementation against `PRODUCT.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `SECURITY.md`, `CONNECTOR_SDK.md`, `EVENT_MODEL.md`, `AUTOMATION_ENGINE.md`, all ADRs current at the time, and `ROADMAP.md`. Produced as a report first (no fixes applied during the review itself), per standing practice adopted 2026-07-18: **every phase gets a review before the next phase starts**, saved here so a year from now the question "what technical debt did we knowingly defer in Phase 1" has a dated, honest answer instead of a guess. Findings below are recorded as they were found; the "Resolution" column reflects what was actually decided and done immediately afterward, not retroactively cleaned up to look better.

---

## Already-disclosed gaps (tracked in `ROADMAP.md`/`STATUS.md` before this review, not new findings)

| # | Finding | Resolution |
|---|---|---|
| 0a | No real ESLint/Prettier config (`packages/config`); every `lint` script is a stub | Deferred - Sprint 1's explicitly open item, addressed before Phase 2 per its own timeline |
| 0b | No Husky pre-commit hooks | Deferred, blocked on 0a |
| 0c | `packages/database`'s Prisma schema is a pragmatic 7-model subset of `DATABASE.md`'s 20+ | Deferred - grows as later phases need more of it, per design |
| 0d | No tests exist | Deferred - explicit user direction: `pnpm test` isn't required in CI until tests exist |

## Findings from this review

### Architectural violations

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | ADR-0009 states connector workers are independently deployable "from day one." The Mock Connector runs inline inside `apps/api`, triggered via HTTP - no separate worker process exists. | Medium | **Deferred to Phase 4.** Splitting a worker out for a single mock connector with no real deployment target yet would be premature; the real split happens naturally when Phase 4's actual `CONNECTOR_SDK.md`-conformant workers are built. Recorded here so Phase 4 planning starts from "this is owed," not a fresh discovery. |
| 2 | `ARCHITECTURE.md` Section 4 describes independent consumers (Inbox Projector, Automation Engine, Notification Service) subscribing to events separately. Phase 1's `EventsProcessor` does all three jobs sequentially in one class. | Medium | **Deferred to Phase 9-11.** Reasonable Sprint 2 simplification to prove the pipeline shape cheaply; the unwind into real independent services is scoped to the phases that build the real Inbox/Automation Engine/Notification Service anyway. |
| 3 | `EVENT_MODEL.md` Section 3's per-aggregate ordering guarantee is not enforced - all events share one generic BullMQ queue with no aggregate-keyed partitioning. | Low (nothing depends on it yet) | **Deferred**, but flagged explicitly: any future consumer that assumes the documented guarantee would be trusting something not yet built. Revisit when a real ordering-sensitive consumer is added. |

### Shortcuts (deliberate, named precisely so they're not mistaken for the real thing later)

| # | Finding | Resolution |
|---|---|---|
| 4 | `Conversation`/`ContactIdentity` key off `providerId` directly; `DATABASE.md`'s `LinkedAccount` entity doesn't exist yet. | Deferred to whichever phase first needs real per-account (not per-provider) connector auth - likely Phase 4-5. |
| 5 | IdentityGraph is exact-match-only (correct per `ROADMAP.md` Phase 3 scope); `confidence_score`, `identity_merge_suggestions`, `identity_merge_log`, `identity_split_log` (ADR-0012/0013) don't exist in the schema yet. | Deferred to Phase 9, as planned. |
| 6 | The stub rule is a hardcoded `if` inside `EventsProcessor`, not data in a `rules` table. | Deferred to Phase 10 (the real Automation Engine) - explicitly sanctioned scope for Sprint 2. |

### Gaps not previously tracked anywhere - triaged and acted on

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 7 | No RFC 7807 error model (`API.md` Section 5) - NestJS's default exception shape was in use instead. | High (compounds with every new endpoint) | **Fixed immediately.** `apps/api/src/common/problem-details.filter.ts`, a global exception filter, now converts every thrown exception into the documented `application/problem+json` shape (`type`/`title`/`status`/`detail`/`instance`/`code`/`traceId`/`errors`). Verified live: an unknown route and the Phase 2 guard (finding #9) both return correctly-shaped problem+json. |
| 8 | `DATABASE.md` Section 1 calls soft deletes "non-negotiable"; no `deletedAt` columns or enforcement existed on any model. | High (gets more expensive to retrofit onto more models and more code paths later) | **Fixed immediately.** `deletedAt` added to `Workspace`/`Contact`/`Conversation`/`Message` (matching exactly which models `DATABASE.md` Section 6 documents it for - `Provider`/`ContactIdentity`/`Notification` intentionally excluded, per that same spec). A Prisma Client extension (`packages/database/src/soft-delete.ts`) redirects `delete`/`deleteMany` to an update setting `deletedAt`, and injects `deletedAt: null` into `findMany`/`findFirst`/`count` by default. Verified live via `scripts/verify-soft-delete.cjs`: `prisma.contact.delete()` leaves the row in Postgres with `deleted_at` set, and a subsequent `findFirst` no longer returns it. |
| 9 | `/dev/mock-connector/send` was unauthenticated, unversioned, and had no guard preventing it from being reachable in a production deployment. | High (a debug endpoint that creates data must never be live) | **Fixed immediately.** The controller now throws `NotFoundException` (404, not 403 - this endpoint doesn't conceptually exist outside development, per `SECURITY.md`'s existence-sensitivity policy, it isn't a real resource being hidden from unauthorized callers) when `NODE_ENV === "production"`. Verified live: a standalone instance started with `NODE_ENV=production` returns a correctly-shaped 404 problem+json for this route. |
| 10 | CORS is wide open (`origin: true`). | Low at this stage | **Deferred** - explicitly acceptable for localhost-only Phase 1/2 development; must be tightened before any real deployment, not tracked as urgent yet. |
| 11 | No DB role separation (`DATABASE.md` Section 21 - `smc_app`/`smc_migrate`/`smc_readonly`); one connection string with full grants. | Low at this stage | **Deferred** to whenever a production deployment target exists - meaningless to set up against a throwaway local dev Postgres. |
| 12 | No audit logging at all (`SECURITY.md` Section 8); every mock-ingested message, rule fire, and notification leaves no durable trail beyond console output. | Medium | **Deferred**, explicitly scoped to whichever phase first has a real user taking real actions worth auditing - premature against synthetic Mock Connector traffic. |

**TODOs**: none - grepped for `TODO`/`FIXME`/`HACK`/`XXX` across `apps/` and `packages/`, zero matches, both before and after this review's fixes.

**Confirmed on-track, no deviation**: UUIDv7 usage (ADR-0007), workspace-scoping on every table, the event envelope's `correlationId`/`causationId` chain, and IdentityGraph's exact-match-only governance (ADR-0012/0013).

---

## Decision Rule Applied

Per explicit direction after this review: **implement now only what becomes more expensive to retrofit later; leave everything else on its originally assigned phase.** That rule produced findings #7, #8, #9 as "fix now" and everything else as "defer" - not a blanket "fix everything found" or "defer everything found," but a specific, stated cost-of-delay test applied per finding. Future phase reviews should apply the same test explicitly, not default to fixing everything a review surfaces.

## Outcome

3 of 12 new findings fixed same-day (RFC 7807, soft deletes, production guard on the dev endpoint), all three verified live (not just typechecked). 9 findings deliberately deferred to their already-planned phases, now with a dated record of why. Tagged `v0.1.1-phase1-hardening`.
