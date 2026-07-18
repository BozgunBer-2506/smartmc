# Smart Message Center - Software Architecture Document

```yaml
Title: ARCHITECTURE.md
Version: 1.3
Status: Living
Owner: Architecture
Last Updated: 2026-07-18
Depends On:
  - PRODUCT.md
Related ADRs:
  - ADR-0001
  - ADR-0004
  - ADR-0005
  - ADR-0009
  - ADR-0010
  - ADR-0011
  - ADR-0012
  - ADR-0013
  - ADR-0014
```

Note: this document was originally drafted under the project's working name "PulseHub" before the product was named Smart Message Center; all references have been updated for consistency.

---

## 0. Executive Summary

Smart Message Center is a unified communication operating system. It connects existing messaging services (Telegram, Discord, Slack, Email) into a single inbox and layers automation and notification intelligence on top, using only official APIs and ToS-compliant integration methods. AI is an optional enhancement layer added after the automation core is solid, not a dependency of the MVP.

Three pillars drive every architecture decision below:

1. **Provider abstraction** - every messaging service is a plugin behind a common `Connector` interface, so adding a new provider never touches core domain logic.
2. **Event-driven core** - all inbound/outbound messages, rule evaluations, and notifications flow through queues, not direct synchronous calls, so providers can fail independently without taking down the platform.
3. **Automation without code** - rules are stored as structured data (JSON/DSL), evaluated by a rules engine, and edited through a visual builder. No user-facing scripting.

---

## 1. Overall Architecture Diagram

```
                                   ┌─────────────────────────┐
                                   │        Clients           │
                                   │  Web (Next.js)            │
                                   │  Desktop (Tauri)           │
                                   │  Mobile (React Native, v2)  │
                                   └────────────┬─────────────┘
                                                │ HTTPS / WSS
                                   ┌────────────▼─────────────┐
                                   │        API Gateway         │
                                   │  (NestJS - REST + GraphQL) │
                                   │  AuthN/Z, Rate Limiting     │
                                   └───┬────────┬────────┬─────┘
                                       │        │        │
                     ┌─────────────────▼┐ ┌────▼─────┐ ┌▼──────────────┐
                     │  Core Domain API  │ │  WS Hub   │ │  GraphQL BFF   │
                     │  (Users, Inbox,   │ │ (realtime │ │ (aggregated    │
                     │  Rules, Contacts) │ │  push)    │ │  views)        │
                     └────────┬──────────┘ └────┬──────┘ └───────────────┘
                              │                  │
                     ┌────────▼──────────────────▼────────┐
                     │            PostgreSQL (Primary)      │
                     │        Redis (cache, pub/sub, BullMQ)│
                     └────────┬──────────────────────────────┘
                              │
                   ┌──────────▼───────────┐
                   │   Message Bus / Queue  │
                   │       (BullMQ/Redis)    │
                   └───┬─────┬─────┬─────┬──┘
                       │     │     │     │
             ┌─────────▼┐ ┌──▼───┐ ┌▼────┐ ┌▼──────────┐
             │ Telegram  │ │Discord│ │Slack│ │  Email     │
             │ Connector │ │Connect│ │Conn │ │  Connector │
             │  Worker   │ │Worker │ │Wrkr │ │  (IMAP/SMTP)│
             └─────────┬─┘ └──┬───┘ └┬────┘ └┬──────────┘
                       │     │     │     │
             ┌─────────▼─────▼─────▼─────▼──┐
             │      External Provider APIs     │
             │ Telegram Bot/MTProto, Discord    │
             │ Gateway, Slack Events API, IMAP  │
             └──────────────────────────────────┘

             ┌──────────────────────────────────┐
             │        Automation Engine           │
             │  (Rule evaluation workers, BullMQ)  │
             │  Subscribes to "message.received"   │
             │  Publishes "action.execute"          │
             └──────────────────────────────────┘

             ┌──────────────────────────────────┐
             │      Notification Service          │
             │  Push (FCM/APNs/Web Push), Email    │
             │  Silent hours, VIP, digesting        │
             └──────────────────────────────────┘

             Cross-cutting: Secrets Manager (Vault/KMS), OpenTelemetry
             Collector -> Prometheus + Grafana + Loki, Audit Log service
```

**Key architectural decision:** connectors are workers, not part of the API request path. A Telegram outage or Slack rate limit never blocks the core app or other providers. Each connector normalizes provider-native events into a canonical `Message` domain event and pushes it onto the bus; nothing downstream knows or cares which provider it came from.

---

## 2. Folder Structure

Monorepo, managed with pnpm workspaces + Turborepo. This layout is formally ratified in [ADR-0011](adr/0011-monorepo-layout.md), which also resolves Turborepo vs. Nx in Turborepo's favor and supersedes a provisional `backend/`+`frontend/`+`connectors/` structure that briefly existed between 2026-07-17 and 2026-07-18.

