# Smart Message Center - DECISIONS.md

```yaml
Title: DECISIONS.md
Version: 1.2
Status: Living
Owner: Architecture
Last Updated: 2026-07-18
Depends On:
  - ROADMAP.md
Related ADRs: [all]
```

A quick-reference index of every Architecture Decision Record. This file is a lookup table, not a substitute for reading the actual ADR - it exists so "have we decided this already, and where" is answerable in ten seconds.

Full records live in [adr/](adr/). Each ADR follows the same shape: Status, Context, Decision, Consequences. **ADRs are never edited after acceptance.** A changed decision gets a new, higher-numbered ADR that explicitly supersedes the old one (linked both ways) - the old ADR stays in place, marked superseded, so the historical reasoning is never lost.

| # | Title | Status | Date | Summary |
|---|---|---|---|---|
| [0001](adr/0001-postgresql.md) | Use PostgreSQL as the Primary Database | Accepted | 2026-07-17 | Single relational + jsonb datastore for all tenant data; NoSQL alternatives rejected for weaker relational integrity fit. |
| [0002](adr/0002-prisma.md) | Use Prisma as the ORM | Accepted | 2026-07-17 | Type-safe data access matching the TS-everywhere stack; optimistic locking and RLS-awareness must be hand-built, not framework-provided. |
| [0003](adr/0003-rest-over-graphql-by-default.md) | REST by Default, GraphQL Only Where It Adds Value | Accepted | 2026-07-17 | REST owns everything with a side effect; GraphQL scoped to the unified inbox read path and rule-builder schema introspection only. |
| [0004](adr/0004-connector-sdk.md) | Pluggable Connector SDK for All Messaging Providers | Accepted | 2026-07-17 | Every provider integrates through one `Connector` interface mapping into the canonical Message/Conversation/Contact model; connectors run as independent workers. |
| [0005](adr/0005-event-driven-architecture.md) | Event-Driven Core (Redis/BullMQ Message Bus) | Accepted | 2026-07-17 | All inbound/outbound flow and automation runs through queues, not direct synchronous calls, so provider failures stay isolated. |
| [0006](adr/0006-uri-versioning.md) | URI-Based API Versioning | Accepted | 2026-07-17 | `/v1/...` path versioning over Accept-header negotiation, prioritizing third-party developer ergonomics. |
| [0007](adr/0007-uuid-v7-primary-keys.md) | UUIDv7 for All Primary Keys | Accepted | 2026-07-17 | Time-ordered UUIDs everywhere: enumeration-safe like UUIDv4, index-locality-friendly like sequential integers. |
| [0008](adr/0008-two-level-multi-tenancy.md) | Two-Level Multi-Tenancy: Organization and Workspace | Accepted | 2026-07-17 | Organization = billing/identity root; Workspace = actual tenant-scoping/data-sharing boundary. Designed for Phase 16 Teams from day one. |
| [0009](adr/0009-modular-monolith-with-connector-workers.md) | Modular Monolith Core with Independently Deployable Connector Workers | Accepted | 2026-07-17 | Core API stays a monolith; connectors are split out as independent services from day one for provider-failure isolation. |
| [0010](adr/0010-telegram-bot-api-only.md) | Telegram Integration via Bot API Only | Accepted | 2026-07-17 | No MTProto user-session mirroring, ever, regardless of the UX gap - ToS-safety and account-ban risk take priority. |
| [0011](adr/0011-monorepo-layout.md) | Monorepo Layout: apps/ + packages/ via pnpm Workspaces + Turborepo | Accepted | 2026-07-18 | Ratifies `apps/*` (web, api, desktop, mobile) + `packages/*` (connector-sdk, automation-engine, database, auth, shared, ui, ai, config) over the provisional `backend/`+`frontend/`+`connectors/` split; also resolves Turborepo vs. Nx in Turborepo's favor. |
| [0012](adr/0012-identitygraph-canonical-identity-layer.md) | IdentityGraph: A First-Class Canonical Identity Layer | Accepted | 2026-07-18 | Names and formalizes the platform's cross-provider identity resolution capability as `IdentityGraph` (chosen over 35 other candidates including IdentityFabric, RelationshipEngine, and rejected trademark-colliding options like Prism/Keystone/Nexus). Every consuming system (Automation Engine, Search, AI, Notifications) must reason about identities, never raw provider accounts. Never auto-merges below exact-match confidence; strictly workspace-scoped, never cross-tenant. |
| [0013](adr/0013-identity-merge-safety-over-cleverness.md) | Identity Merge Governance: Safe Merge and Reversal Over Matching Cleverness | Accepted | 2026-07-18 | A candidate identity match is a persisted, reviewable `identity_merge_suggestions` record (pending/approved/rejected/expired), not an ephemeral event. Every merge is reversible via a first-class split action. States explicitly that a missed duplicate is a minor inconvenience but a wrong merge is actively damaging (cascading VIP/automation/AI errors) - safety and reversibility, not matching sophistication, is the priority whenever the two trade off. |

## How to Add a New ADR

1. Copy the shape of an existing ADR file (`Status` / `Date` / `Deciders` / `Related` header, then `Context` / `Decision` / `Consequences`).
2. Number it sequentially - next number is always the current highest + 1, never reused.
3. Add a row to the table above.
4. If it supersedes an earlier ADR, mark the old one's `Status` as `Superseded by 00XX` (edit only the status line of the old record - the Context/Decision/Consequences body of a superseded ADR is never rewritten) and link forward from the old file to the new one.
5. Per [ROADMAP.md](ROADMAP.md)'s working rules: every significant, hard-to-reverse technical decision gets an ADR. Routine implementation choices within an already-decided pattern do not need one.
