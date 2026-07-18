# Smart Message Center - STATUS.md

```yaml
Title: STATUS.md
Version: 3.1
Status: Living
Owner: Founder/CTO
Last Updated: 2026-07-18
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0011
  - ADR-0012
  - ADR-0013
  - ADR-0014
  - ADR-0015
```

Living status file. Updated at the end of every work session. If a new session starts cold (context lost, new machine, new day), read this file first, then [ROADMAP.md](ROADMAP.md), before doing anything else.

---

## Current Phase

**Phase 0 (Product Foundation), Phase 1 (Project Bootstrap), and Phase 2 (Authentication, backend): COMPLETE.** **Phase 3 (Identity & Messaging Foundation) - COMPLETE and verified live** as of 2026-07-18.

## What Actually Runs Right Now

From a clean checkout:

```
pnpm install          # see the environment note below - must run from real WSL, not a Windows UNC path
docker compose up -d   # Postgres (host port 5433), Redis, mailhog
pnpm db:generate && pnpm db:push
pnpm dev               # apps/web on :3000, apps/api on :4000, 6 packages in tsc --watch
```

**A real person can now**: open `http://localhost:3000`, register or log in, click "Send mock message," and watch it appear in their own Inbox in real time - no page refresh - with the sender resolved by name through IdentityGraph, and see a notification surface for it. This is the Phase 3 demo script end to end, in the actual browser UI, not just via scripts.

**Auth (Phase 2)**: `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `POST /v1/auth/logout-all`, `GET /v1/auth/sessions`, `GET /v1/users/me`. Registering auto-creates an Organization + Workspace + owner `WorkspaceMember`. `pnpm --filter @smc/scripts verify:auth` is the standing regression check (16/16 passing, re-confirmed clean after Phase 3).

**Identity & Messaging (new, Phase 3)**: `GET /v1/conversations`, `GET /v1/conversations/{id}/messages`, `GET /v1/notifications` - all `JwtAuthGuard`-protected, workspace-scoped from verified JWT claims only, never a client-supplied id. `POST /dev/mock-connector/send` now accepts an optional Bearer token: present and valid → ingests into that user's real workspace; absent → falls back to the `DEV_WORKSPACE_ID` fixture for continued dev convenience; present and invalid → `401`, never silently ignored. The WebSocket gateway now requires a valid JWT at connect time (`handshake.auth.token`) and disconnects anyone without one - no more client-supplied `?workspaceId=`. `apps/web` has a real login/register form and a real Inbox (conversation list, message history, notifications, live toasts). `pnpm --filter @smc/scripts verify:phase3` is the standing regression check (11/11 passing): register → reject unauthenticated socket → authenticated socket connects → mock message ingested into the real workspace → both `message.received` and `notification.created` arrive over the socket → sender resolved to a name via IdentityGraph → durability confirmed via all three new REST reads → a second, unrelated user's `GET /v1/conversations` is proven empty (workspace isolation). `verify:soft-delete` re-run clean too. `verify-realtime.mjs` (Phase 1's unauthenticated-room version) is retired, fully superseded.

**Environment note (read before re-running `pnpm install`)**: this repo sits on a WSL filesystem reached from Windows via a `\\wsl.localhost\...` UNC path. Windows-native pnpm crashes on that path (`Error: ...: is not a valid disk on Windows`, a pnpm bug, not a project misconfiguration). Run `pnpm`/`docker`/`node` commands from inside real WSL instead: `wsl.exe -d Ubuntu -- bash -lc 'cd /home/.../smartmc && <command>'`.

**Local dev database note**: Phase 2's schema change (`Workspace.organizationId` became required) forced a `prisma db push --force-reset` on the local dev database - safe, since it only held disposable Phase 1 mock-connector test data. If you're resuming on a machine with an older local DB, expect to do the same (`pnpm db:push --force-reset` from `packages/database`, or just `docker compose down -v && docker compose up -d` for a fully clean slate).

## Repository

**Structure finalized via [ADR-0011](adr/0011-monorepo-layout.md); Phase 3 added `apps/api/src/conversations/`, `apps/api/src/notifications/`, `apps/api/src/auth/token.service.ts`, `apps/api/src/common/http-error.ts` (renamed from `auth/auth.exceptions.ts`), and `apps/web/components/` + `apps/web/lib/` - no new top-level packages.**
```
smartmc/
├── docs/          (15 documents, adr/ [0001-0015], reviews/ [phase-1, phase-2, phase-3])
├── apps/
│   ├── web/         Next.js - real login/register form + real authenticated Inbox (new, Phase 3)
│   └── api/         NestJS - health, events, realtime, mock-connector, auth, users, audit,
│   │                conversations (new), notifications (new)
├── packages/
│   ├── database/      Prisma schema: messaging core (Phase 1) + Organization/User/UserCredentials/
│   │                  WorkspaceMember/Session/AuditLog (Phase 2) + soft-delete extension
│   ├── shared/       Canonical domain types, DEV_WORKSPACE_ID/DEV_ORGANIZATION_ID
│   ├── event-model/    EventEnvelope + EventType
│   ├── identity/      IdentityGraph exact-match resolver
│   ├── connector-sdk/   Mock Connector generator
│   ├── ui/          Minimal Button primitive
│   │                (automation-engine, auth, ai, config, design-tokens still empty, reserved per phase)
├── infrastructure/   (empty, reserved)
├── scripts/        @smc/scripts - verify-phase3.mjs, verify-soft-delete.cjs, verify-auth.mjs
├── docker-compose.yml (Postgres @ 5433, not 5432)
├── LICENSE        (all-rights-reserved)
```
GitHub remote: `https://github.com/BozgunBer-2506/smartmc` - public, connected.

