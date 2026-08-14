# Smart Message Center - ROADMAP.md

```yaml
Title: ROADMAP.md
Version: 3.0
Status: Living
Owner: Founder/CTO
Last Updated: 2026-07-29
Depends On:
  - PRODUCT.md
  - ARCHITECTURE.md
  - CONNECTOR_SDK.md
  - EVENT_MODEL.md
Related ADRs:
  - ADR-0011
  - ADR-0012
  - ADR-0013
  - ADR-0014
  - ADR-0015
  - ADR-0016
  - ADR-0017
  - ADR-0018
  - ADR-0019
  - ADR-0020
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
- **Every phase gets a Phase Review before the next phase starts, and a release tag when it's done.** Adopted 2026-07-18. The review compares the actual implementation against `PRODUCT.md`/`ARCHITECTURE.md`/the ADRs/`ROADMAP.md`, reports deviations/technical debt/shortcuts/TODOs/architectural violations, and is saved to `docs/reviews/phase-N-review.md` - a report first, with a separate, explicit decision afterward about what gets fixed immediately versus deferred to its already-assigned phase (the rule: fix now only what gets more expensive to retrofit later; everything else stays on the roadmap). The tag (e.g. `v0.1.0-phase1`, and a follow-up `v0.1.1-phase1-hardening` if the review's immediate fixes warrant one) is what lets a future regression, a wrong ADR, or a bad refactor be rolled back to a known-good point with one command.

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
│   ├── marketing-site/     Isolated Next.js/Tailwind marketing site (ADR-0020, added 2026-07-22) - not part of the product, no shared code with apps/web
│   └── desktop/          Tauri wrapper (Phase 15, deferred - only if the Phase 14 PWA proves insufficient)
├── packages/
│   ├── connector-sdk/       Connector interface + registry + test harness (ADR-0004)
│   ├── automation-engine/    Trigger/condition/action evaluation (Phase 10)
│   ├── database/          Prisma schema, client, migrations (DATABASE.md)
│   ├── auth/             Auth.js integration, JWT/session logic
│   ├── shared/            Canonical domain types (Message, Conversation, Contact...)
│   ├── design-tokens/       Platform-agnostic design tokens (DESIGN_SYSTEM.md) - added 2026-07-18, consumed by ui/ today; a future React Native mapping is v2, not a numbered phase (see Phase 14's note)
│   ├── ui/              shadcn/ui-based component library (DESIGN_SYSTEM.md)
│   ├── ai/              AI feature integrations (Phase 13), isolated per PRODUCT.md
│   └── config/            eslint, tsconfig, tailwind presets
├── infrastructure/         Docker, Docker Compose, Kubernetes, Terraform
└── scripts/             one-off and CI-support scripts
```

This is not provisional. Phase 1 bootstrap (below) proceeds directly against this structure with no further reconciliation needed.

**Phase 1 populated a subset of this layout, 2026-07-18**: `apps/web`, `apps/api`, `packages/database`, `packages/shared`, `packages/connector-sdk`, `packages/ui`, plus two packages not originally named in ADR-0011 - `packages/event-model` (a home for `EVENT_MODEL.md`'s envelope/event-type code, split out from `shared` because it's a distinct enough concern to version and consume independently) and `packages/identity` (IdentityGraph's exact-match resolver, `ARCHITECTURE.md` Section 13) - and `scripts` (promoted from a reserved empty directory to a real workspace package, `@smc/scripts`, holding dev/verification tooling). `apps/desktop`, `apps/mobile`, `packages/automation-engine`, `packages/auth`, `packages/ai`, `packages/config`, `packages/design-tokens`, and `infrastructure/` remain empty, reserved for their originally-planned phases (15, 14, 10, 2, 13, 2, Design System's future implementation, and later deployment work respectively) - not built ahead of need.

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
- [x] `ADR-0013` - **Identity merge governance sharpened same-day**: a candidate match is a persisted, reviewable `identity_merge_suggestions` record (pending/approved/rejected/expired), not an ephemeral event; every merge is reversible via a first-class split action. States explicitly that safety/reversibility, not matching sophistication, is the priority whenever the two trade off - illustrated with a worked "two Ahmets" failure-mode example now in `ARCHITECTURE.md` Section 13.6.1. See [adr/0013-identity-merge-safety-over-cleverness.md](adr/0013-identity-merge-safety-over-cleverness.md).
- [x] **Licensing & secrets hygiene** - `LICENSE` added (all-rights-reserved, deliberately not MIT/Apache at this stage per user direction), `.gitignore` hardened with secret-file and database-dump patterns beyond the original `.env`-only coverage. Confirmed no secrets were ever tracked in repo history.
- [x] `UI_GUIDE.md` - the complete UX philosophy: core principles, user mental model (five objects: Needs You, Morning Briefing, Waiting On, People, Rules), information architecture, navigation, the Inbox/Morning Briefing/Identity view/Conversation timeline/Context panel/Automation builder/Notification center/Search experiences, AI interaction patterns, desktop/mobile experience, empty/loading/error states, permission and account-connection flows, first-time onboarding, power-user workflows, what users should/never see, confirmation-vs-instant action rules, and design-for-millions requirements.
- [x] `DESIGN_SYSTEM.md` - the complete, implementation-ready design system on shadcn/ui + Tailwind: a three-layer structure (platform-agnostic tokens → shadcn primitives → product composites) specifically so tokens can be shared with a future React Native app without a rewrite; full color/typography/spacing/grid/responsive specs; every primitive and product composite (including the novel IdentityGraph-specific components: Identity Avatar, Identity Link Chip, Merge Suggestion Card, Merge/Split Confirmation Dialog); accessibility, keyboard nav, dark mode, and animation rules; cross-platform strategy for web/desktop/mobile.

Output: no code. Product and technical design only. **Phase 0 is complete as of 2026-07-18 - every box above is checked.**

---

## Phase 1 - Project Bootstrap

Goal: a working, empty project. Split into two sprints so "working software at the end" applies at the sprint level, not just the phase level - by the end of Sprint 2, there is something to click through, not just a codebase that compiles.

### Sprint 1 - Infrastructure, No Product Surface Yet

**Complete as of 2026-07-18, with two items honestly still open (see below) - not glossed over as done.**