```
pulsehub/
├── apps/
│   ├── web/                      # Next.js unified inbox UI
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/             # feature-based modules (inbox, rules, contacts, settings)
│   │   └── lib/
│   ├── desktop/                  # Tauri wrapper around web app
│   └── api/                      # NestJS backend (modular monolith at MVP)
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── accounts/         # linked provider accounts (OAuth tokens etc.)
│       │   │   ├── inbox/            # unified message read model
│       │   │   ├── contacts/
│       │   │   ├── rules/            # automation rule CRUD + versioning
│       │   │   ├── notifications/
│       │   │   └── audit/
│       │   ├── connectors/
│       │   │   ├── telegram/
│       │   │   ├── discord/
│       │   │   ├── slack/
│       │   │   └── email/
│       │   │       ├── connector.interface.ts   # shared contract
│       │   │       ├── *.module.ts
│       │   │       ├── *.worker.ts
│       │   │       └── *.mapper.ts              # provider payload -> canonical Message
│       │   ├── automation/
│       │   │   ├── engine/           # rule evaluator
│       │   │   ├── conditions/
│       │   │   └── actions/
│       │   ├── common/               # guards, interceptors, decorators
│       │   ├── infra/
│       │   │   ├── prisma/
│       │   │   ├── redis/
│       │   │   ├── queue/
│       │   │   ├── storage/          # S3 client
│       │   │   └── secrets/
│       │   └── main.ts
│       └── prisma/
│           ├── schema.prisma
│           └── migrations/
├── packages/
│   ├── domain/                   # shared domain types/entities (framework-agnostic)
│   ├── connector-sdk/             # interface + test harness for building connectors
│   ├── ui/                        # shadcn/ui-based shared component library
│   ├── config/                    # eslint, tsconfig, tailwind presets
│   └── contracts/                 # OpenAPI/GraphQL schema + generated types
├── infra/
│   ├── docker/
│   ├── k8s/
│   ├── terraform/
│   └── grafana-dashboards/
├── .github/workflows/
└── turbo.json
```

Rationale: feature-based modules inside `apps/api/src/modules` (per instructions), connectors isolated in their own directory implementing a shared `connector.interface.ts` so DDD boundaries stay explicit and a new provider is additive, not invasive.

---

## 3. Database Schema (PostgreSQL, Prisma)

Simplified ERD - core entities only, MVP scope.

```
User
 ├── id, email, passwordHash?, createdAt, twoFactorSecret?, ...
 └── has many: LinkedAccount, Rule, NotificationPreference, AuditLog

LinkedAccount                    # a connection to a provider (Telegram, Slack, etc.)
 ├── id, userId, provider (enum), status, externalAccountId
 ├── credentialsRef              # pointer into secrets manager, NEVER raw tokens in DB
 └── has many: Conversation

Conversation                     # a chat/channel/thread, normalized across providers
 ├── id, linkedAccountId, provider, externalId
 ├── type (dm | group | channel)
 ├── title, avatarUrl
 └── has many: Message

Message                          # canonical message, one row per provider-native message
 ├── id, conversationId, externalId, senderId
 ├── direction (inbound | outbound)
 ├── body, bodyFormat (text | markdown | html)
 ├── attachments (jsonb -> Attachment[])
 ├── sentAt, receivedAt
 ├── status (sent | delivered | read | failed)
 └── rawPayload (jsonb, for debugging/replay, redacted for PII where required)

Contact                          # deduplicated person across providers
 ├── id, userId, displayName, isVip (bool)
 └── has many: ContactIdentity

ContactIdentity                  # provider-specific identity mapped to a Contact
 ├── id, contactId, provider, externalId, handle

Rule                             # automation rule (visual builder output)
 ├── id, userId, name, isEnabled, priority
 ├── trigger (jsonb: event type + filters)
 ├── conditions (jsonb: condition tree, AND/OR nested)
 ├── actions (jsonb: ordered list of actions)
 └── has many: RuleExecutionLog

RuleExecutionLog
 ├── id, ruleId, messageId, matchedAt, actionsExecuted (jsonb), result

NotificationPreference
 ├── id, userId, silentHoursStart, silentHoursEnd, timezone
 ├── vipOnlyDuringSilentHours (bool)
 └── keywordAlerts (string[])

Notification
 ├── id, userId, messageId?, ruleId?, type, payload, deliveredAt, readAt

Tag                               # e.g. "Finance", used by automation actions
 ├── id, userId, name, color
MessageTag (join table)

AuditLog
 ├── id, userId, actorType, action, resourceType, resourceId, metadata (jsonb), createdAt
```

Design notes:
- **No raw provider credentials in Postgres.** `LinkedAccount.credentialsRef` points to a secret in Vault/AWS Secrets Manager; the DB never holds a plaintext OAuth token or bot token.
- **Message is the single canonical shape** all connectors map into - this is what makes "unified inbox" actually unified instead of four UIs glued together.
- **Rule.conditions/actions as jsonb** rather than a rigid relational tree - keeps the visual builder flexible without a migration for every new condition type. A JSON-schema validates shape at the application layer.
- Indexes: `Message(conversationId, sentAt)`, `Conversation(linkedAccountId, externalId)` unique, `ContactIdentity(provider, externalId)` unique.

---

## 4. Event Flow

Canonical flow for an inbound message triggering automation and a notification:

