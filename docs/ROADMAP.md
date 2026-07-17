# Smart Message Center - ROADMAP.md

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

---

## Repository Layout

As of 2026-07-17, the repository root is:

```
smartmc/
├── docs/           # everything in this list - product/technical design, ADRs
│   ├── adr/
│   └── ...
├── backend/        # empty - reserved for Phase 1 bootstrap
├── frontend/        # empty - reserved for Phase 1 bootstrap
├── connectors/       # empty - reserved for Phase 4-8 (Connector SDK + provider connectors)
```

**Open reconciliation item**: [ARCHITECTURE.md](ARCHITECTURE.md) Section 2 specifies a pnpm-workspace monorepo layout (`apps/web`, `apps/api`, `apps/desktop`, `packages/*`). The top-level `backend/`, `frontend/`, `connectors/` split adopted here is coarser. These need to be reconciled explicitly at the start of Phase 1 (e.g. `backend/` becomes the `apps/api` + `packages/*` root, `frontend/` becomes `apps/web` + `apps/desktop`, `connectors/` becomes `packages/connector-sdk` plus per-provider connector packages) - not silently, and not by picking one over the other without updating ARCHITECTURE.md to match. Tracked here so it isn't lost before Phase 1 starts.

---

## Phase 0 - Product Foundation

Goal: lock down what we're building and why, before any code exists.

- [x] `PRODUCT.md` - vision, personas, problems/solutions, competitors, MVP/V2, automation catalog, pricing, brand
- [x] `ARCHITECTURE.md` - system architecture, folder structure, DB schema (draft), event flow, API design (draft), auth flow, infra, CI/CD, roadmap, tech choices
- [x] `DATABASE.md` - full schema as its own document: ER diagram, philosophy, naming conventions, every entity with columns/keys/indexes, partitioning/archiving/search strategy, GDPR, RLS-readiness, optimistic locking, Prisma recommendations, full coverage map
- [x] `API.md` - API contract as product surface: REST-first + GraphQL where it adds value, versioning, error model, pagination/filtering/search, auth (OAuth2/JWT), webhooks, WebSockets/SSE, idempotency, long-running ops, per-domain API groups, event/webhook contracts, lifecycle rules
- [x] `docs/adr/` - Architecture Decision Records, seeded with ADR-0001 through ADR-0010 covering every significant decision made so far (Postgres, Prisma, REST-over-GraphQL, Connector SDK, event-driven architecture, URI versioning, UUIDv7, two-level tenancy, modular monolith, Telegram Bot API only) - added to the plan per user direction on 2026-07-17, see Notes on Sequencing
- [x] `docs/DECISIONS.md` - quick-reference index of all ADRs, added alongside `docs/adr/` per user direction on 2026-07-17
- [ ] `UI_GUIDE.md` - expand PRODUCT.md's UI Principles into concrete screen-level guidance (inbox layout, rule builder canvas, morning briefing)
- [ ] `DESIGN_SYSTEM.md` - tokens (color, type, spacing), component inventory on top of shadcn/ui, expand PRODUCT.md's Brand section into implementable specs
- [x] `ROADMAP.md` - this file
- [ ] `SECURITY.md` - threat model, credential storage, secrets management, audit logging spec, GDPR data handling
- [ ] `AUTOMATION_ENGINE.md` - formal spec of the trigger/condition/action data model, expand PRODUCT.md's Automation Engine section into an implementable schema (JSON shape, validation rules, execution semantics)

Output: no code. Product and technical design only. **Phase 0 is not done until every box above is checked.**

---

## Phase 1 - Project Bootstrap

Goal: a working, empty project.

- [ ] Monorepo setup (pnpm workspaces + Turborepo, per ARCHITECTURE.md section 11)
- [ ] Next.js app scaffold (`apps/web`)
- [ ] NestJS app scaffold (`apps/api`)
- [ ] Docker + Docker Compose for local dev (Postgres, Redis, mailhog)
- [ ] Prisma initialized against `DATABASE.md` schema
- [ ] PostgreSQL + Redis wired into local dev
- [ ] ESLint + Prettier shared config (`packages/config`)
- [ ] Husky pre-commit hooks (lint, typecheck)
- [ ] GitHub Actions CI skeleton (lint, typecheck, build - per ARCHITECTURE.md section 9)

Output: `docker compose up` gives a running, empty, lint-clean project.

---

## Phase 2 - Authentication

- [ ] Register / login (email + password, Argon2id)
- [ ] OAuth (Google, GitHub)
- [ ] Passkeys (WebAuthn)
- [ ] 2FA (TOTP)
- [ ] Session management (JWT access + rotating refresh cookie)
- [ ] User settings (profile, password/2FA management)

---

## Phase 3 - Core Platform (no connectors yet)

- [ ] Workspace/account model
- [ ] Inbox shell (empty state, no live data yet)
- [ ] Linked Accounts model (structure only, no real provider yet)
- [ ] Notifications shell (in-app notification center, no external push yet)
- [ ] Tags
- [ ] Folders
- [ ] Search shell (structure, indexing not required yet)
- [ ] User preferences (silent hours, VIP list structure)

Telegram is not part of this phase. This phase proves the domain model stands on its own before any provider is wired in.

---

## Phase 4 - Connector SDK ⭐ Most important phase before Phase 5

The reason a new provider should someday take days, not weeks.

- [ ] `Connector` interface (`packages/connector-sdk`) - defined per ARCHITECTURE.md's `connector.interface.ts` convention
- [ ] Connector registry (how the platform discovers/loads connectors)
- [ ] Canonical event contract (`message.received`, `message.sent`, etc. - per ARCHITECTURE.md section 4)
- [ ] Webhook-based ingestion support
- [ ] Polling-based ingestion support (for providers without webhooks, e.g. IMAP)
- [ ] Health checks per connector
- [ ] Reconnect logic (dropped gateway connections, expired tokens)
- [ ] Retry/backoff logic for outbound provider calls
- [ ] A test/mock connector used only to validate the SDK end-to-end before building a real one

Output: the system can accept a "toy" connector end-to-end (fake provider, fake messages) through the entire pipeline: ingestion -> canonical Message -> unified inbox -> outbound send. This is the proof that Phase 5-8 will be additive, not repeated bespoke work.

---

## Phase 5 - Telegram Connector

First real integration, built entirely on the Phase 4 SDK.

- [ ] Bot API authentication (per ARCHITECTURE.md section 12 decision: Bot API only, not MTProto)
- [ ] Receive messages
- [ ] Send messages
- [ ] Media/attachments
- [ ] Groups
- [ ] Channels
- [ ] Sync (backfill on connect)
- [ ] Connection status surfaced in UI

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