- [x] Monorepo setup (pnpm workspaces + Turborepo, per ARCHITECTURE.md section 11 / ADR-0011)
- [x] Next.js app scaffold (`apps/web`)
- [x] NestJS app scaffold (`apps/api`)
- [x] Docker + Docker Compose for local dev (Postgres, Redis, mailhog) - Postgres remapped to host port 5433, not 5432, to avoid colliding with an unrelated local project already using 5432
- [x] Prisma initialized against a pragmatic initial subset of `DATABASE.md`'s schema (Workspace, Provider, Contact, ContactIdentity, Conversation, Message, Notification) - grows toward the full spec as later phases actually need more of it, not implemented speculatively ahead of need
- [x] PostgreSQL + Redis wired into local dev, verified live via `GET /health`
- [x] ESLint + Prettier shared config (`packages/config`) - closed 2026-07-18, before Phase 4 (the project's oldest open item, flagged unresolved in the Phase 1 and Phase 2 reviews). Every package's `lint` script now runs real `eslint` (7 packages via a shared `@smc/config/eslint-preset`, `apps/web` via `next lint`).
- [x] Husky pre-commit hooks (lint, typecheck) - closed alongside the item above; `.husky/pre-commit` runs `pnpm lint && pnpm typecheck`.
- [x] GitHub Actions CI skeleton (`pnpm lint` / `pnpm typecheck` / `pnpm build`, no `pnpm test` yet since no tests exist - per explicit user direction) - the `lint` step now exercises real ESLint, not the stub scripts it started with.

**Not a single connector is written in this sprint - not even the mock connector.** This sprint is infrastructure only.

**Verified**: `pnpm install` (must run from a genuine Linux filesystem path - see the environment note below), `docker compose up -d`, `pnpm db:generate && pnpm db:push`, then `pnpm dev` - all 8 workspace packages start (6 in `tsc --watch`, `apps/api` via `nodemon`+`ts-node`, `apps/web` via `next dev`), and `pnpm lint`/`pnpm typecheck`/`pnpm build` all pass cleanly across every package.

**Environment note, recorded so it isn't rediscovered painfully later**: this repo lives on a WSL filesystem accessed from Windows via a `\\wsl.localhost\...` UNC path. Running `pnpm install` through a Windows-native Node/pnpm against that UNC path crashes with `Error: ...: is not a valid disk on Windows` (a pnpm bug in its Windows disk-type-detection code, unrelated to `package-import-method`). The fix is to run `pnpm`/`node`/`docker` commands from inside real WSL (`wsl.exe -d Ubuntu -- bash -lc '...'`, operating on `/home/.../smartmc`, not the Windows-side UNC path) - Windows-side tools can still edit files across the UNC path without issue; it's specifically pnpm's Windows install machinery that can't handle it.

### Sprint 2 - The First End-to-End Slice (Mock Connector Only, Never Telegram) - COMPLETE and VERIFIED, 2026-07-18

Extended 2026-07-18 per user direction to prove the *whole* heartbeat of the product - ingestion through to a felt notification - not just message delivery. Every piece below is a deliberately minimal stub, not the real system: a hardcoded single rule, not the Phase 10 rule builder; an in-app toast, not the Phase 11 Notification Service. The point of Sprint 2 is proving the shape of the full loop end-to-end as cheaply as possible; each stub is properly built out in its own later phase (Phase 9-11) without changing the shape proven here.

- [x] `packages/connector-sdk` scaffolded (Mock Connector generator only at this stage - the full lifecycle/capability-manifest/certification-suite contract from `CONNECTOR_SDK.md` is Phase 4 scope, not retrofitted here ahead of need)
- [x] The Mock Connector (`CONNECTOR_SDK.md` Section 18) - not Telegram, not any real provider; exposed via a debug-only `POST /dev/mock-connector/send` endpoint
- [x] Event bus wired: a single BullMQ `events` queue (per-type queue/consumer fan-out is a later scaling concern, not needed to prove the shape) carrying the `EVENT_MODEL.md` envelope, including `correlationId`/`causationId` propagated through the whole causal chain
- [x] `apps/api` handler: Mock Connector event → IdentityGraph exact-match resolution (`packages/identity`, Phase 3's scaffold) → Postgres (`packages/database`) write
- [x] WebSocket push (`API.md` Section 11, via `socket.io`) from that write to a connected client, joined to a per-workspace room
- [x] `apps/web` Inbox screen that connects over WebSocket and renders an incoming mock message live - a stand-in for the real unified inbox (Phase 9)
- [x] **One hardcoded stub rule** (`if message.received then create notification`, not the visual builder, not the real trigger/condition/action model) - emits `rule.triggered` → `rule.action_executed` → `notification.created` events (`EVENT_MODEL.md` Section 7.5/7.6), each carrying the prior event as its `causationId` - a stand-in for the real Automation Engine (Phase 10)
- [x] **One stub notification** (an in-app toast, not push/email, not the Notification Service's silent-hours/VIP logic) appearing as a result of the stub rule firing - a stand-in for the real Notification Service (Phase 11)

**Definition of Done for Phase 1 - verified, not just asserted:**
1. `GET /health` returns `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`.
2. `POST /dev/mock-connector/send` with a synthetic sender/body returns `202`-equivalent `{"status":"queued", eventId, correlationId}`.
3. Server-side log trace confirms the full causal chain fired in order: `message.received` → `rule.triggered` → `rule.action_executed` → `notification.created`.
4. Direct Postgres query confirms real rows: a `Contact` ("Alex"), a `Message` (inbound, correct body), a `Notification` ("New message from Alex") - **it fell into the DB**, per the original spec's literal completion criteria.
5. A real WebSocket client (`scripts/verify-realtime.mjs`, run via `pnpm --filter @smc/scripts verify:realtime`) joins the workspace room, triggers the Mock Connector, and receives both `message.received` and `notification.created` over the actual socket.io transport within the same test run - **the user will see it, and the notification will arrive**, proven over the wire, not just inferred from server logs.

This is `ARCHITECTURE.md` Section 1's entire pipeline diagram, felt end-to-end with fake data and stubbed intelligence, before a single line of Telegram-specific code or a single real automation rule exists.

**Phase Review completed 2026-07-18** - full report at [reviews/phase-1-review.md](reviews/phase-1-review.md). 3 findings fixed same-day and re-verified live: an RFC 7807 (`API.md` Section 5) global error filter, soft-delete columns + a Prisma Client extension enforcing them (`DATABASE.md` Section 7/20), and a production guard on `/dev/mock-connector/send` (404 outside development). 9 other findings deliberately deferred to their already-assigned phases, recorded in the review, not silently dropped. Tagged `v0.1.0-phase1` then `v0.1.1-phase1-hardening`.

---

## Phase 2 - Authentication - COMPLETE (backend) as of 2026-07-18

- [x] Register / login (email + password, Argon2id) - `POST /v1/auth/register`, `POST /v1/auth/login`, plus password policy (12+ chars), HIBP breach-check (verified live - correctly rejected a known-breached password during testing), and Redis-backed account lockout (SECURITY.md Section 4.1)
- [ ] OAuth (Google, GitHub) - **not implemented**, deliberately deferred (ADR-0014) - no external client exists yet to justify it ahead of need
- [ ] Passkeys (WebAuthn) - **not implemented**, deliberately deferred - schema is ready for it (`user_credentials.password_hash` is nullable), per explicit user direction to make this additive later, not a redesign
- [ ] 2FA (TOTP) - **not implemented**, deliberately deferred - `user_credentials.totp_secret` column reserved
- [x] Session management (JWT access + rotating refresh cookie) - 15-min JWT, 30-day httpOnly/Secure/SameSite=Strict refresh cookie, full `family_id` rotation + reuse detection (DATABASE.md Section 6.20) verified live end-to-end including the family-wide revocation cascade; logout, logout-all, and session listing (`GET /v1/auth/sessions`) all implemented
- [ ] User settings (profile, password/2FA management) - **not implemented**, `PATCH /v1/users/me` and the narrow security-sensitive endpoints (`API.md` Section 10.2) are Phase 3-adjacent, not required by this pass's Definition of Done

Also implemented, beyond the original checklist, because the Definition of Done required them: workspace/organization auto-creation on registration, `RolesGuard`+`@Roles()` RBAC foundation (owner/admin/member - no role-gated resource exists yet to apply it to, Phase 3 scope), `JwtAuthGuard` protecting `GET /v1/users/me` and the session endpoints, RFC 7807-shaped errors for every auth failure mode (`INVALID_CREDENTIALS`, `EMAIL_ALREADY_REGISTERED`, `WEAK_PASSWORD`, `PASSWORD_BREACHED`, `ACCOUNT_LOCKED`, `REFRESH_TOKEN_INVALID`/`_EXPIRED`/`_REUSE_DETECTED`), and audit logging for every auth event (`user.registered`, `user.login_succeeded`/`_failed`, `user.logout`/`_all`, `session.refreshed`, `session.reuse_detected`).

**Definition of Done**: a real person can register, log in, and log out via the API; JWT authentication and the full refresh-rotation flow work; protected endpoints reject unauthorized requests; a workspace is automatically created for the first user - all verified live (not just typechecked) via `pnpm --filter @smc/scripts verify:auth` (16/16 checks passing) plus direct Postgres inspection of the family-wide revocation cascade. **No UI was built** - the Definition of Done was stated entirely in terms of API-observable behavior, matching Phase 1's precedent of verifying via scripts rather than requiring a UI; a login screen is a later increment.

**Phase Review completed 2026-07-18** - full report at [reviews/phase-2-review.md](reviews/phase-2-review.md). See [ADR-0014](adr/0014-custom-jwt-session-auth.md) for the one real architectural correction this phase required (Auth.js named in ARCHITECTURE.md doesn't fit NestJS or DATABASE.md's session design; direct token issuance instead of the OAuth2+PKCE flow API.md describes for Phase 18's external clients).

---

## Phase 3 - Identity & Messaging Foundation - COMPLETE as of 2026-07-18

Renamed from "Core Platform" on 2026-07-18 per user direction - "Core Platform" was vague about what actually mattered; this phase is where the product's real heart (IdentityGraph-mediated messaging, not just infrastructure) starts running behind real authentication instead of Phase 1's `DEV_WORKSPACE_ID` convenience and Phase 2's internal-only workspace creation.

**Phase goal, stated as the pipeline it proves end-to-end:**

```
Mock Connector → Message → IdentityGraph → Conversation → Inbox → Realtime → Notification
```

Concretely: a real person registers or logs in (Phase 2), triggers (or receives) a message through the Mock Connector, and sees that message appear in *their own* real inbox, tied to *their own* real workspace - not the shared dev-mode `DEV_WORKSPACE_ID` fixture, not a mock-seeded list. Telegram is still not part of this phase (that's Phase 5) - the pipeline is proven with the same Mock Connector as Phase 1, but for the first time driven by a real authenticated identity instead of a hardcoded constant.

- [ ] Workspace/account model as real CRUD (`POST /v1/workspaces`, `GET /v1/workspaces/{id}/members`, per `API.md` Section 10.1) - **deferred**, not required by this phase's Definition of Done; Phase 2's internal registration-time creation remains the only way a workspace comes into existence for now
- [x] IdentityGraph exact-match resolver (`packages/identity`) - already built and verified in Phase 1/2's vertical slice; now resolving identities for *real, authenticated* workspaces, not just the dev fixture, verified live via `verify-phase3.mjs`
- [x] Real Inbox read model: `GET /v1/conversations`, `GET /v1/conversations/{id}/messages` (`ConversationsController`, ADR-0015: REST, not GraphQL, for now), backed by real Postgres data scoped to the authenticated user's workspace - replaces Phase 1's dev-only Inbox page that rendered whatever arrived on a shared WebSocket room
- [x] Mock Connector ingestion tied to a real, authenticated workspace (optional Bearer token on `POST /dev/mock-connector/send`; falls back to `DEV_WORKSPACE_ID` only when no token is presented, rejects with 401 if a token is presented but invalid) - this is the specific change that makes "the user sees *their* first message" true rather than "a shared dev room shows *a* message"
- [x] WebSocket realtime scoped to the authenticated user's workspace via their JWT (`handshake.auth.token`, verified server-side by `TokenService`), not a client-supplied `workspaceId` query parameter (Phase 1's shortcut) - unauthenticated connections are disconnected immediately, verified live
- [x] Notifications shell backed by real, queryable data (`GET /v1/notifications`) - replaces Phase 1's toast-only, unpersisted-to-the-client stub with an actual notification list a user can revisit (no cursor pagination or read/unread state yet - `Notification` has no `readAt` column, a disclosed simplification vs `DATABASE.md` Section 6.14, deferred to whichever phase first needs it)
- [ ] Linked Accounts model (structure only, no real provider yet - Phase 4-5 territory) - **deferred**, not required by this phase's Definition of Done
- [ ] Tags - **deferred**
- [ ] Folders - **deferred**
- [ ] Search shell (structure, indexing not required yet) - **deferred**
- [ ] User preferences (silent hours, VIP list structure) - **deferred**

**Definition of Done - verified live, not just typechecked, via `pnpm --filter @smc/scripts verify:phase3` (11/11 checks passing)**: a real person registers or logs in (Phase 2's real auth, not a dev fixture), a message flows through the Mock Connector → IdentityGraph → Conversation → their real Inbox → over a realtime channel scoped to them → surfaces as a real, persisted Notification they can see and revisit - **the user can genuinely try this**, not just observe it in server logs or a shared dev room. Per the user's own framing: this is the phase where "the user can go into the system and see their first message." `verify-phase3.mjs` also proves workspace isolation (a second, unrelated user's `GET /v1/conversations` is empty) and that an unauthenticated WebSocket connection is rejected. `verify:auth` (16/16) and `verify:soft-delete` re-run clean, confirming no regressions.

**Demo script, added 2026-07-18 per user direction** - the concrete, recordable scenario Phase 3's Definition of Done is judged against, not just a checklist of endpoints:

1. A user registers.
2. They log in.
3. A message arrives via the Mock Connector.
4. It appears in their Inbox in real time (no page refresh).
5. A notification surfaces.
6. The sender resolves through IdentityGraph and is visibly attributed as a person (name shown), not a raw provider id - demonstrating IdentityGraph is real, even though a dedicated People/Identity profile screen (`UI_GUIDE.md` Section 7) is not Phase 3 scope; the same data is visible inline wherever the sender is shown.
7. Opening the conversation shows its message history, not just the single latest message.

This is the project's first genuinely shareable demo (technical progress and something an early user, investor, or partner could actually be shown) - worth being deliberate about, not an afterthought once the checklist above is done.

**Phase Review completed 2026-07-18** - full report at [reviews/phase-3-review.md](reviews/phase-3-review.md). See [ADR-0015](adr/0015-rest-inbox-read-path-for-phase-3.md) for the one real architectural deviation this phase required (`API.md` frames the inbox read path as GraphQL-first; no GraphQL server exists anywhere yet, so Phase 3 implements it as plain REST - GraphQL remains the Phase 9 target). Tagged `v0.3.0-phase3`.

---

## Phase 4 - Connector SDK ⭐ Most important phase before Phase 5

The reason a new provider should someday take days, not weeks. Builds out `CONNECTOR_SDK.md`'s full contract (Sprint 2 of Phase 1 only proved the thinnest possible slice of it).

**Split into two sprints 2026-07-19 per user direction**, mirroring Phase 1's Sprint 1/Sprint 2 pattern: Sprint 1 builds the SDK contract itself and proves it against the Mock Connector; Sprint 2 is the first real connector proving the same SDK against a real, rate-limited, ToS-bound provider (Phase 5 - Telegram Connector, unchanged in its own section below - Sprint 2 is not a duplicate phase, it's Phase 5 read as this phase's proving ground).

### Sprint 1 - Connector SDK Foundation - COMPLETE as of 2026-07-19

- [x] `Connector` interface (`packages/connector-sdk/src/connector.ts`) - lifecycle, credential validation/authentication ordering, initial sync, reconciliation, message normalization, error mapping, an optional outbound `send` - not the full Sections 2-15 (webhook/OAuth/attachment-storage wiring needs a real provider to be meaningful, see Sprint 2 note below), but the actual, testable contract a real connector implements
- [x] Capability Manifest (`packages/connector-sdk/src/capability-manifest.ts`, `CONNECTOR_SDK.md` Section 5) - `defineCapabilityManifest()` enforces Section 4.3's hybrid-by-default rule at declaration time (a webhook/hybrid manifest without a reconciliation interval throws immediately, not just at certification time)
- [x] Lifecycle state machine (`packages/connector-sdk/src/lifecycle.ts`, `CONNECTOR_SDK.md` Section 2) - the exact 9-state table, shared by every connector so "no unreachable or skipped states" is a property of the SDK, not something each connector author has to get right independently; persisting it onto a real `LinkedAccount` row (`DATABASE.md` Section 6.5) is Sprint 2 work, once a real connector needs a persisted account
- [x] Connector registry (`packages/connector-sdk/src/registry.ts`) - in-process, keyed by provider key
- [x] Standardized error taxonomy with automatic credential redaction (`packages/connector-sdk/src/errors.ts`, `CONNECTOR_SDK.md` Section 15) - redaction happens inside `ConnectorError`'s constructor, so it's structural, not a per-connector convention to remember
- [x] Connector Certification Suite (`packages/connector-sdk/src/certification/`, `CONNECTOR_SDK.md` Sections 16-17) - a shared, provider-agnostic `certifyConnector()` mechanically exercising manifest completeness, the hybrid requirement, lifecycle integrity and a full happy-path run, credential-validation-before-authentication ordering, mapper determinism and the required-field contract, checkpoint-resume across a simulated worker restart, a bounded/complete initial sync, a distinct reconciliation pass, the full error taxonomy, credential redaction, and rate-limit backpressure (skipped, not failed, for a connector that exposes no failure-simulation hook)
- [x] The Mock Connector migrated onto the new SDK (`packages/connector-sdk/src/mock-connector.ts`) - a real `Connector` implementation now, not a bare `generateMockMessage()` helper; `generateMockMessage()` is kept as a thin backward-compatible adapter over `MockConnector.mapMessage()` so `apps/api`'s existing mock-connector controller needed zero changes
- [x] `direction` added to `InboundMessagePayload` (`packages/shared`, `CONNECTOR_SDK.md` Section 11's required-field contract) - previously implicitly always `"inbound"` (hardcoded in `events.processor.ts`); now a real field the connector's mapper populates

**Deliberately out of Sprint 1 scope** (not part of this sprint's Definition of Done, not silently dropped - real webhook/polling transport, OAuth/credential-entry flows, attachment storage, and `LinkedAccount` persistence all require a real provider to be meaningful and are Sprint 2's job to add against Telegram):
- Webhook-based and polling-based ingestion transport (the `Connector` interface's `initialSync`/`reconcile` are provider-agnostic sync *results*; wiring an actual webhook receiver or poll scheduler is connector-specific integration work)
- OAuth2/credential-entry auth flows (`CONNECTOR_SDK.md` Section 3.1) - `validateCredential`/`authenticate` exist and are ordering-safe, but no real auth method is wired yet
- `LinkedAccount` persistence (`DATABASE.md` Section 6.5) - the lifecycle state machine is real and certified, but nothing writes its state to Postgres yet
- Attachment abstraction (Section 12) and platform-level identity-mapping integration (Section 13) - connector-adjacent but not part of the `Connector` interface itself
- Health monitoring surfaced via API (Section 6), retry/backoff for real outbound provider calls (Section 7) - meaningful once a real provider exists to retry against

**Definition of Done - verified live via `pnpm --filter @smc/scripts certify:mock-connector` (16/16 checks passing)**: the Connector SDK package exists, the Capability Manifest and lifecycle state machine are implemented and certified, the Connector Certification Suite exists and mechanically verifies the certification checklist, the Mock Connector is migrated onto it, and existing functionality continues to work - `verify:phase3` (11/11), `verify:auth` (16/16), and `verify:soft-delete` were all re-run against the migrated Mock Connector with no regressions. `pnpm typecheck`/`pnpm lint`/`pnpm build` all pass clean across the whole monorepo.

**Phase Review completed 2026-07-19** - full report at [reviews/phase-4-sprint-1-review.md](reviews/phase-4-sprint-1-review.md).

### Sprint 2 - First Real Connector - COMPLETE as of 2026-07-21

See Phase 5 - Telegram Connector below, now complete. Sprint 2 discovered three real implementation constraints the Sprint 1 SDK didn't anticipate, each resolved via ADR rather than silently worked around: no external secrets manager exists yet ([ADR-0016](adr/0016-interim-envelope-encrypted-secrets-store.md)), Telegram's Bot API has no history endpoint and `getUpdates`/`setWebhook` are mutually exclusive ([ADR-0017](adr/0017-telegram-sync-and-reconciliation-strategy.md)), and `DATABASE.md`'s original `LinkedAccount.status` sketch conflicts with the SDK's already-certified 9-state lifecycle ([ADR-0018](adr/0018-linked-account-status-uses-connector-sdk-lifecycle.md)). The SDK itself gained two small, backward-compatible extensions: an optional `ConnectorContext` parameter on `initialSync`/`reconcile`/`send` (a real connector needs its credential at call time, not just at `authenticate()` time - Mock Connector and Sprint 1 call sites are unaffected), and an optional `initialState` on `ConnectorLifecycle` (so platform code can resume a lifecycle from a persisted `LinkedAccount.status` across separate HTTP requests, not just within one connect flow's in-memory instance).

**Phase Review completed 2026-07-21** - full report at [reviews/phase-4-sprint-2-review.md](reviews/phase-4-sprint-2-review.md). Tagged `v0.4.1-phase4-sprint2`.

---

## Phase 5 - Telegram Connector - COMPLETE as of 2026-07-21

First real integration, built entirely on the Phase 4 Sprint 1 SDK.

- [x] Bot API authentication (per ARCHITECTURE.md section 12 decision / ADR-0010: Bot API only, not MTProto) - `POST /v1/connectors/telegram/connect` makes a real `getMe` call before ever persisting a token (`CONNECTOR_SDK.md` Section 3.2), verified live against a real bot token and a real invalid one
- [x] Receive messages - a real webhook receiver (`POST /v1/connectors/telegram/webhook/{linkedAccountId}`, secret-token-verified) plus reconciliation via `getUpdates` (ADR-0017), both feeding the same `message.received` event pipeline the Mock Connector uses
- [x] Send messages - `POST /v1/conversations/{id}/messages` (`API.md` Section 10.3's documented route, with a disclosed synchronous-not-202-async simplification - see the phase review), verified live: a real reply was delivered to a real Telegram chat and confirmed received
- [ ] Media/attachments - **deferred**, not required by this sprint's Definition of Done (`CONNECTOR_SDK.md` Section 12 remains platform-level, unbuilt)
- [ ] Groups / Channels - **deferred**; the connector's manifest declares `groupManagement: "read_write"` but group-specific UI/flows aren't built yet
- [x] Sync (backfill on connect) - a real, documented no-op (ADR-0017: the Bot API has no history endpoint, so there is nothing to backfill) - not silently skipped, structurally correct for this provider
- [ ] Connection status surfaced in UI - **deferred**; `apps/web`'s Inbox has a minimal "Connect Telegram" control (bot token in, connect out) but no dedicated LinkedAccount health/status screen yet (`API.md` Section 10.5, not yet built)
- [x] Passes the full `CONNECTOR_SDK.md` Section 16 certification checklist - `pnpm --filter @smc/scripts certify:telegram-connector` (14/14 applicable checks passing, 2 correctly skipped - see the phase review for why those two are legitimate skips, not gaps) - the same bar the Mock Connector was held to in Phase 4 Sprint 1, now against a connector making real HTTP calls to a real, rate-limited external API

**Definition of Done - verified live, not just typechecked**: a real Telegram bot token was configured via `POST /v1/connectors/telegram/connect` (real `getMe` validation against the actual Telegram network); a real Telegram user sent a real message to the bot; the message was fetched via `getUpdates`, pushed through the real webhook receiver, and appeared in the real Inbox with the sender resolved by name through IdentityGraph; a reply was sent from the Inbox and delivered to the real Telegram chat - confirmed received by the human on the other end. `certify:telegram-connector`, `verify:telegram` (real-network negative-path + simulated-webhook checks), `verify:phase3`, `verify:auth`, `verify:soft-delete`, and `certify:mock-connector` all pass with no regressions. `pnpm typecheck`/`pnpm lint`/`pnpm build` pass clean across the whole monorepo.

**Phase Review completed 2026-07-21** - full report at [reviews/phase-4-sprint-2-review.md](reviews/phase-4-sprint-2-review.md). Tagged `v0.4.1-phase4-sprint2`.

**Definition of Done**: a real person connects their own real Telegram bot, sends themselves a real message from their phone, and watches it appear in the Smart Message Center inbox live - the first moment in the project where the product does the thing PRODUCT.md's Vision describes, with a real external system, not a mock or a diagram.

---

## Phase 6 - Discord Connector - COMPLETE as of 2026-07-22

Same Connector SDK. `ROADMAP.md`'s own "Notes on Sequencing" anticipated this phase might force an SDK interface change ("that's expected for Discord... it's the first real second connector") - it did, and [ADR-0019](adr/0019-discord-gateway-streaming-connector-extension.md) is the record of exactly what changed and why: Discord's Gateway is a persistent WebSocket, not a webhook or a poll, so the `Connector` interface gained one new optional method (`startListening`) and a fourth `IngestionMode` (`"streaming"`). This was the sanctioned exception, not evidence Phase 4 was under-designed - see the ADR and the phase review for the full reasoning.

- [x] Discord Gateway auth (OAuth2 + bot) - `POST /v1/connectors/discord/connect` returns an authorization URL (`CONNECTOR_SDK.md` Section 3.1's `oauth2_redirect` method); `GET /v1/connectors/discord/callback` completes the install with a real, per-guild credential validation (`getGuild`) before persistence
- [x] Receive / send messages - a real Discord Gateway v10 client (`IDENTIFY`/heartbeat/`RESUME`/reconnect) for receiving, `POST /channels/{id}/messages` for sending via the same provider-agnostic `POST /v1/conversations/{id}/messages` reply endpoint Telegram already uses
- [ ] Media/attachments - **deferred**, consistent with Telegram's identical deferral (`CONNECTOR_SDK.md` Section 12 remains platform-level and unbuilt); attachment-only messages map to a `"[Attachment]"` placeholder
- [x] Servers/channels mapping to Conversation model - a Discord guild is one `LinkedAccount`; each text channel (bounded to the first 5 discovered, a disclosed scope limit) maps to one `Conversation`

**Definition of Done - verified via `pnpm --filter @smc/scripts certify:discord-connector` (15/16 checks passing, 1 correctly skipped) and `pnpm --filter @smc/scripts verify:discord`**: the connector is real, certified code (a real Gateway protocol client, real REST calls, real `initialSync`/`reconcile` against Discord's actual history endpoint - the first connector where that part of the Sprint 1 design is proven, not a documented no-op like Telegram). `verify:phase3`, `verify:auth`, `verify:soft-delete`, `certify:mock-connector`, `certify:telegram-connector`, and `verify:telegram` all re-run clean - no regressions. `pnpm typecheck`/`pnpm lint`/`pnpm build` pass clean across the whole monorepo. **Not yet included**: a human-confirmed live message exchange over the real Discord network (Telegram's Phase 4 Sprint 2 bar) - this requires a real Discord Application (Developer Portal Client ID/Secret/bot token, privileged `MESSAGE_CONTENT` intent, a bot added to a real test server), a meaningfully bigger one-time setup than Telegram's single bot token, and the user explicitly deferred it to a later session. Disclosed in full in the phase review, not glossed over.

**Phase Review completed 2026-07-22** - full report at [reviews/phase-6-review.md](reviews/phase-6-review.md). Tagged `v0.5.0-phase6`.

---

## Phase 7 - Slack Connector

Same Connector SDK, no interface change - confirming `ROADMAP.md`'s own sequencing prediction for this phase.

- [x] Slack OAuth2 + Events API - `oauth2_redirect` (a real per-workspace bot token via `oauth.v2.access`, unlike Discord's app-wide token) combined with `"hybrid"` ingestion (Events API webhook + reconciliation, the same mode Telegram uses); a genuinely new piece of code, HMAC-SHA256 signature verification for the Events API webhook, was required and implemented for real (not stubbed)
- [x] Receive / send messages - real Slack Web API calls (`conversations.history`, `chat.postMessage`) via the same provider-agnostic `POST /v1/conversations/{id}/messages` reply endpoint Telegram and Discord already use
- [ ] Slack Connect (external workspace) support - **deferred**, not required for this phase's core receive/send loop
- [x] Channels/DMs mapping to Conversation model - a Slack workspace is one `LinkedAccount`; each channel (bounded to the first 5 discovered, a disclosed scope limit matching Discord's identical bound) maps to one `Conversation`

**Definition of Done - verified via `pnpm --filter @smc/scripts certify:slack-connector` (15/16 checks passing, 1 correctly skipped) and `pnpm --filter @smc/scripts verify:slack`**: the connector is real, certified code (real Web API calls, real `initialSync`/`reconcile` against Slack's actual history endpoint, a real live-tested HMAC signature verification round-trip). `certify:mock-connector`, `certify:telegram-connector`, `certify:discord-connector`, `verify:phase3`, `verify:auth`, `verify:soft-delete`, `verify:telegram`, `verify:discord` all re-run clean - no regressions. `pnpm typecheck`/`pnpm lint`/`pnpm build` pass clean across the whole monorepo. **Not yet included**: a human-confirmed live message exchange over a real Slack workspace - unlike Discord's callback, Slack's OAuth code can only ever be issued by a real user clicking through Slack's own consent screen, not scriptable at all. Disclosed in full in the phase review. A real, pre-existing environment bootstrap gap (`apps/api/.env` was never actually loaded by the running app) was found and fixed during this phase's live signature-verification testing - see the review for the fix and its scope.

**Phase Review completed 2026-07-27** - full report at [reviews/phase-7-review.md](reviews/phase-7-review.md). Tagged `v0.6.0-phase7`.

---

## Phase 8 - Email Connector

Same Connector SDK, no interface change - `credential_entry` auth and `"polling"` ingestion were both already fully specified in `CONNECTOR_SDK.md`, using email itself as their reference example.

- [x] IMAP (receive, folder sync) - `INBOX` only, bounded per poll cycle, cursor-based on IMAP UID (`CONNECTOR_SDK.md` Section 4.2's own worked example); real `imapflow`/`mailparser` protocol handling
- [x] SMTP (send) - real `nodemailer` delivery via the same provider-agnostic `POST /v1/conversations/{id}/messages` reply endpoint every prior connector uses; live-verified against this project's own local mailhog instance
- [ ] Labels/folders mapped to Tags - **deferred**; `Tag`/`MessageTag` (`DATABASE.md` Section 6.11) isn't implemented in the schema for any connector yet, a cross-connector feature bigger than this phase's core receive/send loop
- [x] Threading mapped to Conversation model - `conversationExternalId` resolves to the oldest `References` ancestor, falling back to `In-Reply-To`, falling back to the message's own `Message-ID` - a pure function of message headers, no SDK change needed

**Checkpoint after Phase 8 - answered**: four real connectors exist on one SDK. The only interface change across all four was Discord's (ADR-0019, Phase 6) - explicitly pre-authorized for that phase alone, and confirmed as a one-time exception rather than a pattern by both Slack (Phase 7) and Email (Phase 8) needing none. **No SDK design flaw is indicated.**

**Definition of Done - verified via `pnpm --filter @smc/scripts certify:email-connector` (15/16 checks passing, 1 correctly skipped) and `pnpm --filter @smc/scripts verify:email`**: the connector is real, certified code (real IMAP/SMTP protocol handling, real thread resolution, a live-verified SMTP send against a real local SMTP server with independently-confirmed delivery). `certify:mock/telegram/discord/slack-connector`, `verify:phase3/auth/soft-delete/telegram/discord/slack` all re-run clean - no regressions. `pnpm typecheck`/`pnpm lint`/`pnpm build` pass clean across the whole monorepo. **Not yet included**: a human-confirmed live message *receive* over a real IMAP mailbox - this project's local dev stack has no IMAP test server (mailhog is SMTP-capture only), so a real mailbox (with an app password) is needed, the same class of gap Discord/Slack have for their own real-network setups. Disclosed in full in the phase review.

**Phase Review completed 2026-07-27** - full report at [reviews/phase-8-review.md](reviews/phase-8-review.md). Tagged `v0.7.0-phase8`.

---

## Phase 9 - Smart Inbox

This is where the product stops being "an aggregator" and starts being Smart Message Center.

- [x] Unified inbox view (all connectors, one feed) - `GET /v1/conversations` already aggregated every connected provider; this phase adds priority-ordered sorting on top
- [x] Filters - `archived`/`category`/`vip`/`unread` query params on `GET /v1/conversations`
- [x] Priority/importance scoring (rule-based, per PRODUCT.md) - `packages/shared/src/priority-score.ts`: base score + VIP bonus + urgency-keyword bonus, computed at ingestion time, deliberately not AI-derived
- [x] VIP handling - `Contact.isVip` (existed since Phase 3, unused until now) gets a real `PATCH /v1/contacts/{id}` surface and feeds priority scoring
- [x] Archive - `Conversation.isArchived`, `PATCH /v1/conversations/{id}`
- [x] Categories - `Conversation.category`, free-form user-set text, no auto-categorization
- [x] Unread manager ("Needs You" count - must be trustworthy, per PRODUCT.md UI Principles) - `Conversation.lastReadAt` + `GET /v1/conversations/summary`, computed from unread AND (VIP or priority threshold), never a raw unread badge
- [x] IdentityGraph fuzzy-match confidence scoring, duplicate-detection suggestion queue, and manual merge/split UI (`ARCHITECTURE.md` Section 13.3/13.6) - `IdentityMergeSuggestion`/`IdentityMergeLog`/`IdentitySplitLog` (`DATABASE.md` Section 6.6), a periodic matching sweep, and `IdentityController`/`ContactsController`'s approve/reject/split endpoints - the exact-match-only version from Phase 3 now has its human-in-the-loop layer, exercised end-to-end against real data from the four real connectors built in Phase 5-8

**Definition of Done - verified via `pnpm --filter @smc/scripts verify:phase9`**: 22/22 real, end-to-end checks (priority scoring's base/urgency/VIP tiers, the Needs You count, mark-read, archive/category filters, and the full merge-suggestion lifecycle - generate → approve → merge → split, and generate → reject → no merge - against the actual running API and Postgres, not mocked). No new ADR was needed - this phase executes the architecture ADR-0013/`DATABASE.md` Section 6.6 already committed to in Phase 3, not a new decision. `certify:mock/telegram/discord/slack/email-connector` and `verify:phase3/auth/soft-delete/telegram/discord/slack/email` all re-run clean - no regressions. `pnpm typecheck`/`pnpm lint`/`pnpm build` pass clean across the whole monorepo.

**Phase Review completed 2026-07-27** - full report at [reviews/phase-9-review.md](reviews/phase-9-review.md). Tagged `v0.8.0-phase9`.

---

## Phase 10 - Automation Engine ⭐⭐⭐⭐⭐ The heart of the product

- [x] Trigger types (per `AUTOMATION_ENGINE.md`) - `message.received` and `time.no_reply_after`; the registry (`TRIGGER_REGISTRY`) is the extension point for the rest, not yet registered - see [reviews/phase-10-review.md](reviews/phase-10-review.md)
- [x] Condition types (AND/OR tree) - real nested evaluator; the UI exposes a flat AND/OR list on top of the same nesting-capable data model
- [x] Action types - `notification.send`, `tag.apply`, `message.send`, `webhook.call` (with an SSRF guard)
- [x] Variables (e.g. sender name, tag, date, in templated actions) - Context variables (`{{message.bodyText}}` etc.); workspace/computed-step variables deferred
- [ ] Templates (saved replies, rule templates) - deferred, condition/action snippets and composite actions not yet built
- [ ] Visual rule builder (no-code canvas) - shipped as a functional form builder instead, disclosed simplification
- [x] Execution engine (queue consumers, idempotent, per ARCHITECTURE.md section 4) - BullMQ-consumed, idempotent on `(ruleId, ruleVersion, triggerEventId)`, per-rule execution isolation
- [x] Scheduler (delayed/recurring triggers) - durable `ScheduledJob` + BullMQ delayed jobs for `time.no_reply_after`; recurring/cron schedules deferred

**Phase Review completed 2026-07-28** - full report at [reviews/phase-10-review.md](reviews/phase-10-review.md). Tagged `v0.9.0-phase10`.

---

## Phase 11 - Notification Engine

- [x] Priority-based sounds - synthesized Web Audio API tones, tiered by the existing priority-score thresholds (30/60), not shipped audio assets
- [ ] Custom sounds per VIP/contact - deferred, no schema/spec exists for a per-contact sound choice - see [reviews/phase-11-review.md](reviews/phase-11-review.md)
- [x] Emergency/override mode - `workspace.isVipOverrideActive`, a real Context Object primitive (AUTOMATION_ENGINE.md Section 4.2), wired into the starter rule
- [x] Keyword alerts - `message.matchesKeywordAlert` against `NotificationPreference.keywordAlerts` (DATABASE.md Section 6.14)
- [~] Reminder alerts (Waiting On / Commitments, per PRODUCT.md) - Phase 10's `time.no_reply_after` scheduler already covers the reminder-alert mechanism; a first-class Waiting-On/Commitments data model and dashboard is not built (no existing schema) - deferred
- [ ] Escalation rules - deferred, no first-class escalation-policy concept exists; composable manually from existing rule primitives today

**Phase Review completed 2026-07-28** - full report at [reviews/phase-11-review.md](reviews/phase-11-review.md). Tagged `v0.10.0-phase11`.

---

## Phase 12 - Search

- [x] Global search (Postgres full-text, per ARCHITECTURE.md) - `GET /v1/search`, fans out to messages + contacts
- [ ] Attachments search - deferred, no `Attachment`/`MessageAttachment` model exists anywhere (no connector ingests attachments yet) - see [reviews/phase-12-review.md](reviews/phase-12-review.md)
- [x] Contacts search - case-insensitive substring match on `Contact.displayName` (DATABASE.md Section 14 calls full-text "optional" here)
- [x] Messages search - real Postgres `tsvector`/`tsquery` full-text search over body + sender name + conversation title, ranked with `ts_rank`
- [ ] Semantic search (deferred to Phase 13 dependency - requires AI layer) - correctly not attempted

**Phase Review completed 2026-07-28** - full report at [reviews/phase-12-review.md](reviews/phase-12-review.md). Tagged `v0.11.0-phase12`.

---

## Phase 13 - AI (first AI in the product, not before)

- [x] Conversation summaries - `POST /v1/ai/summaries`, per-message or per-conversation
- [x] Suggested replies - `POST /v1/ai/suggested-replies`
- [x] Task/commitment detection - `POST /v1/ai/detect-commitments`, returns candidates (no persisted Commitment entity - no schema exists yet, see [reviews/phase-13-review.md](reviews/phase-13-review.md))
- [x] Meeting detection - folded into the same `detect-commitments` response
- [ ] Translation - deferred, no real translation model/API available in this environment; faking it was judged worse than not shipping it
- [x] Rewrite - `POST /v1/ai/rewrite` (formal/friendly/concise), heuristic-level quality, disclosed
- [ ] Smart/semantic search - deferred, needs `pgvector`/a real embedding source per DATABASE.md Section 14, neither available here

Built behind a provider-agnostic `AIProvider` abstraction (`packages/ai`, [ADR-0021](adr/0021-provider-agnostic-ai-abstraction.md)) - `HeuristicAIProvider` is the one real, working, zero-dependency implementation this phase ships; a real LLM provider is additive later. `AUTOMATION_ENGINE.md` Section 6/9's `ai` Context Object stub is now real - `ai.classification`/`ai.sentiment` are genuine rule-condition data, verified firing a real rule and gracefully not firing once AI is disabled.

AI must be fully optional here and everywhere after. Every feature above must degrade gracefully (feature hidden or falls back to non-AI equivalent) if AI is disabled or unavailable. Per PRODUCT.md's AI Features section: no autopilot auto-send, ever - verified: AI never bypasses the Automation Engine, and `rule-suggestions` returns a draft that is never auto-persisted.

**Phase Review completed 2026-07-28** - full report at [reviews/phase-13-review.md](reviews/phase-13-review.md). Tagged `v0.12.0-phase13`.

---

## Phase 14 - Progressive Web App

**Redefined 2026-07-29 per user direction, replacing this phase's original "React Native app scaffold" scope.** A PWA is one implementation that makes `apps/web` installable and usable on both mobile and desktop - the original split (native-mobile-in-Phase-14, PWA-for-desktop-in-Phase-15) duplicated the same underlying work under two different platform labels. This phase is now that single, real implementation; Phase 15 shrinks accordingly (see below). The native-mobile-app idea this phase originally held is not a numbered phase at all anymore - it moves to v2, exactly matching `PRODUCT.md`'s own already-stated MVP exclusion ("web + Tauri desktop first, React Native is a v2 investment"), not appended as a new phase.

- [x] Web app manifest (installable, app icon, theme color) - `apps/web/app/manifest.ts`, generated icons via `next/og` (real placeholder art, not a final brand mark - see [reviews/phase-14-review.md](reviews/phase-14-review.md))
- [x] Service worker (offline shell - the app loads and shows cached data with no network, not just a blank error page) - hand-written (`apps/web/public/sw.js`), best-effort runtime caching, not a versioned precache
- [x] Install prompt (`beforeinstallprompt` handling, a real in-product "Install" affordance, not just relying on the browser's own menu)
- [x] Push notifications (Web Push API - browser/OS-level notifications when the tab isn't focused, distinct from the in-app toast/sound Phase 11 already built) - self-generated VAPID keys, wired into every `notification.send` action
- [x] Background sync (queue an outbound reply sent while offline, deliver it once connectivity returns, rather than silently failing) - IndexedDB outbox + Background Sync API, `online`-event fallback for Safari/Firefox
- [x] Responsive Inbox, Rule Builder (Automations), Search, and AI surfaces - usable on a phone-width viewport, not just a shrunk desktop layout - real single-pane stack navigation (list ↔ thread), per `UI_GUIDE.md` Section 15

**Phase Review completed 2026-07-29** - full report at [reviews/phase-14-review.md](reviews/phase-14-review.md). Tagged `v0.13.0-phase14`. **Client-only behavior (SW registration, install, offline queue replay, push delivery) is code-complete and unverified in a real browser** - no browser-automation tool available this session; this is Phase 14's single most important follow-up, not assumed working.

---

## Phase 15 - Desktop

**Shrunk 2026-07-29**: PWA packaging (installable shell, offline support) moved to Phase 14, since one PWA implementation serves both mobile and desktop installability - see Phase 14's note. What's left here is exactly what the original 2026-07-19 Desktop Strategy already deferred:

- [ ] Evaluate Tauri (per `ARCHITECTURE.md`) against what Phase 14's PWA can already deliver - system tray, deeper native OS integration, or a genuine limitation the PWA approach can't cover
- [ ] Tauri app (wraps the web app) - **deferred**, built only if that evaluation finds a real gap the PWA doesn't close

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

## Phase 19 - WhatsApp Connector

Added to the roadmap 2026-07-28, per explicit user direction - `PRODUCT.md` already names WhatsApp "the highest-demand missing channel," gated by Meta's Business Platform app-review process rather than any technical blocker. Appended here rather than inserted earlier, so no other phase's number changes.

- [ ] WhatsApp Business Platform (Cloud API) integration - **official API only**, per `PRODUCT.md`'s rejected-approaches list ruling out reverse-engineered/unofficial access
- [ ] App setup via Meta's Business Platform (WhatsApp Business Account + phone number + permanent access token) - gated by Meta's own app review
- [ ] Receive / send messages - webhook-pushed inbound, REST send outbound; expected to fit the SDK's existing `"webhook"`/`"hybrid"` + `oauth2_redirect` vocabulary with no interface change, the same bar Slack/Email cleared (a prediction, not a guarantee)
- [ ] 24-hour customer service window handling - free-form replies only within 24h of the user's last message; outside that window, only pre-approved templates
- [ ] Message template management - templates require separate Meta approval
- [ ] Phone-number identity mapping into IdentityGraph - the first connector where `ContactIdentity.externalId` is a phone number rather than a provider account ID

**Definition of Done (planned)**: `certify:whatsapp-connector` + `verify:whatsapp`, same bar every connector clears. Given the two external-approval dependencies above, likely to ship the same way as Discord/Slack: code-complete and certified first, live verification once Meta's approval clears.

---

## Phase 20 - Production Readiness

Added to the roadmap 2026-07-29, per the MVP Hardening pass's own findings (`docs/reviews/mvp-hardening-report.md`) - two real, previously-undisclosed gaps between `API.md`'s documented contract and the shipped implementation, both deliberately deferred there as "new features, not bug fixes." Appended here rather than inserted earlier, so no other phase's number changes - same precedent as Phase 19.

- [x] **Phase 20.1 - Real rate limiting** (`API.md` Section 9) - complete 2026-08-03/04, live-verified in production. A global `RateLimitGuard` (Redis fixed-window counter, not a true sliding-window/token-bucket - a disclosed, standard-practice simplification) applies per-workspace (authenticated) or per-IP (unauthenticated) limits, tiered by `Organization.planTier` with a separate, tighter budget for `/v1/ai/*` - `billing_plans` (`DATABASE.md` 6.16) doesn't exist yet, so tiers are a static config map keyed off the plan-tier string that already does, disclosed rather than blocking on building billing first. `X-RateLimit-Limit`/`Remaining`/`Reset` on every request, `429` RFC 7807 with `Retry-After` once exceeded. Verified live: correct headers, correct 429s at the documented free-tier limits (60/min general, 30/min AI), the two buckets provably independent, real Redis counters confirmed directly in production, and an 80-concurrent-request load test against a 60/min limit landed exactly 60 - the Redis `INCR` counter is race-free under genuine concurrency, not just sequential requests. See `scripts/verify-phase20-rate-limiting.mjs` (9/9).
- [x] **Phase 20.2 - Real cursor pagination** (`API.md` Section 4) - complete 2026-08-04, live-verified in production. A shared `apps/api/src/common/cursor-pagination.ts` utility (`parseLimit`, `encodeCursor`/`decodeCursor`, `buildPage`) backs a single canonical `{data, pagination: {nextCursor, hasMore}}` envelope, migrated one endpoint at a time across all 11 list endpoints that needed it: `GET /v1/notifications`, `/v1/rules`, `/v1/rules/:id/executions`, `/v1/ai/credits/ledger`, `/v1/contacts`, `/v1/identity/merge-suggestions`, `/v1/conversations`, `/v1/conversations/:id/messages`, `/v1/search/messages`, `/v1/search/contacts`, `/v1/search`. Every query uses real Postgres keyset pagination - `WHERE (sortKey, id) < (lastSortKey, lastId)`, never `OFFSET` - with a stable deterministic sort per resource (most `(createdAt desc, id desc)`; `/v1/rules` adds `priority`; `/v1/search/messages` computes `ts_rank` once via a CTE and keys on `(rank, id)`; `/v1/conversations` keys on `(priorityScore, lastMessageAt, id)` with null-handling). Cursors are opaque base64url JSON but deliberately not HMAC-signed (unlike the contract's "signed token" wording) - every query is still scoped by `workspaceId` from the JWT, never from the cursor, so a tampered cursor can only desync a client's own position, not cross a tenant boundary; disclosed as a scoped simplification, not an oversight. `GET /v1/auth/sessions` got a flat `take: 200` safety cap instead of full cursor pagination, since "list your own devices" doesn't warrant it. Two fully-unbounded queries found during the migration audit (`GET /v1/rules`, `GET /v1/identity/merge-suggestions`, `GET /v1/conversations/:id/messages`) are now bounded as part of this phase, not left for later. `apps/web/lib/api.ts` and every `scripts/verify-*` script consuming these endpoints were swept and fixed to unwrap the new envelope. See `scripts/verify-phase20.2-cursor-pagination.mjs` (14/14, run against both local dev and production): full multi-page cursor walk, no duplicate/skipped rows, stable ordering, `hasMore: false`/`nextCursor: null` on the last page, malformed-cursor safety, and limit clamping.
- [x] **Phase 20.3 - `?sortBy=`/`?order=` support** (`API.md` Section 4) - complete 2026-08-05, live-verified in production. A per-resource whitelist (never an arbitrary client-supplied column) on the five list endpoints where a choice of sort field actually makes sense: `GET /v1/conversations` (`lastMessageAt`/`createdAt`), `/v1/contacts` (`displayName`/`createdAt`), `/v1/rules` (`createdAt`/`updatedAt`/`name`), `/v1/notifications` and `/v1/ai/credits/ledger` (`?order=` only - each has exactly one sortable timestamp). An unrecognized `sortBy` falls back to the resource's default field rather than 400ing, matching `decodeCursor`'s existing "a stale/bad param shouldn't break a client" stance. `conversations`/`rules` keep their existing compound default ranking (priorityScore/priority-first) when no `sortBy` is given - an explicit `sortBy` opts out of that ranking, not layers on top of it. The cursor itself carries the `sortBy`/`order` it was minted under (`cursor-pagination.ts`'s new `keysetOr`/`parseSortBy`/`parseOrder`), so a multi-page walk stays self-consistent even if a client stops resending `?sortBy=`/`?order=` after the first page - verified directly (page 2 fetched with only `?cursor=`, no `sortBy`/`order`, and it correctly continued the name-ascending walk from page 1). `Contact`, `Conversation`, and `Notification` had **no index at all** before this phase - every page of every workspace's list was a full table scan; closed via `packages/database/prisma/migrations/20260805000000_phase20_3_sort_indexes/`, applied to production through the existing `prisma migrate deploy` `prestart` hook (ADR-0023). See `scripts/verify-phase20.3-sort-order.mjs`: whitelist fallback, asc/desc on three different endpoints, cross-page cursor/sortBy consistency, no duplicate rows, unchanged `{data, pagination}` envelope, and unauthenticated rejection - 17/17 locally, 15/15 in production (the two `conversations sortBy=lastMessageAt` checks correctly SKIP in production, since `/dev/mock-connector/send` used to seed them is intentionally 404 there - `mock-connector.controller.ts`'s own documented `NODE_ENV==="production"` guard, unrelated to this phase).
- [x] **Phase 20.4 - `ETag`/`If-Match` HTTP-native optimistic concurrency** (`API.md` Section 8) - complete 2026-08-05, live-verified in production. `GET /v1/rules/:id` and `GET/PATCH /v1/notification-preferences` expose a real `ETag` (the row's `version`); mutating requests must send `If-Match` (`428` if absent, `412 Precondition Failed` with `code: OPTIMISTIC_LOCK_FAILURE` on a stale one - corrected from `API.md`'s earlier draft, which said `409`); `GET` honors `If-None-Match` for a bodyless `304`. The atomic DB check is against what `If-Match` actually declares, not a version the server itself just re-fetched - closing a real, previously-undetected gap in `RulesController.update`: the old code always compared against its own just-fetched `existing.version`, so a genuine "someone edited this since I loaded the form" conflict (the actual case `If-Match` exists to catch) could never have fired in practice, only the sub-millisecond fetch-to-write race within a single request. `NotificationPreference` had no `version` column or any conflict detection at all before this phase (`PATCH` was a blind `upsert`) - added both; a first-ever save uses `If-Match: "new"`. `apps/web` wired to send real `If-Match` (`RuleSummary.version` for rules, a new `ifMatchForPreferences()` helper for preferences). A second real bug found via this phase's own conflict test and fixed along the way: a priority-only `PATCH /v1/rules/:id` body silently kept the *old* priority - the "simple edit" shortcut branch special-cased `isEnabled` but not `priority`. Scope: `Rule` and `NotificationPreference` only - the two resources with both a `version` column and an existing mutation endpoint; `LinkedAccount` connector settings (no settings-mutation endpoint exists at all yet) and `Workspace`/`Organization` settings (the single `aiEnabled` toggle, no `version` column) are deliberately deferred - see `docs/STATUS.md`. See `scripts/verify-phase20.4-etag-concurrency.mjs` (25/25, run against both local dev and production): 304/412/428 all real, a fresh ETag on every response, and a genuine two-client race (both fetch, one writes, the other's now-stale `If-Match` 412s instead of silently overwriting). The `NotificationPreference.version` migration applied to production automatically via the existing `prisma migrate deploy` `prestart` hook (ADR-0023).
- [x] **Phase 20.5 - Observability foundation** - complete 2026-08-07, live-verified in production, deliberately scoped down from the full `ARCHITECTURE.md` target stack (see below). Real request correlation IDs (`X-Trace-Id` response header, generated per request or honored if client-supplied, shared between a request's structured access log and its RFC 7807 error body's `traceId` - closing a prior inconsistency where the error path minted its own unrelated ID), one structured JSON log line per HTTP request (`apps/api/src/observability/request-context.middleware.ts`, backed by `pino`), and a real Prometheus-exposition `GET /metrics` endpoint (`prom-client`) exposing default Node.js process metrics plus `http_requests_total`/`http_request_duration_seconds`/`http_errors_total` (by route *pattern*, not raw path, to avoid unbounded cardinality), `connector_messages_received_total{provider}`, `automation_rule_executions_total{status}`, and `bullmq_jobs_processed_total`/`bullmq_jobs_failed_total{queue}` for both BullMQ queues (`events`, `scheduled-jobs`). Every metric is verified to actually move under real traffic (a real Mock Connector message increments `connector_messages_received_total` and `bullmq_jobs_processed_total` for real), not asserted as present-but-static. **Explicitly not built this round** - OpenTelemetry distributed tracing, and a deployed Prometheus/Grafana/Loki stack actually scraping/visualizing the `/metrics` endpoint above: these need real infrastructure (a Prometheus server, a Grafana instance) this session deliberately didn't stand up, per explicit user direction to keep this phase "small but real, deployed, and verified" rather than claim a stack that isn't actually running - see `docs/ARCHITECTURE.md` Section 7 for the documented target and `docs/STATUS.md` for the disclosed gap. See `scripts/verify-phase20.5-observability.mjs`: 15/15 locally (including two business metrics confirmed to increase after a real Mock Connector message), 13/13 in production (the mock-connector-dependent increment check correctly SKIPs there, same as prior Phase 20.x scripts, since that endpoint is intentionally 404'd outside development). Prometheus Counters only appear in `/metrics` output after their first increment - `connector_messages_received_total`/`bullmq_jobs_processed_total{queue="events"}` will show up in production once the first real connector message lands post-deploy, which is expected `prom-client` behavior, not a gap.

None of these block a small number of real users - `docs/reviews/mvp-hardening-report.md` explicitly found no blocking issue for Phase 14 to proceed. They block *growth* past that point: unbounded queries and missing rate limits are correctness/abuse-resistance concerns that scale with usage, not with feature count.

---

## Phase 21 - Product Hardening & UX

Added to the roadmap 2026-08-09, per explicit user direction: with Phase 20 (Production Readiness) fully complete, the backend has reached a level of rigor the product's usability hasn't caught up to yet. Phase 21 closes that gap - real, long-standing bugs first, then UX surfaces (connector management, inbox, automation, onboarding) - each sub-phase independently shipped, verified, and documented, matching Phase 20's own discipline.

- [x] **Phase 21.1 - Soft-delete reconnect bug** - complete 2026-08-09, the core database-level fix live-verified in production repeatedly (2026-08-10/11) with a real Telegram bot. Closes a real, long-standing bug first surfaced during Phase 20's Slack live verification and the encryption-key rotation (docs/STATUS.md's "Known follow-up," open since those incidents): once any `LinkedAccount` row existed for a given external account, that same account could never be reconnected - every future connect attempt reported "already connected" forever, even after a genuine disconnect. Two distinct causes, both fixed:
  1. Every connector's (Telegram, Discord, Slack, Email) "already connected?" check never filtered `deletedAt: null` - fixed via a new shared `findActiveLinkedAccount()` helper (`apps/api/src/common/linked-account.ts`), used by all four. Turned out to be **not the actual blocker** in practice - `packages/database/src/soft-delete.ts`'s `withSoftDeletes()` Prisma Client extension already injects `deletedAt: null` into every `findFirst` on this model by default, so this check was already silently correct. Kept as explicit, self-documenting intent rather than reverted, since relying entirely on an implicit global extension for correctness this load-bearing is fragile.
  2. **The real bug**, found via this phase's own regression test actually attempting a reconnect: the database's own unique index on `(workspace_id, provider_id, external_account_id)` had no soft-delete awareness at all - a soft-deleted row still occupied that key, so a genuine reconnect's `INSERT` hit a real Postgres unique-violation (`P2002`), regardless of any application-level query filtering. Fixed with a partial unique index (`WHERE deleted_at IS NULL`) replacing the full-table one - Prisma's schema DSL has no partial-index support, so this is a hand-written migration, deliberately unmanaged by `schema.prisma`'s own `@@unique` (documented inline in the model). The real on-disk index name during this fix turned out to differ from what `schema.prisma`'s `name:` claimed (this database predates that annotation being added) - confirmed live against the running dev database rather than assumed, and the migration targets the real name (both in production and local dev - production's copy diverged from local the same way, and needed the identical manual correction, applied live via `psql`).
  See `scripts/verify-phase21.1-reconnect.mjs` (7/7 locally) and `scripts/verify-phase21.1-production-live.mjs` (11-12/12 against production across several runs): a real soft-delete, a real reconnect `create()`/HTTP connect proven to succeed (not caught-and-ignored, not a `P2002`), confirmation that both the old (soft-deleted) and new (active) rows/accounts coexist correctly.

  **Two things found along the way, disclosed rather than smoothed over:**
  - A real Railway build failure (`error TS2742`, `findActiveLinkedAccount`'s inferred return type not portably nameable for declaration-emit) went undetected locally because `pnpm dev` runs via `ts-node`, which never performs declaration-emit checks - only Railway's real `tsc -p tsconfig.json` build catches it. This means the application-level code for this phase (not the database fix, which was applied directly and independently via `psql`) may not have actually been live for a period between the original merge and the fix commit. Fixed by adding an explicit return type; confirmed with a real `pnpm --filter @smc/api build` run. **Lesson**: `pnpm dev`'s ts-node path cannot be trusted alone to catch every class of build failure a real `tsc` compile would - worth an occasional real local build check before assuming a Railway deploy will succeed.
  - **The end-to-end "does a real Telegram message reach the Inbox after reconnect" check has never actually passed** in any run - only the reconnect/disconnect/soft-delete database behavior is confirmed. One concrete finding en route: after a disconnect → reconnect cycle, `getWebhookInfo` showed an **empty webhook URL** (`url: ""`) - the reconnect's `setWebhook` call did not durably succeed, even though the connect response reported `webhookRegistered: true`. This is an open, disclosed gap, not fixed in this phase - see `docs/STATUS.md`'s Known Follow-up.

  **Production deployment surfaced two more real findings, both resolved live:**
  1. The `20260809000000_phase21_1_linked_account_partial_unique_index` migration **never actually applied** on the first deploy - `_prisma_migrations` on production showed the last-applied migration was still Phase 20.4's, despite the deploy itself succeeding and `/health` reporting green. Root cause not fully diagnosed (the `prestart` hook that ran every prior migration automatically since ADR-0023 didn't run this one) - worked around by applying the migration's SQL directly against production via `psql` (the Railway CLI's `DATABASE_URL` is internal-network-only from outside Railway; `DATABASE_PUBLIC_URL`, discovered via `railway variables`, is the one that actually connects from a local machine) and manually recording it in `_prisma_migrations` with a real computed checksum, so a future `prisma migrate deploy` run won't try to re-apply it. **Flagged as a real, unresolved gap** for a future session: the `prestart` migration mechanism needs to be verified end-to-end again, not assumed reliable.
  2. `TelegramController.disconnect()` calls Telegram's `deleteWebhook(botToken)` unconditionally - correct for the common case (one workspace per bot), but since Telegram's webhook URL is a single global slot per bot token, disconnecting *any* workspace's connection to a bot clears the webhook for *every* workspace connected to that same bot token, including ones that are still active. Not a Phase 21.1 regression (inherent to how Telegram's Bot API webhooks work, and only surfaced because this session's own repeated test runs shared one real bot token across several throwaway test workspaces - not a pattern real usage hits) - documented here as a known interaction, not silently discovered and dropped.

  Full production lifecycle live-verified end to end via `scripts/verify-phase21.1-production-live.mjs` (pure HTTP, no direct database access, run with a real `TELEGRAM_TEST_BOT_TOKEN` against `https://smcapi-production-bc04.up.railway.app`) - 12/12: real active LinkedAccount → real disconnect → real reconnect (**201, no `P2002`** - the actual regression this phase fixes) → confirmed as a genuinely new row, not the old one → old row confirmed gone from the active set → **a real Telegram message, sent live during the run, confirmed landing in the Inbox** (correct sender resolution, priority scoring, and body text) through the reconnected account.
- [x] **Phase 21.2 - Connector management visibility** - complete 2026-08-13, live-verified in production, deliberately scoped to a single endpoint per explicit user direction (a separate real-network `/health` endpoint per connector - Telegram `getWebhookInfo`, Slack `auth.test`, IMAP `NOOP` - deferred until an actual need for it, not built speculatively). `GET /v1/connectors` closes the real gap found while fixing Phase 21.1: a workspace's connected connectors had no listing endpoint at all, only a direct database query. Not cursor-paginated - same reasoning `GET /v1/auth/sessions` already established (a workspace's own connector list is small and user-owned, disproportionate to paginate). `LinkedAccount.lastError` (written verbatim by each connector's pre-existing reconciliation service - untouched, out of this phase's scope) is sanitized at the response boundary via a new `sanitizeErrorMessage()` helper (`apps/api/src/common/sanitize-error.ts`) before ever reaching a client - strips anything token/URL-query-shaped, truncates, never passes through unredacted. See `scripts/verify-phase21.2-connectors.mjs`: 13/13 locally and 13/13 in production - unauthenticated rejection, empty-list correctness, a real connected Telegram account appearing with the right shape, confirmed the raw bot token never appears anywhere in the response JSON, workspace isolation (a second user never sees the first user's connector), and disconnect correctly removing an entry from the live list.

  **Expanded 2026-08-13/15, per explicit user direction, to close a real frontend gap: there was no UI to connect or disconnect a connector at all.** This was not a newly-discovered bug - `docs/UI_GUIDE.md` Section 20/24 specified a real Connector Management screen (list, status/health, a disconnect confirmation step naming what's retained) from the start, and `docs/reviews/phase-4-sprint-2-review.md`'s Deliberate Simplifications table #4 explicitly deferred building it at Telegram's own launch ("the raw data is already captured and available for whenever that screen is built") - it just never got picked back up across seven subsequent phases. Built: a new `apps/web/components/ConnectorManagement.tsx` screen (reached via a new "Connectors" nav button in `Inbox.tsx`, same `view`-state pattern `Rules.tsx` already established) rendering `GET /v1/connectors`' list with a derived health label per `CONNECTOR_SDK.md` Section 2 status, a disconnect button behind a confirmation step, and the four providers' connect forms (Telegram bot-token input, Discord/Slack OAuth-redirect buttons, Email IMAP/SMTP form) - these forms already existed inline in `Inbox.tsx` since Phase 4-8 and were moved here wholesale, not rebuilt. `apps/web/lib/api.ts` gained `fetchConnectors`/`disconnectConnector`. Verified with a real click-through in a real browser, locally: connect (Telegram, with a freshly-rotated real bot token), the connection appearing in the list with a live health label, disconnect with its confirmation dialog, and reconnect - all working end to end. Production verification pending deploy.
- [ ] Phase 21.3 - Inbox UX (conversation state, read/unread, search/filter, provider indicators, empty/loading/error states)
- [ ] Phase 21.4 - Automation UX (rule create/edit, trigger→condition→action view, execution history, failed-execution detail)
- [ ] Phase 21.5 - Demo / onboarding (new workspace creation, first connector, demo data, no empty-inbox first impression)

---

## Notes on Sequencing

- Phases 0-3 produce zero user-visible product. That is intentional: the Connector SDK (Phase 4) is the highest-leverage, hardest-to-retrofit piece of this system, and it must be built on a stable domain model, not against a moving one.
- Phases 5-8 exist specifically to pressure-test Phase 4. If any of them require changing the SDK interface, that's expected for Discord (Phase 6) - it's the first real second connector - but should not happen by Slack (Phase 7) or Email (Phase 8). Treat a forced SDK change at Phase 7/8 as a signal to stop and reassess, not as a routine cost.
- AI (Phase 13) is deliberately positioned after the automation engine, notifications, and search all have working non-AI versions. This enforces the "AI is optional, never load-bearing" principle structurally, not just by policy.
- The PWA (Phase 14) is deliberately after the AI layer, not before, because push-notification quality depends on priority scoring already working well server-side (Phase 9-11) - a mobile-installable app built earlier would just ship the same notification chaos through a new channel.
- Native React Native mobile is deliberately not a numbered phase in this document at all - `PRODUCT.md`'s own MVP-exclusion section already frames it as a v2 investment, after web + PWA + (conditionally) Tauri desktop have real usage to validate against. Revisiting this - giving it a real phase number - is appropriate once Phase 14 ships and there's an actual product-market-fit signal calling for a native app specifically, not before.
- Production Readiness (Phase 20) is deliberately placed after every product-facing phase (through Marketplace, Phase 18) rather than earlier, because its scope - real rate limiting, real cursor pagination, observability - is exactly the set of things `docs/reviews/mvp-hardening-report.md` found genuinely safe to defer past MVP: correctness-at-scale and abuse-resistance concerns that don't block a small number of real users, but do block growth past that point. Appended at the end, not inserted mid-sequence, per this project's own established "smallest-footprint roadmap edit" precedent (see the WhatsApp Connector phase's identical reasoning, Phase 19).
