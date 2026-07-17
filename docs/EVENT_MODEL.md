# Smart Message Center - EVENT_MODEL.md

```yaml
Title: EVENT_MODEL.md
Version: 1.0
Status: Approved
Owner: Architecture
Last Updated: 2026-07-18
Depends On:
  - ARCHITECTURE.md
  - DATABASE.md
  - API.md
  - CONNECTOR_SDK.md
  - AUTOMATION_ENGINE.md
Related ADRs:
  - ADR-0005
```

The entire system is event-driven (ADR-0005). This document is the canonical registry of every event that flows through it - the internal bus, the outbound webhook system, and the audit-log naming all draw from this one vocabulary (`API.md` Section 14.1 established the naming convention; this document is where every event that convention applies to is actually enumerated and specified). Gates Phase 1 alongside `CONNECTOR_SDK.md`: `packages/shared`'s canonical types and `packages/database`'s schema are built against these event contracts existing and being stable, not discovered ad hoc as each feature is implemented.

---

## 1. Why One Event Model, Not Per-Consumer Payloads

Without a single, versioned event registry, every consumer (`Inbox Projector`, `Automation Engine`, `Notification Service`, outbound `Webhooks`, `Audit Log`) would end up interpreting a slightly different shape for "a message arrived," and the mapping between them would drift silently over time - exactly the kind of inconsistency `AUTOMATION_ENGINE.md` Section 6 warned against for the Context Object. This document makes the event *itself* the shared contract: every consumer reads the same envelope and payload shape for a given event type, whether it's driving a UI update, a rule evaluation, a push notification, or a third-party webhook delivery.

---

## 2. The Event Envelope

Every event, regardless of type, shares one envelope:

