# Phase 11 Review

```yaml
Title: phase-11-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-28
Depends On:
  - ROADMAP.md
Related ADRs: []
```

A point-in-time comparison of the actual Phase 11 (Notification Engine) implementation against `ROADMAP.md`'s six-item checklist and the two schema sections that back it (`DATABASE.md` Section 6.14's `notification_preferences`, and `API.md`'s `PATCH /v1/notification-preferences`). Unlike Phase 10, there is no dedicated `NOTIFICATION_ENGINE.md` design doc - this phase's scope was set by reading the checklist against what's actually already committed to in the schema/API docs, and disclosing the rest as net-new design decisions this phase chose to make small or defer, rather than executing an already-specified plan.

---

## What Was Built

- **`NotificationPreference`** (new model, exactly per `DATABASE.md` Section 6.14): `silentHoursStart`/`silentHoursEnd` ("HH:mm" text - no native Postgres `time` column via `prisma db push` without a raw migration), `vipOverrideEnabled` (default `true`), `keywordAlerts` (`string[]`). One row per `(workspace, user)`.
- **`GET`/`PATCH /v1/notification-preferences`** (`apps/api/src/notification-preferences`) - self-only, exactly the authorization exception `API.md` specifies ("never settable on someone else's behalf, even by a workspace admin"). `GET` returns sensible defaults (never-silent, no keywords) before any row exists, rather than a 404; `PATCH` upserts and validates `HH:mm` time format.
- **Real silent-hours/VIP-override/keyword-alert evaluation** in `packages/automation-engine` - closing Phase 10's own disclosed stub gap:
  - `workspace.isSilentHours` - now computed from the workspace owner's `NotificationPreference` against the current time in the workspace's timezone (`silent-hours.ts`'s `isSilentHoursActive()`), correctly handling a window that wraps midnight (e.g. "22:00"-"06:00").
  - `workspace.isVipOverrideActive` (`AUTOMATION_ENGINE.md` Section 4.2's exact primitive name) - true only when silent hours are active, the sender is VIP, and `vipOverrideEnabled` is true.
  - `message.matchesKeywordAlert` - true if the message body contains any configured keyword, case-insensitive.
  - All three are real, ordinary Context Object fields - resolvable by any rule's conditions with zero engine changes, not a special-cased "notification suppression" mechanism bolted on separately. This is the same messaging-native-condition-primitive pattern `AUTOMATION_ENGINE.md` Section 4.2 already established for VIP/staleness checks.
- **The starter "Notify me on every message" rule's conditions were upgraded** (`AuthService.register()`) from an unconditional `AND []` to `NOT(silentHours) OR isVipOverrideActive OR matchesKeywordAlert` - the concrete, working realization of "Emergency/override mode" and "Keyword alerts" from the checklist, expressed as an ordinary rule rather than new engine logic. With no preference row configured (every workspace's default), this is vacuously "always notify," so Phase 3/9/10's existing behavior and regression scripts are unaffected until a user actually sets silent hours.
- **Priority-based sound cues** (`apps/web/lib/sound.ts`) - three synthesized Web Audio API tone patterns (routine / "Needs You" tier / VIP tier), matching the same 30/60 priority-score thresholds the Inbox's own badge and Phase 9's scoring already use. Played on `message.received` only, never on the user's own outbound `message.sent`.
- **A notification-preferences settings panel** in `apps/web`'s `Rules.tsx` (the "Automations" screen) - silent-hours start/end time pickers, a VIP-override checkbox, and a comma-separated keyword-alerts field, backed by the real endpoint above.
- **`scripts/verify-phase11.mjs`** - 12 real, end-to-end checks: preference defaults, round-trip persistence, a plain message suppressed during a live silent-hours window, a VIP sender breaking through, a keyword-matching message breaking through, and disabling VIP override actually stopping a VIP sender from breaking through.

## What Was Not Built (the honest gap against the checklist)

Two of the checklist's six items have no existing schema/API spec anywhere in the docs set (unlike `notification_preferences`, which Section 6.14 already fully specified) - building them for real would mean making a first, unreviewed schema/design decision, not executing one already committed to:

- **Custom sounds per VIP/contact**: only priority-tier sounds exist (Simplification #1 below); there's no per-contact sound picker, no sound-asset storage/upload mechanism, and no schema field for it anywhere in `DATABASE.md`.
- **Reminder alerts (Waiting On / Commitments)**: `DATABASE.md` has no `Commitment`/`WaitingOn` table at all - grepped, zero matches. Phase 10's `time.no_reply_after` scheduler is a real, already-working mechanism a user can build a "remind me if X doesn't reply" rule on today, which covers the reminder-*alert* half of this item; a first-class Waiting-On/Commitments data model and dashboard (`PRODUCT.md` problems #31-40) is a genuinely separate, larger feature this phase did not build.
- **Escalation rules**: no dedicated "escalation policy" concept exists either in schema or as a distinct action type. A user can already compose an escalation manually today with existing primitives (e.g. `conversation.isStale(N)` AND `sender.isVip` -> `notification.send` + `tag.apply`), but there is no first-class "escalate after N hours to person Y" building block.

Neither is a silent cut: both are called out here and in `ROADMAP.md`'s checklist annotations as requiring net-new design this phase deliberately didn't invent under this ticket.

## Verified

- `pnpm --filter @smc/scripts verify:phase11` - 12/12 passing, real end-to-end against the running API, Postgres, and a live silent-hours window (a window covering "now" is configured via `PATCH`, then a plain/VIP/keyword-matching message's actual notification-or-not outcome is confirmed via `GET /v1/notifications`).
- `verify:phase3` (11/11), `verify:phase9` (22/22), `verify:phase10` (21/21), and `verify:auth` (16/16) all re-run clean - the starter rule's upgraded conditions don't change behavior for any workspace without a configured silent-hours window, which is every workspace those scripts create.
- `pnpm lint`/`pnpm typecheck` pass clean across the whole monorepo.
- Manual smoke test: `apps/web` typechecks/lints clean and serves without a compile error with the new settings panel and sound-cue wiring. Full interactive click-through (setting silent hours in the browser, hearing the tiered chimes, watching a message get suppressed live) was **not** performed - same disclosed limitation as Phase 10: no browser-automation tool is available in this session. The API/engine behavior it depends on is fully covered by `verify-phase11.mjs` instead.

## Deliberate Simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | Sounds are priority-tier only (routine/Needs-You/VIP), not per-contact. | No schema/spec exists for a per-contact sound choice; building storage + a picker UI + asset handling for it would be a first, unreviewed design decision, not this phase's job. | **Deferred** until a real per-contact-sound spec exists. |
| 2 | Silent hours/VIP override/keyword alerts are evaluated from the **workspace owner's** `NotificationPreference` row, used as a workspace-wide setting - not truly per-member. | `NotificationPreference` is correctly modeled per `(workspace, user)` for future multi-member support, but the Automation Engine's rule matching is workspace-level, not per-recipient - there's no "who is this notification for" concept yet for it to consult a specific member's preference. | **Deferred** until notifications are per-user-targeted (see #3). |
| 3 | `Notification` stays workspace-scoped, not per-user with `readAt`/fan-out, despite `DATABASE.md` Section 6.14 specifying `user_id`/`read_at` columns. | Making notifications genuinely per-user requires deciding a rule's "audience" (all workspace members? the rule's creator? something configurable?) - a real design question, not a quick column add, and out of this phase's scope as originally read. | **Deferred** - flagged as the natural next step before per-member silent hours (#2) can be real. |
| 4 | Reminder alerts / Waiting-On / Commitments and Escalation rules are not built as first-class features. | No existing schema/spec for either (see "What Was Not Built" above) - would be net-new design, not execution of a committed plan. | **Deferred**, both explicitly flagged in `ROADMAP.md`'s Phase 11 checklist annotations. |
| 5 | `silentHoursStart`/`End` are stored as `"HH:mm"` text, not a native Postgres `time` column. | This project has no migrations mechanism beyond `prisma db push` (the same reasoning `docs/reviews/phase-9-review.md` Simplification #3 already used for a partial unique index) - a raw `time` column needs a real migration to add a check constraint/format guarantee properly. | **Deferred** until a real migrations mechanism exists. |
| 6 | Rules UI / sound-cue click-through wasn't done in a real browser this session. | No browser-automation tool available; the behavior it depends on is fully covered by `verify-phase11.mjs`. | **Should be done** before calling the UI itself fully verified - same standing gap as Phase 10. |

## Already-Tracked Gaps, Still Open (not new)

| # | Finding | First noted |
|---|---|---|
| 7 | `packages/ui`/`apps/marketing-site` theme consolidation. | STATUS.md gap #12 |
| 8 | No staging environment. | STATUS.md gap #13 |
| 9 | Discord/Slack/Email connectors remain unverified live (postponed/blocked on external setup). | STATUS.md gaps #9/#14/#16 |
| 10 | Phase 10's `Rules.tsx` UI click-through still not done in a real browser. | STATUS.md gap #20 |

**TODOs**: grepped `packages/automation-engine/src`, `apps/api/src/notification-preferences`, `apps/web/lib/sound.ts` for `TODO`/`FIXME`/`HACK`/`XXX` - zero matches, consistent with every prior phase.

## Security Considerations

- `NotificationPreferencesController` is self-only by construction (`claims.sub` is always the target user, never a path/body parameter) - there is no code path where one user can read or write another's preferences, matching `API.md`'s explicit authorization exception.
- Silent-hours/keyword-alert data is read into the Automation Engine's Context Object at execution time only, never written back or exposed to a rule's action output beyond the existing `RuleExecutionLog.actionsExecuted` trace every other Phase 10 action already produces.
- No new external network calls, no new secret handling - this phase touches only first-party Postgres data and client-side Web Audio.

## Decision Rule Applied

Same rule as every prior phase: implement now only what's already committed and expensive to retrofit later; defer everything without a pre-existing spec. `NotificationPreference` and wiring it into real Context Object primitives were implement-now by necessity - `DATABASE.md`/`API.md` already committed to this exact schema and endpoint, and Phase 10's own `workspace.isSilentHours` stub was already a flagged, waiting-to-be-closed gap. Custom sounds, Waiting-On/Commitments, and escalation rules all require a first design decision this phase didn't have a mandate to make unilaterally - genuinely different in kind from "finish what was already specified," which is why they're deferred rather than built small-and-wrong.

## Future Work

- Decide and implement per-user notification targeting (`Notification.userId`/`readAt`, `DATABASE.md` Section 6.14) - the prerequisite for silent hours/VIP override to be genuinely per-member rather than owner-wide (Simplifications #2/#3).
- Design and build a first-class Waiting-On/Commitments data model and dashboard (`PRODUCT.md` problems #31-40) - a real feature, not a quick add.
- Design a first-class escalation-policy concept, or decide that composing one from existing rule primitives is sufficient and document that as the answer.
- A per-contact sound picker, once a real design/spec exists for it.
- A real click-through of the notification-preferences panel and sound cues in a browser (Simplification #6).
- Move `silentHoursStart`/`End` to a native `time` column once a real migrations mechanism exists (Simplification #5).

## Outcome

Phase 11 ships the one checklist item that had a fully committed schema/API spec (`notification_preferences`) as a real, working feature, and uses it to turn two more checklist items (Emergency/override mode, Keyword alerts) into genuine, tested behavior expressed through the Automation Engine's own condition primitives rather than new special-cased logic - closing Phase 10's own disclosed `workspace.isSilentHours` stub in the process. Priority-based sounds ship as a real, if simple, client-side feature. Custom sounds, Waiting-On/Commitments, and escalation rules are explicitly not built, for the same reason: no existing spec to execute against, and inventing one wasn't this phase's call to make alone.
