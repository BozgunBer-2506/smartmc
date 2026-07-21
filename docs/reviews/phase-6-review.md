# Phase 6 Review

```yaml
Title: phase-6-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-22
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0019
```

A point-in-time comparison of the actual Phase 6 (Discord Connector) implementation against `PRODUCT.md`, `ARCHITECTURE.md`, `CONNECTOR_SDK.md`, `EVENT_MODEL.md`, `SECURITY.md`, `DATABASE.md`, all ADRs current at the time, and `ROADMAP.md` - the sixth in the standing per-phase review practice. This is also the phase `ROADMAP.md`'s own "Notes on Sequencing" section flagged as the deliberate pressure-test of the Sprint 1 Connector SDK: "if any of them require changing the SDK interface, that's expected for Discord (Phase 6) - it's the first real second connector." It did, and the change is documented below.

---

## What Was Built

The second real connector, and the first built on a genuinely different ingestion shape than Telegram's:

- **`DiscordConnector`** (`packages/connector-sdk/src/discord/`) - a real `Connector` implementation making real REST calls to `discord.com/api/v10` and maintaining a real Gateway v10 WebSocket connection, injected with a `DiscordApiClient` (a `RealDiscordApiClient` by default, swappable for tests/certification - the same pattern `TelegramConnector` uses).
- **A real Gateway client** (`discord-gateway-client.ts`) - `IDENTIFY`/`HELLO`/heartbeat/`RESUME`/reconnect-with-backoff, implemented against the actual Discord Gateway protocol, not simulated. Uses the `ws` package (already an indirect dependency via `socket.io`).
- **The `Connector` interface's first real extension since Sprint 1**: `startListening()` (returns a `StreamHandle`) and a fourth `IngestionMode` value, `"streaming"` - both introduced in [ADR-0019](adr/0019-discord-gateway-streaming-connector-extension.md), the SDK interface change `ROADMAP.md` explicitly anticipated and sanctioned for this phase.
- **Real `initialSync`/`reconcile`**, not a no-op like Telegram (ADR-0017) - Discord's genuine channel-history endpoint (`GET /channels/{id}/messages`) makes `CONNECTOR_SDK.md` Section 8.1's bounded backfill and Section 4.3's list-and-diff reconciliation implementable exactly as originally specified. This is the first real proof that the Sprint 1 design generalizes beyond Telegram's provider-specific constraints.
- **`DiscordController`** (`apps/api/src/discord/`) - `POST /v1/connectors/discord/connect` (returns an `authorizationUrl` for the browser to redirect to, matching `CONNECTOR_SDK.md` Section 3.1's `oauth2_redirect` method and `API.md`'s documented `{ authorizationUrl }` response shape), `GET /v1/connectors/discord/callback` (a real 302 redirect target, not a JSON endpoint - Discord's browser lands here after the user picks a server), `POST /v1/connectors/discord/{id}/disconnect`.
- **`DiscordGatewayManagerService`** - owns every active Discord `LinkedAccount`'s `StreamHandle`, starting one on boot (for accounts already `active`) and on connect, stopping one on disconnect - a genuinely new kind of platform-side responsibility Telegram's stateless webhook receiver never required.
- **`DiscordReconciliationService`** - the periodic half of ADR-0019's reconciliation requirement, mirroring `TelegramReconciliationService`'s shape but doing a real list-and-diff this time.
- **`DiscordOAuthStateService`** - short-lived CSRF state for the OAuth redirect round-trip, stored in the project's existing Redis instance (reusing `auth/login-throttle.service.ts`'s exact pattern, not new infrastructure).
- **A "Connect Discord" control in `apps/web`'s Inbox** - a single button (no token input field, unlike Telegram - Discord's `oauth2_redirect` method needs none from the user) that redirects to Discord and surfaces the outcome when the browser lands back on `/?discord=connected`.
- **Reused without any changes**: `LinkedAccount`/`SecretRecord` persistence, `CredentialsStoreService`, the Connector Registry, the idempotent-duplicate-handling fix from Phase 4 Sprint 2, and the reply endpoint (`POST /v1/conversations/{id}/messages`) - it already looked connectors up through the registry, so Discord's `send()` slotted in with zero changes to that endpoint.

## The One Real Architectural Decision

**[ADR-0019](adr/0019-discord-gateway-streaming-connector-extension.md)** - Discord's Gateway is a persistent, provider-initiated WebSocket connection, a shape `CONNECTOR_SDK.md` Section 4 (webhook/polling/hybrid) has no category for. Rather than force-fitting it into "webhook" (misleading - Discord never calls an HTTP endpoint of ours) or building a fake polling loop (not how any real Discord bot operates), the `Connector` interface gained one new optional method (`startListening`) and `IngestionMode` gained a fourth value (`"streaming"`, treated like `"hybrid"` for the reconciliation requirement). This is exactly the sanctioned SDK change `ROADMAP.md`'s sequencing notes predicted for this phase - not scope creep, and not required again for Phase 7 (Slack), whose Events API is a normal HTTP webhook, closer to Telegram's shape.