| Field | Type | Description |
|---|---|---|
| `eventId` | UUIDv7 | Globally unique, time-ordered (matching ADR-0007's rationale applied here: consumers can sort/dedupe efficiently) |
| `type` | string | `{resource}.{past_tense_verb}`, e.g. `message.received` (Section 6's naming convention) |
| `version` | integer | The payload schema version for this event *type* (independent of the API's major version, ADR-0006) - allows one event type's payload to evolve without touching unrelated events |
| `occurredAt` | timestamptz | When the underlying real-world thing happened (not when the event was published - see `producedAt` below for that) |
| `producedAt` | timestamptz | When this event was actually emitted onto the bus - distinct from `occurredAt` because ingestion lag (a reconciliation-sync-recovered message, `CONNECTOR_SDK.md` Section 8.3) means these can differ meaningfully, and consumers that care about "how stale is this" need both |
| `producer` | string | The service/worker that emitted it (e.g. `connector-worker:telegram`, `automation-engine`, `api`) |
| `workspaceId` | UUID, nullable | Tenant scope; null only for platform-level events with no single workspace owner (rare - e.g. a `provider.disabled` platform-wide kill switch event) |
| `correlationId` | UUID | Ties together every event in one causal chain (a `message.received` that leads to a `rule.triggered` that leads to a `notification.created` all share one `correlationId`) - what lets `AUTOMATION_ENGINE.md` Section 14.4's debugger reconstruct "this happened because of that" across event boundaries, not just within one rule's execution |
| `causationId` | UUID, nullable | The specific `eventId` that *directly* produced this event (narrower than `correlationId`, which can span a long chain) - null for the first event in a chain |
| `payload` | object | Type-specific data, per Section 6's catalog |

**Why both `correlationId` and `causationId`**: `correlationId` answers "show me everything that happened as a result of this one trigger, in one place" (the debugger's primary view); `causationId` answers "what exactly, one step back, caused this specific event" (rebuilding the precise causal graph, not just a flat list) - both are needed because a chain can branch (one `message.received` triggering three separate rules, each producing its own downstream events that share the same `correlationId` but have different immediate `causationId`s).

---

## 3. Ordering Guarantees

- **Per-aggregate ordering only, never a global total order.** Events sharing an aggregate key (a specific `conversationId`, a specific `ruleId`, a specific `linkedAccountId`) are delivered to a given consumer in the order they were produced. Events across *different* aggregates carry **no ordering guarantee relative to each other** - a `message.received` for Conversation A and a `message.received` for Conversation B may be processed in either order, concurrently, or interleaved.
- **Why this is the right guarantee, not a limitation to work around**: a global total order across every workspace's every event would require a single serialization point, directly contradicting `ARCHITECTURE.md` ADR-0005's entire reason for being event-driven (independent, parallel, failure-isolated processing). Per-aggregate ordering is the guarantee that's actually load-bearing for correctness (a conversation's messages must process in order; two unrelated conversations processing out of order relative to each other is never a correctness bug) and it's what `DATABASE.md` Section 6.9's append-only `message_state_events` design already assumes (ordered *within* a message's lifecycle, not ordered *across* unrelated messages).
- **Consumers must never assume cross-aggregate ordering** - a consumer that needs "all of today's messages across the whole workspace, strictly in arrival order" is building a read model (`API.md` Section 17-style), not relying on the bus's raw ordering guarantee; it sorts by `occurredAt`/`eventId` (UUIDv7's time-ordering, Section 2) at query time instead.

---

## 4. Idempotency

- Every event's `eventId` is the deduplication key. **Producers guarantee at-least-once delivery, never exactly-once** - this is a deliberate, standard distributed-systems tradeoff (exactly-once delivery is either impossible or prohibitively expensive to guarantee generally), and every consumer is required to be idempotent on `eventId`, matching `ARCHITECTURE.md`'s event-flow design and `AUTOMATION_ENGINE.md` Section 10's execution-engine idempotency guarantee, generalized here to every consumer, not just the Automation Engine.
- For events representing a canonical domain entity's creation (`message.received`, `contact.created`), idempotency is enforceable at two layers: the event's `eventId` (bus-level dedup) and the underlying entity's natural key (`DATABASE.md`'s `(conversation_id, external_id)` uniqueness for Messages, Section 6.8) - belt-and-suspenders, since a producer bug that generates two different `eventId`s for the same underlying message would still be caught by the database-level constraint.

---

## 5. Retry & Dead Letter Queue

- A consumer that fails to process an event retries per `API.md` Section 8's retry philosophy (exponential backoff, bounded attempts, retryable-vs-terminal error distinction) - the same discipline applied at the bus-consumer level that `CONNECTOR_SDK.md` Section 7 applies at the provider-API level and `AUTOMATION_ENGINE.md` Section 11 applies at the rule-action level. **This is one retry philosophy, applied consistently at every layer of the system**, not three separate ad hoc policies.
- Events that exhaust retry budget land in a **bus-level Dead Letter Queue**, distinct from (but structurally identical in spirit to) `AUTOMATION_ENGINE.md` Section 13's rule-execution DLQ - a `message.received` event that no consumer could successfully process (e.g. the Inbox Projector crashes repeatedly on a malformed payload) is just as important to surface and make replayable as a failed rule execution, since silently losing a message-lifecycle event is a direct violation of PRODUCT.md's core "never lose a message" trust promise.
- DLQ entries retain the full envelope and payload, are queryable per producer/type/workspace, and are replayable once the underlying issue is fixed - identical operational posture to `AUTOMATION_ENGINE.md` Section 13, deliberately, so operators learn one DLQ mental model that applies everywhere in the system.

---

## 6. Naming Convention & Versioning

- **Naming**: `{resource}.{past_tense_verb}` - restated from `API.md` Section 14.1, where it originated, because this document is the actual enumeration that convention governs. Past tense always: an event describes something that *happened*, never an imperative or a present-tense state.
- **Versioning**: `payload.version` increments only on a breaking change to that specific event type's payload shape (a field removed, renamed, or its meaning changed) - additive fields (a new optional field) do not bump the version, mirroring `API.md` Section 3's additive-evolution philosophy applied to event payloads instead of REST responses. A consumer declares which version(s) of a given event type it understands; the bus (or a thin translation layer) is responsible for either delivering the version a consumer expects or, where feasible, translating forward/backward - the same 12-month minimum deprecation window from `API.md` Section 3 applies before an old payload version stops being produced.
- **New event types are additive by nature** - registering a new type (e.g. a new connector's provider-specific event, `CONNECTOR_SDK.md` Section 5) never requires touching existing event types' contracts, which is what makes the event model itself a platform surface, not just an internal implementation detail.

---

## 7. The Event Catalog

Grouped by domain. `Ordering key` is the aggregate Section 3's per-aggregate ordering guarantee applies to. `Idempotency key` is the natural key used for dedup beyond `eventId` alone, where one exists.

### 7.1 Message Domain

| Event | Payload (key fields) | Producer | Consumers | Ordering key | Idempotency key | Retry |
|---|---|---|---|---|---|---|
| `message.received` | messageId, conversationId, senderId, bodyText, bodyFormat, attachments[], receivedAt | Connector worker | Inbox Projector, Automation Engine, Notification Service, Webhooks | conversationId | (conversationId, externalId) | Standard |
| `message.sent` | messageId, conversationId, status | Connector worker (on provider ack) | Inbox Projector, Webhooks | conversationId | messageId | Standard |
| `message.send_failed` | messageId, conversationId, errorTaxonomyCode (`CONNECTOR_SDK.md` Section 15) | Connector worker | Inbox Projector, Notification Service | conversationId | messageId | None (terminal by definition) |
| `message.edited` | messageId, conversationId, newBodyText, editedAt | Connector worker | Inbox Projector, Automation Engine, Webhooks | conversationId | (messageId, editedAt) | Standard |
| `message.deleted` | messageId, conversationId, deletedAt | Connector worker | Inbox Projector, Automation Engine, Webhooks | conversationId | messageId | Standard |
| `message.status_changed` | messageId, conversationId, status (queued/sent/delivered/read/failed), occurredAt | Connector worker | Inbox Projector, Notification Service | messageId | (messageId, status, occurredAt) | Standard |
| `message.reacted` | messageId, conversationId, reactorContactId, reaction | Connector worker | Inbox Projector, Automation Engine | conversationId | (messageId, reactorContactId, reaction) | Standard |

### 7.2 Conversation Domain

| Event | Payload | Producer | Consumers | Ordering key | Idempotency key | Retry |
|---|---|---|---|---|---|---|
| `conversation.created` | conversationId, linkedAccountId, type, title | Connector worker | Inbox Projector, Automation Engine | conversationId | (linkedAccountId, externalId) | Standard |
| `conversation.archived` | conversationId, archivedBy (user/rule) | API / Automation Engine | Inbox Projector | conversationId | conversationId+state | Standard |
| `conversation.reopened` | conversationId | API | Inbox Projector | conversationId | conversationId+state | Standard |
| `conversation.participant_added` | conversationId, contactId | Connector worker | Inbox Projector | conversationId | (conversationId, contactId) | Standard |
| `conversation.participant_removed` | conversationId, contactId | Connector worker | Inbox Projector | conversationId | (conversationId, contactId) | Standard |
| `conversation.became_stale` | conversationId, staleSinceDuration | Scheduler (via `scheduled_jobs`) | Automation Engine, Notification Service | conversationId | (conversationId, staleWindow) | Standard |

### 7.3 Contact & Identity Domain

| Event | Payload | Producer | Consumers | Ordering key | Idempotency key | Retry |
|---|---|---|---|---|---|---|
| `contact.created` | contactId, workspaceId | Identity resolution service | Inbox Projector | contactId | contactId | Standard |
| `contact.became_vip` | contactId, setBy (user/rule) | API / Automation Engine | Automation Engine, Notification Service | contactId | contactId+state | Standard |
| `contact.tagged` | contactId, tagId, appliedBy | API / Automation Engine | Automation Engine | contactId | (contactId, tagId) | Standard |
| `identity.merged` | primaryContactId, mergedContactId, mergedBy | API (user-confirmed, `CONNECTOR_SDK.md` Section 13) | Inbox Projector, Automation Engine | primaryContactId | (primaryContactId, mergedContactId) | Standard |
| `identity.conflict_detected` | contactCandidateIds[], confidence, provider | Identity resolution service | Notification Service (surfaces to user for confirmation) | workspaceId | signal hash | Standard |

### 7.4 Connector / LinkedAccount Domain

| Event | Payload | Producer | Consumers | Ordering key | Idempotency key | Retry |
|---|---|---|---|---|---|---|
| `connector.connected` | linkedAccountId, providerId | Connector worker | Inbox Projector, Webhooks, Audit Log | linkedAccountId | linkedAccountId+state | Standard |
| `connector.disconnected` | linkedAccountId, providerId | Connector worker / API | Inbox Projector, Webhooks, Audit Log | linkedAccountId | linkedAccountId+state | Standard |
| `connector.reauth_required` | linkedAccountId, reasonCode | Connector worker | Notification Service, Automation Engine (circuit breaker) | linkedAccountId | linkedAccountId+state | Standard |
| `connector.sync_started` | linkedAccountId, syncType (initial/reconciliation) | Connector worker | Inbox Projector (progress UI) | linkedAccountId | (linkedAccountId, syncRunId) | Standard |
| `connector.sync_completed` | linkedAccountId, syncType, itemsProcessed | Connector worker | Inbox Projector | linkedAccountId | (linkedAccountId, syncRunId) | Standard |
| `connector.health_degraded` | linkedAccountId, reasonCode | Connector worker | Automation Engine (circuit breaker), Notification Service | linkedAccountId | linkedAccountId+state | Standard |
| `connector.rate_limited` | linkedAccountId, retryAfterSeconds | Connector worker | (internal backoff coordination only) | linkedAccountId | n/a (transient signal) | N/A |

### 7.5 Rule / Automation Domain

| Event | Payload | Producer | Consumers | Ordering key | Idempotency key | Retry |
|---|---|---|---|---|---|---|
| `rule.created` | ruleId, workspaceId, createdBy | API | Audit Log | ruleId | ruleId+version | Standard |
| `rule.updated` | ruleId, version, updatedBy | API | Audit Log, Automation Engine (re-index) | ruleId | (ruleId, version) | Standard |
| `rule.published` | ruleId, version | API | Automation Engine (activates matching) | ruleId | (ruleId, version) | Standard |
| `rule.triggered` | ruleId, executionId, triggerEventId | Automation Engine | Automation Engine (internal), Analytics | ruleId | executionId | Standard |
| `rule.matched` | ruleId, executionId, matchedConditions | Automation Engine | Analytics, Debugger | ruleId | executionId | Standard |
| `rule.action_executed` | ruleId, executionId, actionIndex, result | Automation Engine | Debugger, Analytics | ruleId | (executionId, actionIndex) | Per `AUTOMATION_ENGINE.md` Section 11 |
| `rule.failed` | ruleId, executionId, failedActionIndex, errorDetail | Automation Engine | Notification Service (per Section 12's fallback/notify), Analytics | ruleId | executionId | Per `AUTOMATION_ENGINE.md` Section 11 |
| `rule.dead_lettered` | ruleId, executionId, reason | Automation Engine | Notification Service, DLQ store | ruleId | executionId | None (terminal) |

### 7.6 Notification Domain

| Event | Payload | Producer | Consumers | Ordering key | Idempotency key | Retry |
|---|---|---|---|---|---|---|
| `notification.created` | notificationId, userId, type, payload | Notification Service | Inbox Projector (WS push), Push delivery worker | userId | notificationId | Standard |
| `notification.delivered` | notificationId, channel (push/email/web) | Push delivery worker | Analytics | userId | (notificationId, channel) | Standard |
| `notification.read` | notificationId, readAt | API | Analytics | userId | notificationId+state | Standard |

### 7.7 Workspace & Organization Domain

| Event | Payload | Producer | Consumers | Ordering key | Idempotency key | Retry |
|---|---|---|---|---|---|---|
| `workspace.created` | workspaceId, organizationId | API | Audit Log, Billing | workspaceId | workspaceId | Standard |
| `workspace.member_invited` | workspaceId, invitedEmail, invitedBy | API | Notification Service (email), Audit Log | workspaceId | (workspaceId, invitedEmail) | Standard |
| `workspace.member_joined` | workspaceId, userId | API | Audit Log | workspaceId | (workspaceId, userId) | Standard |
| `workspace.member_removed` | workspaceId, userId, removedBy | API | Audit Log | workspaceId | (workspaceId, userId, removedAt) | Standard |
| `organization.plan_changed` | organizationId, oldPlan, newPlan | Billing webhook handler | Automation Engine (limit re-check), Audit Log | organizationId | (organizationId, newPlan, changedAt) | Standard |

### 7.8 Billing Domain

| Event | Payload | Producer | Consumers | Ordering key | Idempotency key | Retry |
|---|---|---|---|---|---|---|
| `subscription.updated` | subscriptionId, status | Billing webhook handler | Audit Log, Webhooks (outbound) | organizationId | (subscriptionId, updatedAt) | Standard |
| `invoice.paid` | invoiceId, amountCents | Billing webhook handler | Audit Log | organizationId | invoiceId | Standard |
| `ai_credits.consumed` | organizationId, amount, feature | AI service | Analytics | organizationId | ledgerEntryId | Standard |
| `ai_credits.low_balance` | organizationId, remaining | AI service | Notification Service | organizationId | (organizationId, thresholdCrossedAt) | Standard |

### 7.9 Webhook (Outbound Delivery) Domain

| Event | Payload | Producer | Consumers | Ordering key | Idempotency key | Retry |
|---|---|---|---|---|---|---|
| `webhook.delivery_attempted` | webhookId, deliveryId, attemptNumber | Webhook delivery worker | Analytics | webhookId | deliveryId+attemptNumber | N/A (this event records an attempt, not itself retried) |
| `webhook.delivery_succeeded` | webhookId, deliveryId, responseStatus | Webhook delivery worker | Analytics | webhookId | deliveryId | N/A |
| `webhook.delivery_failed` | webhookId, deliveryId, willRetry | Webhook delivery worker | Notification Service (if exhausted) | webhookId | deliveryId+attemptNumber | N/A |

---

## 8. Adding a New Event Type

1. Confirm it doesn't already exist under a different name (check Section 7 first - a duplicate concept under two names is exactly the drift this document exists to prevent).
2. Name it per Section 6's convention.
3. Define its full envelope + payload, ordering key, idempotency key, and retry behavior - added as a new row in the relevant Section 7 table, not a separate document.
4. If it's consumer-relevant externally (a plausible webhook subscription target, `API.md` Section 14.2), it's automatically eligible - no separate "promote to webhook" process, since Section 6 established one vocabulary serves both internal and external consumers by design.
5. If it originates from a new connector's provider-specific capability (`CONNECTOR_SDK.md` Section 5), it's namespaced under that provider where genuinely provider-specific (e.g. a Discord-only concept) rather than forced into a generic cross-provider event it doesn't really fit - the canonical Message/Conversation events (Section 7.1-7.2) remain the cross-provider baseline every connector maps into regardless.

---

## Coverage Map

| Requirement | Section |
|---|---|
| Event catalog (MessageReceived, MessageEdited, MessageDeleted, ConversationArchived, RuleTriggered, RuleFailed, NotificationSent, ConnectorConnected, ConnectorDisconnected, IdentityMerged, WorkspaceCreated, and more) | 7 |
| Payload | 7 (per event), 2 (envelope) |
| Version | 2, 6 |
| Producer | 7 (per event) |
| Consumers | 7 (per event) |
| Ordering | 3 |
| Idempotency | 4 |
| Retry | 5 |
| Event naming | 6 |
