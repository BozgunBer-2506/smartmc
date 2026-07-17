# Smart Message Center - STATUS.md

Living status file. Updated at the end of every work session. If a new session starts cold (context lost, new machine, new day), read this file first, then [ROADMAP.md](ROADMAP.md), before doing anything else.

---

## Current Phase

**Phase 0 - Product Foundation** (in progress)

## Last Updated

2026-07-18

## Repository

Restructured on 2026-07-17 per user direction into:
```
smartmc/
├── docs/ (PRODUCT.md, ARCHITECTURE.md, DATABASE.md, API.md, ROADMAP.md, STATUS.md, DECISIONS.md, adr/)
├── backend/    (empty, reserved for Phase 1)
├── frontend/    (empty, reserved for Phase 1)
├── connectors/   (empty, reserved for Phase 4-8)
```
GitHub remote: `https://github.com/BozgunBer-2506/smartmc` (see Next Action for connection status).
Open item: `backend/`/`frontend`/`connectors/` needs reconciling against ARCHITECTURE.md's `apps/`+`packages/` monorepo layout before Phase 1 starts - see ROADMAP.md's "Repository Layout" section.

## Completed

- [x] `PRODUCT.md` written - vision, mission, personas, 100 problems, 100 solutions, competitor analysis, MVP/V2 scope, AI features policy, automation engine design + 100 examples, pricing, brand, roadmap outline, success metrics, never-build list.
- [x] `ARCHITECTURE.md` written - system architecture diagram, folder structure, DB schema (draft), event flow, API design (draft), auth flow, infra diagram, deployment strategy, CI/CD pipeline, tech stack rationale.
- [x] `ROADMAP.md` written - 19 phases (0-18), working rules for session continuity, sequencing rationale, ADR discipline, repository layout note.
- [x] `STATUS.md` (this file) created and kept current.
- [x] `DATABASE.md` written - Principal-Architect-level schema: philosophy, naming conventions, ER diagram, UUIDv7 rationale, two-level multi-tenancy (Organization/Workspace), 22 entity groups with full column/key/index/constraint detail, soft-delete + audit + optimistic-locking + RLS-readiness policies, partitioning/archiving/search strategy, GDPR erasure workflow, event-sourcing scope decision, read-model notes, scalability bottlenecks, migration strategy, Prisma conventions, DB role separation, full 48-item coverage map.
- [x] `API.md` written - Principal-API-Architect-level contract: philosophy, naming conventions, versioning strategy, cursor pagination/filtering/sorting/search, RFC 7807 error model, REST-vs-GraphQL scoping, OAuth2/JWT auth, idempotency/optimistic concurrency/retry, rate limiting, 10 capability groups (org/workspace/user/inbox/contacts/connectors/automation/notifications/AI/billing/admin) each with why/request/response/permissions/errors/future-compat, WebSocket/SSE transport split, long-running-operation envelope, file upload/download strategy, webhook payload/signing/retry contract, internal event naming, API lifecycle rules, full coverage map.
- [x] `docs/adr/` seeded with ADR-0001 through ADR-0010: PostgreSQL, Prisma, REST-over-GraphQL-by-default, Connector SDK, event-driven architecture, URI versioning, UUIDv7 primary keys, two-level multi-tenancy, modular monolith + connector workers, Telegram Bot API only.
- [x] `docs/DECISIONS.md` written - quick-reference ADR index with instructions for adding future ADRs.

## In Progress

Git repository connection to `https://github.com/BozgunBer-2506/smartmc` - see Next Action.

## Not Started (Phase 0 remaining)

- [ ] `UI_GUIDE.md` - not started. Should expand PRODUCT.md's "UI Principles" section into concrete screen-level specs.
- [ ] `DESIGN_SYSTEM.md` - not started. Should expand PRODUCT.md's "Brand" section into implementable tokens/components.
- [ ] `SECURITY.md` - not started. Threat model, credential storage, secrets management, audit log spec, GDPR handling.
- [ ] `AUTOMATION_ENGINE.md` - not started. Should formalize PRODUCT.md's automation section into an implementable JSON schema + execution semantics.

## Known Open Decisions (unresolved, tracked here so they aren't lost)

1. **Monorepo tool**: Turborepo vs Nx - leaning Turborepo, not finalized. See ARCHITECTURE.md section 12.
2. **Telegram integration method**: decided - Bot API only, not MTProto (ToS-safety). See ARCHITECTURE.md section 12.
3. **Monolith vs microservices at MVP**: decided - modular monolith for core API, connector workers split out as independent deployables from day one. See ARCHITECTURE.md section 11.
4. **Pricing numbers** ($12/mo Pro, $18/seat Business) are a starting hypothesis, explicitly flagged in PRODUCT.md as likely to need adjustment post-launch based on conversion data. Not a blocker, just don't treat as final.
5. **LinkedIn DM integration** feasibility (no public API) - unresolved, deferred to Phase V2 planning around Phase 16-17 timeframe. May end up in the Never Build list if no compliant path exists.

## Next Action

1. Finish connecting the git remote (`git init`, `git remote add origin https://github.com/BozgunBer-2506/smartmc`, initial commit, push) - in progress as of this update.
2. Write `SECURITY.md` (recommended next Phase 0 doc - `API.md`'s auth section and `DATABASE.md`'s credential-storage design both assume a threat model this document should make explicit).
3. Then `AUTOMATION_ENGINE.md`, `UI_GUIDE.md`, `DESIGN_SYSTEM.md` to close out Phase 0.
4. Resolve the `backend/`/`frontend/`/`connectors/` vs. `apps/`+`packages/` reconciliation (ROADMAP.md's "Repository Layout" section) before Phase 1 bootstrap begins.

Do not start Phase 1 (project bootstrap) until every Phase 0 box in ROADMAP.md is checked.

## How to Resume From Zero Context

1. Read this file (`STATUS.md`).
2. Read `ROADMAP.md` for the full phase plan and working rules.
3. Read `PRODUCT.md` and `ARCHITECTURE.md` for the decisions already made - do not re-derive or re-litigate anything documented there.
4. Continue from "Next Action" above, or from wherever the user redirects.
