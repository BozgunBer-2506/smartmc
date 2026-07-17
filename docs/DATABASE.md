# Smart Message Center - DATABASE.md

Version 0.1 - 2026-07-17
Author role: Principal Database Architect
Scope: PostgreSQL schema design for a multi-tenant SaaS expected to scale to millions of users. No SQL, no Prisma models - this document defines the design that SQL/Prisma will later implement.

---

## 1. Database Philosophy

Five non-negotiable principles govern every decision below, in priority order when they conflict:

1. **Tenant isolation is structural, not conventional.** Every tenant-owned table carries a `workspace_id` (or is reachable to one via a direct, non-nullable foreign key) from day one, even though Smart Message Center launches as single-user-per-workspace. Retrofitting multi-tenancy into a schema that wasn't designed for it is one of the most expensive mistakes a SaaS can make - it touches every table, every query, and every index. We pay this cost once, upfront, at MVP, while the schema is still small.
2. **Nothing important is ever hard-deleted by default.** Messages, conversations, rules, and audit-relevant entities use soft deletes (`deleted_at`). A messaging product's core promise is "we never lose your data" - a hard `DELETE` executed by a bug is an existential-trust incident in this category specifically (see PRODUCT.md's UI Principles: the unread count must always be trustworthy - the same standard applies to "did my data survive"). Hard deletes exist only where GDPR erasure legally requires them, and even then go through a deliberate, audited erasure workflow, not an ad hoc `DELETE FROM`.
3. **The schema assumes scale it doesn't need yet.** UUIDs (not sequential integers) as primary keys, partitioning-ready table design for the message-volume tables, and index strategy chosen for millions-of-rows access patterns, not thousands. We do not build the partitioning or sharding infrastructure at MVP (that would be premature), but we design tables so that infrastructure can be added later without a primary-key migration, which is the part that's genuinely hard to retrofit.
4. **Every table that can be read under Row Level Security, should be designable that way**, even if RLS is not turned on in Postgres at MVP (application-layer tenant scoping is enough initially - see Section 14). The column shape must not preclude RLS later.
5. **The canonical domain model (from ARCHITECTURE.md) stays authoritative.** This document refines and formalizes it; it does not diverge from it. `Message`, `Conversation`, `Contact`, `LinkedAccount` keep the same meaning here as in ARCHITECTURE.md section 3.

**What this schema deliberately does NOT do at MVP, and why:**
- No physical table partitioning yet (see Section 14) - premature at low row counts, adds operational complexity (partition maintenance, constraint exclusion) with zero benefit below tens of millions of rows.
- No event sourcing as the primary persistence model (see Section 43) - full ES adds substantial complexity (event replay, snapshotting, eventual consistency everywhere) that isn't justified when a straightforward normalized model plus append-only audit/execution logs covers the actual requirements (audit trail, debuggability, undo).
- No physical sharding - single Postgres instance (with read replicas) is sufficient for years at this product's realistic growth curve; sharding is a Section 46 concern, not a day-one one.

---

## 2. Naming Conventions

| Rule | Convention | Why |
|---|---|---|
| Tables | `snake_case`, plural (`messages`, `linked_accounts`) | Postgres convention, avoids case-folding surprises, plural reads naturally in queries |
| Columns | `snake_case` | Same as above; matches Prisma's `@@map`/`@map` idiom cleanly |
| Primary key | Always `id` (UUID) | Uniform join/reference pattern everywhere, no per-table PK-name lookups |
| Foreign key | `<singular_referenced_table>_id` (`workspace_id`, `conversation_id`) | Self-documenting, matches Prisma relation field naming by convention |
| Timestamps | `created_at`, `updated_at`, `deleted_at` (all `timestamptz`) | Consistent soft-delete and audit convention across every table (Section 11) |
| Booleans | `is_<adjective>` (`is_vip`, `is_enabled`) | Unambiguous at a glance, no `flag`/`status` overload |
| Enums | Postgres native `enum` type named `<table>_<column>_enum` OR a lookup table for values that will grow (see Section 5, Providers) | Native enums are fast and constrained but require a migration to add a value; lookup tables are used specifically where the value set is expected to grow post-launch (e.g. providers) |
| Junction tables | `<table_a>_<table_b>` alphabetical or semantic (`message_tags`, not `tag_messages`) | Predictable lookup order |
| Indexes | `idx_<table>_<columns>` | Greppable in migration history and `pg_indexes` |
| Unique constraints | `uq_<table>_<columns>` | Same reasoning |
| Foreign key constraints | `fk_<table>_<referenced_table>` | Same reasoning |
| Money | integer minor units (cents), never `float`/`numeric` guesswork column named loosely | Prevents floating-point currency bugs; explicit `_cents` suffix (`amount_cents`) |
| IDs in URLs/APIs | UUID, never the raw internal sequence (there is no sequence - see Section 3) | Prevents enumeration attacks, and decouples external identifiers from internal storage details |

---

## 3. Identifier Strategy: UUID Everywhere

Every table's primary key is a UUID (v7 preferred over v4 - see below), never a `serial`/`bigserial` integer.

**Why UUID over integer PK:**
- **Multi-tenant safety**: integer PKs leak information (row counts, growth rate) and invite enumeration (`/messages/1002` → try `/messages/1003`). UUIDs close that off entirely.
- **Merge/migration safety**: if Smart Message Center ever needs to merge data across regions, restore from a point-in-time backup into a live system, or migrate a tenant between database instances (a realistic enterprise ask - see Section 46), integer PKs collide; UUIDs don't.
- **Distributed generation**: connector workers (per ARCHITECTURE.md, these are independent processes) can generate a `Message.id` before it ever reaches Postgres, enabling idempotent writes and safe retries without a round-trip to get an ID first.

**Why UUIDv7, not UUIDv4, specifically:**
UUIDv4 is fully random, which is actively bad for Postgres B-tree index locality - random inserts across a large index cause page splits and index bloat at scale. UUIDv7 is time-ordered (like a timestamp-prefixed random value), so inserts are roughly sequential at the index level, giving most of integer-PK's index performance while keeping all of UUID's safety properties. This single choice materially affects write performance once tables reach tens of millions of rows, and costs nothing to adopt now. All primary keys and foreign keys use UUIDv7 unless a specific table has a documented reason not to (none do at MVP).

---

## 4. Multi-Tenancy Model

Two-level tenancy, matching PRODUCT.md's persona reality: most users are a "tenant of one," but Support/Sales teams (PRODUCT.md's Business tier) need real multi-user tenants from Phase 16 onward. We model both levels now so Phase 16 (Teams) is additive, not a migration.

- **Organization**: the billing and identity boundary. Every user belongs to exactly one personal Organization created automatically at signup (even solo users), or is invited into an existing team Organization. This is what Section 33 formalizes.
- **Workspace**: a unit of shared data within an Organization. At MVP, one Organization has exactly one Workspace (1:1), but the schema supports N Workspaces per Organization from day one (e.g. an agency with separate client workspaces later) without restructuring - this is what Section 34 formalizes.
- **`workspace_id` is the actual tenant-scoping column** on every tenant-owned table (Conversations, Messages, Contacts, Rules, etc.) - not `organization_id` - because access control and RLS policies (Section 14) need to operate at the granularity users actually share data at.

This two-level split is the single most important multi-tenancy decision in this document: collapsing it to one level ("just Organization") would block the Phase 16 Teams feature from ever supporting per-client or per-department data separation without a breaking migration.

---

## 5. ER Diagram