The same ADR also resolves a smaller, second question cleanly without any interface change: Discord's bot-token auth doesn't expire (unlike a typical per-user OAuth access token), so `CONNECTOR_SDK.md` Section 3.2 stage 4's proactive-refresh behavior is never triggered by this connector - a property of Discord's specific auth shape, not a gap.

## Verified

- `pnpm --filter @smc/scripts certify:discord-connector` (15/16 checks passing, 1 correctly skipped) - a fake `DiscordApiClient`, deterministic, no network required. Notably, the "initial sync resumes from an arbitrary durable checkpoint" check **passed for real** here (it was a legitimate `skip` for Telegram) - direct evidence the Sprint 1 checkpoint/resume design generalizes to a provider with real history, exactly as `ROADMAP.md` hoped this phase would test.
- `pnpm --filter @smc/scripts verify:discord` - real-network checks: registration, and `POST /v1/connectors/discord/connect` correctly reporting `503 DISCORD_NOT_CONFIGURED` when no Discord Application is configured (the honest, disclosed state of this environment - see below).
- `verify:phase3` (11/11), `verify:auth` (16/16), `verify:soft-delete`, `certify:mock-connector` (16/16), `certify:telegram-connector` (14/14, 2 legitimate skips), `verify:telegram` all re-run clean - no regressions from Phase 6's SDK/schema changes.
- `pnpm typecheck`/`pnpm lint`/`pnpm build` all pass clean across the whole monorepo (10 packages, including the new `ws`/`@types/ws` dependency).

### Not Verified Live - Disclosed, Not Hidden

Unlike Phase 4 Sprint 2 (Telegram), this phase does **not** include a human-confirmed live message exchange over the real Discord network. Setting that up requires registering a real Discord Application in the Developer Portal (Client ID/Secret, a bot token, enabling the privileged `MESSAGE_CONTENT` intent) and adding the bot to a real test server - a meaningfully bigger one-time setup than Telegram's single BotFather token, and the user deliberately deferred it to a later session rather than doing it now. What **is** verified, without that setup:

- The full Gateway protocol implementation is real code (`IDENTIFY`, heartbeat, `RESUME`, reconnect-with-backoff), not a stub - it has simply never been pointed at a live Discord Gateway connection yet.
- The REST client, OAuth2 authorization-URL construction, and the full connect/callback/disconnect control flow are exercised by certification and `verify:discord`'s config-detection check.
- `mapMessage`/`mapError`/the normalization contract are certified against fixtures modeled directly on real Discord API response shapes.

This is a real, bounded gap - the same class of thing `docs/reviews/phase-2-review.md` already established precedent for ("no UI was built... verified live via API-observable behavior... a login screen is a later increment"). The next session that has a real Discord Application available should run `pnpm --filter @smc/scripts verify:discord` with `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_BOT_TOKEN`/`DISCORD_PUBLIC_BASE_URL`/`DISCORD_TEST_GUILD_ID` set, plus a manual message-send/reply check through the actual Inbox UI, before this connector is considered production-ready.

