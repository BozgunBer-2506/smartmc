# Smart Message Center - STATUS.md

```yaml
Title: STATUS.md
Version: 3.3
Status: Living
Owner: Founder/CTO
Last Updated: 2026-07-22
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0011
  - ADR-0012
  - ADR-0013
  - ADR-0014
  - ADR-0015
  - ADR-0016
  - ADR-0017
  - ADR-0018
  - ADR-0019
```

Living status file. Updated at the end of every work session. If a new session starts cold (context lost, new machine, new day), read this file first, then [ROADMAP.md](ROADMAP.md), before doing anything else.

---

## Current Phase

**Phase 0 (Product Foundation) through Phase 5 (Telegram Connector): COMPLETE.** **Phase 6 (Discord Connector) - COMPLETE and certified** as of 2026-07-22, with one disclosed gap: no human-confirmed live message exchange over the real Discord network yet (requires a real Discord Application the user has deliberately deferred setting up - see `docs/reviews/phase-6-review.md`).

## What Actually Runs Right Now

From a clean checkout:

```
pnpm install          # see the environment note below - must run from real WSL, not a Windows UNC path
docker compose up -d   # Postgres (host port 5433), Redis, mailhog
pnpm db:generate && pnpm db:push
pnpm dev               # apps/web on :3000, apps/api on :4000, 6 packages in tsc --watch
```

**A real person can now**: open `http://localhost:3000`, register or log in, connect a real Telegram bot (a token from @BotFather) and/or click "Connect Discord" to install the platform's Discord bot into their own server, and have real messages from either provider appear in their own Inbox in real time, sender resolved by name through IdentityGraph - then reply from the Inbox and have that reply delivered back to the real chat. Telegram's flow is human-confirmed live end to end; Discord's is fully implemented and certified but not yet exercised against a real Discord server (see Phase 6 below). Sending a mock message (Phase 3's demo path) still works unchanged alongside both.

**Connector SDK (Phase 4 Sprint 1)**: `pnpm --filter @smc/scripts certify:mock-connector` runs the Connector Certification Suite against the Mock Connector (16/16 checks passing) - the same mechanical bar every connector is held to.

**Telegram Connector (Phase 4 Sprint 2 / Phase 5)**: `POST /v1/connectors/telegram/connect` (real `getMe` validation before persistence), `POST /v1/connectors/telegram/webhook/{linkedAccountId}` (the real webhook receiver, secret-token-verified), `POST /v1/connectors/telegram/{id}/disconnect`, `POST /v1/conversations/{id}/messages` (the reply path, provider-agnostic - looked up through the Connector Registry). `pnpm --filter @smc/scripts certify:telegram-connector` (14/14 applicable, 2 legitimate skips) and `pnpm --filter @smc/scripts verify:telegram` (real-network negative-path + simulated-webhook checks) are the standing regression checks. Credentials are stored via an interim envelope-encrypted secrets store (`apps/api/src/credentials-store/`, [ADR-0016](adr/0016-interim-envelope-encrypted-secrets-store.md)) - a disclosed, pre-production gap versus `SECURITY.md`'s target external-secrets-manager design, tracked below.