```
Organization 1---* Workspace 1---* WorkspaceMember *---1 User
                                       │
                                       │ 1
                                       │
                                       * 
                                  LinkedAccount *---1 Provider
                                       │ 1
                                       │
                                       * 
                                  Conversation *---* ConversationParticipant ---1 Contact
                                       │ 1                                          │ *
                                       │                                            │
                                       *                                    ContactIdentity
                                    Message *---* MessageAttachment
                                       │ 1                │ 1
                                       │                  │
                                       *                  *
                                MessageStateEvent      Attachment (S3 ref)
                                       
Message *---* Tag  (via MessageTag)
Message 1---* MessageAISummary
Message 1---* NotificationEvent

Workspace 1---* Rule 1---* RuleExecutionLog *---1 Message
Rule 1---* ScheduledJob

Workspace 1---* NotificationPreference ---1 User
Workspace 1---* ApiKey
Workspace 1---* Webhook 1---* WebhookDelivery

Organization 1---* Subscription ---1 BillingPlan
Organization 1---* Invoice
Organization 1---* AICreditLedgerEntry

User 1---* Session
User 1---* AuditLog (actor)
Workspace 1---* AuditLog (subject scope)

Workspace 1---* FeatureFlagOverride ---1 FeatureFlag
Workspace 1---* Setting
```

Legend: `1---*` one-to-many, `*---*` many-to-many (via join table), `---1` many-to-one (FK direction). Full column-level detail for every entity follows in Section 6.

---

## 6. Entity Catalog

For each entity: purpose, columns (name / type / constraints), keys, indexes, cascade rules, and the reasoning behind non-obvious choices. Data types use Postgres type names (not SQL syntax).

### 6.1 Organization (item 33)

Purpose: the billing/identity root. One per customer (solo user or team).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | UUIDv7 |
| name | text | not null | |
| slug | text | not null, unique | for future vanity URLs (`app.smc.io/o/acme`) |
| plan_tier | text | not null, default `'free'` | denormalized cache of current plan for fast checks; source of truth is `subscriptions` |
| created_at | timestamptz | not null, default now() | |
| updated_at | timestamptz | not null | |
| deleted_at | timestamptz | nullable | soft delete |

