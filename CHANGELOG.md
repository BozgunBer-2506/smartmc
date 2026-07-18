# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning tracks `docs/ROADMAP.md`'s phases rather than strict SemVer pre-1.0 - a version bump corresponds to a completed, tagged phase (see `docs/reviews/` for the review behind each one), not an API stability guarantee. Phase 0 (Product Foundation) produced no code, only the documentation set in `docs/` - it predates versioned releases and isn't listed below.

## [Unreleased]

Phase 4 - Connector SDK is next: the full `CONNECTOR_SDK.md` contract (lifecycle, registry, webhook/polling/hybrid ingestion, health checks, checkpointed recovery, retry/backoff), with the Mock Connector becoming the certification-checklist reference implementation.

### Added
- Real ESLint + Prettier configuration (`packages/config`, populating the previously-reserved package), replacing every package's `echo "(no lint configured yet)"` stub - `pnpm lint` now runs `eslint` across all 8 code-bearing packages (7 via a shared `@smc/config/eslint-preset`, `apps/web` via `next lint` + `eslint-config-next`)
- Husky pre-commit hook (`.husky/pre-commit`) running `pnpm lint && pnpm typecheck` before every commit
- `pnpm format` / `pnpm format:check` (Prettier, via `@smc/config/prettier-preset`)

This closes the project's oldest open technical-debt item, flagged unresolved in both the Phase 1 and Phase 2 reviews.

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

[Unreleased]: https://github.com/BozgunBer-2506/smartmc/compare/v0.3.0-phase3...HEAD
[0.3.0]: https://github.com/BozgunBer-2506/smartmc/compare/v0.2.0-phase2...v0.3.0-phase3
[0.2.0]: https://github.com/BozgunBer-2506/smartmc/compare/v0.1.1-phase1-hardening...v0.2.0-phase2
[0.1.1]: https://github.com/BozgunBer-2506/smartmc/compare/v0.1.0-phase1...v0.1.1-phase1-hardening
[0.1.0]: https://github.com/BozgunBer-2506/smartmc/releases/tag/v0.1.0-phase1
