# Smart Message Center - STATUS.md

```yaml
Title: STATUS.md
Version: 1.4
Status: Living
Owner: Founder/CTO
Last Updated: 2026-07-18
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0011
```

Living status file. Updated at the end of every work session. If a new session starts cold (context lost, new machine, new day), read this file first, then [ROADMAP.md](ROADMAP.md), before doing anything else.

---

## Current Phase

**Phase 0 - Product Foundation** (in progress)

## Last Updated

2026-07-18

## Repository

**Structure finalized 2026-07-18 via [ADR-0011](adr/0011-monorepo-layout.md).** A provisional `backend/`+`frontend/`+`connectors/` layout existed 2026-07-17 to 2026-07-18 and has been fully replaced, per explicit user direction not to defer this into Phase 1:
```
smartmc/
├── docs/ (PRODUCT.md, ARCHITECTURE.md, DATABASE.md, API.md, ROADMAP.md, STATUS.md, DECISIONS.md, adr/)
├── apps/       (web, api, desktop, mobile - all empty, reserved per phase)
├── packages/     (connector-sdk, automation-engine, database, auth, shared, ui, ai, config - all empty)
├── infrastructure/ (empty, reserved for Docker/K8s/Terraform)
├── scripts/     (empty, reserved for CI-support scripts)
```
GitHub remote: `https://github.com/BozgunBer-2506/smartmc`, connected and pushed.
No open reconciliation item remains at the repository-layout level.

## Completed

- [x] `PRODUCT.md` written - vision, mission, personas, 100 problems, 100 solutions, competitor analysis, MVP/V2 scope, AI features policy, automation engine design + 100 examples, pricing, brand, roadmap outline, success metrics, never-build list.
- [x] `ARCHITECTURE.md` written - system architecture diagram, folder structure, DB schema (draft), event flow, API design (draft), auth flow, infra diagram, deployment strategy, CI/CD pipeline, tech stack rationale.
- [x] `ROADMAP.md` written - 19 phases (0-18), working rules for session continuity, sequencing rationale, ADR discipline, repository layout note.
- [x] `STATUS.md` (this file) created and kept current.
- [x] `DATABASE.md` written - Principal-Architect-level schema: philosophy, naming conventions, ER diagram, UUIDv7 rationale, two-level multi-tenancy (Organization/Workspace), 22 entity groups with full column/key/index/constraint detail, soft-delete + audit + optimistic-locking + RLS-readiness policies, partitioning/archiving/search strategy, GDPR erasure workflow, event-sourcing scope decision, read-model notes, scalability bottlenecks, migration strategy, Prisma conventions, DB role separation, full 48-item coverage map.
- [x] `API.md` written - Principal-API-Architect-level contract: philosophy, naming conventions, versioning strategy, cursor pagination/filtering/sorting/search, RFC 7807 error model, REST-vs-GraphQL scoping, OAuth2/JWT auth, idempotency/optimistic concurrency/retry, rate limiting, 10 capability groups (org/workspace/user/inbox/contacts/connectors/automation/notifications/AI/billing/admin) each with why/request/response/permissions/errors/future-compat, WebSocket/SSE transport split, long-running-operation envelope, file upload/download strategy, webhook payload/signing/retry contract, internal event naming, API lifecycle rules, full coverage map.
- [x] `docs/adr/` seeded with ADR-0001 through ADR-0010: PostgreSQL, Prisma, REST-over-GraphQL-by-default, Connector SDK, event-driven architecture, URI versioning, UUIDv7 primary keys, two-level multi-tenancy, modular monolith + connector workers, Telegram Bot API only.
- [x] `docs/DECISIONS.md` written - quick-reference ADR index with instructions for adding future ADRs.
- [x] `ADR-0011` written and repository restructured same-day - `apps/`+`packages/` via pnpm workspaces + Turborepo, evaluated against scalability/DX/code-sharing/connector-architecture/desktop/mobile/CI-CD/testing/build-performance/future-microservices, over the provisional `backend/`+`frontend/`+`connectors/` split. `ARCHITECTURE.md` Section 12 and `ROADMAP.md`'s Repository Layout section both updated to reflect this as final, not provisional.
- [x] Git repository connected: `https://github.com/BozgunBer-2506/smartmc`, initial commit pushed to `main`.
- [x] Document metadata-header convention adopted (Title/Version/Status/Owner/Last Updated/Depends On/Related ADRs) and backfilled onto every existing living document in `docs/` - see ROADMAP.md's Working Rules. Also fixed leftover "PulseHub" naming in ARCHITECTURE.md left over from before the product was renamed.
- [x] `SECURITY.md` written - threat model (assets/actors/attack surfaces/data classification), authentication/session security (Argon2id, passkeys-as-default, refresh-token reuse detection, separate admin auth tier), secrets management (why connector credentials are retrievable and how that's bounded via indirection/access-scoping/logging/unconditional-revocation-on-disconnect), encryption at rest/in transit, full GDPR operational policy (subject rights, retention timelines, residency, breach notification), audit logging spec (what's logged, integrity enforcement, retention), OWASP-Top-10-mapped application security, inbound webhook verification + outbound webhook signing, third-party connector sandboxing (Phase 18 forward-looking), infrastructure security, incident response, vulnerability management/CI security testing, explicitly-rejected-approaches list.

