# Smart Message Center - ROADMAP.md

```yaml
Title: ROADMAP.md
Version: 1.4
Status: Living
Owner: Founder/CTO
Last Updated: 2026-07-18
Depends On:
  - PRODUCT.md
  - ARCHITECTURE.md
  - CONNECTOR_SDK.md
  - EVENT_MODEL.md
Related ADRs:
  - ADR-0011
  - ADR-0012
```

This file is the single source of truth for project sequencing. If context is lost between sessions, work resumes by reading this file plus [STATUS.md](STATUS.md), never by guessing.

---

## Working Rules

- Every phase ends with a git commit.
- Every completed task in this file gets checked off in the same commit that completes it.
- [STATUS.md](STATUS.md) is updated at the end of every work session, not just at phase boundaries.
- Never skip a phase. If a phase turns out to be unnecessary, mark it explicitly "Skipped - reason" rather than silently omitting it.
- Never delete a recorded architecture decision. Superseded decisions are marked superseded, with a reason, not removed.
- Design/document before coding, for every phase, not just Phase 0.
- Every new module includes: a short README, tests, and a note on where it fits the architecture.
- If context runs out or a new session starts cold, resume by reading ROADMAP.md + STATUS.md first, before touching code.
- Never implement a feature that isn't documented in [PRODUCT.md](PRODUCT.md) or this roadmap. If it seems needed but isn't documented, document it first, then build it.
- Every feature traces back to a problem/solution pair in PRODUCT.md. If it doesn't, question whether it should be built.
- Every significant, hard-to-reverse technical decision (a technology choice, a pattern adopted, a "we will not do X and here's why") gets its own ADR in `docs/adr/`, numbered sequentially, never edited after acceptance - superseded ADRs get a new ADR that supersedes the old one (linked both ways), the old one is never rewritten or deleted. This is what answers "why didn't we just use GraphQL everywhere" six months from now with a documented answer instead of a guess.
- A repository-layout or deployment-topology decision is never left open past the document that depends on it - it gets resolved (ADR + updated ARCHITECTURE.md/ROADMAP.md/STATUS.md, and the repository restructured to match) before moving to the next document, not deferred to "whenever Phase 1 starts." Adopted 2026-07-18 after the `backend/`+`frontend/`+`connectors/` layout was correctly called out as something that shouldn't have been left provisional.
- Every living document in `docs/` (not the ADRs, which have their own header convention) carries a metadata block directly under its title: `Title`, `Version`, `Status` (Draft/Review/Approved/Living), `Owner`, `Last Updated`, `Depends On` (other docs), `Related ADRs`. This is what lets a human or an AI resuming cold tell, at a glance, whether a document is current and what it would break to change. Adopted 2026-07-18, backfilled onto every existing document the same day.
- **Every phase ends with working, demonstrable software** - not just checked boxes. Adopted 2026-07-18. Each phase below now states an explicit Definition of Done that someone can actually open and click through, starting from Phase 1. A phase whose only output is "the code compiles" or "the tests pass in CI" is not done - it's done when there is something a human can run and see behave correctly. This is what keeps architectural decisions honest (a design that only looks right on paper gets caught the first time it has to actually run) and keeps momentum visible.

---

## Repository Layout

**Resolved as of 2026-07-18 via [ADR-0011](adr/0011-monorepo-layout.md).** A provisional `backend/`+`frontend/`+`connectors/` layout existed briefly (2026-07-17 to 2026-07-18) and has been fully replaced - not left as an alias or transitional structure. The repository root is:

