# Smart Message Center - CONNECTOR_SDK.md

```yaml
Title: CONNECTOR_SDK.md
Version: 1.0
Status: Approved
Owner: Architecture
Last Updated: 2026-07-18
Depends On:
  - ARCHITECTURE.md
  - DATABASE.md
  - API.md
  - SECURITY.md
Related ADRs:
  - ADR-0004
  - ADR-0010
```

This is the contract every messaging provider integration conforms to - our own Telegram/Discord/Slack/Email connectors (ROADMAP.md Phase 5-8) first, and eventually third-party connectors (Phase 18 marketplace) built by people who have never spoken to us. **When someone says "I'll write a Signal connector," this document is what they read, and conformance to it is the only thing that matters** - not familiarity with our internal codebase. Gates Phase 1: the core domain model (`apps/api`, `packages/database`, `packages/shared`) is built against the assumption that this contract exists and is stable, so it is finalized before that code is written, not discovered partway through.

---

## 1. Why This Document Gates Phase 1

`AUTOMATION_ENGINE.md` argued the Context Object - the unified, provider-agnostic view of a message, a conversation, a contact - is the product's actual moat. **That object is only as trustworthy as the connectors that populate it.** A connector that normalizes Telegram messages slightly differently than Discord messages (a missing `sentAt`, an inconsistent attachment shape, a silently-dropped edit event) doesn't just produce a bug in one integration - it corrupts the one thing every rule, every priority score, and every cross-channel search depends on being uniform. `ARCHITECTURE.md`'s Connector SDK (ADR-0004) was named as the highest-leverage, hardest-to-retrofit piece of the system for exactly this reason. This document is where that abstraction stops being a diagram and becomes a testable contract - Section 17's certification checklist and mock connector are what make "conforms to the SDK" a verifiable claim, not a promise.

---

## 2. Connector Lifecycle