Indexes: `uq_organizations_slug`. Cascade: deleting (soft) an Organization cascades a soft-delete intent to all child Workspaces via application logic, not a DB `ON DELETE CASCADE` (see Section 11 - cascades on soft delete are application-orchestrated, never automatic, so we never silently soft-delete a workspace a user didn't intend to touch).

### 6.2 Workspace (item 34)

Purpose: the tenant-scoping unit; almost every other table hangs off this.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| organization_id | uuid | FK -> organizations.id, not null | |
| name | text | not null | |
| timezone | text | not null, default `'UTC'` | IANA tz name, drives silent-hours logic (PRODUCT.md problem #85) |
| created_at / updated_at / deleted_at | timestamptz | | |

Indexes: `idx_workspaces_organization_id`. FK cascade: `ON DELETE RESTRICT` (an Organization cannot be hard-deleted while Workspaces exist - forces the deliberate GDPR erasure workflow, Section 15, rather than an accidental cascade wipe).

### 6.3 User & WorkspaceMember

| Table | Purpose |
|---|---|
| `users` | Global identity - a person, independent of any workspace. Holds auth-relevant fields (email, password hash, 2FA secret ref, passkey credential refs) - detailed in a future `SECURITY.md`, referenced here only structurally. |
| `workspace_members` | Join table: which Users belong to which Workspace, with what role. |

`users` key columns: `id (uuid, PK)`, `email (text, unique, citext for case-insensitivity)`, `display_name`, `avatar_url`, `created_at/updated_at/deleted_at`. Auth secrets (password hash, 2FA seed, WebAuthn credentials) live in a separate `user_credentials` table, not on `users` itself - **why**: separating rarely-joined, highly-sensitive auth material from the frequently-joined identity row reduces the blast radius of an accidental over-fetch (`SELECT *` on `users` in application code should never be able to leak a password hash) and lets us apply stricter column-level access/encryption policy to one small table instead of auditing every query against a wide `users` table.

`workspace_members`: `id (uuid, PK)`, `workspace_id (FK)`, `user_id (FK)`, `role (enum: owner, admin, member)`, `invited_by_user_id (FK, nullable)`, `joined_at`, `created_at/updated_at/deleted_at`. Unique constraint `uq_workspace_members_workspace_user` on `(workspace_id, user_id)` - a user cannot join the same workspace twice. Index `idx_workspace_members_user_id` for "which workspaces am I in" lookups.

### 6.4 Provider (item 21)

Purpose: catalog of supported external services (Telegram, Discord, Slack, Email, future WhatsApp/LinkedIn). Modeled as a **lookup table, not a native enum** - the one deliberate exception to the enum-preference in Section 2 - **why**: providers will be added post-launch (WhatsApp, LinkedIn per PRODUCT.md's V2 section, and eventually third-party connectors per Phase 18's marketplace), and adding a native Postgres enum value requires a schema migration with locking caveats on older Postgres versions, whereas a lookup-table row is a plain insert. This directly serves the Connector SDK's "pluggable provider" goal from ARCHITECTURE.md/ROADMAP.md Phase 4.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| key | text | not null, unique | stable machine key, e.g. `telegram`, `discord` |
| display_name | text | not null | |
| category | text | not null | `chat`, `email`, `social` - for future UI grouping |
| is_enabled | boolean | not null, default true | kill switch for a provider platform-wide (e.g. during an outage or ToS dispute) |
| icon_url | text | nullable | |
| created_at/updated_at | timestamptz | | no soft delete - providers are a small, admin-managed catalog, not user data |

### 6.5 LinkedAccount / Connector Account (item 22)

Purpose: a Workspace's connection to one Provider account (e.g. "this Telegram bot," "this Gmail inbox").

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| workspace_id | uuid | FK, not null | tenant scope |
| provider_id | uuid | FK -> providers.id, not null | |
| external_account_id | text | not null | provider-native identifier (bot user id, mailbox address) |
| display_label | text | nullable | user-given nickname, e.g. "Work Telegram" |
| status | enum | not null, default `pending` | `pending`, `active`, `error`, `reauth_required`, `disconnected` |
| credentials_ref | text | not null | **pointer only** - see below |
| last_synced_at | timestamptz | nullable | |
| last_error | text | nullable | surfaced to UI per ARCHITECTURE.md's connector health-check design |
| created_at/updated_at/deleted_at | timestamptz | | |

Unique constraint: `uq_linked_accounts_workspace_provider_external` on `(workspace_id, provider_id, external_account_id)` - prevents connecting the same external account twice into one workspace.

**`credentials_ref` design, explained**: this column never holds a raw OAuth/bot token. It holds an opaque reference (a secret path/ID) into the external secrets manager (Vault/AWS Secrets Manager, per ARCHITECTURE.md section 7). This is not a performance decision, it's a blast-radius decision: a Postgres backup, a read replica misconfiguration, or a SQL-injection-class bug must never be able to leak a live Telegram bot token or Slack OAuth token. Splitting secrets out of the primary datastore is the single highest-leverage security decision in this schema.

Index: `idx_linked_accounts_workspace_id`, `idx_linked_accounts_status` (for the health-check sweep job to find `error`/`reauth_required` accounts efficiently).

### 6.6 Contact & ContactIdentity (items 20)

Purpose: a deduplicated person, independent of which channel they message on - the entity that makes "unified" actually mean something (PRODUCT.md problem #97).

**`contacts`**: `id (uuid, PK)`, `workspace_id (FK)`, `display_name`, `avatar_url (nullable)`, `is_vip (boolean, default false)`, `notes (text, nullable)`, `created_at/updated_at/deleted_at`.

**`contact_identities`**: `id (uuid, PK)`, `contact_id (FK)`, `provider_id (FK)`, `external_id (text, not null)` - the provider-native user ID, `handle (text, nullable)` - display handle (`@username`, phone number, email address), `created_at/updated_at`.

Unique constraint `uq_contact_identities_provider_external` on `(provider_id, external_id, workspace_id)` - the same external identity can't be attached to two different Contacts within one workspace, which is what makes dedup enforceable at the DB layer instead of purely an application-logic hope.

Index: `idx_contact_identities_contact_id`, `idx_contact_identities_external_id` (fast "which Contact does this inbound sender map to" lookup - this runs on every single inbound message, so it is one of the hottest indexes in the whole schema).

**Why identity resolution is a separate table, not columns on Contact**: a person can have a Telegram handle, a work email, and a Slack user ID simultaneously - this is fundamentally one-to-many, and flattening it onto Contact (e.g. `telegram_id`, `slack_id`, `email` columns) would require a schema migration for every new provider, defeating the entire pluggable-connector premise.

### 6.7 Conversation & ConversationParticipant (items 23-24)

Purpose: a chat/channel/thread, normalized across providers.

**`conversations`**: `id (uuid, PK)`, `workspace_id (FK)`, `linked_account_id (FK)`, `provider_id (FK, denormalized for query convenience)`, `external_id (text, not null)`, `type (enum: dm, group, channel)`, `title (text, nullable)`, `avatar_url (nullable)`, `last_message_at (timestamptz, nullable - denormalized, see below)`, `is_archived (boolean, default false)`, `created_at/updated_at/deleted_at`.

Unique constraint `uq_conversations_linked_account_external` on `(linked_account_id, external_id)`.

**Why `last_message_at` is denormalized onto Conversation**: the unified inbox's primary query is "list conversations ordered by most recent activity" - without a denormalized column, this requires a correlated subquery or window function over Messages for every single inbox load, which does not scale past a modest message count. This is a deliberate, documented denormalization, kept in sync by the same transaction that inserts a new Message (Section 17 - read model considerations expands on this pattern).

**`conversation_participants`**: `id (uuid, PK)`, `conversation_id (FK)`, `contact_id (FK, nullable - null for "this workspace's own linked account" as a participant)`, `linked_account_id (FK, nullable)`, `role (enum: member, admin, owner - provider-native role where applicable)`, `joined_at (nullable)`, `left_at (nullable)`. Exactly one of `contact_id`/`linked_account_id` is non-null (a CHECK constraint enforces this) - a participant is either an external Contact or "us."

Indexes: `idx_conversations_workspace_id_last_message_at` (composite, DESC on last_message_at - the exact shape of the inbox's main query), `idx_conversation_participants_conversation_id`, `idx_conversation_participants_contact_id`.

### 6.8 Message (items 25-26, 18)

Purpose: the canonical, provider-agnostic message - the single most important and highest-volume table in the system.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | UUIDv7, generated by the connector worker (Section 3) for idempotency |
| workspace_id | uuid | FK, not null | denormalized from conversation for RLS/partitioning (Section 14/45) |
| conversation_id | uuid | FK, not null | |
| external_id | text | not null | provider-native message ID |
| sender_contact_id | uuid | FK, nullable | null for outbound (sent by us) |
| direction | enum | not null | `inbound`, `outbound` |
| body_text | text | nullable | plain-text body, always populated where extractable, for search (Section 16) |
| body_format | enum | not null | `text`, `markdown`, `html` |
| body_rich | jsonb | nullable | original rich structure (Slack blocks, Discord embeds) when the provider has one |
| status | enum | not null, default `received` | see Section 6.9 for full lifecycle |
| sent_at | timestamptz | nullable | provider-reported send time |
| received_at | timestamptz | not null, default now() | when we ingested it |
| raw_payload | jsonb | nullable | full original provider payload, PII-redacted per policy (Section 15), retained for debugging/replay |
| created_at/updated_at/deleted_at | timestamptz | | |

Unique constraint `uq_messages_conversation_external` on `(conversation_id, external_id)` - the actual idempotency guarantee: if a connector worker retries an ingestion after a crash, the insert is a safe no-op conflict, not a duplicate message.

**Why `body_text` AND `body_rich` both exist**: search (Section 16) and AI features (summarization, classification) need a reliable plain-text representation that works identically regardless of source provider; but discarding the original rich structure would degrade the UI's ability to render a Slack message with its native formatting. Keeping both is a deliberate size-vs-fidelity tradeoff, justified because `body_rich` is typically small (a few KB) relative to the value of accurate rendering.

**Why `raw_payload` is retained at all, given GDPR concerns**: debugging a connector mapping bug (Section 4 of ARCHITECTURE.md's event flow) is materially harder without the original payload, and provider webhook payloads occasionally contain fields not yet mapped into the canonical model that become valuable later. It is retained subject to the same retention/erasure policy as the rest of the Message row (Section 15), and any field we know to contain sensitive-beyond-necessary data (e.g. full raw phone numbers in metadata we don't otherwise store) is redacted at ingestion time, before the row is ever written - **why redact at write time, not read time**: a field we never persist can never leak from a backup, a replica, or a future bug; redaction after the fact protects nothing already written.

Indexes: `idx_messages_conversation_id_sent_at` (composite - the "load this conversation's messages in order" query), `idx_messages_workspace_id_received_at` (composite - supports the Morning Briefing and cross-conversation recency queries), GIN index on `body_text` for full-text search (Section 16).

### 6.9 MessageStateEvent (item 26)

Purpose: append-only delivery/read lifecycle history for a Message - kept separate from `messages.status` (which holds only the *current* state) so we retain the full timeline without mutating the Message row repeatedly.

`id (uuid, PK)`, `message_id (FK)`, `state (enum: queued, sent, delivered, read, failed)`, `occurred_at (timestamptz, not null)`, `metadata (jsonb, nullable - e.g. failure reason)`, `created_at`.

Index: `idx_message_state_events_message_id_occurred_at`.

**Why a separate append-only table instead of just updating `messages.status`**: (a) delivery status can arrive out of order from provider webhooks (a `read` receipt can theoretically race a `delivered` one), and an append-only log lets us always compute "most recent state by occurred_at" correctly rather than trusting arrival order; (b) it gives a genuine audit trail of a message's delivery journey, useful for support debugging ("the customer says they never got this") without needing full event sourcing for the whole system (see Section 43 - this is the one place a lightweight event-log pattern earns its cost).

### 6.10 Attachment & MessageAttachment (item 19)

Purpose: files, decoupled from Messages so the same physical file is never duplicated in storage if referenced more than once (e.g. forwarded), and so the Files view (PRODUCT.md problem #62) can query attachments independent of message content.

**`attachments`**: `id (uuid, PK)`, `workspace_id (FK)`, `storage_key (text, not null)` - S3 object key, `content_type (text)`, `size_bytes (bigint)`, `checksum_sha256 (text)` - used for dedup detection, `original_filename (text, nullable)`, `virus_scan_status (enum: pending, clean, flagged, default pending)`, `created_at/deleted_at`.

**`message_attachments`** (join table): `id (uuid, PK)`, `message_id (FK)`, `attachment_id (FK)`, `position (int, default 0)` - display order within a message.

Unique-ish dedup index: `idx_attachments_workspace_checksum` (non-unique composite index, not a hard unique constraint - two genuinely different files can hash-collide only theoretically, but more practically two *different* legitimate uploads could share content like an empty PDF template; the index accelerates dedup *lookup*, application logic decides whether to actually reuse the S3 object).

Cascade: deleting a Message soft-deletes the join row, never the underlying Attachment (a forwarded file referenced by multiple messages must survive any single message's deletion).

### 6.11 Tag & MessageTag

`tags`: `id (uuid, PK)`, `workspace_id (FK)`, `name (text, not null)`, `color (text, nullable)`, `created_by_user_id (FK, nullable - null if system/automation-created)`, `created_at/deleted_at`. Unique constraint `uq_tags_workspace_name` on `(workspace_id, lower(name))`.

`message_tags`: `id (uuid, PK)`, `message_id (FK)`, `tag_id (FK)`, `applied_by (enum: user, rule)`, `rule_id (FK, nullable)`, `created_at`. Unique constraint `uq_message_tags_message_tag` on `(message_id, tag_id)`.

### 6.12 Rule / Automation Engine (items 28-29, 46 of AUTOMATION_ENGINE.md's future spec)

Purpose: the trigger/condition/action definitions from PRODUCT.md's Automation Engine section, stored as structured data per ARCHITECTURE.md section 3's original design.

**`rules`**: `id (uuid, PK)`, `workspace_id (FK)`, `created_by_user_id (FK)`, `name (text, not null)`, `is_enabled (boolean, default true)`, `priority (int, default 0)` - execution order when multiple rules match the same event, `trigger (jsonb, not null)` - trigger type + filters, `conditions (jsonb, not null)` - AND/OR condition tree, `actions (jsonb, not null)` - ordered action list, `version (int, not null, default 1)` - **optimistic locking column**, `created_at/updated_at/deleted_at`.

**Why `jsonb` for trigger/conditions/actions rather than a fully normalized relational structure**: the visual rule builder (Phase 10) needs to support an evolving, deeply nested condition tree (AND/OR nesting, arbitrary depth) and a growing catalog of trigger/condition/action types (PRODUCT.md documents ~15 condition types and ~15 action types already, with more implied by the 100 examples). Fully normalizing this into `rule_conditions`, `rule_condition_children`, etc. tables would require a schema migration every time a new condition/action type is added, directly undermining the no-code builder's promise of fast iteration. The `jsonb` payload is validated at the application layer against a versioned JSON Schema (to be defined in `AUTOMATION_ENGINE.md`), which gives us structural safety without relational rigidity.

**Why `version` (optimistic locking) matters specifically on Rules**: two admins (Business tier, Phase 16) could open the same rule for editing simultaneously; without optimistic locking, the second save silently overwrites the first admin's changes with no warning. The `version` column is checked-and-incremented on every update (`WHERE id = ? AND version = ?`); a mismatch means "someone else changed this since you loaded it," surfaced to the UI as a conflict rather than silent data loss.

**`rule_execution_logs`** (item 29): `id (uuid, PK)`, `rule_id (FK)`, `message_id (FK, nullable)`, `matched_at (timestamptz, not null)`, `actions_executed (jsonb, not null)` - what actually ran and its result per action, `status (enum: success, partial_failure, failure)`, `error_detail (text, nullable)`, `created_at`. Append-only, never updated or soft-deleted (it is itself a form of audit log - see Section 43). Index: `idx_rule_execution_logs_rule_id_matched_at`, `idx_rule_execution_logs_message_id`.

### 6.13 ScheduledJob (item 30)

Purpose: durable representation of delayed/recurring automation triggers (PRODUCT.md's "no reply in 2 days" style rules) - a Postgres-backed record of intent, separate from the BullMQ/Redis job queue itself.

`id (uuid, PK)`, `workspace_id (FK)`, `rule_id (FK, nullable)`, `job_type (enum: reminder, digest, health_check, custom)`, `payload (jsonb)`, `scheduled_for (timestamptz, not null)`, `status (enum: pending, enqueued, completed, cancelled, failed, default pending)`, `bullmq_job_id (text, nullable)` - cross-reference to the Redis-backed job once enqueued, `created_at/updated_at`.

**Why this table exists when BullMQ already handles delayed jobs**: Redis-backed queues are not the durable source of truth we want for "did we actually remind the user their invoice is overdue" - a Redis eviction, misconfiguration, or restart without persistence enabled could silently drop a scheduled reminder with no record it ever existed. `scheduled_jobs` is the durable, queryable Postgres record; BullMQ is the execution mechanism. A reconciliation sweep (Phase 11) can detect `pending` rows whose `scheduled_for` has passed with no corresponding completion and re-enqueue them - this is the specific mechanism behind PRODUCT.md automation example #93 ("alert the user that a rule may be silently failing").

Index: `idx_scheduled_jobs_status_scheduled_for` (composite - the sweep query's exact access pattern).

### 6.14 Notification & NotificationPreference (item 27)

**`notification_preferences`**: `id (uuid, PK)`, `workspace_id (FK)`, `user_id (FK)`, `silent_hours_start (time, nullable)`, `silent_hours_end (time, nullable)`, `vip_override_enabled (boolean, default true)`, `keyword_alerts (text[], default '{}')`, `created_at/updated_at`. One row per (workspace, user) - unique constraint `uq_notification_preferences_workspace_user`.

**`notifications`**: `id (uuid, PK)`, `workspace_id (FK)`, `user_id (FK)`, `message_id (FK, nullable)`, `rule_id (FK, nullable)`, `type (enum: message, reminder, digest, system)`, `payload (jsonb)`, `delivered_at (timestamptz, nullable)`, `read_at (timestamptz, nullable)`, `created_at`.

Index: `idx_notifications_workspace_user_created_at`, partial index `idx_notifications_unread` on `(user_id) WHERE read_at IS NULL` - the "Needs You" count (PRODUCT.md's most trust-critical UI element) is read on nearly every page load, so this partial index keeps that query cheap regardless of total notification history size.

### 6.15 AI Summary & AI Credits (items 31-32)

**`message_ai_summaries`**: `id (uuid, PK)`, `message_id (FK, nullable)`, `conversation_id (FK, nullable)` - a summary can be per-message or per-thread, `summary_text (text)`, `model_used (text)`, `generated_at (timestamptz)`, `created_at`. Exactly one of `message_id`/`conversation_id` non-null (CHECK constraint).

**Why AI summaries are a separate table, never a column on Message**: per PRODUCT.md's AI Features principle ("AI is never load-bearing"), AI output must be trivially strippable - deleting every row in this table (e.g. a workspace disabling AI entirely) must not touch the Message table at all. Coupling them via a column would blur that boundary and risk a migration or a bug making AI accidentally required.

**`ai_credit_ledger`** (item 32): `id (uuid, PK)`, `organization_id (FK)`, `entry_type (enum: grant, consumption, purchase, expiry)`, `amount (int, not null)` - positive for grants/purchases, negative for consumption, `balance_after (int, not null)` - denormalized running balance for fast reads, `feature (text, nullable)` - which AI feature consumed credits, `related_message_id (uuid, nullable)`, `created_at`.

**Why an append-only ledger instead of a single mutable `credits_remaining` counter**: billing-adjacent balances must be reconstructable and auditable ("why does this account show 340 credits, prove it") - a single mutable counter updated in place has no history and is one race condition away from being wrong with no way to detect it. An append-only ledger with a denormalized `balance_after` cache gives both fast reads (read the latest row) and full auditability (sum the ledger to verify). This is standard practice for anything resembling a financial balance, and AI credits are exactly that.

### 6.16 Billing, Subscription, Plan (items 35-36)

**`billing_plans`**: `id (uuid, PK)`, `key (text, unique)` - `free`, `pro`, `pro_ai_unlimited`, `business`, `enterprise`, `display_name`, `price_cents_monthly (int, nullable)`, `price_cents_yearly (int, nullable)`, `included_ai_credits (int, nullable)`, `max_linked_accounts (int, nullable)`, `max_active_rules (int, nullable)`, `is_active (boolean, default true)`. A catalog table, admin-managed, mirrors PRODUCT.md's Pricing section as data rather than hardcoded application logic - **why**: pricing/limits change (PRODUCT.md explicitly flags the initial numbers as a hypothesis likely to be adjusted), and encoding them as data means a price or limit change is a data update, not a deploy.

**`subscriptions`**: `id (uuid, PK)`, `organization_id (FK)`, `billing_plan_id (FK)`, `status (enum: trialing, active, past_due, cancelled, expired)`, `billing_provider (text)` - `stripe` etc., `external_subscription_id (text, nullable)`, `current_period_start/end (timestamptz)`, `seats (int, default 1)` - for per-seat Business/Enterprise tiers, `created_at/updated_at/deleted_at`.

**`invoices`**: `id (uuid, PK)`, `organization_id (FK)`, `subscription_id (FK)`, `amount_cents (int)`, `status (enum: draft, open, paid, void, uncollectible)`, `external_invoice_id (text, nullable)`, `issued_at`, `paid_at (nullable)`.

**Design note**: actual payment processing (card storage, PCI scope) is deliberately kept entirely outside this schema - `external_subscription_id`/`external_invoice_id` reference Stripe (or equivalent) as the system of record for payment instruments. This schema never stores a card number or equivalent, full stop; Postgres holds only the billing *relationship* (what plan, what status), never payment credentials - same blast-radius principle as Section 6.5's `credentials_ref`.

### 6.17 FeatureFlag (item 37)

**`feature_flags`**: `id (uuid, PK)`, `key (text, unique)`, `description (text)`, `default_enabled (boolean, default false)`.

**`feature_flag_overrides`**: `id (uuid, PK)`, `feature_flag_id (FK)`, `workspace_id (FK, nullable)`, `organization_id (FK, nullable)`, `is_enabled (boolean, not null)`. Exactly one of `workspace_id`/`organization_id` non-null - overrides can target a single workspace (a beta tester) or a whole organization (an enterprise pilot).

**Why flags live in Postgres rather than only in a third-party flag service**: connector rollouts (per ROADMAP.md Phase 5-8, "ship dark, enable per-user") need to be queryable in the same transaction/request context as the rest of tenant data, and a self-hosted flag table avoids a hard external dependency for a capability this central to the deploy strategy described in ARCHITECTURE.md section 8. A third-party service (LaunchDarkly) remains an option layered on top later, not a replacement for this table.

### 6.18 Setting (item 38)

**`settings`**: `id (uuid, PK)`, `workspace_id (FK, nullable)`, `user_id (FK, nullable)`, `key (text, not null)`, `value (jsonb, not null)`, `updated_at`. Exactly one of `workspace_id`/`user_id` non-null - a setting is either workspace-scoped (shared) or user-scoped (personal), never both. Unique constraint `uq_settings_scope_key` on `(coalesce(workspace_id,'00000000-0000-0000-0000-000000000000'), coalesce(user_id,'00000000-0000-0000-0000-000000000000'), key)`.

**Why a generic key/value settings table instead of dedicated columns per setting**: most settings (UI density preference, default snooze duration, digest send time) are low-stakes, frequently added/changed during product iteration, and don't warrant a migration each time. High-stakes, frequently-queried settings that need real constraints and indexing (silent hours, VIP override) get their own proper columns on `notification_preferences` (Section 6.14) instead - the line is drawn at "does this need to be queried/filtered/indexed on its own," not just stored and read back.

### 6.19 ApiKey (item 39)

**`api_keys`**: `id (uuid, PK)`, `workspace_id (FK)`, `created_by_user_id (FK)`, `name (text)`, `key_prefix (text, not null)` - first 8 chars shown in UI for identification, `key_hash (text, not null)` - the actual key is hashed (Argon2 or SHA-256 with pepper), never stored plaintext, `scopes (text[], default '{}')`, `last_used_at (timestamptz, nullable)`, `expires_at (timestamptz, nullable)`, `revoked_at (timestamptz, nullable)`, `created_at`.

Index: `idx_api_keys_key_prefix` (fast lookup path: extract prefix from presented key, narrow candidates, then verify hash - avoids hashing-comparison against every key in the table).

**Why hash, not encrypt, the key**: an API key is a credential we only ever need to *verify*, never *retrieve* - hashing (one-way) is strictly safer than encryption (two-way, meaning a decryption key exists somewhere that could itself leak). This mirrors password-storage best practice and is deliberately different from `credentials_ref` (Section 6.5), which must be retrievable to actually call the provider API on the user's behalf.

### 6.20 Session (item 40)

**`sessions`**: `id (uuid, PK)`, `user_id (FK)`, `refresh_token_hash (text, not null)`, `family_id (uuid, not null)` - groups a chain of rotated refresh tokens, `user_agent (text, nullable)`, `ip_address (inet, nullable)`, `expires_at (timestamptz, not null)`, `revoked_at (timestamptz, nullable)`, `created_at`.

**Why `family_id`**: implements the refresh-token rotation + reuse-detection scheme from ARCHITECTURE.md section 6 - if a revoked/already-rotated token in a family is presented again (a sign of theft), every session in that `family_id` is revoked at once, not just the one token. This is the concrete schema support for that stated security behavior.

Index: `idx_sessions_user_id`, `idx_sessions_family_id`.

### 6.21 AuditLog (item 41)

**`audit_logs`**: `id (uuid, PK)`, `workspace_id (FK, nullable)` - null for platform-level events (e.g. login), `organization_id (FK, nullable)`, `actor_user_id (FK, nullable)` - null for system/automation-initiated events, `actor_type (enum: user, system, rule, api_key)`, `action (text, not null)` - e.g. `linked_account.connected`, `rule.updated`, `message.deleted`, `resource_type (text)`, `resource_id (uuid, nullable)`, `metadata (jsonb, nullable)` - before/after diff where relevant, `ip_address (inet, nullable)`, `created_at (timestamptz, not null)`.

Append-only by design: no `updated_at`, no `deleted_at`, and application code must never issue an `UPDATE` or `DELETE` against this table - enforced by a Postgres role-level `REVOKE UPDATE, DELETE` on the table for the application's database role, not just a convention (see Section 14 on RLS/role design). This is the strongest guarantee in the schema, deliberately, because an audit log that can be edited by the thing it's auditing is worthless.

Index: `idx_audit_logs_workspace_id_created_at`, `idx_audit_logs_actor_user_id_created_at`, `idx_audit_logs_resource_type_resource_id`.

### 6.22 Webhook & WebhookDelivery (item 42)

**`webhooks`** (outbound, for the Phase 18 public API / power-user integrations): `id (uuid, PK)`, `workspace_id (FK)`, `target_url (text, not null)`, `secret (text, not null)` - for HMAC signing of payloads, `subscribed_events (text[], not null)`, `is_enabled (boolean, default true)`, `created_at/updated_at/deleted_at`.

**`webhook_deliveries`**: `id (uuid, PK)`, `webhook_id (FK)`, `event_type (text)`, `payload (jsonb)`, `response_status (int, nullable)`, `attempt_count (int, default 0)`, `delivered_at (timestamptz, nullable)`, `next_retry_at (timestamptz, nullable)`, `created_at`. Append-only, mirrors the `rule_execution_logs` pattern - every delivery attempt is its own row when retried, not an overwrite, so the full retry history is inspectable (matches the UI Principle: "automations must be inspectable, not magical," extended here to webhooks).

Index: `idx_webhook_deliveries_webhook_id_created_at`, `idx_webhook_deliveries_next_retry_at` (for the retry sweep).

---

## 7. Soft Deletes (item 11, elaborated)

Every tenant-owned, user-meaningful table carries `deleted_at timestamptz nullable`. Convention:

- All application queries go through a repository/Prisma middleware layer that automatically appends `WHERE deleted_at IS NULL` (Section 47) - engineers cannot forget this per-query.
- A soft-deleted row is excluded from all normal reads but remains fully intact for: audit trail, GDPR "show me a deletion actually happened" proof, and a future "restore" feature (not in MVP scope, but the data model doesn't foreclose it).
- **Cascading soft deletes are orchestrated in application/service code, never via a DB trigger or `ON DELETE CASCADE`** - deleting a Conversation should soft-delete its Messages, but doing this via a blind cascade risks silently taking down far more than intended as the schema grows relationships over time. An explicit service method that soft-deletes a Conversation and its Messages in one transaction is auditable and reviewable in a way a schema-level cascade trigger is not.
- Tables that do NOT get soft deletes: `audit_logs`, `rule_execution_logs`, `webhook_deliveries`, `message_state_events`, `ai_credit_ledger` (all append-only by design, per their own sections above - a "soft delete" on an audit trail is a contradiction in terms).
- True hard deletion exists only in the GDPR erasure workflow (Section 15) and in scheduled hard-purge jobs for data past its soft-delete retention window (e.g. permanently purging rows soft-deleted more than 90 days ago, for storage cost reasons) - never as an ad hoc application code path.

---

## 8. Audit Logging Strategy (item 41, elaborated)

Two distinct layers, not one, because they serve different consumers:

1. **`audit_logs`** (Section 6.21) - human-facing, coarse-grained, "what happened and who did it." Consumed by the Business-tier audit log UI (ROADMAP.md Phase 16) and compliance exports (Phase 17).
2. **Domain-specific append-only logs** (`rule_execution_logs`, `webhook_deliveries`, `message_state_events`) - fine-grained, system-facing, built for debugging and inspectability of a specific subsystem, not for a general "who did what" narrative.

Writing both from the same event would be redundant noise in `audit_logs` (nobody wants "Rule X evaluated" as a line item next to "User Y changed their password"); keeping them separate lets each serve its actual audience with the right level of detail. `audit_logs` entries ARE created, however, for actions a human took that affected automation (creating/editing/deleting a Rule) - the distinction is "did a human make a decision" (goes to `audit_logs`) vs. "did the system execute something" (goes to the domain log).

---

## 9. Optimistic Locking (item 13, consolidated)

Applied specifically where **concurrent human edits to the same row are a realistic scenario with a real cost if lost silently**:

- `rules.version` (Section 6.12) - two admins editing one rule.
- `subscriptions` - a billing webhook and an admin-initiated plan change could race; a version check prevents a stale webhook payload from clobbering a newer admin action.
- `linked_accounts.status`-adjacent updates are NOT version-locked - a connector worker updating sync status is a single-writer-per-account situation by construction (only one worker owns a given LinkedAccount's sync at a time), so the coordination problem optimistic locking solves doesn't exist there; adding it would be unjustified complexity.

**Why not apply it everywhere reflexively**: optimistic locking adds a retry-on-conflict burden to every write path it touches. Applying it to tables with no realistic concurrent-write scenario (e.g. `messages`, which are only ever written once by the ingesting connector and never concurrently edited by two humans) would add engineering overhead for a race condition that cannot occur given the actual write patterns.

---

## 10. Row Level Security Compatibility (item 14)

RLS is **not turned on in Postgres at MVP** - application-layer tenant scoping (every query mediated through a repository layer that injects `workspace_id`) is the enforced boundary initially, because turning on RLS from day one adds real operational complexity (policy maintenance, `SET LOCAL` session variable plumbing through the connection pool, policy performance tuning) that isn't justified before there's a compliance or enterprise-tier reason to need defense-in-depth beyond application logic.

The schema is designed so RLS can be enabled later **without restructuring**, which is the actual point of listing it as a requirement now:
- Every tenant-owned table has a non-nullable `workspace_id` column, directly on the table (not requiring a join to determine tenancy) - RLS policies need this to be a direct column for reasonable performance.
- Naming is consistent (`workspace_id`, never `tenant_id` in one place and `workspace_id` in another) so a single policy template applies uniformly.
- The application's Postgres role is already distinct from an eventual "superuser/migration" role (Section 21), which is a prerequisite for RLS to mean anything (RLS is bypassed by table owners/superusers by default).

**When RLS actually gets turned on** (Phase 17, Enterprise): specifically for enterprise customers who require defense-in-depth beyond "we promise the application code is correct" as part of a security review or compliance requirement. At that point, `SET LOCAL app.current_workspace_id` per request plus a policy of `USING (workspace_id = current_setting('app.current_workspace_id')::uuid)` on each tenant table becomes the enforcement mechanism, layered underneath, not instead of, the existing application-layer checks.

---

## 11. Cascading Rules (item 13, elaborated)

General policy, deliberately conservative:

- **Foreign keys default to `ON DELETE RESTRICT`**, not `CASCADE`. A hard delete that would orphan or cascade-destroy related rows should fail loudly and force a deliberate decision, not happen implicitly as a side effect of deleting something else. This is a direct consequence of Section 1's philosophy #2 (nothing important is silently lost).
- The specific, deliberate exceptions to RESTRICT:
  - `message_attachments` → `messages`: `ON DELETE CASCADE` (the join row, not the Attachment itself - see Section 6.10).
  - `message_tags` → `messages`: `ON DELETE CASCADE` (the join row).
  - `conversation_participants` → `conversations`: `ON DELETE CASCADE` (the join row).
  - `sessions` → `users`: `ON DELETE CASCADE` (a deleted user's sessions are meaningless on their own).
  - `contact_identities` → `contacts`: `ON DELETE CASCADE` (an identity mapping with no Contact to map to is meaningless).
- All other relationships (Message→Conversation, Rule→Workspace, LinkedAccount→Workspace, etc.) are `RESTRICT`, meaning the *hard*-delete path is intentionally hard to trigger - normal product behavior always goes through soft delete (Section 7), and hard deletes are reserved for the explicit, audited GDPR erasure workflow (Section 15) or scheduled purge jobs that are themselves written to respect dependency order explicitly, not rely on cascade to do it for them.

---

## 12. Partitioning Strategy (item 14)

**Not implemented at MVP.** Designed for, not built - implementing physical partitioning before it's needed adds operational overhead (partition creation/maintenance jobs, constraint exclusion planning, more complex backup/restore) with no benefit at low-millions row counts, which is where this product realistically sits through Phase 9-12 of the roadmap.

**The design decision made now that enables it later, without a painful migration:**
- `messages` (and `message_state_events`, `notifications`, `rule_execution_logs`, `audit_logs`, `webhook_deliveries` - all the high-volume, time-ordered, append-heavy tables) always carry both a `workspace_id` and a clear time column (`received_at`/`created_at`/`occurred_at`), and their primary keys are UUIDv7 (Section 3), which are themselves roughly time-ordered.
- **When partitioning is actually implemented** (realistic trigger: `messages` crossing roughly 100-200 million rows, or query latency on the time-ordered indexes measurably degrading): the recommended strategy is **range partitioning by month on the time column** for `messages`, `message_state_events`, `notifications`, and `audit_logs`, since the dominant access pattern for all of them is "recent data, ordered by time" (the unified inbox, the Morning Briefing, the audit log UI) - old partitions become cheap to archive or drop from hot storage (Section 13) as a side effect of the same partitioning scheme.
- **Why not partition by `workspace_id` (tenant) instead of time**: at this product's realistic scale, no single workspace is expected to produce a meaningfully disproportionate share of message volume the way, say, a multi-tenant analytics product might - the skew that makes tenant-partitioning valuable elsewhere isn't present here. Time-based partitioning also aligns naturally with the archiving strategy (Section 13), giving one scheme that serves two purposes.
- This is documented here specifically so that a future migration doesn't have to first solve "how do we even add a partition key retroactively to a table with a billion rows" - the columns needed already exist, by design, from day one.

---

## 13. Archiving Strategy (item 15)

Three tiers, distinct from soft-delete (Section 7), which is about *undo safety*, not storage cost:

1. **Hot** (default): all data in the primary Postgres tables, fully queryable, no special handling. This covers the first N months of a workspace's data (exact window TBD by usage data, not guessed at now).
2. **Warm**: `raw_payload` on old Messages (beyond, e.g., 12 months) is moved out of the row into cold object storage (S3, same bucket family as Attachments) and replaced with a pointer, while `body_text`/`body_rich`/metadata stay in Postgres for search and display - this is the single biggest storage-cost lever in the schema, since `raw_payload` is by far the largest column on the highest-volume table, and old raw payloads are read extremely rarely (debugging a very old issue) compared to the message content itself.
3. **Cold**: partitions (once implemented, Section 12) older than a configurable retention window (workspace-configurable, respecting GDPR minimum/maximum constraints, Section 15) are detached and moved to cheaper storage or dropped, per the workspace's own retention setting.

None of tier 2/3 is built at MVP; tier 1 is the whole of MVP. This section exists so the schema (specifically, the `raw_payload jsonb` design and the time-column discipline from Section 12) doesn't have to be redesigned when tiering becomes a real cost concern.

---

## 14. Search Strategy & Full-Text Search (items 16-17)

**MVP**: Postgres native full-text search (`tsvector`/`tsquery`) via a generated/maintained `search_vector` column on `messages` (and optionally `contacts.display_name`), combining `body_text` with sender name and conversation title, indexed with a GIN index. This is genuinely sufficient at MVP scale and avoids standing up a separate search infrastructure (Elasticsearch/Meilisearch/etc.) before it's proven necessary - **why not reach for a dedicated search engine immediately**: it's another stateful service to operate, back up, and keep in sync with Postgres as the source of truth, and Postgres FTS covers the "keyword search across my messages" use case (PRODUCT.md problems #51-60) adequately for the realistic MVP corpus size per workspace.

**When a dedicated search engine becomes justified**: cross-workspace search volume/complexity growing beyond what Postgres FTS handles well (multi-field ranking, typo tolerance, faceted filtering at real scale) - a realistic Phase 12-ish trigger, not before.

**Semantic search (AI-optional, PRODUCT.md/ROADMAP.md Phase 13)**: requires a vector representation of message content. Recommended approach: `pgvector` extension on Postgres for an `message_embeddings` table (`id`, `message_id FK`, `embedding vector(N)`, `model_version text`) rather than a separate vector database - keeps embeddings co-located with the data they index, avoids yet another synced datastore, and `pgvector` is mature enough by 2026 to handle this product's realistic embedding volume. This table is explicitly additive and optional: if AI/semantic search is disabled for a workspace, this table simply has no rows for it, with zero impact on keyword search or any other feature (directly enforcing PRODUCT.md's "AI never load-bearing" rule at the schema level).

---

## 15. GDPR Compliance (elaborated across several items)

- **Right to erasure**: a formal `data_erasure_requests` table (`id`, `organization_id`, `requested_by`, `status: pending/processing/completed`, `requested_at`, `completed_at`) drives a deliberate, application-orchestrated hard-delete workflow across every table holding that user's/workspace's PII - never an ad hoc manual `DELETE`. This workflow is itself logged to `audit_logs` (the one case where hard deletion is expected and the audit log records that it happened, not what was deleted, since the content is gone by design).
- **Right to access/portability**: served by the same export capability described in PRODUCT.md's "one-click export" solution (#60) - a workspace/user data export job that walks the same table set the erasure workflow does, but writes out instead of deleting.
- **Data minimization**: `raw_payload` redaction at write time (Section 6.8), and `credentials_ref`/payment-instrument exclusion from Postgres entirely (Sections 6.5, 6.16) are both GDPR-motivated as much as security-motivated - less true PII at rest is less exposure, period.
- **Retention limits**: `workspace_id`-scoped retention settings (a `Setting` row, Section 6.18, or a dedicated `data_retention_policies` table once Phase 17 needs it) define how long data is kept before automatic purge - this is what the archiving strategy's "cold" tier (Section 13) ultimately enforces, not just cost, but compliance.
- **Consent and processing records**: out of schema scope for this document - tracked at the application/legal layer, referenced here only as a dependency the schema doesn't block.

---

## 16. Event Sourcing Considerations (item 43)

**Decision: not adopted as the primary persistence model.** Full event sourcing (rebuilding all state by replaying an immutable event log) is deliberately rejected for the core domain (Messages, Conversations, Contacts) because:
- The actual product requirements (audit trail, debuggability, "what happened and why") are already met by the targeted append-only logs already in this schema (`rule_execution_logs`, `message_state_events`, `audit_logs`, `webhook_deliveries`) without paying full-ES costs (replay complexity, snapshotting strategy, eventual consistency reasoning everywhere, a much steeper learning curve for every future engineer touching this codebase).
- A messaging product's core entities (a Message, once received, essentially never changes - it has a status lifecycle but not complex mutable state) don't have the kind of rich, replay-valuable state history that makes ES earn its complexity in domains like finance or inventory management.

**Where event-sourcing-like patterns ARE used, deliberately, narrowly**: `message_state_events` and `rule_execution_logs` are, in effect, small-scoped, single-purpose event logs bolted onto an otherwise normalized model - this is the pragmatic middle ground: get the auditability/replay benefit exactly where it's valuable (delivery status history, automation execution history), without adopting ES as an architecture-wide commitment.

---

## 17. Read Model Considerations (item 44)

The schema is **normalized-first with deliberate, narrow denormalization for known-hot query paths**, not a full CQRS split with separate read/write databases at MVP (ARCHITECTURE.md flags CQRS as "where useful," and this is exactly the calibration):

- `conversations.last_message_at` (Section 6.7) - denormalized to avoid a correlated subquery on every inbox load.
- `linked_accounts.status`/`last_synced_at` - denormalized connection health, avoiding a join to a separate health-check log for the common "is this account OK" check.
- `ai_credit_ledger.balance_after` - denormalized running balance (Section 6.15).
- `organizations.plan_tier` - denormalized cache of the current billing plan (Section 6.1), avoiding a join to `subscriptions` for every plan-gated feature check, which happens on nearly every request.

**Where a genuine separate read model becomes justified**: the "Needs You" / Morning Briefing aggregation (PRODUCT.md's most important UI surface) may eventually warrant a materialized, precomputed table (`inbox_read_model` - one row per conversation per user, precomputed priority/unread state) updated by the same event pipeline that writes Messages, rather than computed live on every page load - this is a Phase 9 (Smart Inbox) implementation decision, not an MVP one, and the schema above doesn't block adding it: it would consume the same `messages`/`conversations`/`rules` tables as input, as an additive projection, not a replacement.

---

## 18. Scalability Bottlenecks (item 45, anticipated)

Named explicitly now so they're monitored for, not discovered in an incident:

1. **`messages` table write volume** - the highest-write-rate table by far, especially once high-traffic connectors (Discord communities, busy Slack workspaces) are live. Mitigated by: UUIDv7 index locality (Section 3), the partitioning path (Section 12), and keeping the write path (connector worker → Message insert) free of synchronous side-effect work (automation evaluation is async, per ARCHITECTURE.md's event flow, not part of the same transaction).
2. **`contact_identities` lookup on every inbound message** - this table is read on the hot path of every single ingestion (Section 6.6). Mitigated by the dedicated index and by keeping this table narrow (few columns, small row size) so it stays cache-resident even at large row counts.
3. **`notifications` unread-count queries** - mitigated by the partial index (Section 6.14), but at very large scale this is a strong candidate for the materialized read-model treatment described in Section 17.
4. **`audit_logs` unbounded growth** - append-only, never soft-deleted, genuinely grows forever for a workspace. Mitigated by the same partitioning/archiving path (Sections 12-13) applied to it specifically, likely earlier in the product's life than `messages` partitioning, since audit logs have a lower value-per-byte for staying in hot storage than message content does.
5. **Single Postgres primary as a write bottleneck** - the single-instance-plus-read-replicas approach (Section 1) has a ceiling; the schema's tenant-scoping discipline (`workspace_id` everywhere, Section 4/10) is specifically what makes a future move to per-tenant or sharded-by-workspace Postgres (e.g. Citus, or logical sharding) tractable *if* it's ever needed - most SaaS products at this scale never actually need it, so it is explicitly a Section 46 "if needed" path, not a roadmap commitment.

---

## 19. Future Migration Strategy (item 46)

- **Zero-downtime migrations**: expand/contract pattern (ARCHITECTURE.md section 8) - every schema change ships as (1) an additive, backward-compatible migration (new nullable column, new table) deployed and let run against both old and new application code, then (2) a follow-up migration that drops/tightens once the old code path is fully retired. Never a single migration that both adds and requires a column in the same deploy.
- **Adding a new Provider**: a data insert into `providers`, not a schema migration - the entire point of Section 6.4's lookup-table design.
- **Adding a new Rule trigger/condition/action type**: an application-layer JSON Schema version bump, not a schema migration - the entire point of Section 6.12's `jsonb` design.
- **Tenant-to-region migration** (a realistic future enterprise ask - "keep our data in the EU"): the strict `workspace_id` scoping (Section 4) combined with no cross-workspace foreign keys anywhere in this schema (verified deliberately - every FK either points within the same workspace's data or to a genuinely global table like `providers`) means a single workspace's entire dataset is extractable and re-insertable as a unit, which is the actual prerequisite for this kind of migration ever being feasible.
- **Splitting the monolith database later** (if a specific subsystem, e.g. billing, ever needs its own datastore): the deliberate boundary-keeping in this schema (billing tables reference `organization_id`, never reach into `messages`/`conversations` internals) means that boundary already exists logically and a physical split would follow existing seams, not require redrawing them.

---

## 20. Prisma Schema Recommendations (item 47)

No Prisma model code here (out of scope per instructions), but the conventions the eventual `schema.prisma` must follow, given everything above:

- **One `schema.prisma`, multiple `@@map`/`@map` directives** to keep Prisma's camelCase model/field convention on the application side while the actual database stays `snake_case` (Section 2) - do not let ORM convenience dictate database naming.
- **A Prisma Client extension (or middleware) enforcing soft-delete filtering globally** - every `findMany`/`findFirst`/`findUnique` call is intercepted to inject `deleted_at: null` unless explicitly overridden (e.g. an admin "show deleted" view) - this is what makes Section 7's "engineers cannot forget this per-query" claim actually true in practice, not just policy.
- **A Prisma Client extension enforcing `workspace_id` scoping** wherever request context provides one - the application-layer equivalent of Section 10's RLS-readiness, active from day one even before real RLS exists.
- **Optimistic locking (`rules.version`, `subscriptions.version`) implemented via an explicit `updateMany({ where: { id, version }, data: { version: { increment: 1 }, ...} })` pattern**, checking the resulting count, rather than relying on any implicit Prisma feature - Prisma does not have built-in optimistic locking, so this must be a deliberate repository-layer pattern, documented once and reused, not reinvented per feature.
- **Separate Prisma schema "namespacing" by domain via multi-file schema (Prisma's `prismaSchemaFolder` preview/stable feature) once the schema grows past ~15-20 models** - splitting `schema/auth.prisma`, `schema/messaging.prisma`, `schema/billing.prisma`, etc. for reviewability, matching the feature-based module structure already established in ARCHITECTURE.md's folder layout, rather than one unmanageable single file.
- **Migrations are reviewed for lock behavior before merge** - any migration that would take a long-held lock on `messages` or another high-traffic table (e.g. adding a `NOT NULL` column without a safe default, or an index build without `CONCURRENTLY`) is treated as a deploy-blocking review finding, not a routine change - this is a process recommendation, not a schema one, but it's a direct consequence of taking Section 18's bottleneck table seriously.

---

## 21. Database Roles & Privilege Separation (supporting Section 10 and Section 6.21)

Not explicitly requested as a numbered item, but required for several of the above to be true rather than aspirational:

- **`smc_app` role**: used by the running application (API, connector workers). Has full CRUD on tenant tables, but explicitly `REVOKE UPDATE, DELETE` on `audit_logs`, `rule_execution_logs`, `webhook_deliveries`, `message_state_events`, `ai_credit_ledger` - append-only really means append-only, enforced by Postgres grants, not just application discipline.
- **`smc_migrate` role**: used only by the CI/CD migration job (ARCHITECTURE.md section 8's pre-deploy migration Job), has DDL privileges the app role does not.
- **`smc_readonly` role**: for analytics/BI tooling and read replicas, no write privileges at all - ensures a reporting dashboard bug can never mutate production data.

This separation is what makes Section 6.21's "the strongest guarantee in the schema" claim enforceable rather than a comment in the codebase that someone could bypass.

---

## Coverage Map

Cross-reference of every requirement number from the brief to where it's addressed, so nothing is silently dropped.

| # | Requirement | Section |
|---|---|---|
| 1 | ER Diagram | 5 |
| 2 | Database philosophy | 1 |
| 3 | Naming conventions | 2 |
| 4 | Every table | 6 (all subsections) |
| 5 | Every column | 6 (all subsections) |
| 6 | Data types | 6 (all subsections) |
| 7 | Constraints | 6, 7, 9, 11 |
| 8 | Primary Keys | 3, 6 |
| 9 | Foreign Keys | 6, 11 |
| 10 | Indexes | 6 (per entity) |
| 11 | Composite indexes | 6.7, 6.8, 6.14, 6.17 |
| 12 | Unique constraints | 6 (per entity) |
| 13 | Cascading rules | 11 |
| 14 | Partitioning strategy | 12 |
| 15 | Archiving strategy | 13 |
| 16 | Search strategy | 14 |
| 17 | Full-text search | 14 |
| 18 | Message storage strategy | 6.8 |
| 19 | Attachments | 6.10 |
| 20 | Contacts | 6.6 |
| 21 | Providers | 6.4 |
| 22 | Connector accounts | 6.5 |
| 23 | Conversations | 6.7 |
| 24 | Conversation participants | 6.7 |
| 25 | Messages | 6.8 |
| 26 | Message states | 6.9 |
| 27 | Notifications | 6.14 |
| 28 | Automation rules | 6.12 |
| 29 | Automation executions | 6.12 |
| 30 | Scheduled jobs | 6.13 |
| 31 | AI summaries | 6.15 |
| 32 | AI credits | 6.15 |
| 33 | Organizations | 6.1 |
| 34 | Workspaces | 6.2 |
| 35 | Billing | 6.16 |
| 36 | Subscriptions | 6.16 |
| 37 | Feature flags | 6.17 |
| 38 | Settings | 6.18 |
| 39 | API keys | 6.19 |
| 40 | Sessions | 6.20 |
| 41 | Audit logs | 6.21, 8 |
| 42 | Webhooks | 6.22 |
| 43 | Event sourcing considerations | 16 |
| 44 | Read model considerations | 17 |
| 45 | Scalability bottlenecks | 18 |
| 46 | Future migration strategy | 19 |
| 47 | Prisma schema recommendations | 20 |
| 48 | Explain WHY every design decision exists | throughout (every "Why" callout) |

Plus explicit requirement coverage: UUID everywhere (3), multi-tenant ready (4, 10), soft deletes (7), audit logging (8, 6.21), optimistic locking (9), RLS compatibility (10), GDPR compliant (15), future enterprise support (4, 10, 17, 19, 21).