```
smartmc/
├── docs/              product/technical design documents, ADRs
│   ├── adr/
│   └── ...
├── apps/
│   ├── web/            Next.js unified inbox UI
│   ├── api/            NestJS backend (modular monolith, ADR-0009)
│   ├── desktop/          Tauri wrapper (Phase 15)
│   └── mobile/           React Native (added when Phase 14 starts)
├── packages/
│   ├── connector-sdk/       Connector interface + registry + test harness (ADR-0004)
│   ├── automation-engine/    Trigger/condition/action evaluation (Phase 10)
│   ├── database/          Prisma schema, client, migrations (DATABASE.md)
│   ├── auth/             Auth.js integration, JWT/session logic
│   ├── shared/            Canonical domain types (Message, Conversation, Contact...)
│   ├── ui/              shadcn/ui-based component library
│   ├── ai/              AI feature integrations (Phase 13), isolated per PRODUCT.md
│   └── config/            eslint, tsconfig, tailwind presets
├── infrastructure/         Docker, Docker Compose, Kubernetes, Terraform
└── scripts/             one-off and CI-support scripts
```

This is not provisional. Phase 1 bootstrap (below) proceeds directly against this structure with no further reconciliation needed.

---

## Phase 0 - Product Foundation

Goal: lock down what we're building and why, before any code exists.

