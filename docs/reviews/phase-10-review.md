# Phase 10 Review

```yaml
Title: phase-10-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-28
Depends On:
  - ROADMAP.md
  - AUTOMATION_ENGINE.md
Related ADRs: []
```

A point-in-time comparison of the actual Phase 10 (Automation Engine) implementation against `AUTOMATION_ENGINE.md`'s full design (208 examples, visual canvas, NL rule creation, marketplace, time-travel simulator) and `ROADMAP.md`'s Phase 10 checklist - the tenth in the standing per-phase review practice, and the largest single gap yet between a design doc's full ambition and what a phase actually ships. `AUTOMATION_ENGINE.md` explicitly frames itself as "the design a decade of engineering teams will build against" - this phase is the first real slice of that decade's work, not the whole thing, and this review is unusually detailed about exactly which slice.

---

## What Was Built

- **`packages/automation-engine`** (new package) - the trigger/condition/action/context model, framework-agnostic:
  - **Trigger registry** (`triggers.ts`) - two registered trigger types: `message.received` (event-driven) and `time.no_reply_after` (scheduled), each declaring its Context Object guarantees (`AUTOMATION_ENGINE.md` Section 3.2/3.4).
  - **Context Object** (`buildContext()`) - `message`/`conversation`/`sender`/`workspace`/`execution` sections populated from real data (Section 6); `ai`/`automation_memory`/`location` sections are not populated (nothing produces them yet).
  - **Condition evaluator** (`conditions.ts`) - a real nested AND/OR/NOT tree evaluator (Section 4.1) with 9 operators and the one callable primitive, `conversation.isStale(hours)`.
  - **Variable interpolation** (`variables.ts`) - `{{message.bodyText}}`-style Context-variable resolution (Section 4.3 tier 1 only).
  - **Action executor** (`actions.ts`) - sequential-only action chain execution against an injected `ActionPorts` interface, producing per-action results so partial success is representable (Section 5.4).
