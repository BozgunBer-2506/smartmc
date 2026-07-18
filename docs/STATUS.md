# Smart Message Center - STATUS.md

```yaml
Title: STATUS.md
Version: 2.2
Status: Living
Owner: Founder/CTO
Last Updated: 2026-07-18
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0011
  - ADR-0012
  - ADR-0013
```

Living status file. Updated at the end of every work session. If a new session starts cold (context lost, new machine, new day), read this file first, then [ROADMAP.md](ROADMAP.md), before doing anything else.

---

## Current Phase

**Phase 0 - Product Foundation: COMPLETE.** **Phase 1 - Project Bootstrap: COMPLETE and verified end-to-end** as of 2026-07-18 (Sprint 1 infrastructure + Sprint 2 vertical slice - see below). **Phase 2 - Authentication has not started.**

## What Actually Runs Right Now

This is no longer a documentation-only repository. From a clean checkout:

```
pnpm install          # see the environment note below - must run from real WSL, not a Windows UNC path
docker compose up -d   # Postgres (host port 5433), Redis, mailhog
pnpm db:generate && pnpm db:push
pnpm dev               # apps/web on :3000, apps/api on :4000, 6 packages in tsc --watch
```

Then, with `pnpm dev` running:
- `GET http://localhost:4000/health` → `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`
- Opening `http://localhost:3000` shows a dev Inbox with a "Send mock message" control
- Clicking it (or `POST /dev/mock-connector/send`) drives the full pipeline live: Mock Connector → `message.received` event (BullMQ) → IdentityGraph exact-match resolution → Postgres write (Contact/Conversation/Message) → WebSocket push → the Inbox page renders the message → a hardcoded stub rule fires → a Notification row is created → a toast appears
- `pnpm --filter @smc/scripts verify:realtime` is a standing regression check: connects a real socket.io client, triggers the Mock Connector, and asserts both `message.received` and `notification.created` arrive over the wire - this is what was actually run to verify Sprint 2's Definition of Done, not just server logs
- `pnpm --filter @smc/scripts verify:soft-delete` is a second standing regression check (added post-Phase-1-Review): creates a Contact, calls `prisma.contact.delete()`, and asserts the row survives in Postgres with `deletedAt` set while a normal `findFirst` no longer returns it

**Environment note (read before re-running `pnpm install`)**: this repo sits on a WSL filesystem reached from Windows via a `\\wsl.localhost\...` UNC path. Windows-native pnpm crashes on that path (`Error: ...: is not a valid disk on Windows`, a pnpm bug, not a project misconfiguration - `package-import-method=copy` in `.npmrc` does not fix it). Run `pnpm`/`docker`/`node` commands from inside real WSL instead: `wsl.exe -d Ubuntu -- bash -lc 'cd /home/.../smartmc && <command>'`. Editing files across the UNC path from Windows-side tools is fine; it's specifically pnpm's Windows install machinery that can't handle it.

## Repository

**Structure finalized 2026-07-18 via [ADR-0011](adr/0011-monorepo-layout.md), populated 2026-07-18 (Phase 1):**
```
smartmc/
├── docs/          (14 documents, adr/ [0001-0013], reviews/ [phase-1-review.md])
├── apps/
│   ├── web/         Next.js dev Inbox - real, running (apps/desktop, apps/mobile still empty, reserved)
│   └── api/         NestJS - health, events (BullMQ), realtime gateway (socket.io), mock-connector trigger
├── packages/
│   ├── database/      Prisma schema (pragmatic initial subset of DATABASE.md) + client
│   ├── shared/       Canonical domain types + DEV_WORKSPACE_ID
│   ├── event-model/    EventEnvelope + EventType, per EVENT_MODEL.md
│   ├── identity/      IdentityGraph exact-match resolver, per ARCHITECTURE.md Section 13
│   ├── connector-sdk/   Mock Connector generator (full CONNECTOR_SDK.md contract is Phase 4)
│   ├── ui/          Minimal Button primitive (full DESIGN_SYSTEM.md build-out is later)
│   │                (automation-engine, auth, ai, config, design-tokens still empty, reserved per phase)
├── infrastructure/   (empty, reserved)
├── scripts/        @smc/scripts - verify-realtime.mjs, verify-soft-delete.cjs (regression checks)
├── docker-compose.yml (Postgres @ 5433 - not 5432, to avoid a collision with an unrelated local project)
├── LICENSE        (all-rights-reserved)
```
GitHub remote: `https://github.com/BozgunBer-2506/smartmc` - public, connected. `pnpm-lock.yaml` now exists and is tracked.

## Phase 1 - What's Done and What's Honestly Not

**Sprint 1 (infrastructure)** - done, with two items open, not glossed over:
- [x] Monorepo (pnpm + Turborepo), Next.js + NestJS scaffolds, Docker Compose, Prisma init + push, CI (`lint`/`typecheck`/`build`, no `test` yet per explicit user direction - added when tests exist)
- [ ] **Real ESLint/Prettier config (`packages/config`) - not done.** Every `lint` script is currently a stub. This is the most concrete near-term gap.
- [ ] **Husky pre-commit hooks - not done**, blocked on the item above.

**Sprint 2 (vertical slice)** - done and verified (not just claimed): message → bus → IdentityGraph → DB → WebSocket → stub inbox → stub rule → stub notification, proven via `/health`, direct Postgres queries, and a real WebSocket client round-trip. Full detail in `ROADMAP.md`'s Phase 1 section.

## Phase 1 Review - Completed 2026-07-18