```
1. Provider webhook/gateway event arrives at Connector Worker
   (Telegram: bot webhook or MTProto update;
    Discord: Gateway WS event;
    Slack: Events API HTTP callback;
    Email: IMAP IDLE push or poll)

2. Connector Worker maps provider payload -> canonical Message DTO
   via its *.mapper.ts, resolves/creates Conversation + Contact

3. Worker writes Message to Postgres, then publishes
   "message.received" event to the bus (BullMQ queue "events")

4. Two consumers subscribe to "message.received":

   a) Inbox Projector
      -> updates the read-model used by GraphQL BFF / WS Hub
      -> pushes realtime update to connected clients over WS

   b) Automation Engine
      -> loads enabled Rules for the user, filtered by trigger type
      -> evaluates condition tree against the Message + Contact
      -> for each matched rule, enqueues "action.execute" jobs
         (one job per action, ordered by priority)

5. Action Executors (queue consumers) run each action:
   - "set priority"      -> update Message/Conversation metadata
   - "tag"                -> insert MessageTag
   - "notify"              -> enqueue Notification Service job
   - "schedule reminder"   -> enqueue delayed job (BullMQ delay) for
                              "no reply after N days" checks

6. Notification Service consumes notify jobs:
   - checks NotificationPreference (silent hours, VIP, keywords)
   - if suppressed, stores as pending digest entry
   - else dispatches via Web Push / FCM / APNs / email

7. Outbound path (user replies from Smart Message Center):
   API -> "message.send" command -> routed to the correct
   Connector Worker -> provider API call -> on success,
   Message row updated to status=sent, "message.sent" event emitted
```

All steps after (3) are asynchronous and idempotent (each job carries the source `Message.id` as an idempotency key) so retries on connector flakiness never double-fire automations.

---

## 5. API Design

Hybrid REST + GraphQL, per the tech stack:

- **REST** for commands and provider-specific/OAuth flows (`POST /accounts/telegram/connect`), and for simple CRUD not needing aggregation.
- **GraphQL** for the unified inbox read path, where the client needs to fetch conversations + messages + contacts + tags in one shaped query, and for the visual rule builder's introspection of available triggers/conditions/actions.
- **WebSockets** for realtime message push and typing/read-receipt style ephemeral events.

Representative REST endpoints:

```
POST   /auth/login | /auth/register | /auth/2fa/verify | /auth/passkey/*
GET    /accounts                          list linked provider accounts
POST   /accounts/:provider/connect        start OAuth/connect flow
DELETE /accounts/:id                      unlink an account

GET    /inbox/conversations               paginated, filterable
GET    /inbox/conversations/:id/messages
POST   /inbox/conversations/:id/messages  send a message (outbound)

GET    /contacts
PATCH  /contacts/:id                      e.g. toggle VIP

GET    /rules
POST   /rules
PATCH  /rules/:id
DELETE /rules/:id
POST   /rules/:id/test                    dry-run against sample message

GET    /notifications/preferences
PATCH  /notifications/preferences

GET    /audit-logs                        admin/self, paginated
```

Representative GraphQL schema fragment:

```graphql
type Query {
  inbox(filter: InboxFilter, cursor: String, limit: Int): ConversationConnection!
  conversation(id: ID!): Conversation
  ruleBuilderSchema: RuleBuilderSchema!   # available triggers/conditions/actions, for the no-code UI
}

type Mutation {
  sendMessage(conversationId: ID!, body: String!, attachments: [AttachmentInput!]): Message!
  upsertRule(input: RuleInput!): Rule!
}

type Subscription {
  messageReceived(conversationId: ID): Message!
  notificationCreated: Notification!
}
```

All endpoints sit behind the API Gateway: JWT auth guard, per-user rate limiting (Redis token bucket), request validation (class-validator/zod), and structured error responses (RFC 7807 problem+json).

---

## 6. Authentication Flow

