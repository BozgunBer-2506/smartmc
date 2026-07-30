# Phase 7 Review

```yaml
Title: phase-7-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-27
Depends On:
  - ROADMAP.md
Related ADRs: []
```

A point-in-time comparison of the actual Phase 7 (Slack Connector) implementation against `PRODUCT.md`, `ARCHITECTURE.md`, `CONNECTOR_SDK.md`, `EVENT_MODEL.md`, `SECURITY.md`, `DATABASE.md`, all ADRs current at the time, and `ROADMAP.md` - the seventh in the standing per-phase review practice. `ROADMAP.md`'s own "Notes on Sequencing" set the bar for this phase precisely: "Phases 5-8 exist specifically to pressure-test Phase 4... a forced SDK change at Phase 7/8 [should be treated as] a signal to stop and reassess, not as a routine cost." No such change was needed - confirmed below.

---

## What Was Built

The third real connector, and the first to combine two ingestion/auth shapes the SDK had already separately proven on Discord and Telegram, rather than needing either extended:

- **`SlackConnector`** (`packages/connector-sdk/src/slack/`) - a real `Connector` implementation making real Web API calls to `slack.com/api`, injected with a `SlackApiClient` (a `RealSlackApiClient` by default, swappable for tests/certification - the same pattern every prior connector uses).
- **`oauth2_redirect` auth** (`CONNECTOR_SDK.md` Section 3.1) - the same auth method Discord already uses, but a materially different credential shape: Slack's OAuth v2 install flow issues a genuinely distinct, per-workspace bot token (`xoxb-...`) via a real code exchange (`oauth.v2.access`), unlike Discord's one app-wide bot token reused across every guild. `SlackCredential` is `{ botToken, teamId }`, both per-`LinkedAccount`.
- **`"hybrid"` ingestion** (`CONNECTOR_SDK.md` Section 4.3) - the same ingestion mode Telegram already uses: Slack's Events API pushes to a webhook, backstopped by a periodic reconciliation pass. Unlike Telegram's per-`LinkedAccount` webhook URL, Slack's Events API endpoint is registered once, app-wide, in the Slack App config; incoming events carry their own `team_id`, used to route to the right `LinkedAccount`.
- **Real `initialSync`/`reconcile`** - Slack's genuine `conversations.list`/`conversations.history` endpoints make this a real bounded backfill and list-and-diff pass, the same proof point Discord's real history endpoint already established for a second provider; Slack is the third.
- **`SlackController`** (`apps/api/src/slack/`) - `POST /v1/connectors/slack/connect` (returns an `authorizationUrl`), `GET /v1/connectors/slack/callback` (a real 302 redirect target; unlike Discord's callback, this one performs a real OAuth code exchange before persisting anything), `POST /v1/connectors/slack/events` (the Events API webhook), `POST /v1/connectors/slack/{id}/disconnect`.
- **HMAC-SHA256 Events API signature verification** - a genuinely new piece of security-critical code no prior connector needed: Slack signs every Events API request with `X-Slack-Signature`/`X-Slack-Request-Timestamp` over the raw request body (`SECURITY.md`'s authenticity requirement), verified here with `crypto.timingSafeEqual` and a 5-minute replay window, matching Slack's own documented verification algorithm. Live-tested end-to-end (real crypto on both sides) via `verify-slack.cjs`.
- **`SlackApiService`** (`apps/api/src/slack/slack-api.service.ts`) - the one platform-orchestration call outside the core `Connector` interface: the OAuth code exchange, the same reason `TelegramApiService` exists for `setWebhook`/`deleteWebhook`.
- **`SlackOAuthStateService`** - short-lived OAuth CSRF state, the identical Redis-backed pattern `DiscordOAuthStateService` already established, reused rather than re-invented.
- **`SlackReconciliationService`** - the periodic half of the hybrid requirement, the same shape as `TelegramReconciliationService`/`DiscordReconciliationService`.
- **A "Connect Slack" control in `apps/web`'s Inbox** - a single button, the same shape as "Connect Discord."
- **Reused without any changes**: `LinkedAccount`/`SecretRecord` persistence, `CredentialsStoreService`, the Connector Registry, the idempotent-duplicate-handling fix from Phase 4 Sprint 2, and the reply endpoint - Slack's `send()` slotted in with zero changes to `POST /v1/conversations/{id}/messages`.

## No SDK Interface Change Was Needed

Confirming `ROADMAP.md`'s own expectation for this phase: `SlackConnector` needed no new `Connector` interface member and no new `IngestionMode` value. It is built entirely from combinations the SDK already supports - `oauth2_redirect` (proven by Discord) plus `"hybrid"` (proven by Telegram), applied to a third, independent provider. This is the concrete evidence `ROADMAP.md` asked this phase to produce: **the Connector SDK is now validated against three independent real providers (Telegram, Discord, Slack)** without a forced redesign at the third.

## A Real, Disclosed Bug Found During Live Signature Verification

Live-testing the Events API signature check (`verify-slack.cjs`, described above) surfaced a genuine pre-existing gap, not introduced by this phase: **no code in this repository ever loaded `apps/api/.env` into `process.env`.** `DATABASE_URL` appeared to work only because Prisma's own generated client independently loads `.env` for its own use; every other `*.config.ts` file (`auth.config.ts`, `telegram.config.ts`, `discord.config.ts`, and now `slack.config.ts`) was written assuming a loader existed, but none had ever actually been wired up - `SLACK_SIGNING_SECRET` set in `.env` was invisible to the running app until manually exported into the shell.

**Fix**: a single `dotenv` dependency (`apps/api/package.json`) and one line, `import "dotenv/config";`, as the first statement in `apps/api/src/main.ts`. Verified with a from-cold, nothing-manually-exported restart: the app correctly read `SLACK_SIGNING_SECRET` from `.env` alone (`verify-slack.cjs`'s signature checks passed 5/5). No `*.config.ts` file changed - every existing `() => process.env.X` accessor now works exactly as its own doc comments already described. `@nestjs/config`'s `ConfigModule` was considered and rejected: it would introduce a second, competing configuration pattern next to the one already used everywhere, for no benefit this project's stage needs. Not an ADR-worthy decision - it closes an environment bootstrap gap, not a change to any documented architecture.

This also retroactively explains why Discord's live-verification attempt (this session, prior to Phase 7) never progressed past a Cloudflare Tunnel being provisioned: any Discord config values added to `.env` at that point would have been silently inert for the same reason, though no such values were actually added before that attempt was postponed.

## Verified

- `pnpm --filter @smc/scripts certify:slack-connector` (15/16 checks passing, 1 correctly skipped - the same `send()`/`simulateFailure()` hook gap Telegram and Discord's real classes also don't expose, not a Slack-specific shortfall).
- `pnpm --filter @smc/scripts verify:slack` - real-network checks against the running API: registration, `POST /v1/connectors/slack/connect` correctly reporting `503 SLACK_NOT_CONFIGURED` when no Slack App is configured (the honest, disclosed state of this environment), and - with a real `SLACK_SIGNING_SECRET` configured - a fully live, real-crypto round trip: a validly-signed `url_verification` challenge is accepted and echoed back, an invalidly-signed request is rejected with `401`.
- `certify:mock-connector` (16/16), `certify:telegram-connector` (14/14, 2 skips), `certify:discord-connector` (15/15, 1 skip), `verify:phase3` (11/11), `verify:auth` (16/16), `verify:soft-delete`, `verify:telegram`, `verify:discord` all re-run clean - no regressions from Phase 7's SDK/dotenv changes.
- `pnpm lint`/`pnpm typecheck`/`pnpm build` all pass clean across the whole monorepo (12 workspace packages, including the new `dotenv` dependency).

### Not Verified Live - Disclosed, Not Hidden

Unlike Telegram's Phase 4 Sprint 2 bar, this phase does **not** include a human-confirmed live message exchange over a real Slack workspace, and - unlike Discord's callback - **the full OAuth install can never be exercised by a script at all**, regardless of configuration: Slack's `code` parameter is only ever issued by Slack itself after a real user clicks through Slack's own consent screen in a browser. `verify-slack.cjs` proves everything that is mechanically provable without that click: the connect endpoint's config-detection, the authorization URL's shape, and - the security-critical piece - the Events API signature verification working end-to-end with real cryptography. The next session with a real Slack App available (Client ID/Secret/Signing Secret, a workspace to install into) should complete the actual install via a browser and manually confirm a message round-trip through the Inbox UI, the same bar Telegram and (pending) Discord are held to.

**Update 2026-07-30 - live-verified in production.** A real Slack App was installed against production Railway infrastructure and a real message round-trip was confirmed end-to-end (OAuth install → Events API webhook → BullMQ → Postgres → `GET /v1/conversations`/Inbox UI). This surfaced two real bugs, both fixed the same session (not new scope, genuine defects in already-"complete" code): (1) the default bot OAuth scopes never requested `groups:read`, so `conversations.list`'s `private_channel` half 500'd with `missing_scope` on every install; (2) `syncChannels()` called `conversations.history` on every channel `conversations.list` returned, including ones the bot was never a member of, 500ing with `not_in_channel` - fixed by filtering to `is_member: true` channels before building the sync cursor. See `CHANGELOG.md`'s `[Unreleased]` entries for both. Slack is now genuinely feature-complete **and** fully validated - the "pending" caveat above is resolved.

## Deliberate Simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | `initialSync`/`reconcile` are bounded to the first 5 channels and the most recent 50 messages per channel - the same bound Discord uses, for the same reason. | Consistent with Discord's identical, already-disclosed simplification (`docs/reviews/phase-6-review.md` #1/#2). | **Deferred**, same as Discord. |
| 2 | Message edits (`message_changed`) and deletions (`message_deleted`) are not ingested - only plain `message` events. `capabilityManifest.messageEditing`/`messageDeletion: true` reflect that Slack *supports* these natively, not that this connector ingests them yet. | Same disclosed pattern as Discord's `messageEditing: true` (`docs/reviews/phase-6-review.md` #4) - the manifest describes provider capability, not built scope. | **Deferred**, tracked here so the manifest isn't mistaken for built behavior. |
| 3 | Reactions and threads (`reactions`/`threads: false`) are not implemented, even though Slack natively supports both. | Out of scope for a first working receive/send loop, consistent with every prior connector's "don't overengineer" precedent. | **Deferred**. |
| 4 | Sender identity is the raw Slack user ID (`U0123...`), not a resolved display name - `users.info` is never called. | Resolving real names is an extra Web API call per unique sender; IdentityGraph already has a real display-name path for Telegram/Discord and can be extended when this is prioritized. | **Deferred** - a real, disclosed simplification, not a silent omission. |
| 5 | Attachments are not downloaded/stored - an attachment-only message (`subtype: "file_share"`) maps to a `"[Attachment]"` placeholder, identical to Telegram's and Discord's handling. | Consistent with every prior connector - `CONNECTOR_SDK.md` Section 12's storage flow remains platform-wide and unbuilt. | **Deferred**, same as Telegram/Discord. |
| 6 | Slack-side app uninstall (`auth.revoke`) is not called on disconnect - only the local secret is deleted. | `SECURITY.md` Section 5.2's guarantee is our-side unusability, not provider-side revocation, which `CONNECTOR_SDK.md` Section 3.2 stage 6 already frames as best-effort; Discord's disconnect similarly calls no revocation endpoint. | **Accepted**, consistent with existing precedent. |
| 7 | Group management is declared `read_only` (`groupManagement`) - `conversations.invite`/`conversations.kick` are never called, even though Slack's Web API supports both. | No feature in this phase needs it; declaring `read_write` without building it would be a false capability claim (`CONNECTOR_SDK.md` Section 5's negotiation contract). | **Accepted** as an honest manifest, not a gap. |

## Already-Tracked Gaps, Still Open (not new)

| # | Finding | First noted |
|---|---|---|
| 8 | `packages/database`'s Prisma schema remains a pragmatic subset of `DATABASE.md`'s full spec. | Phase 1/2/3/4 reviews |
| 9 | The interim secrets store (ADR-0016) remains a disclosed pre-production gap versus `SECURITY.md`'s external-secrets-manager target - now also holding Slack's per-workspace bot tokens. | Phase 4 Sprint 2 review |
| 10 | Discord's connector remains unverified live against the real Discord network (postponed this session, per explicit user direction - see `STATUS.md` gap #9). | Phase 6 review |

**TODOs**: none - grepped `packages/connector-sdk/src/slack`, `apps/api/src/slack`, and the new/changed scripts for `TODO`/`FIXME`/`HACK`/`XXX`, zero matches, consistent with every prior phase.

**Confirmed on-track, no deviation**: credential validation always precedes persistence, now validated per-workspace via a real `auth.test` call cross-checked against the expected `teamId` (Section 3.2); the error taxonomy's 7 codes are exercised against real Slack error shapes (`invalid_auth`, `ratelimited`, `channel_not_found`, `missing_scope`, `msg_too_long`, 5xx, and Slack's own HTTP-200-with-`ok:false` quirk); the normalization contract's required fields match exactly; bot-authored messages are never ingested (`bot_id` filter), avoiding self-loops; UUIDv7 for every new row; soft-delete correctly applies to `LinkedAccount` and correctly does not apply to `SecretRecord`.

## Security Considerations

- Slack's per-workspace bot token goes through the identical `CredentialsStoreService` path every prior connector's credential does (encrypted at rest, unconditionally deleted on disconnect per `SECURITY.md` Section 5.2) - no new credential-handling surface.
- The OAuth v2 `state` parameter is a real CSRF defense (random, single-use, TTL-bound, verified before any code exchange happens), the same pattern Discord's `state` already provides - `SECURITY.md`'s threat table's "authorization code interception, scope escalation" risk.
- The Events API webhook is the one genuinely new attack surface this phase introduces (a public, unauthenticated-by-JWT endpoint, unlike every other connector endpoint) - closed by real HMAC-SHA256 signature verification (`crypto.timingSafeEqual`, constant-time) plus a 5-minute replay window, matching Slack's own documented algorithm exactly, not a simplified approximation of it.
- The dotenv bootstrap fix (above) has no security implication of its own - it makes existing, already-designed-for config accessors actually work, rather than introducing any new secret-handling path.

## Decision Rule Applied

Same rule as every prior phase: implement now only what's more expensive to retrofit later; defer everything else to its already-assigned scope. Unlike Phase 6, no SDK interface change was needed here, exactly as `ROADMAP.md` predicted - the one non-trivial new piece of code (Events API signature verification) is a webhook-authenticity mechanism, not an architectural change, and was implemented for real rather than stubbed, since a stubbed signature check would be a false security claim. The dotenv fix was implement-now by necessity (it silently broke Slack's own signing-secret configuration, and would have broken Discord's real credentials too, the moment anyone tried to use them) and was scoped to the smallest change consistent with the existing `*.config.ts` pattern, not a new configuration architecture.

## Future Work

- Complete a real Slack App install via a browser and manually confirm a message round-trip through the Inbox UI (see "Not Verified Live" above) - the concrete next step before this connector is production-ready.
- Resolve real sender display names via `users.info` (Simplification #4), likely batched/cached rather than per-message.
- Ingest `message_changed`/`message_deleted` events once Section 10's edit/delete conflict-resolution guidance is implemented platform-wide (the same gap already tracked for Telegram/Discord).
- Raise or make configurable the channel-count/message-count bounds on initial sync (Simplification #1), same as Discord.
- Complete Discord's live verification (tracked separately, `STATUS.md` gap #9) - now unblocked from a purely mechanical standpoint by the dotenv fix, though still requires the user's own Discord Application setup.

## Outcome

The third real connector exists, is certified against the same suite every connector is held to, and is the first built entirely from ingestion/auth combinations the SDK already supports - no interface change, confirming `ROADMAP.md`'s own prediction for this phase. **The Connector SDK is now validated against three independent real providers.** One real, disclosed, pre-existing gap (the `.env` bootstrap) was found and fixed during live signature-verification testing, with the smallest change consistent with the codebase's existing configuration pattern - not a new architecture, and not an ADR-worthy decision. Live, human-confirmed verification over a real Slack workspace is the one explicitly incomplete item, disclosed here rather than hidden.