**Discord Connector (new, Phase 6)**: `POST /v1/connectors/discord/connect` (returns an OAuth2 authorization URL - `CONNECTOR_SDK.md` Section 3.1's `oauth2_redirect` method), `GET /v1/connectors/discord/callback` (the real install-completion redirect target, per-guild credential validation before persistence), `POST /v1/connectors/discord/{id}/disconnect`, and the same provider-agnostic `POST /v1/conversations/{id}/messages` reply path Telegram uses. Receiving is a real Discord Gateway v10 WebSocket connection (`IDENTIFY`/heartbeat/`RESUME`/reconnect), not a webhook - the SDK's first `"streaming"` connector ([ADR-0019](adr/0019-discord-gateway-streaming-connector-extension.md)). `pnpm --filter @smc/scripts certify:discord-connector` (15/16, 1 legitimate skip) and `pnpm --filter @smc/scripts verify:discord` are the standing regression checks. Discord's `initialSync`/`reconcile` do a real bounded backfill/diff against Discord's genuine channel-history endpoint - unlike Telegram's documented no-op (ADR-0017), this is the first real proof the Sprint 1 sync design generalizes. **Not yet human-verified live** - requires a real Discord Application (Developer Portal Client ID/Secret/bot token), which the user has deferred setting up; see `docs/reviews/phase-6-review.md`.

**Auth (Phase 2)**: `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `POST /v1/auth/logout-all`, `GET /v1/auth/sessions`, `GET /v1/users/me`. Registering auto-creates an Organization + Workspace + owner `WorkspaceMember`. `pnpm --filter @smc/scripts verify:auth` is the standing regression check (16/16 passing, re-confirmed clean after Phase 3).

**Identity & Messaging (new, Phase 3)**: `GET /v1/conversations`, `GET /v1/conversations/{id}/messages`, `GET /v1/notifications` - all `JwtAuthGuard`-protected, workspace-scoped from verified JWT claims only, never a client-supplied id. `POST /dev/mock-connector/send` now accepts an optional Bearer token: present and valid → ingests into that user's real workspace; absent → falls back to the `DEV_WORKSPACE_ID` fixture for continued dev convenience; present and invalid → `401`, never silently ignored. The WebSocket gateway now requires a valid JWT at connect time (`handshake.auth.token`) and disconnects anyone without one - no more client-supplied `?workspaceId=`. `apps/web` has a real login/register form and a real Inbox (conversation list, message history, notifications, live toasts). `pnpm --filter @smc/scripts verify:phase3` is the standing regression check (11/11 passing): register → reject unauthenticated socket → authenticated socket connects → mock message ingested into the real workspace → both `message.received` and `notification.created` arrive over the socket → sender resolved to a name via IdentityGraph → durability confirmed via all three new REST reads → a second, unrelated user's `GET /v1/conversations` is proven empty (workspace isolation). `verify:soft-delete` re-run clean too. `verify-realtime.mjs` (Phase 1's unauthenticated-room version) is retired, fully superseded.

**Environment note (read before re-running `pnpm install`)**: this repo sits on a WSL filesystem reached from Windows via a `\\wsl.localhost\...` UNC path. Windows-native pnpm crashes on that path (`Error: ...: is not a valid disk on Windows`, a pnpm bug, not a project misconfiguration). Run `pnpm`/`docker`/`node` commands from inside real WSL instead: `wsl.exe -d Ubuntu -- bash -lc 'cd /home/.../smartmc && <command>'`.

**Local dev database note**: Phase 2's schema change (`Workspace.organizationId` became required) forced a `prisma db push --force-reset` on the local dev database - safe, since it only held disposable Phase 1 mock-connector test data. If you're resuming on a machine with an older local DB, expect to do the same (`pnpm db:push --force-reset` from `packages/database`, or just `docker compose down -v && docker compose up -d` for a fully clean slate).

## Repository

**Structure finalized via [ADR-0011](adr/0011-monorepo-layout.md); Phase 6 added `packages/connector-sdk/src/discord/` and `apps/api/src/discord/` - no new top-level packages.**
```
smartmc/
├── docs/          (15 documents, adr/ [0001-0019], reviews/ [phase-1 .. phase-4-sprint-2, phase-6])
├── apps/
│   ├── web/         Next.js - real login/register form + real authenticated Inbox + Connect Telegram/Discord
│   └── api/         NestJS - health, events, realtime, mock-connector, auth, users, audit,
│   │                conversations (reply endpoint), notifications, credentials-store, telegram, discord (new)
├── packages/
│   ├── database/      Prisma schema: messaging core (Phase 1) + Organization/User/UserCredentials/
│   │                  WorkspaceMember/Session/AuditLog (Phase 2) + LinkedAccount/SecretRecord (Phase 4 Sprint 2)
│   │                  + soft-delete extension
│   ├── shared/       Canonical domain types, DEV_WORKSPACE_ID/DEV_ORGANIZATION_ID
│   ├── event-model/    EventEnvelope + EventType
│   ├── identity/      IdentityGraph exact-match resolver
│   ├── connector-sdk/   Connector interface (+ streaming/StreamHandle, Phase 6), lifecycle, capability
│   │                  manifest, error taxonomy, registry, certification suite, Mock/Telegram/Discord Connectors
│   ├── config/       Real ESLint + Prettier presets
│   ├── ui/          Minimal Button primitive
│   │                (automation-engine, auth, ai, design-tokens still empty, reserved per phase)
├── infrastructure/   (empty, reserved)
├── scripts/        @smc/scripts - verify-phase3.mjs, verify-soft-delete.cjs, verify-auth.mjs,
│                   certify-mock-connector.mjs, certify-telegram-connector.mjs, verify-telegram.cjs,
│                   certify-discord-connector.mjs (new), verify-discord.cjs (new)
├── docker-compose.yml (Postgres @ 5433, not 5432)
├── LICENSE        (all-rights-reserved)
```
GitHub remote: `https://github.com/BozgunBer-2506/smartmc` - public, connected.

## Phase 6 - Discord Connector (complete, certified, live human verification pending)

Full detail in `ROADMAP.md`'s Phase 6 section and [docs/reviews/phase-6-review.md](reviews/phase-6-review.md). Summary:

**Implemented**: a real `DiscordConnector` (`packages/connector-sdk/src/discord/`) making real REST calls to `discord.com/api/v10` and maintaining a real Gateway v10 WebSocket connection (`IDENTIFY`/heartbeat/`RESUME`/reconnect); `DiscordGatewayManagerService` owning every active guild's persistent connection; `DiscordReconciliationService` doing a genuine list-and-diff reconciliation pass (Discord has a real history endpoint, unlike Telegram); the OAuth2 install flow (`connect`/`callback`/`disconnect`); a "Connect Discord" control in the Inbox.

**One real architectural decision**: [ADR-0019](adr/0019-discord-gateway-streaming-connector-extension.md) - Discord's Gateway doesn't fit `CONNECTOR_SDK.md` Section 4's webhook/polling/hybrid taxonomy, so the `Connector` interface gained an optional `startListening()` method and `IngestionMode` gained a `"streaming"` value. This was the SDK interface change `ROADMAP.md`'s own sequencing notes explicitly expected and sanctioned for this phase - not a sign Phase 4 was under-designed.

**Verified**: `certify:discord-connector` (15/16, 1 legitimate skip - notably, the checkpoint-resume check that Telegram had to skip *passed for real* here, proving the Sprint 1 sync design generalizes) and `verify:discord` (real-network config-detection checks). **Not yet verified**: a human-confirmed live message exchange over the real Discord network - this needs a real Discord Application (bigger setup than Telegram's single bot token), which the user explicitly deferred to a later session. Disclosed in full in the phase review, not hidden.

Tagged `v0.5.0-phase6`.

## Phase 4 Sprint 2 / Phase 5 - Telegram Connector (complete, verified live end to end)

Full detail in `ROADMAP.md`'s Phase 4 Sprint 2 and Phase 5 sections and [docs/reviews/phase-4-sprint-2-review.md](reviews/phase-4-sprint-2-review.md). Summary:

**Implemented**: a real `TelegramConnector` (`packages/connector-sdk/src/telegram/`) making real HTTP calls to `api.telegram.org`; `LinkedAccount`/`SecretRecord` persistence (`DATABASE.md` Section 6.5, previously spec-only); an interim envelope-encrypted `CredentialsStoreService` standing in for the external secrets manager `SECURITY.md` specifies; a real webhook receiver, a `getUpdates`-based reconciliation drain (ADR-0017), a real reply path (`POST /v1/conversations/{id}/messages`), and idempotent duplicate handling in the event pipeline (a real Phase 1-inherited gap, closed this sprint).

**Three real architectural decisions, each resolved via ADR before implementation**: [ADR-0016](adr/0016-interim-envelope-encrypted-secrets-store.md) (interim secrets store), [ADR-0017](adr/0017-telegram-sync-and-reconciliation-strategy.md) (Telegram's Bot API has no history endpoint and `getUpdates`/webhook are mutually exclusive), [ADR-0018](adr/0018-linked-account-status-uses-connector-sdk-lifecycle.md) (`LinkedAccount.status` uses the SDK's full lifecycle vocabulary, not `DATABASE.md`'s narrower original sketch).

**Verified with a complete, human-confirmed live run**: a real Telegram user sent a real message to a disposable test bot; it was ingested and appeared in the real Inbox with the sender resolved by name; a reply was sent from the Inbox and confirmed received on the real Telegram app on the other end - not simulated, not mocked.

Tagged `v0.4.1-phase4-sprint2`.

## Phase 4 Sprint 1 - Connector SDK Foundation (complete, verified live)

Full detail in `ROADMAP.md`'s Phase 4 Sprint 1 section and [docs/reviews/phase-4-sprint-1-review.md](reviews/phase-4-sprint-1-review.md). Summary:

**Implemented**: the `Connector` interface (`packages/connector-sdk`), a Capability Manifest that structurally enforces the hybrid-by-default reconciliation rule, the full 9-state lifecycle state machine shared by every connector, a standardized error taxonomy with automatic credential redaction, an in-process connector registry, and the Connector Certification Suite (`certifyConnector()`) - a mechanical, CI-runnable conformance test exercising 16 checks drawn from `CONNECTOR_SDK.md`'s certification checklist. The Mock Connector is migrated onto the SDK as a real `Connector` implementation; `generateMockMessage()` (Phase 1's original helper) is kept as a thin backward-compatible adapter, so `apps/api`'s mock-connector controller needed no changes.

**No ADR required** - this sprint implements `CONNECTOR_SDK.md` as already documented (it has gated Phase 1 since 2026-07-18), not a deviation from it.

**Deliberately out of Sprint 1 scope** (a real provider is needed to make these meaningful, so they're Sprint 2/Telegram's job): real webhook/polling transport, OAuth/credential-entry auth flows, `LinkedAccount` persistence, attachment abstraction, health monitoring, and real outbound retry/backoff. Full reasoning per item in the phase review.

Verified live via `pnpm --filter @smc/scripts certify:mock-connector` (16/16). `verify:phase3` (11/11), `verify:auth` (16/16), `verify:soft-delete` all re-confirmed clean against the migrated Mock Connector - no regressions.

## Phase 3 - Identity & Messaging Foundation (complete, verified live)

Full detail in `ROADMAP.md`'s Phase 3 section and [docs/reviews/phase-3-review.md](reviews/phase-3-review.md). Summary:

**Implemented**: the real Postgres-backed Inbox read model (`GET /v1/conversations`, `GET /v1/conversations/{id}/messages`), the real notifications list (`GET /v1/notifications`), Mock Connector ingestion tied to a real authenticated workspace (optional Bearer token, `DEV_WORKSPACE_ID` fallback preserved), WebSocket realtime authenticated via JWT at connect time (no more client-supplied `workspaceId`), a shared `TokenService` used by the HTTP guard, the WebSocket gateway, and the mock connector alike, and a real login/register + Inbox UI in `apps/web`.

**One real architectural deviation**: [ADR-0015](adr/0015-rest-inbox-read-path-for-phase-3.md) - `API.md` frames the inbox read path as GraphQL-first, but no GraphQL server exists anywhere in the codebase and standing one up now would be new infrastructure, contradicting this phase's explicit "no new technologies" instruction. Implemented as plain REST; GraphQL remains the Phase 9 target.

**Deliberately deferred** (per `ROADMAP.md`'s own Phase 3 checklist, not new gaps): public Workspace/account CRUD endpoints, Linked Accounts model, Tags, Folders, Search shell, user preferences (silent hours/VIP structure) - none were required by this phase's Definition of Done.

Tagged `v0.3.0-phase3`.

## Lint / Husky gap - closed 2026-07-18 (before Phase 4)

The project's oldest open item (flagged unresolved in both the Phase 1 and Phase 2 reviews) is now closed. `packages/config` (previously reserved/empty) now holds a real shared ESLint preset (`eslint-preset.js`, `eslint:recommended` + `plugin:@typescript-eslint/recommended` + `eslint-config-prettier`, non-type-aware for speed) and a shared Prettier preset (`prettier-preset.js`). All 7 non-Next code-bearing packages extend it via `.eslintrc.js` (`extends: [require.resolve("@smc/config/eslint-preset")]` - a plain string `"@smc/config/eslint-preset"` does not resolve correctly through ESLint's `eslint-config-*` naming-convention resolver once a shareable config name has a subpath, so `require.resolve()` is used to bypass that resolution and hand ESLint an absolute path directly). `apps/web` uses `next lint` + `eslint-config-next` instead, matching Next.js's own convention. A Husky pre-commit hook (`.husky/pre-commit`) now runs `pnpm lint && pnpm typecheck` before every commit. `pnpm lint`/`pnpm typecheck`/`pnpm build` all verified clean across all 8 code-bearing packages after the change (2 pre-existing `no-explicit-any` warnings in `packages/database/src/soft-delete.ts`, no errors).

## Phase 2 - Authentication (backend complete, verified live)

Full detail in `ROADMAP.md`'s Phase 2 section and [docs/reviews/phase-2-review.md](reviews/phase-2-review.md). Summary:

**Implemented**: email+password register/login (Argon2id, 12+ char policy, HIBP breach-check, Redis account lockout), JWT access tokens (15 min) + rotating refresh cookies with full `family_id` reuse-detection (verified live, including the family-wide revocation cascade), logout/logout-all/session listing, `JwtAuthGuard` + `RolesGuard` (owner/admin/member RBAC foundation, no role-gated resource yet), RFC 7807 errors for every auth failure mode, audit logging for every auth event, automatic Organization+Workspace creation on registration.

**One real architectural correction**: [ADR-0014](adr/0014-custom-jwt-session-auth.md) - `ARCHITECTURE.md` named "Auth.js," which has no NestJS integration and can't implement `DATABASE.md`'s session design. Corrected to a custom implementation of the same documented behavior, not a redesign.

**Deliberately deferred** (per `ROADMAP.md`'s own Phase 2 checklist, not new gaps): OAuth (Google/GitHub), Passkeys (schema is ready - `user_credentials.password_hash` is nullable), 2FA (TOTP), user-settings endpoints, public Organization/Workspace CRUD endpoints (that's Phase 3's "Workspace/account model"), and any login UI (Definition of Done was API-observable only).

Tagged `v0.2.0-phase2`.

## Phase 1 - Project Bootstrap (complete, reviewed, hardened)

**Sprint 1 (infrastructure)** - now fully complete. Real ESLint/Prettier config and Husky pre-commit hooks were closed 2026-07-18, before Phase 4 - see "Lint / Husky gap - closed" above.

**Sprint 2 (vertical slice)** - complete and re-verified after Phase 2's schema changes.

**Phase 1 Review** ([docs/reviews/phase-1-review.md](reviews/phase-1-review.md)): 3 findings fixed same-day and verified live - RFC 7807 error model, soft-delete infrastructure, production guard on the mock-connector endpoint. 9 findings deliberately deferred. Tagged `v0.1.0-phase1` and `v0.1.1-phase1-hardening`.

## Phase 0 - Complete Document Set (15 documents, 19 ADRs)

| Document | Core content |
|---|---|
| `PRODUCT.md` | Vision, personas, 100 problems/solutions, competitor analysis, MVP/V2, pricing, brand, Never Build list |
| `ARCHITECTURE.md` | System architecture, folder structure, DB schema draft, event flow, API design draft, **Section 6: Authentication Flow (corrected, ADR-0014)**, Section 13: IdentityGraph |
| `DATABASE.md` | Full PostgreSQL schema spec - Phase 1+2 together implement Organization/Workspace/User/UserCredentials/WorkspaceMember/Session/AuditLog + the messaging core |
| `API.md` | Full REST+GraphQL contract |
| `SECURITY.md` | Threat model, credential/secrets management, GDPR operational policy, audit logging spec - Section 4 (Auth) now implemented |
| `AUTOMATION_ENGINE.md` | The flagship differentiator - not yet implemented (Phase 10) |
| `CONNECTOR_SDK.md` | The contract any provider integration conforms to (Phase 4) |
| `EVENT_MODEL.md` | The canonical ~40-event registry (4 implemented so far) |
| `UI_GUIDE.md` | Complete UX philosophy - no UI built against it yet beyond the Phase 1 dev Inbox stub |
| `DESIGN_SYSTEM.md` | Implementation-ready design system - not yet built against |
| `ROADMAP.md` | 19 phases, working rules, Phase 1-6 verified Definitions of Done |
| `STATUS.md` | This file |
| `DECISIONS.md` | Index of all 19 ADRs |

**ADRs 0001-0019**: PostgreSQL, Prisma, REST-over-GraphQL-by-default, Connector SDK, event-driven architecture, URI versioning, UUIDv7 primary keys, two-level multi-tenancy, modular monolith + connector workers, Telegram Bot API only, monorepo layout, IdentityGraph as a first-class capability, identity merge safety over matching cleverness, custom JWT/session auth instead of Auth.js, REST (not GraphQL) for the Phase 3 inbox read path, interim envelope-encrypted secrets store, Telegram sync/reconciliation strategy given Bot API's shape, LinkedAccount.status uses the SDK's full lifecycle vocabulary, **Discord Gateway: a streaming ingestion mode and Connector interface extension**.

## Known Open Decisions / Gaps (tracked so they aren't lost)

1. **Pricing numbers** ($12/mo Pro, $18/seat Business) - a starting hypothesis (`PRODUCT.md`), not a blocker.
2. **LinkedIn DM integration** feasibility (no public API) - deferred to Phase 16-17.
3. **`packages/database`'s Prisma schema is a pragmatic subset of `DATABASE.md`'s full spec** - `LinkedAccount` is now real (Phase 4 Sprint 2); IdentityGraph's confidence-scoring/merge-suggestion tables, RLS, and DB role separation remain spec-only, deferred to their assigned phases.
4. **Six Phase 2 simplifications on record** (citext→app-level email normalization, no timing-attack mitigation on login, no `trust proxy` config, raw device/IP in session listing, untuned Argon2id parameters, 15-min role-change propagation delay) - all reasoned and disclosed in `docs/reviews/phase-2-review.md`, none hidden.
5. **`Notification` has no `readAt` column** - `GET /v1/notifications` (Phase 3) is read-only, no mark-read/unread state yet. Disclosed in `docs/reviews/phase-3-review.md`, deferred to whichever phase first needs it (likely Phase 11).
6. **The interim secrets store is envelope encryption in Postgres, not a real external secrets manager** ([ADR-0016](adr/0016-interim-envelope-encrypted-secrets-store.md)) - a disclosed, pre-production security posture reduction, to be closed before any real customer credential is ever stored in production. Now also holds Discord's app-wide bot token.
7. **The reply endpoint sends synchronously and returns `201`, not `API.md`'s documented `202 Accepted` + async-WebSocket-observed shape** - disclosed in `docs/reviews/phase-4-sprint-2-review.md`; revisit when a real need for async/bulk/scheduled send exists.
8. **Media/attachments, Groups/Channels, and a LinkedAccount health/status UI screen are not yet implemented for Telegram** - disclosed in `docs/reviews/phase-4-sprint-2-review.md`, deferred to their own scope.
9. **Discord's connector has not been verified live against the real Discord network** - certified against a fake API client and real-network config-detection checks only; needs a real Discord Application (Client ID/Secret/bot token) the user has deferred setting up. Disclosed in `docs/reviews/phase-6-review.md`, the concrete next step before this connector is production-ready.
10. **Discord `initialSync`/`reconcile` are bounded to 5 channels / 50 messages per channel**, and new channels created after connect are never auto-discovered - disclosed in `docs/reviews/phase-6-review.md`, deferred until real usage shows the bound is too small.
11. **`DiscordGatewayManagerService` runs inside `apps/api`'s single process**, not a separate connector-worker (`ARCHITECTURE.md`/ADR-0009's eventual split) - flagged as a known consequence in ADR-0019 itself.

All other previously-open decisions are resolved, including the lint/Husky gap (closed 2026-07-18, see above) - see [DECISIONS.md](DECISIONS.md).

## Next Action

1. **Verify Discord live** when a real Discord Application is available: register one in the Developer Portal, enable the privileged `MESSAGE_CONTENT` intent, add the bot to a test server, set `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_BOT_TOKEN`/`DISCORD_PUBLIC_BASE_URL`/`DISCORD_TEST_GUILD_ID`, run `pnpm --filter @smc/scripts verify:discord`, and manually confirm a real message round-trip through the Inbox UI - the same bar Telegram already cleared.
2. Begin Phase 7 - Slack Connector: `ROADMAP.md`'s own sequencing note expects this one to *not* require another SDK interface change (Slack's Events API is a normal HTTP webhook, closer to Telegram's shape than Discord's Gateway) - treat a forced change here as a signal to stop and reassess, not a routine cost.

## How to Resume From Zero Context

1. Read this file (`STATUS.md`).
2. Read `ROADMAP.md` for the full phase plan, working rules, and Phase 1-6's exact verification steps.
3. Read `PRODUCT.md`, `ARCHITECTURE.md` (Section 6 for auth, Section 13 for IdentityGraph), and `DECISIONS.md` for decisions already made - do not re-derive or re-litigate anything documented there.
4. To actually run the app: see "What Actually Runs Right Now" above, including the WSL environment note and the local-DB-reset note.
5. Continue from "Next Action" above, or from wherever the user redirects.