## Phase 3 - Identity & Messaging Foundation (complete, verified live)

Full detail in `ROADMAP.md`'s Phase 3 section and [docs/reviews/phase-3-review.md](reviews/phase-3-review.md). Summary:

**Implemented**: the real Postgres-backed Inbox read model (`GET /v1/conversations`, `GET /v1/conversations/{id}/messages`), the real notifications list (`GET /v1/notifications`), Mock Connector ingestion tied to a real authenticated workspace (optional Bearer token, `DEV_WORKSPACE_ID` fallback preserved), WebSocket realtime authenticated via JWT at connect time (no more client-supplied `workspaceId`), a shared `TokenService` used by the HTTP guard, the WebSocket gateway, and the mock connector alike, and a real login/register + Inbox UI in `apps/web`.

**One real architectural deviation**: [ADR-0015](adr/0015-rest-inbox-read-path-for-phase-3.md) - `API.md` frames the inbox read path as GraphQL-first, but no GraphQL server exists anywhere in the codebase and standing one up now would be new infrastructure, contradicting this phase's explicit "no new technologies" instruction. Implemented as plain REST; GraphQL remains the Phase 9 target.

**Deliberately deferred** (per `ROADMAP.md`'s own Phase 3 checklist, not new gaps): public Workspace/account CRUD endpoints, Linked Accounts model, Tags, Folders, Search shell, user preferences (silent hours/VIP structure) - none were required by this phase's Definition of Done.

Tagged `v0.3.0-phase3`.

## Phase 2 - Authentication (backend complete, verified live)

Full detail in `ROADMAP.md`'s Phase 2 section and [docs/reviews/phase-2-review.md](reviews/phase-2-review.md). Summary:

**Implemented**: email+password register/login (Argon2id, 12+ char policy, HIBP breach-check, Redis account lockout), JWT access tokens (15 min) + rotating refresh cookies with full `family_id` reuse-detection (verified live, including the family-wide revocation cascade), logout/logout-all/session listing, `JwtAuthGuard` + `RolesGuard` (owner/admin/member RBAC foundation, no role-gated resource yet), RFC 7807 errors for every auth failure mode, audit logging for every auth event, automatic Organization+Workspace creation on registration.

**One real architectural correction**: [ADR-0014](adr/0014-custom-jwt-session-auth.md) - `ARCHITECTURE.md` named "Auth.js," which has no NestJS integration and can't implement `DATABASE.md`'s session design. Corrected to a custom implementation of the same documented behavior, not a redesign.

**Deliberately deferred** (per `ROADMAP.md`'s own Phase 2 checklist, not new gaps): OAuth (Google/GitHub), Passkeys (schema is ready - `user_credentials.password_hash` is nullable), 2FA (TOTP), user-settings endpoints, public Organization/Workspace CRUD endpoints (that's Phase 3's "Workspace/account model"), and any login UI (Definition of Done was API-observable only).

Tagged `v0.2.0-phase2`.

## Phase 1 - Project Bootstrap (complete, reviewed, hardened)

**Sprint 1 (infrastructure)** - complete except two still-open items: real ESLint/Prettier config (`packages/config`) and Husky pre-commit hooks - every `lint` script is still a stub. **This is now the single oldest open item in the project** (flagged in the Phase 1 review, still not closed after Phase 2 - worth prioritizing before Phase 3 adds much more code to eventually lint).

**Sprint 2 (vertical slice)** - complete and re-verified after Phase 2's schema changes.

**Phase 1 Review** ([docs/reviews/phase-1-review.md](reviews/phase-1-review.md)): 3 findings fixed same-day and verified live - RFC 7807 error model, soft-delete infrastructure, production guard on the mock-connector endpoint. 9 findings deliberately deferred. Tagged `v0.1.0-phase1` and `v0.1.1-phase1-hardening`.

## Phase 0 - Complete Document Set (15 documents, 15 ADRs)

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
| `ROADMAP.md` | 19 phases, working rules, Phase 1-3 verified Definitions of Done |
| `STATUS.md` | This file |
| `DECISIONS.md` | Index of all 15 ADRs |

**ADRs 0001-0015**: PostgreSQL, Prisma, REST-over-GraphQL-by-default, Connector SDK, event-driven architecture, URI versioning, UUIDv7 primary keys, two-level multi-tenancy, modular monolith + connector workers, Telegram Bot API only, monorepo layout, IdentityGraph as a first-class capability, identity merge safety over matching cleverness, custom JWT/session auth instead of Auth.js, **REST (not GraphQL) for the Phase 3 inbox read path**.

## Known Open Decisions / Gaps (tracked so they aren't lost)

1. **Pricing numbers** ($12/mo Pro, $18/seat Business) - a starting hypothesis (`PRODUCT.md`), not a blocker.
2. **LinkedIn DM integration** feasibility (no public API) - deferred to Phase 16-17.
3. **Real lint/format config + pre-commit hooks** - still open since Phase 1, now the project's oldest unresolved item across three phases. Recommended before Phase 4.
4. **`packages/database`'s Prisma schema is a pragmatic subset of `DATABASE.md`'s full spec** - soft deletes and the auth core (Organization/User/Session/AuditLog/etc.) are now implemented; `LinkedAccount`, IdentityGraph's confidence-scoring/merge-suggestion tables, RLS, and DB role separation remain spec-only, deferred to their assigned phases.
5. **Six Phase 2 simplifications on record** (citext→app-level email normalization, no timing-attack mitigation on login, no `trust proxy` config, raw device/IP in session listing, untuned Argon2id parameters, 15-min role-change propagation delay) - all reasoned and disclosed in `docs/reviews/phase-2-review.md`, none hidden.
6. **`Notification` has no `readAt` column** - `GET /v1/notifications` (Phase 3) is read-only, no mark-read/unread state yet. Disclosed in `docs/reviews/phase-3-review.md`, deferred to whichever phase first needs it (likely Phase 11).

All other previously-open decisions are resolved - see [DECISIONS.md](DECISIONS.md).

## Next Action

1. Close the lint/Husky gap (item 3 above) - it's been open since Phase 1, survived Phase 2 and Phase 3 unaddressed, and should not survive Phase 4 too.
2. Begin Phase 4 - Connector SDK: build out `CONNECTOR_SDK.md`'s full contract (lifecycle, registry, webhook/polling/hybrid ingestion, health checks, checkpointed recovery, retry/backoff, the Mock Connector as certification-checklist reference implementation). Definition of Done: the Mock Connector passes its own certification checklist, including a simulated worker-restart-mid-sync test and a webhook-loss-then-reconciliation test.

## How to Resume From Zero Context

1. Read this file (`STATUS.md`).
2. Read `ROADMAP.md` for the full phase plan, working rules, and Phase 1-3's exact verification steps.
3. Read `PRODUCT.md`, `ARCHITECTURE.md` (Section 6 for auth, Section 13 for IdentityGraph), and `DECISIONS.md` for decisions already made - do not re-derive or re-litigate anything documented there.
4. To actually run the app: see "What Actually Runs Right Now" above, including the WSL environment note and the local-DB-reset note.
5. Continue from "Next Action" above, or from wherever the user redirects.
