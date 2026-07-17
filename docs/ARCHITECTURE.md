# PulseHub - Software Architecture Document

Version 0.1 (MVP Architecture) - 2026-07-17

---

## 0. Executive Summary

PulseHub is a unified communication operating system. It connects existing messaging services (Telegram, Discord, Slack, Email) into a single inbox and layers automation and notification intelligence on top, using only official APIs and ToS-compliant integration methods. AI is an optional enhancement layer added after the automation core is solid, not a dependency of the MVP.

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

Monorepo, managed with pnpm workspaces + Turborepo (or Nx - see Section 11 for tradeoff).

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

7. Outbound path (user replies from PulseHub):
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

```
1. Sign-up/login via Auth.js (NestJS-integrated) supporting:
   - Email + password (Argon2id hashing)
   - OAuth (Google, GitHub) for platform account creation
   - Passkeys (WebAuthn) as the preferred passwordless path
   - TOTP-based 2FA as a mandatory-optional second factor

2. On success, issue:
   - short-lived JWT access token (15 min), signed, stored in memory/client
   - httpOnly, Secure, SameSite=Strict refresh token cookie (7-30 days)
   - refresh rotation: each refresh call invalidates the prior token
     (detect reuse -> revoke whole session family, audit log entry)

3. Separate from platform auth: PER-PROVIDER OAuth for connectors
   (Telegram uses bot token / login widget, Discord/Slack use OAuth2).
   These tokens are exchanged server-side, immediately written to the
   secrets manager, and only a reference id is persisted in Postgres.
   PulseHub's own JWT never carries provider credentials.

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

## 12. Open Decisions (flagged, not resolved)

- **Monorepo tool**: Turborepo (simpler, faster to adopt) vs Nx (richer generators/graph, better for eventual mobile app addition). Recommendation: start Turborepo, revisit at Phase 3 when React Native is added.
- **Modular monolith vs microservices at MVP**: recommendation is a modular monolith (NestJS modules) for the core API, with connector workers already split out as separate deployables from day one - this gets the scaling/isolation benefit where it actually matters (flaky third-party APIs) without paying full microservices tax on the core domain before product-market fit.
- **Telegram integration method**: Bot API (simpler, ToS-safe, but bot must be added to chats/channels explicitly) vs MTProto user API (full inbox visibility but higher ToS/ban risk, explicitly against the "use official APIs" and "no ToS violation" constraints). Recommendation: Bot API only for MVP; document the UX limitation (users must add the PulseHub bot rather than getting silent full-inbox mirroring) rather than risk account bans.
