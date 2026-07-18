# Smart Message Center - STATUS.md

```yaml
Title: STATUS.md
Version: 3.0
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
```

Living status file. Updated at the end of every work session. If a new session starts cold (context lost, new machine, new day), read this file first, then [ROADMAP.md](ROADMAP.md), before doing anything else.

---

## Current Phase

**Phase 0 (Product Foundation) and Phase 1 (Project Bootstrap): COMPLETE.** **Phase 2 (Authentication) - backend COMPLETE and verified** as of 2026-07-18. **Phase 3 (Core Platform) has not started.**

## What Actually Runs Right Now

From a clean checkout:

```
pnpm install          # see the environment note below - must run from real WSL, not a Windows UNC path
docker compose up -d   # Postgres (host port 5433), Redis, mailhog
pnpm db:generate && pnpm db:push
pnpm dev               # apps/web on :3000, apps/api on :4000, 6 packages in tsc --watch
```

**Auth (new, Phase 2)**: `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `POST /v1/auth/logout-all`, `GET /v1/auth/sessions`, `GET /v1/users/me`. Registering auto-creates an Organization + Workspace + owner `WorkspaceMember`. `pnpm --filter @smc/scripts verify:auth` is the standing regression check (16/16 passing) - register, duplicate-rejection, protected-route-rejects-no-token, login, protected-route-accepts-token, refresh rotation, reuse detection, and confirmation that reuse detection revokes the *entire* session family, not just the reused token. Verified independently via direct Postgres inspection too.

**Sprint 2 vertical slice (Phase 1, still working)**: `GET /v1/health` (note: now under no prefix, same as `/dev/*` - both intentionally excluded from the `/v1` versioning prefix added this phase), `POST /dev/mock-connector/send` still drives the full mock pipeline live. `pnpm --filter @smc/scripts verify:realtime` and `verify:soft-delete` both still pass, confirmed after the Phase 2 schema migration.

**Environment note (read before re-running `pnpm install`)**: this repo sits on a WSL filesystem reached from Windows via a `\\wsl.localhost\...` UNC path. Windows-native pnpm crashes on that path (`Error: ...: is not a valid disk on Windows`, a pnpm bug, not a project misconfiguration). Run `pnpm`/`docker`/`node` commands from inside real WSL instead: `wsl.exe -d Ubuntu -- bash -lc 'cd /home/.../smartmc && <command>'`.

**Local dev database note**: Phase 2's schema change (`Workspace.organizationId` became required) forced a `prisma db push --force-reset` on the local dev database - safe, since it only held disposable Phase 1 mock-connector test data. If you're resuming on a machine with an older local DB, expect to do the same (`pnpm db:push --force-reset` from `packages/database`, or just `docker compose down -v && docker compose up -d` for a fully clean slate).

## Repository

**Structure finalized via [ADR-0011](adr/0011-monorepo-layout.md); Phase 2 added `apps/api/src/auth/`, `apps/api/src/audit/`, `apps/api/src/users/`, `apps/api/src/config/`, and `apps/api/src/common/format-validation-errors.ts` - no new top-level packages.**
```
smartmc/
├── docs/          (15 documents, adr/ [0001-0014], reviews/ [phase-1, phase-2])
├── apps/
│   ├── web/         Next.js dev Inbox (no auth UI yet - Phase 2 was backend-only)
│   └── api/         NestJS - health, events, realtime, mock-connector, AUTH (new), users, audit
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
├── scripts/        @smc/scripts - verify-realtime.mjs, verify-soft-delete.cjs, verify-auth.mjs
├── docker-compose.yml (Postgres @ 5433, not 5432)
├── LICENSE        (all-rights-reserved)
```
GitHub remote: `https://github.com/BozgunBer-2506/smartmc` - public, connected.

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

## Phase 0 - Complete Document Set (15 documents, 14 ADRs)

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
| `ROADMAP.md` | 19 phases, working rules, Phase 1-2 verified Definitions of Done |
| `STATUS.md` | This file |
| `DECISIONS.md` | Index of all 14 ADRs |

**ADRs 0001-0014**: PostgreSQL, Prisma, REST-over-GraphQL-by-default, Connector SDK, event-driven architecture, URI versioning, UUIDv7 primary keys, two-level multi-tenancy, modular monolith + connector workers, Telegram Bot API only, monorepo layout, IdentityGraph as a first-class capability, identity merge safety over matching cleverness, **custom JWT/session auth instead of Auth.js**.

## Known Open Decisions / Gaps (tracked so they aren't lost)

1. **Pricing numbers** ($12/mo Pro, $18/seat Business) - a starting hypothesis (`PRODUCT.md`), not a blocker.
2. **LinkedIn DM integration** feasibility (no public API) - deferred to Phase 16-17.
3. **Real lint/format config + pre-commit hooks** - still open since Phase 1, now the project's oldest unresolved item. Recommended before Phase 3.
4. **`packages/database`'s Prisma schema is a pragmatic subset of `DATABASE.md`'s full spec** - soft deletes and the auth core (Organization/User/Session/AuditLog/etc.) are now implemented; `LinkedAccount`, IdentityGraph's confidence-scoring/merge-suggestion tables, RLS, and DB role separation remain spec-only, deferred to their assigned phases.
5. **Six Phase 2 simplifications on record** (citext→app-level email normalization, no timing-attack mitigation on login, no `trust proxy` config, raw device/IP in session listing, untuned Argon2id parameters, 15-min role-change propagation delay) - all reasoned and disclosed in `docs/reviews/phase-2-review.md`, none hidden.

All other previously-open decisions are resolved - see [DECISIONS.md](DECISIONS.md).

## Next Action

1. Close the lint/Husky gap (item 3 above) - it's been open since Phase 1 and Phase 3 will add meaningfully more code on top of an unlinted codebase if this keeps slipping.
2. Begin Phase 3 - Core Platform (workspace/account model as real CRUD endpoints, inbox shell, Linked Accounts model structure, notifications shell, tags, folders, search shell, user preferences, and IdentityGraph's exact-match-only scaffold per `ARCHITECTURE.md` Section 13.6).

## How to Resume From Zero Context

1. Read this file (`STATUS.md`).
2. Read `ROADMAP.md` for the full phase plan, working rules, and Phase 1-2's exact verification steps.
3. Read `PRODUCT.md`, `ARCHITECTURE.md` (Section 6 for auth, Section 13 for IdentityGraph), and `DECISIONS.md` for decisions already made - do not re-derive or re-litigate anything documented there.
4. To actually run the app: see "What Actually Runs Right Now" above, including the WSL environment note and the local-DB-reset note.
5. Continue from "Next Action" above, or from wherever the user redirects.
