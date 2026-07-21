# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning tracks `docs/ROADMAP.md`'s phases rather than strict SemVer pre-1.0 - a version bump corresponds to a completed, tagged phase (see `docs/reviews/` for the review behind each one), not an API stability guarantee. Phase 0 (Product Foundation) produced no code, only the documentation set in `docs/` - it predates versioned releases and isn't listed below.

## [Unreleased]

Phase 7 - Slack Connector is next. `ROADMAP.md`'s own sequencing note expects this one to *not* require another SDK interface change (Slack's Events API is a normal HTTP webhook) - a forced change here would be a signal to stop and reassess.

## [0.5.0] - 2026-07-22 - Phase 6: Discord Connector (`v0.5.0-phase6`)

### Added
- A real `DiscordConnector` (`packages/connector-sdk/src/discord/`) making real REST calls to `discord.com/api/v10` and maintaining a real Gateway v10 WebSocket connection - the second real connector, and the first built on a genuinely different ingestion shape than Telegram's
- A real Discord Gateway client (`IDENTIFY`/heartbeat/`RESUME`/reconnect-with-backoff) using the `ws` package
- `Connector.startListening()` (returns a `StreamHandle`) and a fourth `IngestionMode` value, `"streaming"` - the SDK interface change `ROADMAP.md`'s sequencing notes explicitly anticipated for this phase (ADR-0019)
- Real `initialSync`/`reconcile` against Discord's genuine channel-history endpoint - unlike Telegram's documented no-op (ADR-0017), the first proof the Sprint 1 sync design generalizes to a provider with real history
- `POST /v1/connectors/discord/connect`, `GET /v1/connectors/discord/callback`, `POST /v1/connectors/discord/{id}/disconnect` - Discord's `oauth2_redirect` install flow (`CONNECTOR_SDK.md` Section 3.1)
- `DiscordGatewayManagerService` (owns every active guild's persistent connection) and `DiscordReconciliationService` (the periodic list-and-diff pass ADR-0019 still requires for streaming connectors)
- `DiscordOAuthStateService` - short-lived CSRF state for the OAuth redirect round-trip, reusing the project's existing Redis instance pattern
- A "Connect Discord" control in `apps/web`'s Inbox
- `pnpm --filter @smc/scripts certify:discord-connector` (15/16, 1 legitimate skip) and `pnpm --filter @smc/scripts verify:discord` regression checks
- ADR-0019: Discord Gateway - a streaming ingestion mode and Connector interface extension

### Changed
- `defineCapabilityManifest()`/`requiresReconciliation()` treat `"streaming"` the same as `"hybrid"` for the reconciliation requirement
- `ConnectorLifecycle` was already resumable from a persisted state (Phase 4 Sprint 2); Discord is the second connector to rely on it, for its `disconnect` flow

### Known Gaps
- No human-confirmed live message exchange over the real Discord network yet - requires a real Discord Application (Developer Portal Client ID/Secret/bot token, privileged `MESSAGE_CONTENT` intent, a bot added to a real test server), a bigger one-time setup than Telegram's single bot token. The user explicitly deferred this to a later session; disclosed in full in `docs/reviews/phase-6-review.md`, not hidden.

## [0.4.1] - 2026-07-21 - Phase 4 Sprint 2 / Phase 5: Telegram Connector (`v0.4.1-phase4-sprint2`)

### Added
- A real `TelegramConnector` (`packages/connector-sdk/src/telegram/`) making real HTTP calls to `api.telegram.org` - the first connector built on Sprint 1's SDK against an actual external provider
- `LinkedAccount` and `SecretRecord` Prisma models (`packages/database`) - `DATABASE.md` Section 6.5, implemented for real for the first time
- `SecretsService` (`apps/api/src/secrets/`) - an interim envelope-encrypted (AES-256-GCM) credential store standing in for the external secrets manager `SECURITY.md` specifies (ADR-0016)
- `POST /v1/connectors/telegram/connect`, `POST /v1/connectors/telegram/webhook/{linkedAccountId}` (the real webhook receiver, secret-token-verified), `POST /v1/connectors/telegram/{id}/disconnect`
- `POST /v1/conversations/{id}/messages` - the reply path, looked up through the Connector Registry rather than hardcoded to one provider
- A `TelegramReconciliationService` running the periodic half of ADR-0017's recovery strategy
- A "Connect Telegram" control in `apps/web`'s Inbox, plus a reply input and `message.sent` realtime handling
- `pnpm --filter @smc/scripts certify:telegram-connector` and `pnpm --filter @smc/scripts verify:telegram` regression checks
- ADR-0016 (interim secrets store), ADR-0017 (Telegram sync/reconciliation strategy given Bot API's shape), ADR-0018 (`LinkedAccount.status` uses the SDK's full lifecycle vocabulary) - three real architectural decisions, each resolved before the affected code was written

### Changed
- `ConnectorLifecycle` accepts an optional `initialState` (backward compatible, defaults to `"registered"`) - resumes a lifecycle from a persisted status across separate requests, not just within one connect flow
- `initialSync`/`reconcile`/`send` accept an optional `ConnectorContext` (backward compatible) - a real connector needs its resolved credential at call time, not just at `authenticate()` time
- The Certification Suite's checkpoint-resume and reconciliation checks now correctly `skip` (not fail) a legitimate zero-message result, for providers with no history endpoint
- `events.processor.ts`'s `handleMessageReceived` is now idempotent - a duplicate `(conversationId, externalId)` is a safe no-op, not a crashed job or a duplicate notification

### Security
- `SecretRecord` is deliberately excluded from the soft-delete extension - disconnecting a LinkedAccount performs a real, unconditional `DELETE`, per `SECURITY.md` Section 5.2

Verified with a complete, human-confirmed live run: a real Telegram user sent a real message to a disposable test bot, it appeared in the real Inbox with the sender resolved by name, and a reply sent from the Inbox was confirmed received on the real Telegram app on the other end.

## [0.4.0] - 2026-07-19 - Phase 4 Sprint 1: Connector SDK Foundation (`v0.4.0-phase4-sprint1`)

### Added
- The `Connector` interface (`packages/connector-sdk`) - capability manifest, credential validation/authentication with a structural ordering guarantee (`BaseConnector`), bounded/resumable initial sync, a distinct reconciliation pass, a pure normalization mapper, standardized error mapping, an optional outbound `send`, and a lifecycle state machine per account
- Capability Manifest (`defineCapabilityManifest()`) - enforces the hybrid-by-default reconciliation rule at declaration time
- The full 9-state connector lifecycle state machine (`ConnectorLifecycle`), shared by every connector, with a graph-integrity check verifying no unreachable or dead-end states
- A standardized 7-code error taxonomy (`ConnectorError`) with automatic credential redaction built into its constructor
- An in-process Connector Registry
- The Connector Certification Suite (`certifyConnector()`) - a shared, provider-agnostic conformance test mechanically exercising 16 checks drawn from the certification checklist, including a simulated worker-restart checkpoint-resume test and a rate-limit backpressure test
- `pnpm --filter @smc/scripts certify:mock-connector` - the standing regression check (16/16 passing)
- `direction` added to `InboundMessagePayload` (`packages/shared`) - a previously-hardcoded normalization field is now real
- Real ESLint + Prettier configuration (`packages/config`, populating the previously-reserved package), replacing every package's `echo "(no lint configured yet)"` stub - `pnpm lint` now runs `eslint` across all 8 code-bearing packages (7 via a shared `@smc/config/eslint-preset`, `apps/web` via `next lint` + `eslint-config-next`)
- Husky pre-commit hook (`.husky/pre-commit`) running `pnpm lint && pnpm typecheck` before every commit
- `pnpm format` / `pnpm format:check` (Prettier, via `@smc/config/prettier-preset`)

### Changed
- The Mock Connector migrated onto the new SDK as a real `Connector` implementation (`MockConnector extends BaseConnector`); `generateMockMessage()` is kept as a thin backward-compatible adapter over `MockConnector.mapMessage()` - `apps/api`'s mock-connector controller needed no changes
- `events.processor.ts` now reads `payload.direction` instead of hardcoding `"inbound"`

This release also closes the project's oldest open technical-debt item (real lint/Husky config), flagged unresolved in both the Phase 1 and Phase 2 reviews.

## [0.3.0] - 2026-07-18 - Phase 3: Identity & Messaging Foundation (`v0.3.0-phase3`)

### Added
- Real Postgres-backed Inbox read model: `GET /v1/conversations`, `GET /v1/conversations/{id}/messages`
- `GET /v1/notifications` - a real, queryable notification list
- A shared `TokenService` centralizing JWT verification for the HTTP guard, the WebSocket gateway, and the mock connector's optional-auth path
- A real login/register form and an authenticated Inbox UI in `apps/web` (conversation list, message history, notifications, live toasts)
- `pnpm --filter @smc/scripts verify:phase3` regression check (11 assertions), including a workspace-isolation proof and an unauthenticated-socket-rejected proof
- ADR-0015: REST (not GraphQL) for the Phase 3 inbox read path - no GraphQL server exists yet, and standing one up now would be new infrastructure

### Changed
- `POST /dev/mock-connector/send` now accepts an optional Bearer token: present and valid ingests into that user's real workspace; absent falls back to the `DEV_WORKSPACE_ID` dev fixture; present and invalid returns `401`
- WebSocket connections are now authenticated via JWT at connect time (`handshake.auth.token`); unauthenticated or invalid-token connections are disconnected immediately - replaces the client-supplied `?workspaceId=` query parameter
- The Mock Connector's dev-fixture Organization/Workspace upsert is now scoped to `DEV_WORKSPACE_ID` only, no longer running unconditionally for every inbound message
- `AuthException`/`authError` renamed to `httpError()` and moved from `auth/` to `common/http-error.ts`, since Phase 3 needed the same RFC 7807 helper in non-auth modules

### Removed
- `scripts/verify-realtime.mjs` - fully superseded by `verify-phase3.mjs`, which tests the same pipeline shape against real authentication instead of an unauthenticated, unscoped dev room

## [0.2.0] - 2026-07-18 - Phase 2: Authentication (`v0.2.0-phase2`)

### Added
- Email + password registration and login (`POST /v1/auth/register`, `POST /v1/auth/login`)
- JWT access tokens (15 min) with rotating refresh cookies
- Logout (`POST /v1/auth/logout`), log-out-everywhere (`POST /v1/auth/logout-all`), and active-session listing (`GET /v1/auth/sessions`)
- `GET /v1/users/me`
- `JwtAuthGuard` and `RolesGuard` - owner/admin/member RBAC foundation
- Automatic Organization + Workspace creation on registration
- Audit logging for every auth event (registration, login success/failure, logout, refresh, reuse detection)
- URI API versioning (`/v1` prefix), with `/health` and `/dev/*` intentionally excluded
- `pnpm --filter @smc/scripts verify:auth` regression check (16 assertions)
- ADR-0014: custom JWT/session authentication instead of Auth.js (which had no NestJS integration and couldn't implement the `family_id` session design)

### Changed
- `Workspace` now requires `organizationId` (local dev database was force-reset - disposable Phase 1 mock data only)
- `ARCHITECTURE.md` Section 6 corrected to describe the actual authentication mechanism

### Security
- Argon2id password hashing (never bcrypt/SHA-family)
- Password policy: 12+ characters
- Have I Been Pwned breach-password checking (k-anonymity range API, fails open on network error)
- Redis-backed account lockout on repeated failed logins (keyed by account and by IP independently)
- Refresh-token rotation with `family_id` reuse detection - presenting an already-rotated token revokes the *entire* session family, not just that token (verified live against Postgres)
- RFC 7807 (`application/problem+json`) error shape for every auth failure mode, with stable per-error `code` values

## [0.1.1] - 2026-07-18 - Phase 1 review + hardening (`v0.1.1-phase1-hardening`)

### Added
- RFC 7807 global error model (`apps/api/src/common/problem-details.filter.ts`), applied to the whole API
- Soft-delete infrastructure: `deletedAt` columns + a Prisma Client extension enforcing filtered reads and delete-as-update semantics
- `docs/reviews/phase-1-review.md` - the first Phase Review, establishing the standing per-phase review practice
- `scripts/verify-soft-delete.cjs` regression check

### Security
- Production guard on the dev-only `POST /dev/mock-connector/send` endpoint (404 when `NODE_ENV=production`)
- `LICENSE` added (all-rights-reserved - the repo is public but not open source)
- `.gitignore` hardened against secret-file and database-dump patterns beyond the original `.env`-only coverage

## [0.1.0] - 2026-07-18 - Phase 1: Bootstrap + first vertical slice (`v0.1.0-phase1`)

### Added
- pnpm + Turborepo monorepo (`apps/web`, `apps/api`, `packages/*`), per ADR-0011
- Docker Compose for local dev (Postgres, Redis, mailhog)
- Prisma schema (initial subset: Workspace, Provider, Contact, ContactIdentity, Conversation, Message, Notification)
- The Mock Connector (`packages/connector-sdk`) and the full ingestion pipeline: `message.received` event (BullMQ) → IdentityGraph exact-match resolution (`packages/identity`) → Postgres write → WebSocket push → dev Inbox UI → a hardcoded stub rule → a stub notification
- `EventEnvelope`/`EventType` (`packages/event-model`), implementing 4 of `EVENT_MODEL.md`'s ~40 cataloged events
- GitHub Actions CI (`lint` / `typecheck` / `build`)
- `scripts/verify-realtime.mjs` regression check

[Unreleased]: https://github.com/BozgunBer-2506/smartmc/compare/v0.5.0-phase6...HEAD
[0.5.0]: https://github.com/BozgunBer-2506/smartmc/compare/v0.4.1-phase4-sprint2...v0.5.0-phase6
[0.4.1]: https://github.com/BozgunBer-2506/smartmc/compare/v0.4.0-phase4-sprint1...v0.4.1-phase4-sprint2
[0.4.0]: https://github.com/BozgunBer-2506/smartmc/compare/v0.3.0-phase3...v0.4.0-phase4-sprint1
[0.3.0]: https://github.com/BozgunBer-2506/smartmc/compare/v0.2.0-phase2...v0.3.0-phase3
[0.2.0]: https://github.com/BozgunBer-2506/smartmc/compare/v0.1.1-phase1-hardening...v0.2.0-phase2
[0.1.1]: https://github.com/BozgunBer-2506/smartmc/compare/v0.1.0-phase1...v0.1.1-phase1-hardening
[0.1.0]: https://github.com/BozgunBer-2506/smartmc/releases/tag/v0.1.0-phase1