## Deliberate Simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | `initialSync`/`reconcile` are bounded to the first 5 text channels and the most recent 50 messages per channel, not `CONNECTOR_SDK.md` Section 8.1's fuller "last 30 days or 500 messages" example. | A guild can have far more channels/history than is reasonable to eagerly sync on every connect for a first implementation; the bound is real and enforced (not silently unlimited), just smaller than the spec's illustrative default. | **Deferred** - raise the bound (or make it configurable) once a real workspace's usage shows the current one is too small. |
| 2 | Messages are only ingested from the first 5 text channels discovered at connect time - new channels created afterward are never picked up. | Channel-list re-discovery on every sync pass would add real complexity (detecting new channels, deciding whether to auto-include them) disproportionate to what's needed to prove the connector works. | **Deferred** - a future enhancement, not required by this phase's Definition of Done. |
| 3 | `DiscordOAuthStateService`'s CSRF state is a single-Redis-instance store with no clustering/multi-region consideration. | Matches this project's current single-instance-Redis stage exactly (the same Redis `LoginThrottleService` already uses) - building for a scale this project isn't at yet would be premature. | **Accepted**, consistent with the project's stated "don't overengineer" instruction. |
| 4 | Message edits (Discord's `MESSAGE_UPDATE` dispatch) and deletions are not ingested - only `MESSAGE_CREATE`. `capabilityManifest.messageEditing: true` reflects that Discord *supports* edits, not that this connector ingests them yet. | Section 10's conflict-resolution guidance for edits is real work (fetching/replacing `body_text`, version history) not required for this phase's core receive/send loop. | **Deferred**, tracked here so the manifest's `messageEditing: true` isn't mistaken for a built feature. |
| 5 | Attachments are not downloaded/stored (`CONNECTOR_SDK.md` Section 12 remains platform-level and unbuilt, as disclosed in every connector review so far) - an attachment-only message maps to a `"[Attachment]"` placeholder body text. | Consistent with Telegram's identical simplification (Phase 4 Sprint 2 review) - Section 12's pre-signed-URL storage flow is a platform-wide feature, not a per-connector one. | **Deferred**, same as Telegram. |
| 6 | The one app-wide Discord bot token is stored once per `LinkedAccount` (duplicated across every guild a workspace connects) rather than shared via a single `SecretRecord`. | Keeps the `credentialsRef` → `SecretRecord` relationship uniform across every connector (Telegram's per-account-token model and Discord's shared-token model both look the same from `LinkedAccount`'s perspective) - a small storage redundancy traded for architectural consistency. | **Accepted** - simplicity over a micro-optimization. |

## Already-Tracked Gaps, Still Open (not new)

| # | Finding | First noted |
|---|---|---|
| 7 | `packages/database`'s Prisma schema remains a pragmatic subset of `DATABASE.md`'s full spec (IdentityGraph confidence-scoring, RLS, DB role separation still spec-only). | Phase 1/2/3/4 reviews |
| 8 | The interim secrets store (ADR-0016) remains a disclosed pre-production gap versus `SECURITY.md`'s external-secrets-manager target - now storing Discord's app-wide bot token in addition to per-workspace Telegram tokens. | Phase 4 Sprint 2 review |
| 9 | `DiscordGatewayManagerService` runs inside `apps/api`'s single process, not a separate connector-worker (`ARCHITECTURE.md`/ADR-0009's eventual per-connector-worker split) - flagged explicitly as a consequence in ADR-0019 itself, not discovered after the fact. | New this phase (ADR-0019), tracked here and in `STATUS.md` |

**TODOs**: none - grepped `packages/connector-sdk/src/discord`, `apps/api/src/discord`, and the new/changed scripts for `TODO`/`FIXME`/`HACK`/`XXX`, zero matches, consistent with every prior phase.

**Confirmed on-track, no deviation**: credential validation always precedes persistence, now validated per-guild not just per-token (Section 3.2); the error taxonomy's 7 codes are exercised against real Discord error shapes (401/429/404/403/400/5xx); the normalization contract's required fields match exactly; bot-authored messages (ours and other bots') are never ingested, avoiding self-loops; UUIDv7 for every new row; soft-delete correctly applies to `LinkedAccount` and correctly does not apply to `SecretRecord`.

## Security Considerations

- The app-wide Discord bot token is exactly as sensitive as any Telegram bot token and goes through the identical `CredentialsStoreService` path (encrypted at rest, unconditionally deleted on disconnect per `SECURITY.md` Section 5.2) - no new credential-handling surface was introduced.
- The OAuth2 `state` parameter is a real CSRF defense (random, single-use, TTL-bound, verified before any `LinkedAccount` is created) - `SECURITY.md`'s threat table explicitly names "authorization code interception, scope escalation" as an OAuth2 risk this addresses.
- The Gateway connection authenticates with the bot token exactly once (`IDENTIFY`), the same credential already covered by the secrets-store threat model - no additional credential type was introduced by the streaming connection itself.

## Decision Rule Applied

Same rule as every prior phase: implement now only what's more expensive to retrofit later; defer everything else to its already-assigned scope. ADR-0019's SDK extension was implement-now by necessity (Discord cannot function without it) and was explicitly pre-authorized by `ROADMAP.md`'s own sequencing notes. Everything in the Deliberate Simplifications table was a genuine, disclosed scope call, not a shortcut taken silently - and the one gap this review is most explicit about (no human-confirmed live message exchange) is disclosed as exactly that, not glossed over as complete.

## Future Work

- Run `verify:discord`'s full flow and a manual Inbox walkthrough once a real Discord Application is available (see "Not Verified Live" above) - the concrete next step before this connector is production-ready.
- Raise or make configurable the channel-count/message-count bounds on initial sync (Simplification #1/#2).
- Ingest `MESSAGE_UPDATE`/`MESSAGE_DELETE` dispatches once Section 10's edit/delete conflict-resolution guidance is implemented platform-wide (likely alongside Telegram's `edited_message` handling, which has the same gap).
- Revisit `DiscordGatewayManagerService`'s single-process placement when connector volume/`ARCHITECTURE.md`'s connector-worker split actually becomes necessary (ADR-0019's own noted consequence).

## Outcome

The second real connector exists, is certified against the same suite the Mock and Telegram connectors are held to, and is the first to prove the Sprint 1 SDK design generalizes to a provider with real history/backfill capability - exactly the pressure-test `ROADMAP.md` intended this phase to be. One real, pre-authorized architectural decision (ADR-0019) extended the `Connector` interface for the Gateway's streaming shape. Live, human-confirmed verification over the real Discord network is the one explicitly incomplete item, disclosed here rather than hidden, and deferred to the user's own timeline per their explicit direction this session.