Full report: [docs/reviews/phase-1-review.md](reviews/phase-1-review.md) - the first of what's now a standing practice (a Phase Review before every subsequent phase starts, saved to `docs/reviews/`). Compared the implementation against every relevant doc + ADR; found 12 new items beyond the already-disclosed Sprint 1 gaps. Decision rule applied: fix now only what's more expensive to retrofit later, defer everything else to its already-assigned phase.

**Fixed same-day, verified live** (not just typechecked):
- **RFC 7807 error model** (`apps/api/src/common/problem-details.filter.ts`) - every thrown exception now returns the `API.md` Section 5-shaped `application/problem+json` body, globally.
- **Soft-delete infrastructure** (`DATABASE.md` Section 7/20's "non-negotiable" principle, previously unimplemented) - `deletedAt` on `Workspace`/`Contact`/`Conversation`/`Message`, enforced by a Prisma Client extension (`packages/database/src/soft-delete.ts`) that filters reads and redirects `delete`/`deleteMany` to an update. Verified via `scripts/verify-soft-delete.cjs`.
- **Production guard on `/dev/mock-connector/send`** - returns 404 when `NODE_ENV=production`, verified against a standalone instance actually started with that env var set.

**Deliberately deferred** (9 items - connector worker separation, multi-consumer fan-out, per-aggregate queue ordering, `LinkedAccount`, IdentityGraph's merge tables, the real Automation Engine, CORS hardening, DB role separation, audit logging) - each already has a home in a later phase; none pulled forward.

Tagged `v0.1.0-phase1` (pre-review) and `v0.1.1-phase1-hardening` (post-review fixes).

## Phase 0 - Complete Document Set (14 documents, 13 ADRs)

| Document | Core content |
|---|---|
| `PRODUCT.md` | Vision, personas, 100 problems/solutions, competitor analysis, MVP/V2, pricing, brand, IdentityGraph-sharpened moat argument, Never Build list |
| `ARCHITECTURE.md` | System architecture, folder structure, DB schema draft, event flow, API design draft, auth flow, infra, CI/CD, tech-choice rationale, **Section 13: IdentityGraph** |
| `DATABASE.md` | Full PostgreSQL schema (spec - Phase 1 implements a pragmatic initial subset, see above) |
| `API.md` | Full REST+GraphQL contract |
| `SECURITY.md` | Threat model, credential/secrets management, GDPR operational policy, audit logging spec |
| `AUTOMATION_ENGINE.md` | The flagship differentiator - trigger/condition/action models, IdentityGraph-powered Context Object, 208 examples |
| `CONNECTOR_SDK.md` | The contract any provider integration conforms to (Phase 4 - Phase 1's Mock Connector is a minimal precursor, not yet conformant) |
| `EVENT_MODEL.md` | The canonical ~40-event registry (Phase 1 implements 4 of them - message.received, rule.triggered, rule.action_executed, notification.created) |
| `UI_GUIDE.md` | Complete UX philosophy |
| `DESIGN_SYSTEM.md` | Implementation-ready design system (Phase 1's `@smc/ui` is a placeholder, not yet built against this spec) |
| `ROADMAP.md` | 19 phases, working rules, Phase 1's two sprints with verified Definitions of Done |
| `STATUS.md` | This file |
| `DECISIONS.md` | Index of all 13 ADRs |

**ADRs 0001-0013**: PostgreSQL, Prisma, REST-over-GraphQL-by-default, Connector SDK, event-driven architecture, URI versioning, UUIDv7 primary keys, two-level multi-tenancy, modular monolith + connector workers, Telegram Bot API only, monorepo layout, IdentityGraph as a first-class capability, identity merge safety over matching cleverness.

## Known Open Decisions / Gaps (tracked so they aren't lost)

1. **Pricing numbers** ($12/mo Pro, $18/seat Business) - a starting hypothesis (`PRODUCT.md`), not a blocker.
2. **LinkedIn DM integration** feasibility (no public API) - deferred to Phase 16-17.
3. **Real lint/format config + pre-commit hooks** - Sprint 1's two open items, above. Recommended next action before Phase 2 starts, since it's cheap now and gets more disruptive to retrofit the more code exists.
4. **`packages/database`'s Prisma schema is a pragmatic subset of `DATABASE.md`'s full spec** - soft deletes are now implemented (see Phase 1 Review above); audit logs, IdentityGraph confidence scoring/merge suggestions, `LinkedAccount`, RLS, and DB role separation are still spec-only, deferred to their assigned phases per the review.

All other previously-open decisions are resolved - see [DECISIONS.md](DECISIONS.md).

## Next Action

1. Close Sprint 1's two open items: real ESLint/Prettier config (`packages/config`) and Husky pre-commit hooks.
2. Begin Phase 2 - Authentication (register/login, OAuth, passkeys, 2FA, session management) - the dev-mode fixed `DEV_WORKSPACE_ID` and unauthenticated (now production-guarded) `/dev/mock-connector/send` endpoint are Phase 1 conveniences to be replaced, not permanent design.

## How to Resume From Zero Context

1. Read this file (`STATUS.md`).
2. Read `ROADMAP.md` for the full phase plan, working rules, and Phase 1's exact verification steps.
3. Read `PRODUCT.md`, `ARCHITECTURE.md` (especially Section 13, IdentityGraph), and `DECISIONS.md` for decisions already made - do not re-derive or re-litigate anything documented there.
4. To actually run the app: see "What Actually Runs Right Now" above, including the WSL environment note - don't rediscover that the hard way.
5. Continue from "Next Action" above, or from wherever the user redirects.