- **`apps/api/src/automation`** - the real wiring:
  - `RuleExecutionService` - matches a workspace's enabled rules for a fired trigger type via an indexed `Rule.triggerType` column (Section 10's "indexed, not full scan"), evaluates conditions, executes matched rules with per-rule try/catch isolation, and records an idempotent `RuleExecutionLog` row keyed on `(ruleId, ruleVersion, triggerEventId)`.
  - Four real action types wired to real side effects: `notification.send` (writes `Notification`, emits over the existing WebSocket gateway), `tag.apply` (writes to `Conversation.tags`), `message.send` (sends through the real connector registry + credentials store, the same path `ConversationsController.sendMessage` uses), `webhook.call` (POSTs with a 5s timeout and an SSRF guard blocking private/internal IP ranges - `AUTOMATION_ENGINE.md` Section 12 example #190, resolved via DNS lookup on the actual target, not just a hostname-string check).
  - `SchedulerService` - the durable relative-time trigger mechanism (Section 3.3): a `ScheduledJob` Postgres row plus a matching BullMQ delayed job per `(rule, conversation)`; an inbound message (re)schedules every enabled `time.no_reply_after` rule against that conversation, an outbound message (a real reply, or the automation engine's own `message.send` action) cancels the pending job.
  - `RulesController` - full CRUD (`GET/POST/PATCH/DELETE /v1/rules`), a dry-run test endpoint (`POST /v1/rules/:id/dry-run`, no real side effects), and an execution-log listing endpoint (`GET /v1/rules/:id/executions`).
  - `EventsProcessor`'s Phase 1-9 hardcoded "stub rule" (notify on every message, unconditionally) is fully replaced by a real call into `RuleExecutionService`. Every new workspace's `AuthService.register()` now seeds one real, visible, disable-able `Rule` row ("Notify me on every message") reproducing that exact starter behavior as data instead of code - `AUTOMATION_ENGINE.md`'s own "inspectable, never magical" principle applied to the very first thing a new user sees.
- **`apps/web`** - a functional (not visual-canvas) rule builder: `Rules.tsx`, reachable via a new "Automations" button in the Inbox header. Create a rule (trigger + provider scope + hours, a flat AND/OR condition list, an action list with type-specific param fields), enable/disable, delete, test (dry-run against a synthetic sample), and view recent execution history per rule.
- **Schema additions**: `Rule` (trigger/conditions/actions as jsonb, `version` optimistic-locking column, indexed `triggerType`), `RuleExecutionLog` (append-only, unique on `(ruleId, ruleVersion, triggerEventId)`), `ScheduledJob` (unique on `(ruleId, conversationId)`), `Conversation.tags` (a plain `String[]`, not the still-deferred relational `Tag`/`MessageTag` model).
- **`scripts/verify-phase10.mjs`** - 21 real, end-to-end checks against the running API: the starter-rule seed, condition-gated matching (a VIP-only rule fires for a VIP sender and not a non-VIP one, confirmed via both the execution log and the dry-run endpoint), `tag.apply`'s recorded success, idempotency (dry-run never writes a log), optimistic-locking version tracking, enable/disable/delete semantics, trigger-type validation, and the scheduled `time.no_reply_after` trigger actually firing after its delay elapses with no reply.

## What Was Not Built (the honest gap against `AUTOMATION_ENGINE.md`)

This phase implements the engine's *mechanics* - trigger, condition, action, execution, retry-adjacent isolation, a real scheduler - against a deliberately narrow slice of the design doc's surface. Explicitly not built, not silently skipped:

- **Trigger categories**: only `message.received` and one time-based trigger (`time.no_reply_after`) exist. Contact/conversation/workspace/manual/event/location-aware triggers (Section 3.1's other six categories) are unregistered - the registry (`TRIGGER_REGISTRY`) is the extension point, not a rewrite, when they're added.
- **Visual rule builder (Section 7)**: `Rules.tsx` is a functional form - trigger dropdown, a flat condition list with one top-level AND/OR, an action list - not a drag/drop canvas with visually nested condition groups. The *stored* shape (`ConditionNode`) still supports arbitrary nesting, so a richer UI can be built on the same rules later without a data migration.
- **Natural language rule creation (Section 8)** and **AI-assisted rules (Section 9)**: not built at all. Consistent with `PRODUCT.md`'s "AI is optional, never load-bearing" - the engine is fully useful without either.
- **Action chain branching/parallelism/delayed-in-chain steps (Section 5.2)**: actions run purely sequentially. There is no `{{steps.N.output}}` (no multi-step context to reference), so branching logic has nothing to condition on yet.
- **Workspace variables and computed/derived variables (Section 4.3 tiers 2-3)**: only Context variables (tier 1) are interpolated.
- **Rule versioning's draft/published/rollback lifecycle (Section 14.1)**: `version` is a real optimistic-locking column, but there's no separate draft-vs-published state or version history browsing/rollback UI - an edit updates the live row in place.
- **Rule simulator (Section 14.3)** and **step-by-step debugger (Section 14.4)**: the dry-run endpoint and the execution-log list are the honest, much smaller stand-ins - a single synthetic sample and a flat history list, not a time-travel virtual-clock sandbox or a per-condition-node trace view.
- **Rule analytics (Section 15)**, **marketplace (Section 16)**, **import/export (Section 17)**: not built.
- **Condition/composite-action snippets (Sections 4.4/5.3)**: no extraction-into-named-reusable-unit mechanism; every rule's conditions/actions are fully inline.
- **Retry policy (Section 11) and circuit breaker (Section 12)**: an action either succeeds or fails once per execution - no per-action retry/backoff, no circuit breaker tripping across repeated failures, no auto-disable-after-N-consecutive-failures. `RuleExecutionLog.status` still faithfully records success/partial_failure/failure per execution; there's just no automated response to a failing pattern yet.
- **Dead Letter Queue (Section 13)**: no `dead_lettered` status or replay UI - a failed action's result is visible in the execution log, but nothing routes it to a distinct DLQ surface.
- **Recurring/cron scheduled triggers (Section 3.1's "Scheduled triggers")**: `time.no_reply_after` is the only scheduled trigger type; "every Monday 9am"-style recurring schedules are not implemented.
- **A reconciliation sweep for `ScheduledJob` rows a Redis eviction silently drops** (`DATABASE.md` Section 6.13 itself already flags this as a Phase 11 concern, not Phase 10's).
- **Tag/MessageTag (`DATABASE.md` Section 6.11)**: `tag.apply` writes to a plain `Conversation.tags String[]`, not a relational per-workspace tag catalog with colors/metadata - already a tracked gap since Phase 8/9.

None of the above are silent cuts - each is either a `TRIGGER_REGISTRY`/`ActionType`-shaped extension point already in the code, or called out inline in the relevant file's own doc comment.

## Verified

- `pnpm --filter @smc/scripts verify:phase10` - 21/21 checks passing, real end-to-end against the running API and Postgres (see script for the full list: starter-rule seeding, VIP-conditioned matching, tag application, idempotent dry-run, optimistic locking, enable/disable/delete, trigger-type validation, and the scheduled no-reply trigger actually firing).
- `verify:phase3` (11/11) and `verify:phase9` (22/22) re-run clean - replacing the hardcoded stub rule with the real engine plus a seeded starter rule reproduces the exact notification-on-every-message behavior those scripts depend on; no regression.
- `verify:auth` (16/16) re-run clean.
- `pnpm lint`/`pnpm typecheck` pass clean across the whole monorepo (a new `packages/automation-engine/.eslintrc.js` was needed - every other package has one, this one was missing until this phase).
- Manual smoke test: the API dev server boots with `AutomationModule` wired into `AppModule`/`EventsModule`/`ConversationsModule`; `apps/web`'s dev server serves the page with the new "Automations" tab without a build/compile error (confirmed via `curl` + a clean `next` typecheck). Full interactive click-through of the Rules UI (creating a rule via the form, toggling enable/disable, viewing history) was **not** performed - no browser-automation tool is available in this session. The API surface the UI calls is fully exercised by `verify-phase10.mjs` instead; the UI itself should still get a real click-through before this is considered done end-to-end.

## A Real Bug Found and Fixed During Verification

Two real, non-obvious bugs surfaced only by actually running `verify-phase10.mjs` against a live server, both fixed before this phase was considered complete:

1. **Soft delete silently didn't apply to `Rule`.** `packages/database/src/soft-delete.ts`'s `SOFT_DELETE_MODELS` allowlist has to name every soft-deletable model explicitly - `Rule` was added to the schema and to `DELETE /v1/rules/:id`'s handler, but not to this list, so a "deleted" rule kept appearing in `GET /v1/rules`. Fixed by adding `"Rule"` to the list.
2. **BullMQ rejects `:` in a custom job id.** `SchedulerService` originally keyed delayed jobs as `` `${ruleId}:${conversationId}` `` - BullMQ throws `Custom Id cannot contain :` at `queue.add()` time, which silently failed the scheduling call (caught by the queue's own retry/failure logging, not by anything user-visible) and meant `time.no_reply_after` rules never actually fired. Fixed by switching the separator to `_` (`jobIdFor()`).

Both were caught because this phase's verification script exercises the real HTTP/DB/queue path end-to-end rather than only unit-testing `packages/automation-engine`'s pure functions - the same lesson `docs/reviews/phase-9-review.md` and others already established, reconfirmed here.

## Deliberate Simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | Rule matching is a `findMany` per fired trigger type, filtered in-app by scope/conditions - not a fully precomputed per-workspace index beyond the `triggerType` column itself. | Correct and fast at this product's current scale; the `triggerType` column is the one indexing decision `AUTOMATION_ENGINE.md` Section 10 explicitly calls out, and it's in place. | **Accepted** at current scale, same "don't build for a scale not yet reached" principle every prior phase applies. |
| 2 | `workspace.isSilentHours` is hardcoded `false` in the Context Object. | No silent-hours settings surface exists yet to populate it from - there is nothing real to evaluate. | **Deferred** until a settings/silent-hours feature exists. |
| 3 | The flat, single-level AND/OR condition UI in `Rules.tsx` (vs. arbitrary nesting). | The stored `ConditionNode` shape already supports full nesting (Section 4.1) - only the builder UI is narrowed, not the data model or the evaluator. | **Deferred** - additive UI work, no backend change needed later. |
| 4 | `tag.apply` writes to `Conversation.tags String[]`, not a relational `Tag`/`MessageTag` catalog. | Already a tracked gap since Phase 8/9 (`STATUS.md` gap #17); building the full relational model just for this one action type would be scope creep against this phase's actual need. | **Deferred**, same tracked gap. |
| 5 | No reconciliation sweep for dropped `ScheduledJob` rows. | `DATABASE.md` Section 6.13 itself already assigns this to Phase 11, not Phase 10. | **Deferred to Phase 11**, per the schema's own prior note. |
| 6 | Rule UI click-through wasn't done in a real browser this session. | No browser-automation tool available; the API surface it calls is fully covered by `verify-phase10.mjs` instead. | **Should be done** before calling the UI itself fully verified - flagged, not silently assumed working. |

## Already-Tracked Gaps, Still Open (not new)

| # | Finding | First noted |
|---|---|---|
| 7 | `packages/ui`/`apps/marketing-site` theme consolidation. | STATUS.md gap #12 |
| 8 | No staging environment. | STATUS.md gap #13 |
| 9 | Discord/Slack/Email connectors remain unverified live (postponed/blocked on external setup). | STATUS.md gaps #9/#14/#16 |

**TODOs**: grepped `packages/automation-engine/src` and `apps/api/src/automation` for `TODO`/`FIXME`/`HACK`/`XXX` - zero matches, consistent with every prior phase.

## Security Considerations

- Every `RulesController` endpoint is `JwtAuthGuard`-protected and workspace-scoped (`findFirst({ where: { id, workspaceId } })` throughout) - no rule, execution log, or dry-run from another workspace is visible or actionable.
- `webhook.call` resolves the target hostname via DNS and blocks private/internal/link-local IP ranges before connecting (`ssrf-guard.ts`) - directly implementing `AUTOMATION_ENGINE.md` Section 12 automation example #190, and checking the resolved address (not just the hostname string) so a DNS-rebinding attempt against a public-looking hostname is still caught.
- `message.send` reuses `ConversationsController`'s exact credential-decryption and connector-send path - no new secret-handling code, no new place for a credential to leak.
- The dev-only `/dev/mock-connector/send` and `POST /dev/identity-matching/run` precedents are unchanged by this phase.

## Decision Rule Applied

Same rule as every prior phase: implement now only what's more expensive to retrofit later; defer everything else to its already-assigned scope or a later phase. The trigger/condition/action/context model, the indexed matcher, real idempotency, and the durable scheduler were implement-now by necessity - a fake/mocked execution engine would be far more expensive to retrofit once real rules exist and users depend on them. The visual canvas, NL rule creation, marketplace, simulator, and analytics are all additive UI/product surfaces on top of a now-real backend, not backend rework - exactly the kind of thing safe to defer.

## Future Work

- A real click-through of `Rules.tsx` in a browser (Simplification #6).
- Nested-condition-group UI, still backed by the same already-nesting-capable data model (Simplification #3).
- Contact/conversation/workspace/manual/event/location trigger types, each an addition to `TRIGGER_REGISTRY`, not a rewrite.
- Recurring/cron scheduled triggers, alongside `time.no_reply_after`.
- Retry policy, circuit breaker, auto-disable, and a real Dead Letter Queue surface (Sections 11-13).
- Rule simulator and step-by-step debugger (Sections 14.3-14.4).
- Workspace variables and multi-step action chaining with branching (Sections 4.3 tier 2, 5.2).
- Condition snippets and composite actions (Sections 4.4/5.3), then the marketplace built on top of them (Section 16).
- A `ScheduledJob` reconciliation sweep (already assigned to Phase 11 by `DATABASE.md`).

## Outcome

Phase 10 replaces Phase 1-9's hardcoded "stub rule engine" with a real, if deliberately narrow, Automation Engine: two trigger types, a genuinely nested condition evaluator, four working action types (including a real security control on the riskiest one), an idempotent and isolated execution engine, and a durable scheduler for the single most-requested time-based pattern (`PRODUCT.md`'s "no reply after 2 days"). `AUTOMATION_ENGINE.md`'s full 208-example, marketplace-and-simulator vision remains exactly that - a vision this phase takes one real, working, extensible step into, not the whole distance.