- [x] `AUTOMATION_ENGINE.md` written - designed as the product's flagship differentiator, not a feature: trigger model (9 categories incl. future location-aware), nested-condition model with reusable Condition Snippets, action model with branching/parallel/delayed steps and reusable Composite Actions, the cross-channel Context Object (the section explicitly named as the actual technical moat vs. Zapier/generic automation tools), visual builder driven by a registered-capability catalog (so the engine is a platform, not a hardcoded feature), natural-language rule creation and AI-assisted rules (both strictly draft-only, never auto-activating, per PRODUCT.md's hard AI boundary), execution engine (idempotent, isolated per rule, sandboxed external calls), retry policy, failure policy (circuit breakers, auto-disable with notification), dead letter queue (replayable), rule versioning/testing/simulator (a time-travel virtual-clock sandbox - the section flagged as the hardest-to-copy piece)/debugger, rule analytics framed around "value delivered" not just technical metrics, a three-tier marketplace design (snippets/composite actions/rule bundles) with safety review, import/export with portable variable-based references, a dedicated "why competitors can't copy this" section, and 208 examples across all 16 requested categories (Personal through Accessibility, 13 each).
- [x] `CONNECTOR_SDK.md` written - added to scope per user direction on 2026-07-18, explicitly gating Phase 1: connector lifecycle state machine (with `degraded` as a distinct state from `error`/`reauth_required`), auth lifecycle across auth-method types, hybrid ingestion required by default (webhook-only fails certification - webhooks alone are never trusted), capability discovery/feature negotiation, health monitoring, retry/backoff, initial/incremental/reconciliation sync, checkpointed offline recovery, conflict resolution (provider is always the content source of truth, identities never auto-merged beyond exact match), message normalization contract, attachment abstraction (always routed through our own storage, never provider-URL references), rate limit handling (backpressure, never silent drops), a standardized error taxonomy, a 13-item certification checklist, a shared conformance test harness, and the Mock Connector's dual role as first connector built and reference conformance implementation - it also turns out to be the load-bearing component behind `AUTOMATION_ENGINE.md`'s rule simulator.
- [x] `EVENT_MODEL.md` written - added to scope per user direction on 2026-07-18, explicitly gating Phase 1 alongside `CONNECTOR_SDK.md`: the shared event envelope (with `correlationId`/`causationId` for cross-event causal tracing, feeding the Automation Engine's debugger), per-aggregate (never global) ordering guarantees explained and justified, idempotency via `eventId` plus natural-key dedup, one retry/DLQ philosophy applied consistently at the bus level (mirroring `CONNECTOR_SDK.md`'s provider-call retries and `AUTOMATION_ENGINE.md`'s action retries - not three separate policies), naming/versioning rules, and a full catalog of ~40 events across 9 domains (Message, Conversation, Contact/Identity, Connector, Rule/Automation, Notification, Workspace/Organization, Billing, Webhook) each fully specified (payload/producer/consumers/ordering key/idempotency key/retry).
- [x] `ROADMAP.md` updated with a new Working Rule ("every phase ends with working, demonstrable software") and Phase 1 restructured into Sprint 1 (infrastructure only, no connector) / Sprint 2 (Mock Connector end-to-end: synthetic message → DB → WebSocket → UI, per user's suggested flow). Phases 2-5 each given an explicit Definition of Done: Phase 2 = a real login-able app, Phase 3 = an inbox showing a message list from mock/seeded data, Phase 4 = the Mock Connector passing its own full certification checklist including simulated-restart and webhook-loss-then-reconciliation tests, Phase 5 = a real person connecting a real Telegram bot and seeing a real message arrive live.

## In Progress

Nothing actively in progress. Awaiting direction on next Phase 0 document.

## Not Started (Phase 0 remaining)

- [ ] `UI_GUIDE.md` - not started. Should expand PRODUCT.md's "UI Principles" section into concrete screen-level specs. Should also cover the rule builder canvas UI now that AUTOMATION_ENGINE.md has specified its behavior (Section 7).
- [ ] `DESIGN_SYSTEM.md` - not started. Should expand PRODUCT.md's "Brand" section into implementable tokens/components.

These are now the **only two remaining boxes in all of Phase 0.**

## Known Open Decisions (unresolved, tracked here so they aren't lost)

1. **Pricing numbers** ($12/mo Pro, $18/seat Business) are a starting hypothesis, explicitly flagged in PRODUCT.md as likely to need adjustment post-launch based on conversion data. Not a blocker, just don't treat as final.
2. **LinkedIn DM integration** feasibility (no public API) - unresolved, deferred to Phase V2 planning around Phase 16-17 timeframe. May end up in the Never Build list if no compliant path exists.

All other previously-open decisions (monorepo tool, repository layout, monolith-vs-microservices, Telegram integration method) are resolved - see [DECISIONS.md](DECISIONS.md).

## Next Action

1. Write `UI_GUIDE.md`, then `DESIGN_SYSTEM.md` to close out Phase 0 - these are the last two remaining boxes on ROADMAP.md's Phase 0 checklist.
2. Once both are done, every Phase 0 box is checked - begin Phase 1 (project bootstrap) directly against the `apps/`+`packages/` structure ratified in ADR-0011, no further reconciliation needed.

## How to Resume From Zero Context

1. Read this file (`STATUS.md`).
2. Read `ROADMAP.md` for the full phase plan and working rules.
3. Read `PRODUCT.md` and `ARCHITECTURE.md` for the decisions already made - do not re-derive or re-litigate anything documented there.
4. Continue from "Next Action" above, or from wherever the user redirects.