- [x] `PRODUCT.md` - vision, personas, problems/solutions, competitors, MVP/V2, automation catalog, pricing, brand
- [x] `ARCHITECTURE.md` - system architecture, folder structure, DB schema (draft), event flow, API design (draft), auth flow, infra, CI/CD, roadmap, tech choices
- [x] `DATABASE.md` - full schema as its own document: ER diagram, philosophy, naming conventions, every entity with columns/keys/indexes, partitioning/archiving/search strategy, GDPR, RLS-readiness, optimistic locking, Prisma recommendations, full coverage map
- [x] `API.md` - API contract as product surface: REST-first + GraphQL where it adds value, versioning, error model, pagination/filtering/search, auth (OAuth2/JWT), webhooks, WebSockets/SSE, idempotency, long-running ops, per-domain API groups, event/webhook contracts, lifecycle rules
- [x] `docs/adr/` - Architecture Decision Records, seeded with ADR-0001 through ADR-0010 covering every significant decision made so far (Postgres, Prisma, REST-over-GraphQL, Connector SDK, event-driven architecture, URI versioning, UUIDv7, two-level tenancy, modular monolith, Telegram Bot API only) - added to the plan per user direction on 2026-07-17, see Notes on Sequencing
- [x] `docs/DECISIONS.md` - quick-reference index of all ADRs, added alongside `docs/adr/` per user direction on 2026-07-17
- [x] `ADR-0011` - repository layout decided (`apps/`+`packages/` via pnpm workspaces + Turborepo, over `backend/`+`frontend/`+`connectors/`), evaluated against scalability, DX, code sharing, connector architecture, desktop/mobile support, CI/CD, testing, build performance, and future microservices - see [adr/0011-monorepo-layout.md](adr/0011-monorepo-layout.md). Repository restructured to match immediately, not deferred to Phase 1.
- [x] `ROADMAP.md` - this file
- [x] `SECURITY.md` - threat model (assets/actors/attack surfaces), data classification, auth/session security, secrets/credential management (why connector tokens are retrievable and how that's bounded), encryption at rest/in transit, GDPR (subject rights/retention/residency/breach notification), audit logging spec, OWASP-mapped application security, inbound/outbound webhook verification, third-party connector isolation, infrastructure security, incident response, vulnerability management, rejected-approaches list
- [x] `AUTOMATION_ENGINE.md` - the flagship differentiator, formalized: trigger/condition/action models (nested condition trees, condition snippets, composite actions), the cross-channel Context Object (the actual moat), visual builder + NL rule creation + AI-assisted rules (all optional, never load-bearing), execution engine (idempotent, isolated, sandboxed), retry/failure policy, dead letter queue, rule versioning/testing/simulator (time-travel sandbox)/debugger, rule analytics, marketplace (three-tier reusability: snippets/composite actions/rules), import/export, an explicit "why competitors can't copy this" argument, and 208 examples across the 16 requested categories.
- [x] `CONNECTOR_SDK.md` - the contract any provider integration (ours or third-party) conforms to: connector lifecycle state machine, auth lifecycle across auth-method types, webhook/polling/hybrid ingestion (hybrid required by default - webhooks alone are never trusted), capability discovery + feature negotiation, health monitoring, retry/backoff, initial/incremental/reconciliation sync, checkpointed offline recovery, conflict resolution, message normalization contract, attachment abstraction, identity mapping (auto-match on exact identity only, never silent fuzzy merge), rate limit handling, a standardized provider-agnostic error taxonomy, a certification checklist, and the mock connector's dual role as both the first connector built (Phase 4) and the conformance-test reference implementation every other connector is held to. Added to scope per user direction on 2026-07-18, explicitly gating Phase 1.
- [x] `EVENT_MODEL.md` - the canonical event registry the internal bus, outbound webhooks, and audit log all draw from one shared vocabulary: the event envelope (including `correlationId`/`causationId` for cross-event causal tracing), per-aggregate (not global) ordering guarantees, idempotency, retry/DLQ (mirroring `AUTOMATION_ENGINE.md`'s DLQ design), naming/versioning rules, and a full catalog of ~40 events across Message/Conversation/Contact-Identity/Connector/Rule/Notification/Workspace/Billing/Webhook domains, each with payload/producer/consumers/ordering key/idempotency key/retry behavior specified. Added to scope per user direction on 2026-07-18, explicitly gating Phase 1 alongside `CONNECTOR_SDK.md`.
- [x] `ADR-0012` - **IdentityGraph** named and formalized as a first-class architectural capability, after a 36-candidate naming exercise across Graph/Identity/Communication/Relationship/Intelligence/Platform categories. Every consuming system (Automation Engine, Search, AI, Notifications) now reasons about identities, never raw provider accounts. Never auto-merges beyond exact deterministic match; strictly workspace-scoped, never cross-tenant (added to PRODUCT.md's Never Build list). `PRODUCT.md`, `ARCHITECTURE.md` (new Section 13), `DATABASE.md` (confidence-score column + `identity_merge_log`/`identity_split_log` audit tables), and `AUTOMATION_ENGINE.md` all updated to route their existing identity-adjacent content through this one named capability - see [adr/0012-identitygraph-canonical-identity-layer.md](adr/0012-identitygraph-canonical-identity-layer.md).
- [ ] `UI_GUIDE.md` - expand PRODUCT.md's UI Principles into concrete screen-level guidance (inbox layout, rule builder canvas, morning briefing)
- [ ] `DESIGN_SYSTEM.md` - tokens (color, type, spacing), component inventory on top of shadcn/ui, expand PRODUCT.md's Brand section into implementable specs

Output: no code. Product and technical design only. **Phase 0 is not done until every box above is checked.**

---

## Phase 1 - Project Bootstrap

Goal: a working, empty project. Split into two sprints so "working software at the end" applies at the sprint level, not just the phase level - by the end of Sprint 2, there is something to click through, not just a codebase that compiles.

### Sprint 1 - Infrastructure, No Product Surface Yet

- [ ] Monorepo setup (pnpm workspaces + Turborepo, per ARCHITECTURE.md section 11 / ADR-0011)
- [ ] Next.js app scaffold (`apps/web`)
- [ ] NestJS app scaffold (`apps/api`)
- [ ] Docker + Docker Compose for local dev (Postgres, Redis, mailhog)
- [ ] Prisma initialized against `DATABASE.md` schema
- [ ] PostgreSQL + Redis wired into local dev
- [ ] ESLint + Prettier shared config (`packages/config`)
- [ ] Husky pre-commit hooks (lint, typecheck)
- [ ] GitHub Actions CI skeleton (lint, typecheck, build - per ARCHITECTURE.md section 9)

**Not a single connector is written in this sprint - not even the mock connector.** This sprint is infrastructure only.

### Sprint 2 - The First End-to-End Slice (Mock Connector Only, Never Telegram)

Extended 2026-07-18 per user direction to prove the *whole* heartbeat of the product - ingestion through to a felt notification - not just message delivery. Every piece below is a deliberately minimal stub, not the real system: a hardcoded single rule, not the Phase 10 rule builder; an in-app toast, not the Phase 11 Notification Service. The point of Sprint 2 is proving the shape of the full loop end-to-end as cheaply as possible; each stub is properly built out in its own later phase (Phase 9-11) without changing the shape proven here.

- [ ] `packages/connector-sdk` scaffolded per `CONNECTOR_SDK.md`'s contract (interface, registry, lifecycle state machine)
- [ ] The Mock Connector (`CONNECTOR_SDK.md` Section 18) - not Telegram, not any real provider
- [ ] Event bus wired per `EVENT_MODEL.md`'s envelope + `message.received` event
- [ ] Minimal `apps/api` handler: Mock Connector event → IdentityGraph exact-match resolution (Phase 3's scaffold) → Postgres (`packages/database`) write
- [ ] WebSocket push (`API.md` Section 11) from that write to a connected client
- [ ] A bare-bones `apps/web` screen that connects over WebSocket and renders an incoming mock message live - a stand-in for the real unified inbox (Phase 9)
- [ ] **One hardcoded stub rule** (not the visual builder, not the rule engine's full trigger/condition/action model - a single, literal `if message.received then create notification` check) reacting to the mock message via `rule.triggered`/`rule.action_executed` events (`EVENT_MODEL.md` Section 7.5) - a stand-in for the real Automation Engine (Phase 10)
- [ ] **One stub notification** (an in-app toast, not push/email, not the Notification Service's silent-hours/VIP logic) appearing as a result of the stub rule firing - a stand-in for the real Notification Service (Phase 11)

**Definition of Done for Phase 1**: `docker compose up`, register an account (Phase 2's auth, or a seeded dev-mode user if auth isn't ready yet), open the web app, trigger the Mock Connector to emit a synthetic message - and watch the full loop happen live: the message appears in the (stub) inbox, the stub rule fires, and a notification toast appears. This is `ARCHITECTURE.md` Section 1's entire pipeline diagram, felt end-to-end with fake data and stubbed intelligence, before a single line of Telegram-specific code or a single real automation rule exists. If this doesn't work smoothly with a mock connector and a trivial stub rule, it will not work smoothly once Telegram (Phase 5) and the real Automation Engine (Phase 10) replace those stubs - this sprint is where the pipeline's *shape* gets validated cheaply, before any of its pieces get complicated.

---

## Phase 2 - Authentication

- [ ] Register / login (email + password, Argon2id)
- [ ] OAuth (Google, GitHub)
- [ ] Passkeys (WebAuthn)
- [ ] 2FA (TOTP)
- [ ] Session management (JWT access + rotating refresh cookie)
- [ ] User settings (profile, password/2FA management)

**Definition of Done**: a real person can sign up, log out, log back in, and land on the (still mostly empty) app as themselves - a login-able application, not just an API that accepts credentials.

---

## Phase 3 - Core Platform (no connectors yet)

- [ ] Workspace/account model
- [ ] `packages/identity-graph` scaffolded: `Contact`/`ContactIdentity` schema (`DATABASE.md` Section 6.6) with exact-match resolution only (`ARCHITECTURE.md` Section 13.6) - fuzzy/confidence-scored matching is a later phase, not required to prove the core model
- [ ] Inbox shell rendering a **message list from seeded/mock data** (not an empty state - Phase 1's mock pipeline is reused here to seed realistic-looking conversations)
- [ ] Linked Accounts model (structure only, no real provider yet)
- [ ] Notifications shell (in-app notification center, no external push yet)
- [ ] Tags
- [ ] Folders
- [ ] Search shell (structure, indexing not required yet)
- [ ] User preferences (silent hours, VIP list structure)

Telegram is not part of this phase. This phase proves the domain model stands on its own before any provider is wired in.

**Definition of Done**: a logged-in user sees an inbox with a believable list of conversations and messages (mock-sourced), can open one, tag it, and set a notification preference - the full unified-inbox *shape* is real; only the data source is still fake.

---

## Phase 4 - Connector SDK ⭐ Most important phase before Phase 5

The reason a new provider should someday take days, not weeks. Builds out `CONNECTOR_SDK.md`'s full contract (Sprint 2 of Phase 1 only proved the thinnest possible slice of it).

- [ ] `Connector` interface (`packages/connector-sdk`) - full implementation of `CONNECTOR_SDK.md` Sections 2-15, not just the lifecycle skeleton from Phase 1 Sprint 2
- [ ] Connector registry (how the platform discovers/loads connectors)
- [ ] Canonical event contract fully wired per `EVENT_MODEL.md` Section 7.1-7.4, not just `message.received`
- [ ] Webhook-based ingestion support
- [ ] Polling-based ingestion support (for providers without webhooks, e.g. IMAP)
- [ ] Hybrid reconciliation pass (`CONNECTOR_SDK.md` Section 4.3) - required, not optional
- [ ] Health checks per connector (`CONNECTOR_SDK.md` Section 6)
- [ ] Checkpointed offline recovery (`CONNECTOR_SDK.md` Section 9)
- [ ] Retry/backoff logic for outbound provider calls
- [ ] The Mock Connector extended to full certification-checklist conformance (`CONNECTOR_SDK.md` Section 16-18) - it becomes the reference implementation, not just Phase 1's proof-of-pipeline stub
- [ ] The conformance test harness itself (`CONNECTOR_SDK.md` Section 17)

**Definition of Done**: the Mock Connector passes its own certification checklist end-to-end, including a simulated worker-restart-mid-sync test and a simulated webhook-loss-then-reconciliation test - the system demonstrably survives the failure modes `CONNECTOR_SDK.md` designed for, proven against fake infrastructure before it's ever risked against a real provider's flakiness.

---

## Phase 5 - Telegram Connector

First real integration, built entirely on the Phase 4 SDK.

- [ ] Bot API authentication (per ARCHITECTURE.md section 12 decision / ADR-0010: Bot API only, not MTProto)
- [ ] Receive messages
- [ ] Send messages
- [ ] Media/attachments
- [ ] Groups
- [ ] Channels
- [ ] Sync (backfill on connect)
- [ ] Connection status surfaced in UI
- [ ] Passes the full `CONNECTOR_SDK.md` Section 16 certification checklist - the same bar the Mock Connector was held to in Phase 4, now against a real, rate-limited, occasionally-flaky external API

**Definition of Done**: a real person connects their own real Telegram bot, sends themselves a real message from their phone, and watches it appear in the Smart Message Center inbox live - the first moment in the project where the product does the thing PRODUCT.md's Vision describes, with a real external system, not a mock or a diagram.

---

## Phase 6 - Discord Connector

Same Connector SDK. No architecture changes, no repeated plumbing - if this phase requires touching core domain code, that's a signal Phase 4 was under-designed and should be revisited before continuing.

- [ ] Discord Gateway auth (OAuth2 + bot)
- [ ] Receive / send messages
- [ ] Media/attachments
- [ ] Servers/channels mapping to Conversation model

---

## Phase 7 - Slack Connector

Same pattern as Phase 6.

- [ ] Slack OAuth2 + Events API
- [ ] Receive / send messages
- [ ] Slack Connect (external workspace) support
- [ ] Channels/DMs mapping to Conversation model

---

## Phase 8 - Email Connector

- [ ] IMAP (receive, folder sync)
- [ ] SMTP (send)
- [ ] Labels/folders mapped to Tags
- [ ] Threading mapped to Conversation model

**Checkpoint after Phase 8**: four real connectors exist on one SDK. If adding connectors 2-4 took meaningfully longer than connector 1 (relative to their native API complexity), the SDK has a design flaw - fix it before Phase 9, not after.

---

## Phase 9 - Smart Inbox

This is where the product stops being "an aggregator" and starts being Smart Message Center.

- [ ] Unified inbox view (all connectors, one feed)
- [ ] Filters
- [ ] Priority/importance scoring (rule-based, per PRODUCT.md)
- [ ] VIP handling
- [ ] Archive
- [ ] Categories
- [ ] Unread manager ("Needs You" count - must be trustworthy, per PRODUCT.md UI Principles)
- [ ] IdentityGraph fuzzy-match confidence scoring, duplicate-detection suggestion queue, and manual merge/split UI (`ARCHITECTURE.md` Section 13.3/13.6) - the exact-match-only version from Phase 3 gets its human-in-the-loop layer here, once there are multiple real connectors (Phase 5-8) generating cross-provider identity signal worth reconciling

---

## Phase 10 - Automation Engine ⭐⭐⭐⭐⭐ The heart of the product

- [ ] Trigger types (per `AUTOMATION_ENGINE.md`)
- [ ] Condition types (AND/OR tree)
- [ ] Action types
- [ ] Variables (e.g. sender name, tag, date, in templated actions)
- [ ] Templates (saved replies, rule templates)
- [ ] Visual rule builder (no-code canvas)
- [ ] Execution engine (queue consumers, idempotent, per ARCHITECTURE.md section 4)
- [ ] Scheduler (delayed/recurring triggers)

---

## Phase 11 - Notification Engine

- [ ] Priority-based sounds
- [ ] Custom sounds per VIP/contact
- [ ] Emergency/override mode
- [ ] Keyword alerts
- [ ] Reminder alerts (Waiting On / Commitments, per PRODUCT.md)
- [ ] Escalation rules

---

## Phase 12 - Search

- [ ] Global search (Postgres full-text, per ARCHITECTURE.md)
- [ ] Attachments search
- [ ] Contacts search
- [ ] Messages search
- [ ] Semantic search (deferred to Phase 13 dependency - requires AI layer)

---

## Phase 13 - AI (first AI in the product, not before)

- [ ] Conversation summaries
- [ ] Suggested replies
- [ ] Task/commitment detection
- [ ] Meeting detection
- [ ] Translation
- [ ] Rewrite
- [ ] Smart/semantic search

AI must be fully optional here and everywhere after. Every feature above must degrade gracefully (feature hidden or falls back to non-AI equivalent) if AI is disabled or unavailable. Per PRODUCT.md's AI Features section: no autopilot auto-send, ever.

---

## Phase 14 - Mobile

- [ ] React Native app scaffold
- [ ] Push notifications (native - the reason this waits until now, see PRODUCT.md V2 rationale)
- [ ] Offline support
- [ ] Biometrics

---

## Phase 15 - Desktop

- [ ] Tauri app (wraps the web app, per ARCHITECTURE.md)
- [ ] System tray
- [ ] Native notifications
- [ ] Background sync

---

## Phase 16 - Teams

- [ ] Organizations/workspaces (multi-user)
- [ ] Shared inbox (claim/assign, no double-reply)
- [ ] Roles
- [ ] Permissions (RBAC)
- [ ] Audit logs

---

## Phase 17 - Enterprise

- [ ] SSO (SAML/OIDC)
- [ ] SCIM
- [ ] LDAP
- [ ] Analytics dashboard
- [ ] Compliance tooling (SOC 2 prep)
- [ ] Retention policies

---

## Phase 18 - Marketplace

- [ ] Automation template marketplace
- [ ] Connector marketplace (third-party connectors on the Phase 4 SDK)
- [ ] AI plugins
- [ ] Community rule sharing

---

## Notes on Sequencing

- Phases 0-3 produce zero user-visible product. That is intentional: the Connector SDK (Phase 4) is the highest-leverage, hardest-to-retrofit piece of this system, and it must be built on a stable domain model, not against a moving one.
- Phases 5-8 exist specifically to pressure-test Phase 4. If any of them require changing the SDK interface, that's expected for Discord (Phase 6) - it's the first real second connector - but should not happen by Slack (Phase 7) or Email (Phase 8). Treat a forced SDK change at Phase 7/8 as a signal to stop and reassess, not as a routine cost.
- AI (Phase 13) is deliberately positioned after the automation engine, notifications, and search all have working non-AI versions. This enforces the "AI is optional, never load-bearing" principle structurally, not just by policy.
- Mobile (Phase 14) is deliberately after the AI layer, not before, because push-notification quality depends on priority scoring already working well server-side (Phase 9-11) - a mobile app built earlier would just ship the same notification chaos natively.
