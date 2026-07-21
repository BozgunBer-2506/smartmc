# Smart Message Center - ROADMAP.md

```yaml
Title: ROADMAP.md
Version: 2.2
Status: Living
Owner: Founder/CTO
Last Updated: 2026-07-22
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
│   ├── desktop/          Tauri wrapper (Phase 15)
│   └── mobile/           React Native (added when Phase 14 starts)
├── packages/
│   ├── connector-sdk/       Connector interface + registry + test harness (ADR-0004)
│   ├── automation-engine/    Trigger/condition/action evaluation (Phase 10)
│   ├── database/          Prisma schema, client, migrations (DATABASE.md)
│   ├── auth/             Auth.js integration, JWT/session logic
│   ├── shared/            Canonical domain types (Message, Conversation, Contact...)
│   ├── design-tokens/       Platform-agnostic design tokens (DESIGN_SYSTEM.md) - added 2026-07-18, consumed by ui/ today and a future React Native mapping in Phase 14
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
4. Direct Postgres query confirms real rows: a `Contact` ("Deniz"), a `Message` (inbound, correct body), a `Notification` ("New message from Deniz") - **it fell into the DB**, per the Turkish spec's literal bitiş criteria.
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

**Desktop Strategy, added 2026-07-19 per user direction**: the initial desktop experience is delivered as a Progressive Web App (PWA), not a native Tauri client. A native desktop client (Tauri, as originally specified in `ARCHITECTURE.md`) is only built if real customer demand or a genuine technical limitation of the PWA approach justifies the added maintenance cost of a second build target. This is the lower-risk, more cost-effective strategy for the product's current stage: it delivers an "app-like" experience from day one on a single codebase, while keeping Tauri available as a later, deliberate upgrade rather than a default.

- [ ] PWA packaging of `apps/web` (installable, offline-capable shell, app icon) - the actual Phase 15 starting point, not Tauri
- [ ] System tray / native notifications / background sync - evaluated against what the PWA platform APIs can already deliver before treating any of them as a reason to build Tauri
- [ ] Tauri app (wraps the web app, per `ARCHITECTURE.md`) - **deferred**, built only if the PWA approach proves insufficient

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