A connector instance (a `LinkedAccount`, `DATABASE.md` Section 6.5) moves through a defined state machine. Every state is visible to the user (per `API.md` Section 10.5's health endpoint) - there is no internal-only state a user's account can be stuck in without a corresponding UI signal.

| State | Meaning | Entered from | Exits to |
|---|---|---|---|
| `registered` | The LinkedAccount row exists; connect flow started but not completed | (creation) | `authenticating` |
| `authenticating` | Auth flow in progress (Section 3) | `registered`, `reauth_required` | `syncing_initial`, `error` |
| `syncing_initial` | Initial backfill sync running (Section 8.1) | `authenticating` | `active`, `error` |
| `active` | Healthy, ingesting/sending normally | `syncing_initial`, `degraded`, `reauth_required` | `degraded`, `reauth_required`, `disconnecting` |
| `degraded` | Reachable but impaired (elevated error rate, rate-limited, partial capability loss) - not the same as down | `active` | `active` (recovered), `error`, `reauth_required` |
| `reauth_required` | Credential expired/revoked; connector paused, not destroyed | `active`, `degraded`, `authenticating` | `authenticating` (user reconnects), `disconnecting` |
| `error` | Unrecoverable-without-intervention failure distinct from a credential problem (e.g. provider account itself suspended) | `syncing_initial`, `active`, `degraded` | `disconnecting`, `authenticating` (retry) |
| `disconnecting` | User-initiated removal in progress (credential revocation, secret deletion per `SECURITY.md` Section 5.2) | `active`, `degraded`, `reauth_required`, `error` | `disconnected` |
| `disconnected` | Terminal. LinkedAccount soft-deleted (`DATABASE.md` Section 7); historical messages retained per workspace retention policy | `disconnecting` | (none - a new connection is a new LinkedAccount, never a resurrection of this one) |

**Why `degraded` is a distinct state from `error` or `reauth_required`**: a connector rate-limited by its provider, or experiencing an elevated-but-not-total error rate, is still doing useful work - collapsing this into a binary "up/down" would either hide a real, worsening problem (if merged into `active`) or trigger unnecessary user alarm and rule auto-disabling (if merged into `error`). `degraded` is what `AUTOMATION_ENGINE.md` Section 12's circuit-breaker and auto-disable logic actually watches for a sustained trend on, not a single blip.

Every state transition is an event on the internal bus (`EVENT_MODEL.md`'s Connector domain) and, where relevant, a webhook (`API.md` Section 14.1's `linked_account.*` naming).

---

## 3. Authentication Lifecycle

Providers authenticate in fundamentally different ways; the SDK does not force one shape onto all of them (matching `API.md` Section 10.5's `connectMethod` discriminator) but does standardize the lifecycle around any of them.

### 3.1 Auth Methods (discriminated, extensible)

| Method | Examples | Shape |
|---|---|---|
| `oauth2_redirect` | Discord, Slack, Gmail/Google Workspace | Standard authorization-code flow; connector declares required scopes; refresh token stored via `credentials_ref` (`SECURITY.md` Section 5) |
| `bot_token_entry` | Telegram (per ADR-0010, Bot API only) | User enters/generates a token in the provider's own UI, pastes it in; connector validates it against the provider's API before accepting |
| `credential_entry` | IMAP/SMTP | Host/port/username/password or app-password; connector validates via a real connection attempt before persisting |
| `session_qr` *(future)* | Providers whose only sanctioned integration path is a linked-device/QR session (evaluated case-by-case against `SECURITY.md`'s ToS-compliance bar before ever being adopted - never a default) | A session token tied to a linked device, with its own independent revocation path |

### 3.2 Lifecycle Stages

1. **Initiation** - the connector declares what it needs (scopes, fields) via its manifest (Section 5); the platform renders the appropriate UI without connector-specific frontend code, driven by the `connectMethod` discriminator.
2. **Validation** - before a credential is ever persisted (even to the secrets manager), the connector must make one real, minimal call to the provider to confirm the credential actually works (e.g. a Telegram `getMe` call) - a connector never accepts a credential on faith.
3. **Persistence** - on success, the credential goes directly to the secrets manager; only `credentials_ref` reaches Postgres (`SECURITY.md` Section 5.1) - the connector process itself never writes a raw credential to any log, database row, or error message (Section 15's error contract explicitly requires credential redaction in error payloads).
4. **Refresh** - for `oauth2_redirect`, the connector is responsible for proactive token refresh before expiry, using the standard refresh-token flow; a refresh failure transitions the LinkedAccount to `reauth_required`, never a silent retry-forever loop.
5. **Reauthorization** - the user re-runs Initiation; on success the *same* LinkedAccount row is updated (not a new one created) so conversation/message history stays attached to one continuous identity.
6. **Revocation** - on disconnect, the connector calls the provider's revocation endpoint where one exists (best-effort), and the secret is deleted from the secrets manager unconditionally regardless of that call's success (`SECURITY.md` Section 5.2's restated guarantee: our-side unusability is the guarantee, provider-side revocation is best-effort on top).

---

## 4. Ingestion Models: Webhook, Polling, and Hybrid

### 4.1 Webhook Connectors

The provider pushes events to us (Discord Gateway, Slack Events API, Telegram Bot webhook). Lowest latency, but **never assumed 100% reliable** - providers drop webhooks during their own incidents, and a connector that only listens will silently miss messages with no local signal that anything is wrong. This is why webhook-only is not a supported connector type on its own (Section 4.3).

### 4.2 Polling Connectors

The connector actively pulls for changes on an interval (IMAP without IDLE support, or any provider without a push mechanism). Polling connectors must be **cursor-based, never full-refetch** - each poll requests "everything since cursor X," and the cursor is checkpointed durably (Section 9) so a crash mid-poll resumes correctly rather than either reprocessing everything or silently skipping a window.

### 4.3 Hybrid Connectors (the required default for any provider offering webhooks)

**Every webhook-capable connector is required to also run a low-frequency reconciliation poll** (e.g. every 15-30 minutes, provider-rate-limit-budget-permitting) that fetches recent activity via the provider's own list/history endpoint and diffs it against what we've already ingested. This is the direct, structural answer to webhook unreliability: a missed webhook during a provider outage is caught and backfilled within one reconciliation cycle, not lost until a user notices a gap and files a support ticket. **This single requirement is why "hybrid" is the SDK's default posture, not an optional enhancement** - a connector submitted for certification (Section 17) without a reconciliation pass does not pass certification, regardless of how solid its webhook handling is on its own.

---

## 5. Capability Discovery & Feature Negotiation

No two providers support the same feature set (Telegram bots can't see read receipts the way iMessage can; Discord has reactions and threads, basic IMAP has neither). Rather than the core platform special-casing each provider, every connector publishes a **Capability Manifest** at registration time:

| Capability | Example values |
|---|---|
| `messageEditing` | supported / not supported |
| `messageDeletion` | supported / not supported (some providers only support "delete for me," never "delete for everyone" via bot) |
| `reactions` | supported / not supported |
| `threads` | supported / not supported |
| `readReceipts` | supported / not supported |
| `typingIndicators` | supported / not supported |
| `groupManagement` | can add/remove participants / read-only |
| `maxAttachmentSizeBytes` | provider-specific limit |
| `supportedAttachmentTypes` | image, video, document, voice, etc. |
| `rateLimits` | requests/second, burst allowance (Section 12) |

**Why this matters beyond documentation**: the UI (unified inbox) queries this manifest (extending `API.md`'s `GET /v1/providers` to include the manifest per provider) to decide what controls to render - a "react to this message" button never appears for a conversation on a provider that doesn't support reactions, rather than appearing and failing when clicked. The Automation Engine (`AUTOMATION_ENGINE.md` Section 5) similarly checks manifest capabilities before allowing an action type to be configured against a given provider's conversations - a rule author is prevented from building a rule that would silently no-op at execution time, at build time instead.

---

## 6. Health Monitoring

- Every connector worker emits a **heartbeat** on a fixed interval (independent of message volume - a quiet, healthy connector heartbeats identically to a busy one) - absence of a heartbeat past a grace window is itself a signal, distinct from an explicit error.
- Health status (`healthy` / `degraded` / `down`, mapped onto Section 2's lifecycle states) is computed from: heartbeat presence, recent error rate (Section 15's taxonomy), and reconciliation-sync drift (Section 4.3 - a growing gap between "last successful reconciliation" and "now" is a degradation signal even absent explicit errors).
- Surfaced via `API.md` Section 10.5's `GET /v1/linked-accounts/{id}/health` and, in aggregate, contributes to `AUTOMATION_ENGINE.md` Section 12's circuit-breaker logic for rules depending on a degraded connector.

---

## 7. Retry & Backoff

- **Every outbound call to a provider API** (send message, fetch history, revoke token) follows the same retry contract as `API.md` Section 8: exponential backoff with jitter, a bounded attempt count, and an explicit distinction between retryable errors (`5xx`, `429`, network timeout) and terminal errors (`401`/`403`-class auth failures, `404`-class "this chat no longer exists") - terminal errors go straight to the error contract (Section 15) without wasting retry budget.
- **Provider-declared backoff is authoritative when present**: a `Retry-After` header (or provider-specific rate-limit-reset field) overrides the connector's own default backoff calculation - respecting the provider's own signal is both correct behavior and part of the ToS-compliance posture ADR-0010 already commits to generally.
- Backoff state is per-`LinkedAccount`, not global per-connector-type - one workspace's Telegram bot being rate-limited never throttles another workspace's independent Telegram connection.

---

## 8. Sync Strategy

### 8.1 Initial Sync

On successful authentication (Section 3), a connector performs a **bounded backfill** - not unlimited history, which is unbounded cost and unbounded time-to-first-value. Default bound: the lesser of a time window (e.g. last 30 days) or a message count cap (e.g. last 500 messages per conversation), configurable per provider based on what its API realistically supports efficiently. Initial sync is:
- **Resumable**: progress checkpointed (Section 9) so a crash or restart mid-backfill continues from where it left off, never restarts from zero.
- **Non-blocking for the rest of the platform**: a LinkedAccount in `syncing_initial` (Section 2) does not block the user from using other, already-`active` connectors - initial sync is scoped to that one LinkedAccount's data becoming available, surfaced with visible progress (`API.md` Section 12's long-running-operation pattern, reused here).

### 8.2 Incremental Sync

Once `active`, new activity arrives primarily via webhook (Section 4.1) or poll cursor advancement (Section 4.2), with the reconciliation pass (Section 4.3) as the correctness backstop. Incremental sync never re-processes the full history - only the delta since the last checkpoint.

### 8.3 Reconciliation Sync

The hybrid pattern's periodic pass (Section 4.3): fetch recent activity, diff against what's already ingested (using the same `(conversation_id, external_id)` idempotent-insert pattern as normal ingestion, `DATABASE.md` Section 6.8), and backfill anything missing. Reconciliation is also what detects and ingests **edits and deletions** for providers where the webhook for those specific event types is less reliable than the webhook for new messages (a documented per-provider nuance, tracked in each connector's own implementation notes, not a platform-wide assumption).

---

## 9. Checkpointing & Offline Recovery

- Every sync operation (initial, incremental cursor, reconciliation) persists its progress as a durable checkpoint - reusing `DATABASE.md` Section 6.13's `scheduled_jobs`-adjacent durability pattern (a Postgres row, not just in-memory or Redis-only state) specifically so a connector worker crash or a full platform restart never loses sync position.
- **On worker restart**, a connector resumes every `LinkedAccount` it's responsible for from its last checkpoint, not from "now" - a connector worker down for an hour catches up on that hour's activity via the checkpoint-resumed incremental sync plus a reconciliation pass, rather than silently skipping the gap.
- This is the direct connector-layer counterpart to `ARCHITECTURE.md`'s event-bus idempotency guarantee - offline recovery is not a special case bolted on, it's the same checkpoint-and-resume discipline the SDK requires for every sync path applied to the "the worker was down" scenario specifically.

---

## 10. Conflict Resolution

- **Duplicate ingestion** (the same message arriving via both webhook and a reconciliation pass): resolved structurally by `DATABASE.md`'s unique constraint on `(conversation_id, external_id)` - the second insert is a safe no-op, never a duplicate row. Connectors are required to always populate `external_id` from the provider's own message identifier, never generate one locally, precisely so this dedup works.
- **Out-of-order delivery status** (a `read` receipt arriving before a `delivered` one, due to webhook delivery jitter): resolved by `DATABASE.md` Section 6.9's append-only `message_state_events` log - the current status is computed as "most recent by `occurred_at`," not "most recently received," so arrival order never corrupts the true state timeline.
- **Content conflicts** (a message was edited at the provider between our ingesting the original and processing a delayed edit event): the provider is always the source of truth for content - a connector never attempts local "merge" logic; the edit event simply replaces `body_text`/`body_rich`, with the prior version retained in the message's version history if the platform's editing UI requires undo/history (an application-layer concern, not a connector one).
- **Identity conflicts** (two different provider accounts that might be the same real person, but confidence is insufficient for automatic merge): never auto-merged silently - raised as an `identity.conflict_detected` event (`EVENT_MODEL.md`) for user confirmation, per Section 11's identity-mapping policy.

---

## 11. Message Normalization

Every connector's mapper (`ARCHITECTURE.md`'s `*.mapper.ts` convention) transforms a provider-native payload into the canonical `Message`/`Conversation`/`Contact` shape (`DATABASE.md` Section 6.6-6.9). The normalization contract:

- **Required fields** (a connector cannot register/pass certification without populating these correctly): `externalId`, `conversationExternalId`, `direction`, `bodyText` (plain-text extraction is mandatory even for rich-format providers, per `DATABASE.md` Section 6.8's search/AI-readiness rationale), `receivedAt`.
- **Best-effort fields**: `sentAt` (fall back to `receivedAt` if the provider doesn't distinguish), `bodyRich` (omit if the provider has no rich structure - never fabricate one), `senderContactId` (resolved via Section 12's identity mapping; null is valid for outbound messages).
- **Provider-specific extensions**: anything not covered by the canonical shape is preserved in `rawPayload` (`DATABASE.md` Section 6.8), subject to the same at-ingestion redaction policy `SECURITY.md` already specifies - a connector never invents new top-level canonical fields to accommodate provider-specific data; it goes in the extension payload, keeping the canonical model genuinely canonical across all providers.
- **Normalization is a pure function, tested in isolation**: given a fixed provider payload fixture, a mapper must produce a fixed, deterministic canonical output - this determinism is what the mock connector's conformance suite (Section 18) actually verifies.

---

## 12. Attachment Abstraction

- A connector never hands raw provider media bytes directly to the core platform inline - it downloads from the provider, uploads to our object storage via the same pre-signed-URL flow the API exposes to clients (`API.md` Section 13), and produces a canonical `Attachment` record (`DATABASE.md` Section 6.10) referencing our storage, not the provider's.
- **Why route through our storage rather than just storing the provider's own media URL**: provider media URLs commonly expire, require the original credential to access, or disappear if the source message/account is later deleted - none of which are acceptable for a product whose core promise is durable, searchable message history. Attachment durability is not delegated to the provider.
- Large attachments are streamed (download-then-upload without full in-memory buffering) - a connector holding an entire large video file in worker memory is a certification failure (Section 17), not just a performance nitpick, given `DATABASE.md` Section 18's write-volume bottleneck concerns apply equally to worker memory pressure at scale.
- Content-type mapping is normalized against the platform's own attachment-type taxonomy (image/video/document/voice/other) regardless of the provider's native categorization scheme, so cross-provider automation conditions (`AUTOMATION_ENGINE.md` Section 4.2's `message.containsAttachmentType`) behave identically regardless of source.

---

## 13. Identity Mapping

- On ingesting a message from a previously-unseen provider-native sender, a connector calls the shared identity-resolution service (not connector-specific logic) with the provider-native identifier and any available profile signals (display name, handle, email if applicable).
- **Auto-match** occurs only against an existing `ContactIdentity` with an exact `(provider, externalId)` match (`DATABASE.md` Section 6.6) - this is deterministic, not fuzzy, and always safe to automate.
- **Fuzzy/cross-provider matching** (e.g. "this Telegram handle and this email probably belong to the same person") is never performed automatically by a connector - it's a platform-level, opt-in suggestion surfaced to the user (an `identity.suggested_merge` signal distinct from the conflict-detection event in Section 10), because an incorrect automatic merge would corrupt VIP status, relationship history, and automation targeting for two actually-different people. Connectors supply signal; they never make the merge decision.

---

## 14. Rate Limit Handling

- Every connector declares its provider's rate limits in its Capability Manifest (Section 5) as a starting configuration, refined at runtime from actual provider responses (headers, error payloads).
- **Backpressure, not drop**: when a connector's outbound queue would exceed the provider's rate budget, outbound sends queue and wait (respecting Section 7's backoff), they are never silently dropped - a user's message send always either succeeds, retries, or surfaces a clear failure (`API.md` Section 10.3's `429` surfaced through to the client), never disappears.
- Per-`LinkedAccount` rate tracking (Section 7) means one workspace's high-volume usage of a shared-capacity provider connection (rare, but possible for certain provider auth models) is isolated from other workspaces' usage of their own independent connections.

---

## 15. Error Contract

Every connector-to-provider interaction failure is mapped into a **standardized, provider-agnostic error taxonomy** before it reaches the rest of the platform - core platform code (the Automation Engine's failure policy, `API.md`'s error responses) never branches on provider-specific error shapes:

| Taxonomy code | Meaning | Platform response |
|---|---|---|
| `AUTH_EXPIRED` | Credential no longer valid | LinkedAccount → `reauth_required` (Section 2) |
| `RATE_LIMITED` | Provider rate limit hit | Backoff (Section 7), LinkedAccount → `degraded` if sustained |
| `PROVIDER_UNAVAILABLE` | Provider-side outage/5xx | Retry per Section 7; LinkedAccount → `degraded` if sustained |
| `RESOURCE_NOT_FOUND` | Target conversation/message no longer exists at the provider | Terminal for that specific operation; not a connector-health signal |
| `PERMISSION_DENIED` | Bot/account lacks permission for this specific action (e.g. not an admin in a channel) | Terminal for that operation; surfaced to the user as an actionable message, not a generic failure |
| `PAYLOAD_REJECTED` | Provider rejected the content itself (banned word filter, size limit) | Terminal; surfaced with the specific reason where the provider supplies one |
| `UNKNOWN` | Anything not yet mapped to a specific code | Logged with full (credential-redacted) context for triage; treated conservatively as retryable-once, then terminal |

**Credential redaction is mandatory in every error payload and log line a connector produces** - Section 3.3's persistence-layer guarantee is worthless if a stack trace or error message leaks the same credential elsewhere; certification (Section 17) explicitly tests for this.

---

## 16. Connector Certification Checklist

A connector - first-party or third-party (Phase 18) - is not eligible for general availability until it passes every item below, verified against the mock connector's conformance suite (Section 18):

1. Registers a complete, accurate Capability Manifest (Section 5) - no capability claimed that isn't actually supported, verified by the test harness actually exercising each claimed capability.
2. Implements the full lifecycle state machine (Section 2) with no unreachable or skipped states.
3. Validates credentials before persistence (Section 3.2) - never accepts and stores an unverified credential.
4. Is a Hybrid connector if the provider supports webhooks (Section 4.3) - webhook-only fails certification.
5. Initial sync is bounded, resumable, and non-blocking (Section 8.1).
6. All sync checkpointing survives a simulated worker restart (Section 9) - the mock connector's conformance suite includes a forced-restart test.
7. Normalization mapper is deterministic and passes the required-field contract (Section 11) against a fixed fixture set.
8. Attachments are streamed through our storage, never held fully in memory, never left as provider-URL-only references (Section 12).
9. Identity resolution never auto-merges beyond exact-match (Section 13).
10. Rate limiting produces backpressure, never silent drops (Section 14).
11. Every error path maps to the standardized taxonomy (Section 15), with credential redaction verified in all logged/returned error content.
12. Passes a security review for any external network calls it makes beyond the declared provider API (`SECURITY.md` Section 9.5) - relevant especially for third-party marketplace connectors.
13. Ships with its own test fixtures (sample provider payloads) sufficient for the mock-connector-based conformance suite to exercise its mapper without needing live provider credentials in CI.

---

## 17. Testing Harness

- A shared, provider-agnostic **conformance test suite** (built once, run against every connector) exercises the certification checklist above mechanically wherever possible: feeding fixture payloads through the connector's mapper and asserting canonical-shape correctness, simulating rate-limit responses and asserting correct backoff behavior, simulating a worker restart mid-sync and asserting checkpoint resumption, simulating webhook payload loss and asserting the reconciliation pass backfills correctly.
- This suite is what makes "a new connector conforms to the SDK" a CI-verifiable claim rather than a manual code-review judgment call - critical for Phase 18, where marketplace connectors are authored by people the core team has never worked with directly.

---

## 18. Mock Connector

The **first connector built, before Telegram** (ROADMAP.md Phase 4's explicit instruction), and the one every other connector is validated against for the rest of the product's life:

- Implements the full SDK contract (Sections 2-15) against a fully synthetic, locally-controllable "provider" - no real external API, no rate limits imposed by anyone but our own configurable simulation.
- **Doubles as the conformance test suite's reference implementation** (Section 17) - "does a new connector behave the way the mock connector behaves under the same simulated conditions" is the actual, mechanical bar new connectors are held to.
- **Powers the Automation Engine's simulator** (`AUTOMATION_ENGINE.md` Section 14.3): the mock connector's synthetic event stream is exactly what lets a user's rule simulation "fast-forward 3 days with no reply" without any real provider or real waiting involved - the mock connector is not just a development convenience, it is the load-bearing component underneath one of the product's most differentiating features.
- Configurable to simulate every failure mode in Section 15's taxonomy on demand, every lifecycle transition in Section 2, and arbitrary webhook-loss/reconciliation scenarios - making it possible to test the entire platform's behavior under connector failure without ever touching a real, rate-limited, ToS-bound external API.

---

## Coverage Map

| Requirement | Section |
|---|---|
| Connector lifecycle | 2 |
| Authentication lifecycle | 3 |
| Webhook connectors | 4.1 |
| Polling connectors | 4.2 |
| Hybrid connectors | 4.3 |
| Capability discovery | 5 |
| Feature negotiation | 5 |
| Health monitoring | 6 |
| Retry | 7 |
| Backoff | 7 |
| Sync strategy | 8 |
| Initial sync | 8.1 |
| Incremental sync | 8.2 |
| Conflict resolution | 10 |
| Message normalization | 11 |
| Attachment abstraction | 12 |
| Identity mapping | 13 |
| Rate limit handling | 14 |
| Offline recovery | 9 |
| Error contracts | 15 |
| Connector certification checklist | 16 |
| Testing harness | 17 |
| Mock connector | 18 |