Corrected 2026-07-18 via [ADR-0014](adr/0014-custom-jwt-session-auth.md): "Auth.js" (this section's original wording) has no NestJS integration and cannot implement `DATABASE.md` Section 6.20's `family_id` reuse-detection design - authentication is a custom implementation of the exact behavior below, not a redesign of it.

```
1. Sign-up/login via custom NestJS auth services supporting:
   - Email + password (Argon2id hashing) - implemented Phase 2
   - OAuth (Google, GitHub) for platform account creation - Phase 2 checklist, not yet implemented
   - Passkeys (WebAuthn) as the preferred passwordless path - Phase 2 checklist, not yet implemented;
     schema already accommodates it (`user_credentials.password_hash` is nullable)
   - TOTP-based 2FA as a mandatory-optional second factor - Phase 2 checklist, not yet implemented

2. On success, issue (Phase 2, direct issuance - not the OAuth2+PKCE flow `API.md` Section 7.1
   describes for Phase 18's external/marketplace clients, per ADR-0014):
   - short-lived JWT access token (15 min), signed, stored in memory/client
   - httpOnly, Secure, SameSite=Strict refresh token cookie (7-30 days)
   - refresh rotation: each refresh call invalidates the prior token
     (detect reuse -> revoke whole session family, audit log entry)

3. Separate from platform auth: PER-PROVIDER OAuth for connectors
   (Telegram uses bot token / login widget, Discord/Slack use OAuth2).
   These tokens are exchanged server-side, immediately written to the
   secrets manager, and only a reference id is persisted in Postgres.
   Smart Message Center's own JWT never carries provider credentials.

4. Authorization: RBAC at the workspace level (Owner/Admin/Member,
   for future team accounts) + resource-level ownership checks
   (a user can only act on their own LinkedAccounts/Rules).

5. All auth events (login, failed login, token refresh, 2FA change,
   provider connect/disconnect) written to AuditLog.
```

---

## 7. Infrastructure Diagram

```
                         ┌────────────────────────┐
                         │        Cloudflare         │
                         │  DNS, CDN, WAF, DDoS       │
                         │  protection, Cloudflare     │
                         │  Tunnel (optional ingress)  │
                         └────────────┬─────────────┘
                                      │
                         ┌────────────▼─────────────┐
                         │      AWS Load Balancer      │
                         │           (ALB)              │
                         └────────────┬─────────────┘
                                      │
                    ┌─────────────────▼──────────────────┐
                    │       EKS (Kubernetes) Cluster        │
                    │  ┌───────────┐ ┌────────────────┐   │
                    │  │  api pods  │ │ connector-worker │   │
                    │  │ (NestJS)   │ │ pods (per        │   │
                    │  │            │ │ provider, HPA)    │   │
                    │  ├───────────┤ ├────────────────┤   │
                    │  │  web (SSR) │ │ automation-      │   │
                    │  │  pods      │ │ engine pods       │   │
                    │  ├───────────┤ ├────────────────┤   │
                    │  │ ws-hub pods│ │ notification-    │   │
                    │  │            │ │ service pods      │   │
                    │  └───────────┘ └────────────────┘   │
                    └───┬────────┬──────────┬──────────────┘
                        │        │          │
             ┌──────────▼──┐ ┌───▼──────┐ ┌─▼─────────────┐
             │  RDS Postgres │ │ElastiCache│ │  S3 (attach-  │
             │  (Multi-AZ)   │ │  Redis     │ │  ments,       │
             │               │ │            │ │  backups)     │
             └───────────────┘ └────────────┘ └───────────────┘

             ┌───────────────────────────────────────────┐
             │  Secrets: AWS Secrets Manager / HashiCorp    │
             │  Vault (KMS-encrypted provider credentials)  │
             └───────────────────────────────────────────┘

             ┌───────────────────────────────────────────┐
             │  Observability: OTel Collector (in-cluster)  │
             │  -> Prometheus (metrics) -> Grafana (dash)   │
             │  -> Loki (logs)                              │
             └───────────────────────────────────────────┘
```

Environment separation: `dev` (single-node, docker-compose), `staging` (scaled-down EKS, same manifests as prod), `prod` (Multi-AZ, HPA-scaled connector workers - these scale independently since Discord/Slack event volume differs wildly from Email polling load).

---

## 8. Deployment Strategy

- **Docker Compose** for local dev: Postgres, Redis, mailhog (SMTP testing), the NestJS API, and the Next.js app, all hot-reloading.
- **Kubernetes (EKS)** for staging/prod, using Helm charts per service (api, web, ws-hub, each connector worker, automation-engine, notification-service).
- **Progressive rollout**: staging deploy on every merge to `main`; production deploy is a manual-gated promotion of a staging-tested image (same image, different config/secrets - never rebuild for prod).
- **Blue/green or rolling** deploys for the API (stateless, safe for rolling); connector workers use rolling deploys with `terminationGracePeriodSeconds` tuned so in-flight provider events aren't dropped mid-shutdown.
- **Database migrations** run as a pre-deploy Kubernetes Job (Prisma Migrate), gated before the new API pods roll out; migrations must be backward-compatible with the previous API version (expand/contract pattern) to support zero-downtime rollback.
- **Feature flags** (e.g. LaunchDarkly or a simple in-house flag table) gate new connectors/rule types so they can ship dark and be enabled per-user.

---

## 9. CI/CD Pipeline (GitHub Actions)

```
on: pull_request
  - lint (eslint, prettier check)
  - typecheck (tsc --noEmit across workspaces, via turbo)
  - unit tests (per package/app, via turbo)
  - build (turbo build, verifies all packages compile)

on: push to main (post-merge)
  - all of the above, plus:
  - integration tests (docker-compose spun up: real Postgres/Redis,
    mocked provider APIs via recorded fixtures)
  - build & push Docker images to ECR, tagged with git SHA
  - deploy to staging (Helm upgrade, automatic)
  - run smoke tests against staging
  - terraform plan (posted as PR comment on infra changes)

on: manual workflow_dispatch (promote)
  - deploy chosen staging-verified SHA to production (Helm upgrade)
  - run production smoke tests
  - notify on failure, auto-rollback via `helm rollback` on smoke
    test failure
```

Supporting practices: signed commits optional, branch protection on `main`, required status checks, Terraform state in an S3 backend with DynamoDB locking, secrets never in the repo (GitHub Actions OIDC to AWS, no long-lived AWS keys in CI).

---

## 10. Roadmap: MVP to Enterprise

**Phase 0 - Foundations (weeks 1-3)**
Monorepo scaffold, auth (email/password + passkeys), Postgres schema, CI skeleton, one connector end-to-end (Telegram) to validate the whole event pipeline before parallelizing.

**Phase 1 - MVP (weeks 4-10)**
Discord, Slack, Email connectors. Unified inbox UI. Contact deduplication. Visual rule builder (v1: sender-based and keyword-based triggers, priority/tag/notify actions). Notification service with silent hours + VIP. Reminder-on-no-reply automation.

**Phase 2 - Hardening (weeks 11-14)**
Rate limiting, audit logging, GDPR data export/delete endpoints, secrets manager integration (move off env vars), observability stack (OTel/Prometheus/Grafana/Loki), load testing connector workers, Kubernetes migration from docker-compose staging.

**Phase 3 - Growth (months 4-6)**
Desktop app (Tauri) GA. Team/workspace accounts with RBAC. More automation triggers (attachment type, time-of-day, message volume). Digest notifications. Public API for third-party rule triggers (Zapier-style webhook actions).

**Phase 4 - AI Layer (months 6-9, optional/parallel)**
Conversation summaries, suggested replies, message classification, task detection, smart search, natural-language rule creation ("notify me urgently if my boss messages about the deadline"). Built as an isolated service consuming the same `message.received` events - can be disabled entirely without touching core.

**Phase 5 - Enterprise (months 9-12+)**
SSO (SAML/OIDC), granular RBAC, per-workspace data residency options, SLA-backed uptime, dedicated tenant infrastructure option, compliance certifications (SOC 2), mobile app (React Native) GA, marketplace for community-built connectors against the `connector-sdk`.

---

## 11. Technology Choices Explained

| Choice | Why |
|---|---|
| **Next.js + React + TS** | SSR for fast initial inbox load, App Router for feature-based routing, huge ecosystem, matches the folder structure's feature-module approach. |
| **TailwindCSS + shadcn/ui** | Fast, consistent UI without a heavy design-system rebuild; shadcn's copy-in-code model means full control for a product this visually central (a messaging inbox lives and dies by UI polish). |
| **TanStack Query** | Server-state caching/invalidation for REST calls, pairs naturally with GraphQL codegen hooks too; avoids hand-rolled cache logic for a data-heavy inbox UI. |
| **Tauri (desktop)** | Native-feeling desktop app with a fraction of Electron's binary size and memory footprint - important since this app is meant to run always-on in a tray, like Beeper/Slack do. |
| **NestJS** | Opinionated, DI-first, modular structure maps directly onto Clean Architecture/DDD; first-class support for REST, GraphQL, WebSockets, and microservice transports (useful when connectors outgrow the monolith). |
| **PostgreSQL** | Relational integrity for users/rules/contacts, jsonb for flexible rule condition trees, mature, battle-tested, Multi-AZ RDS support. |
| **Redis** | Backs BullMQ queues, pub/sub for WS fan-out across API replicas, and rate-limit token buckets - one piece of infra, three jobs. |
| **Prisma ORM** | Type-safe queries matching the TS-everywhere stack, migration tooling that fits the expand/contract deploy pattern. |
| **BullMQ** | Redis-backed queue with delayed jobs (needed for "remind after 2 days"), retries/backoff (needed for flaky provider APIs), and priority queues (needed for automation action ordering). |
| **WebSockets** | Realtime push for new messages - polling an inbox app would feel broken; NestJS has native WS gateway support. |
| **REST + GraphQL** | REST for simple commands/OAuth callbacks (easier for third-party redirect flows), GraphQL for the inbox's naturally nested, client-shaped data needs and for exposing rule-builder schema introspection to the frontend. |
| **Auth.js** | Handles OAuth provider complexity (Google/GitHub sign-in) and integrates with passkeys/WebAuthn, avoiding a hand-rolled auth stack for a product that will also manage sensitive third-party OAuth tokens. |
| **JWT + rotating refresh cookies** | Stateless access tokens scale horizontally across API pods; rotation + reuse detection mitigates stolen-refresh-token risk without server-side session storage overhead. |
| **Passkeys/2FA** | Messaging aggregators are a high-value target (one login exposes Telegram+Slack+Discord+Email) - passwordless/2FA is not optional for this threat model. |
| **S3-compatible storage** | Attachments (images, files) don't belong in Postgres; S3 gives cheap, durable, CDN-fronted storage, and "S3-compatible" keeps a path open to Cloudflare R2 for egress cost savings. |
| **Docker + Compose + Kubernetes** | Compose for fast local dev parity, Kubernetes for the connector-worker scaling story - each provider has wildly different load/rate-limit characteristics and needs independent HPA. |
| **Terraform** | Infra-as-code for RDS/EKS/S3/IAM, code-reviewable infra changes, matches the "no manual console changes" principle needed for SOC 2 later. |
| **GitHub Actions** | Tight repo integration, OIDC-to-AWS avoids long-lived cloud credentials in CI, matches monorepo/turbo build caching. |
| **Prometheus + Grafana + Loki + OTel** | Standard, vendor-neutral observability stack; OTel instrumentation now avoids a painful re-instrumentation later; Loki keeps logs queryable alongside the same Grafana dashboards as metrics. |
| **AWS + Cloudflare** | AWS for compute/data (EKS/RDS/S3, mature managed services), Cloudflare in front for DDoS/WAF/CDN and cheap global edge caching of static assets - reduces AWS egress cost and adds a second layer of defense. |
| **Clean Architecture / DDD / feature modules / Repository Pattern / DI / SOLID** | The core domain (messages, contacts, rules) must stay provider-agnostic; connectors are the "infrastructure" layer in DDD terms, swappable behind interfaces, which is precisely what lets Telegram/Discord/Slack/Email be added without touching automation or notification logic. |
| **CQRS (where useful)** | The inbox read path (heavily aggregated, read-optimized) is naturally separable from the write/command path (send message, create rule) - applied selectively, not dogmatically, to the inbox and automation modules where the read/write shape genuinely diverges. |

---

## 12. Decisions Formalized as ADRs

The following were originally flagged here as open; all have since been formally decided and recorded in [docs/adr/](adr/) (see [DECISIONS.md](DECISIONS.md) for the full index). This section is kept as a historical pointer, not a live open-questions list - **there are no unresolved architectural decisions at the monorepo/deployment-topology level as of ADR-0011.**

- **Monorepo tool**: Turborepo, over Nx. Decided in [ADR-0011](adr/0011-monorepo-layout.md).
- **Repository layout**: `apps/` + `packages/` via pnpm workspaces. Decided in [ADR-0011](adr/0011-monorepo-layout.md).
- **Modular monolith vs microservices at MVP**: modular monolith for the core API, connector workers split out as independent deployables from day one. Decided in [ADR-0009](adr/0009-modular-monolith-with-connector-workers.md).
- **Telegram integration method**: Bot API only, never MTProto. Decided in [ADR-0010](adr/0010-telegram-bot-api-only.md).

Any future open decision at this level gets its own entry in [docs/DECISIONS.md](DECISIONS.md) and, once resolved, its own ADR - not a line added back to this section.

---

## 13. IdentityGraph: The Canonical Identity Layer

Introduced 2026-07-18 via [ADR-0012](adr/0012-identitygraph-canonical-identity-layer.md), following a formal naming exercise (36 candidates evaluated across Graph/Identity/Communication/Relationship/Intelligence/Platform categories - full analysis in that ADR), and sharpened the same day by [ADR-0013](adr/0013-identity-merge-safety-over-cleverness.md) after a review specifically flagged that safe, reversible merging - not clever matching - is the actual design priority. Appended as a new top-level section rather than inserted earlier in this document's numbering, specifically so every existing cross-reference to this document's Sections 1-12 from `DATABASE.md`, `API.md`, `SECURITY.md`, `CONNECTOR_SDK.md`, and `AUTOMATION_ENGINE.md` remains valid - renumbering to place this "where it conceptually belongs" would have silently broken a dozen cross-document references for a purely cosmetic gain.

### 13.0 Concept Glossary

For a reader checking "is X actually specified anywhere":

| Concept | Where it's defined |
|---|---|
| Identity entity | `Contact` - `DATABASE.md` Section 6.6 |
| Provider identity | `ContactIdentity` - `DATABASE.md` Section 6.6 |
| Identity confidence score | `contact_identities.confidence_score` - `DATABASE.md` Section 6.6 |
| Merge request | `identity_merge_suggestions` (pending/approved/rejected/expired lifecycle) - `DATABASE.md` Section 6.6, [ADR-0013](adr/0013-identity-merge-safety-over-cleverness.md) |
| Split operation | Manual split action + `identity_split_log` - Section 13.3 below, `DATABASE.md` Section 6.6 |
| User approval flow | Section 13.6 below; UI realization in `UI_GUIDE.md` Section 7 |
| Identity history | `identity_merge_log` + `identity_split_log` (structural changes) and relationship/communication history (Section 13.3 below) - together, "how this identity has changed" and "what this identity has said" |
| Privacy controls | Section 13.8 below |
| Data ownership | Section 13.8 below |
| Wrong-merge recovery | Section 13.6.1 below - treated as IdentityGraph's primary design priority, not a fallback |

### 13.1 Purpose

Every architectural document up to this point has implicitly assumed the platform reasons about identities, not provider accounts - `DATABASE.md` Section 6.6's `Contact`/`ContactIdentity` split exists for exactly this reason, and `AUTOMATION_ENGINE.md` Section 1 already named the canonical context model as the product's real moat. **IdentityGraph is the explicit name and architectural boundary for that capability.** Stated as a hard rule: no consuming system - Automation Engine, Search, AI, Notifications, or the unified inbox itself - is permitted to reason primarily about a `LinkedAccount` or a raw provider-native sender ID. Every one of them reads from IdentityGraph, which resolves "who is this, really" once, consistently, regardless of which of the four (eventually dozens) of connectors the message arrived through.

### 13.2 Position in the Architecture

IdentityGraph sits directly downstream of connector ingestion and upstream of every consuming system:

```
Connector Workers (CONNECTOR_SDK.md)
        │  raw provider-native sender/conversation data
        ▼
   IdentityGraph
        │  resolves to canonical Contact + confidence-scored ContactIdentity links
        ▼
┌───────┴────────┬─────────────┬──────────────┬─────────────────┐
│  Unified Inbox   │  Automation  │   Search      │  Notification    │
│  (Conversation/   │  Engine      │  (cross-      │  Service          │
│  Message read      │  (Context     │  channel      │  (VIP/relation-   │
│  model)             │  Object's     │  identity      │  ship-aware       │
│                     │  sender/       │  resolution)   │  routing)          │
│                     │  contact       │                │                    │
│                     │  sections)     │                │                    │
└─────────────────┴─────────────┴──────────────┴─────────────────┘
```

This is a **logical** layer at Phase 0-4's stage of the project, not necessarily a separately deployed service - it is implemented as a well-bounded module (`packages/identity-graph` per ADR-0011's package layout) called synchronously by connector workers at ingestion time and queried by every downstream consumer, persisted via the schema `DATABASE.md` Section 13.4 (below) defines. Whether it ever becomes a separately deployed service is a scaling decision for a future ADR, not a decision this document makes now (mirroring ADR-0009's "modular monolith until a real scaling-skew reason exists" posture).

### 13.3 Responsibilities

- **Identity resolution**: given a provider-native sender identifier (from a connector, `CONNECTOR_SDK.md` Section 13), resolve it to a canonical `Contact`, creating one if none exists.
- **Identity linking**: attach a newly-resolved provider identity to an existing `Contact` when a deterministic, exact match exists (`(provider, externalId)` - the only automatic case, per Section 13.6).
- **Confidence scoring**: every non-exact candidate link between a provider identity and an existing `Contact` carries a numeric confidence score (signals: matching display name, matching email/handle fragments, shared conversation participants, temporal correlation) - stored, never silently discarded, and never itself sufficient to trigger an automatic merge above a very narrow deterministic-match threshold.
- **Duplicate detection**: proactively surfaces likely-duplicate `Contact` records (two contacts that probably represent one real person) as a suggestion queue, not a background auto-fix.
- **Manual merge**: the only path by which two `Contact` records become one, always human-confirmed, always audit-logged (`DATABASE.md` Section 13.4).
- **Manual split**: the reverse operation - a `Contact` incorrectly merged (or one that legitimately represents two different people who happened to share a matched signal) can be split back apart, preserving each resulting `Contact`'s own message/relationship history correctly, not losing data on either side.
- **Relationship history**: first-contact date, historical response-lag pattern, VIP status, tag history - the data `AUTOMATION_ENGINE.md` Section 4.2's messaging-native condition primitives (`sender.isVip`, `sender.isFirstContact`, `conversation.responseLagIsAbnormal`) read from.
- **Communication history**: the full cross-channel message timeline for a given identity (`DATABASE.md` Section 6.6's original "Contact Timeline" concept, `API.md` Section 10.4), now explicitly IdentityGraph's to own and serve.
- **Provider abstraction**: nothing downstream of IdentityGraph ever needs to know or care which specific provider a given identity link came from to answer "is this the same person" - that knowledge is fully contained within IdentityGraph's resolution logic.

### 13.4 Data Model (formalized in `DATABASE.md`)

IdentityGraph's persistence is `DATABASE.md` Section 6.6's `Contact`/`ContactIdentity` tables, now extended (Section 13.6 below) with a confidence-score column and two new append-only audit tables (`identity_merge_log`, `identity_split_log`) - see `DATABASE.md` for full column-level detail. IdentityGraph does not introduce a new database technology or a separate graph database at this stage - the relational `Contact`/`ContactIdentity` join, indexed appropriately (`DATABASE.md` Section 6.6's existing index design), is sufficient at this product's realistic scale, and a dedicated graph database is a Section 13.8 future consideration, not a current requirement.

### 13.5 Why This Is the Real Competitive Moat

Restated and sharpened from `AUTOMATION_ENGINE.md` Section 1/18, now with a name attached:

1. **It requires solving cross-provider identity resolution honestly, within each provider's ToS.** A competitor could reverse-engineer or bridge unofficial APIs to shortcut this (Beeper's historical approach) - we've explicitly ruled that out (ADR-0010 and PRODUCT.md's Never Build list), which means IdentityGraph's quality is earned entirely through official-API-available signal and careful matching logic, not through privileged access. That's a harder, slower path to build - and exactly why it's defensible once built.
2. **Every other differentiating feature depends on it, compounding the moat.** The Automation Engine's messaging-native condition primitives, cross-channel search, VIP/silent-hours logic, and any future AI features are all *consumers* of IdentityGraph, not independent systems that happen to also need identity data. A competitor copying the Automation Engine's visual builder UI (`AUTOMATION_ENGINE.md` Section 1's original argument) still has nothing underneath it - `sender.isVip` is meaningless without a working IdentityGraph resolving who the sender actually is across channels first.
3. **It improves with usage in a way a fresh competitor cannot shortcut.** Confidence scoring, duplicate-detection suggestions, and manual merge/split decisions accumulate as workspace-specific signal over time (Section 13.7's cold-start limitation is real on day one of a given workspace, but the *system's* matching logic itself - not any individual workspace's data - also improves platform-wide as more real-world matching patterns are observed and confirmed across the product's whole install base, subject to Section 13.6's per-workspace privacy boundary).

### 13.6 Preventing Incorrect Merges

The single highest-consequence failure mode for IdentityGraph is a wrong merge - conflating two different real people, which corrupts VIP status, relationship history, and every automation targeting either of them. Prevention is structural, not just procedural:

- **Automatic merge is permitted in exactly one case**: an exact, deterministic match on `(provider, externalId)` - the same provider-native account, seen twice. This is not really a "merge decision" at all; it's recognizing the same identity, and carries no ambiguity.
- **Every other candidate match, regardless of confidence score, becomes a persisted, reviewable `identity_merge_suggestion`** (`DATABASE.md` Section 6.6, [ADR-0013](adr/0013-identity-merge-safety-over-cleverness.md)) - a 98%-confidence suggestion is still a suggestion sitting in a `pending` state until a human explicitly approves or rejects it, never auto-applied. This is a hard product boundary, not a tunable threshold someone can quietly lower under pressure to "reduce manual work."
- **Every merge and split is audit-logged** (`DATABASE.md` Section 6.6's `identity_merge_log`/`identity_split_log`) with who confirmed it, when, and what confidence signals were present at the time - so an incorrect merge is always traceable and reversible (Section 13.3's manual-split capability), never a silent, unrecoverable data-corruption event.
- **Suggestion frequency is rate-limited per workspace, and suggestions expire** - IdentityGraph does not surface unlimited low-confidence merge suggestions, which would train users to reflexively approve them out of alert fatigue (the same failure mode `PRODUCT.md`'s UI Principles warn against for notifications generally, applied here to identity-merge prompts specifically), and a `pending` suggestion left unreviewed expires rather than accumulating as stale, potentially-outdated evidence.

#### 13.6.1 Worked Example: Two Ahmets, and Why Recovery Matters More Than Prevention

A concrete illustration of why [ADR-0013](adr/0013-identity-merge-safety-over-cleverness.md) treats safe reversal, not matching sophistication, as the priority: a workspace has "Ahmet" the customer (tagged VIP, targeted by three automation rules routing his invoices to Finance) and, separately, "Ahmet" a personal friend of the workspace owner, messaging through a channel that exposes only a first name. A fuzzy-matching heuristic, tuned aggressively enough, could plausibly suggest merging them - shared first name, temporally-close messages, no strongly distinguishing signal available from either provider.

**If this were ever auto-merged**, the damage is immediate and compounding: the friend's casual messages now inherit VIP treatment and Finance-routing automation; the customer's messages are now polluted with the friend's conversational history for any AI-generated summary; a "no reply after 2 days" reminder rule fires against the wrong relationship entirely. None of this produces an error message - it produces confidently wrong behavior, which is worse than a visible failure because nothing prompts a user to notice something is broken until real damage (a misrouted invoice, an inappropriately-VIP-flagged casual message) has already occurred.

**Because merging requires explicit human confirmation (Section 13.6) and every merge is reversible (Section 13.3)**, the actual failure mode is bounded and recoverable: the suggestion sits `pending` until a human reviews it (and a well-designed review card, per `UI_GUIDE.md` Section 7, showing "shared first name only, no other matching signal" as the evidence, should make a careless approval less likely in the first place) - and even if a user does approve it in error, a split is a first-class, immediately-available action, not a support escalation. **This is the actual point of ADR-0013**: IdentityGraph's job is not to never be wrong - a system confident enough to never suggest a borderline match would also miss many real duplicates. Its job is to make being wrong cheap, visible, and fast to fix.

### 13.7 Risks & Limitations

Stated honestly, not glossed over:

- **Cold-start problem**: a brand-new workspace has no relationship history, no confirmed merges, and minimal cross-message signal - IdentityGraph's resolution quality for that workspace starts at "exact-match only" and improves over the workspace's first weeks of real usage, not instantly.
- **Signal-quality ceiling per provider**: resolution quality is bounded by how much identity signal a given provider actually exposes via its official API (`CONNECTOR_SDK.md` Section 13) - a provider that only exposes an opaque numeric ID with no name/handle gives IdentityGraph very little to work with, and no amount of matching-algorithm sophistication overcomes a provider that simply doesn't expose the signal.
- **Fundamentally no ground truth without user confirmation**: IdentityGraph can never be certain two different provider identities are the same real person without either a deterministic match or a human confirming it - this is a permanent, structural limitation, not an accuracy target to eventually reach 100% on.
- **Adversarial impersonation risk**: a malicious actor could deliberately craft a provider identity (display name, handle) to resemble an existing trusted contact, hoping to be auto-suggested as a match - mitigated by Section 13.6's human-confirmation requirement (a suggestion is never auto-applied) and by `SECURITY.md` Section 9.2's broader phishing/impersonation detection, but worth naming explicitly as a risk IdentityGraph's design has to account for, not assume away.
- **Merge/split is not free of edge cases**: a split operation on a `Contact` with deeply intertwined history (shared tags, shared automation-rule targeting, shared VIP status set at different times for what turn out to be two different people) requires careful, explicit rules for how that history divides - full operational detail belongs in a future implementation-level document (flagged here, not designed in full at this stage).

### 13.8 Privacy Protection

- **Strictly workspace-scoped, never cross-tenant** (ADR-0012's non-negotiable governance principle): there is no global, cross-customer identity graph correlating people across different Smart Message Center workspaces. A person who happens to message two different Smart Message Center customers is two entirely separate `Contact` records, one per workspace, with no linkage between them anywhere in the system. This is now explicitly recorded in `PRODUCT.md`'s Never Build list.
- **Data minimization inherited from `DATABASE.md`/`SECURITY.md`**: IdentityGraph does not collect additional signal beyond what connectors already normalize into the canonical `Message`/`Conversation`/`Contact` model (`DATABASE.md` Section 6.6-6.8) - it resolves and links, it does not go fetch additional external profile data from third-party sources.
- **Confidence scores and matching signals are internal-only**, never exposed to other users of a shared workspace beyond the merge-suggestion UI itself, and never exposed externally via the public API - a workspace member sees "these might be the same person," not the underlying signal weights that produced that suggestion.
- **GDPR erasure applies at the `Contact` level** (`SECURITY.md` Section 7.2) - erasing a person's data erases their `Contact` record and every `ContactIdentity` link to it; a merge performed before an erasure request is itself part of the auditable history retained only as long as `DATABASE.md`'s audit-retention policy (`SECURITY.md` Section 8.4) requires, not indefinitely.
- **Data ownership, stated explicitly**: the *workspace* (its owner/admins, per `DATABASE.md` Section 6.3's role model) controls and is accountable for the `Contact` records IdentityGraph builds - the real people those records represent are data subjects with GDPR rights (Section 7.2 above), not platform users with any account or access of their own to that data. This is the standard controller/data-subject relationship `SECURITY.md` already establishes generally, restated here because IdentityGraph is the specific capability that makes "who controls this record, and who has rights over it" a question worth answering explicitly rather than leaving implicit.

---
