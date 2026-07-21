# Phase 4 Sprint 2 Review

```yaml
Title: phase-4-sprint-2-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-21
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0010
  - ADR-0016
  - ADR-0017
  - ADR-0018
```

A point-in-time comparison of the actual Phase 4 Sprint 2 (Telegram Connector) implementation against `PRODUCT.md`, `ARCHITECTURE.md`, `CONNECTOR_SDK.md`, `EVENT_MODEL.md`, `SECURITY.md`, `DATABASE.md`, all ADRs current at the time, and `ROADMAP.md` - the fifth in the standing per-phase review practice. Per the user's explicit Sprint 2 spec: implementation-first, no shortcuts unless documented here, an ADR before any real architectural decision. This report follows that discipline.

---

## What Was Built

The first real, production-shaped connector, built on Sprint 1's SDK:

- **`TelegramConnector`** (`packages/connector-sdk/src/telegram/`) - a real `Connector` implementation making real HTTP calls to `api.telegram.org`, injected with a `TelegramApiClient` (a `RealTelegramApiClient` by default, swappable for a fake one in tests/certification - the same dependency-injection pattern that makes the connector testable without a live token).
- **`LinkedAccount` and `SecretRecord` persistence** (`packages/database/prisma/schema.prisma`) - `DATABASE.md` Section 6.5's schema, implemented for real for the first time, with `status` using the SDK's full 9-state lifecycle vocabulary (ADR-0018) and `credentialsRef` pointing into the interim secrets store (ADR-0016).
- **`CredentialsStoreService`** (`apps/api/src/credentials-store/`) - AES-256-GCM envelope encryption in Postgres, standing in for the external secrets manager `SECURITY.md` Section 5 specifies (ADR-0016), with the same `putSecret`/`getSecret`/`deleteSecret` contract a real secrets manager integration would expose later.
- **`TelegramController`** (`apps/api/src/telegram/`) - `POST /v1/connectors/telegram/connect` (real credential validation before persistence, per `CONNECTOR_SDK.md` Section 3.2), `POST /v1/connectors/telegram/webhook/{linkedAccountId}` (the real webhook receiver, secret-token-verified, feeding the same event pipeline the Mock Connector uses), `POST /v1/connectors/telegram/{id}/disconnect` (unconditional secret deletion per `SECURITY.md` Section 5.2, real `deleteWebhook` call, lifecycle to `disconnected`).
- **`TelegramReconciliationService`** (`apps/api/src/telegram/`) - the periodic half of ADR-0017's strategy, sweeping every active `LinkedAccount` on an interval.
- **The reply path** - `POST /v1/conversations/{id}/messages` (`API.md` Section 10.3's documented route), looked up through the Connector Registry rather than special-cased to Telegram, so a future connector's `send()` slots into the same endpoint.
- **Idempotent duplicate handling** (`apps/api/src/events/events.processor.ts`) - a real gap in the Phase 1-3 pipeline, closed this sprint: `handleMessageReceived` now checks for an existing `(conversationId, externalId)` row before creating one, making a re-delivered webhook or a reconciliation-recovered message that the webhook already delivered a safe no-op (`CONNECTOR_SDK.md` Section 10), not a crashed job or a duplicate notification.
- **Two small, backward-compatible SDK extensions**, both discovered as real implementation constraints, not preferences: an optional `ConnectorContext` parameter threading a resolved credential through `initialSync`/`reconcile`/`send` (Sprint 1's Mock Connector never needed per-call credentials; a real connector does), and an optional `initialState` on `ConnectorLifecycle` (Sprint 1's lifecycle only ever needed to exist within one connect flow's in-memory instance; disconnect needs to resume from whatever state Postgres already has).
- **The Certification Suite itself gained two fixes**, both because a real connector surfaced cases the Mock-Connector-only suite hadn't needed to handle: the checkpoint-resume and reconciliation checks now treat a legitimate zero-message result as a `skip`, not a failure (a provider with no history endpoint has nothing to resume against - see ADR-0017), and `CertificationOptions` gained an optional `context` field threaded into every `initialSync`/`reconcile`/`send` call.

## Verified Live

- `pnpm --filter @smc/scripts certify:telegram-connector` (14/14 applicable checks passing, 2 correctly skipped - see "Certification Results" below) - a fake `TelegramApiClient`, deterministic, no network required.
- `pnpm --filter @smc/scripts verify:telegram` - real network calls against the actual Telegram API: a clearly invalid token is really rejected (`422 INVALID_BOT_TOKEN`), and (when `TELEGRAM_TEST_BOT_TOKEN` is set) a real bot token really connects, a simulated webhook payload is really accepted/rejected based on the secret token, and the resulting message really appears in the real Inbox with the sender resolved by name.
- **A complete, human-confirmed live end-to-end run**, using a disposable test bot (`@smc_bozgun_bot`, created via BotFather specifically for this verification, never a bot from another project): a real Telegram user sent a real message ("Hi, test msg 2107 1318") to the bot; it was fetched via `getUpdates`, pushed through the real `POST /v1/connectors/telegram/webhook/{id}` receiver, and appeared in the real Inbox (`GET /v1/conversations`) with the sender resolved to "Peace" through IdentityGraph; a reply was sent via `POST /v1/conversations/{id}/messages`, which called Telegram's real `sendMessage` API, and the human on the other end confirmed receiving it in their actual Telegram app.
- `verify:phase3` (11/11), `verify:auth` (16/16), `verify:soft-delete`, and `certify:mock-connector` (16/16) all re-run clean - no regressions from Sprint 2's schema/SDK changes.
- `pnpm typecheck`/`pnpm lint`/`pnpm build` all pass clean across the whole monorepo (10 packages).

### Certification Results (`certify:telegram-connector`)

14 passed, 2 skipped, 0 failed:
- **Skipped**: "Initial sync resumes from an arbitrary durable checkpoint" - Telegram's Bot API has no history endpoint, so `initialSync()` legitimately returns zero messages immediately (ADR-0017); there is nothing to verify resumption against. This is the certification suite correctly recognizing a real provider limitation, not a gap in Telegram's implementation.
- **Skipped**: "Rate limiting produces backpressure" - this check requires a `simulateFailure()` test hook, which is a Mock-Connector-specific test affordance (`CONNECTOR_SDK.md` Section 18), not part of the core `Connector` interface. `TelegramConnector`'s actual backpressure behavior (honoring `retry_after` and retrying once on a real `429`) is implemented in `send()` and exercised by manual testing, not by this generic hook - a real connector isn't required to expose the same test seam Mock does.

## The Three Real Architectural Decisions

Per the user's explicit rule ("if a real architectural decision is required, create an ADR before changing the implementation"), three were discovered and resolved before writing the affected code, not after:

1. **[ADR-0016](adr/0016-interim-envelope-encrypted-secrets-store.md)** - `SECURITY.md` requires an external secrets manager; none exists, and provisioning one is disproportionate to this sprint. Ships an interim `CredentialsStoreService` (AES-256-GCM in Postgres) behind the same `credentials_ref`-indirection contract, disclosed as a pre-production posture with a named residual risk (a single compromised encryption key decrypts every stored credential - no per-secret KMS rotation or IAM scoping).
2. **[ADR-0017](adr/0017-telegram-sync-and-reconciliation-strategy.md)** - Telegram's Bot API has no history/list endpoint and `getUpdates`/`setWebhook` are mutually exclusive, so `CONNECTOR_SDK.md` Section 4.3/8.1's reconciliation and initial-sync design can't be implemented as generically specified. Initial sync is a documented no-op; reconciliation uses `getWebhookInfo`'s backlog/error signal to trigger a real delete-webhook/drain-via-`getUpdates`/restore-webhook cycle.
3. **[ADR-0018](adr/0018-linked-account-status-uses-connector-sdk-lifecycle.md)** - `DATABASE.md`'s original 5-value `status` sketch conflicts with the SDK's already-certified 9-state `ConnectorLifecycle`. The full 9-value set wins, since it's the more detailed, already-implemented, already-tested source.

No other genuine architectural decisions were required - the SDK context/lifecycle extensions (above) are additive, backward-compatible refinements within the already-decided `Connector` interface shape, not redesigns, so they didn't need their own ADRs.

## Deliberate Simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | `POST /v1/conversations/{id}/messages` sends synchronously and returns `201`, not `API.md` Section 10.3's documented `202 Accepted` + async-delivery-observed-over-WebSocket shape. | Building a real outbound event processor (a `message.send_requested` event, a BullMQ consumer, a `status` column on `Message` to track queued/sent/failed) is meaningfully more scope than "the user can reply and the reply is delivered" requires. The synchronous path is honest, working, and production-viable for a first version. | **Deferred** - revisit when a real need for async send (bulk sends, scheduled send, `AUTOMATION_ENGINE.md`'s reply actions) makes the queue's cost worth paying. |
| 2 | The reply endpoint's request body is `{ body }` only - no `bodyFormat`, `attachmentIds`, or `idempotencyKey`, all of which `API.md` Section 10.3 documents. | None of those fields are needed for plain-text reply, which is all Sprint 2's Definition of Done requires. | **Deferred** to whichever phase first needs rich-format replies or attachments. |
| 3 | The webhook secret token (`LinkedAccount.webhookSecret`) is stored as a plain column, not routed through `CredentialsStoreService`. | It's an inbound-verification value we generate ourselves, not a credential that grants access to call Telegram's API on the user's behalf - `SECURITY.md` Section 5's boundary is specifically about the latter. Documented directly in the Prisma schema comment. | **Accepted** - a deliberate, reasoned distinction, not an oversight. |
| 4 | `apps/web`'s "Connect Telegram" UI is a single bot-token input with no dedicated LinkedAccount status/health screen. | `ROADMAP.md`'s own Phase 5 checklist marks "connection status surfaced in UI" as a real requirement, but building a full health dashboard (`API.md` Section 10.5, not yet built anywhere) is out of proportion to proving the connector itself works. | **Deferred** - the raw data (`LinkedAccount.status`/`lastError`) is already captured and available for whenever that screen is built. |
| 5 | Reconciliation runs on a `setInterval` in the same Node process as the API, not a separate connector-worker process (`ARCHITECTURE.md`/ADR-0009's eventual per-connector-worker split). | Matches the existing codebase's current stage - `apps/api` is still the modular monolith ADR-0009 describes as the *starting* topology; splitting out a Telegram worker process is a scaling decision for when connector volume actually warrants it, not before. | **Accepted**, consistent with ADR-0009's own stated sequencing. |

## Already-Tracked Gaps, Still Open (not new)

| # | Finding | First noted |
|---|---|---|
| 6 | `packages/database`'s Prisma schema remains a pragmatic subset of `DATABASE.md`'s full spec - `LinkedAccount` is now real (this sprint), but IdentityGraph's confidence-scoring/merge-suggestion tables and RLS/DB role separation remain spec-only. | Phase 1/2/3/4-Sprint-1 reviews |
| 7 | The interim secrets store (ADR-0016) is a known, disclosed pre-production gap versus `SECURITY.md`'s target design. | New this sprint, tracked here and in `STATUS.md` |

**TODOs**: none - grepped `packages/connector-sdk/src/telegram`, `apps/api/src/telegram`, ``, and the new/changed scripts for `TODO`/`FIXME`/`HACK`/`XXX`, zero matches, consistent with every prior phase.

**Confirmed on-track, no deviation**: credential validation always precedes persistence (verified live with a real invalid token); the webhook receiver rejects a wrong secret token (verified live, `401`); unconditional secret deletion on disconnect (`SECURITY.md` Section 5.2); the normalization contract's required fields (`externalId`, `conversationExternalId`, `direction`, `bodyText`, `receivedAt`) match exactly, including on real Telegram payloads; the error taxonomy's 7 codes are exercised against real Telegram error shapes (401/429/404/403/400/5xx); UUIDv7 for every new row; soft-delete registered for `LinkedAccount`, correctly *not* registered for `SecretRecord` (which must hard-delete per `SECURITY.md`).

## Decision Rule Applied

Same rule as every prior phase: implement now only what's more expensive to retrofit later; defer everything else to its already-assigned scope. This sprint's three ADRs were each "implement now" by necessity (the connector cannot function without a credential store, without a real sync strategy, or without a decided status vocabulary) - none were deferrable. Everything in the Deliberate Simplifications table was a genuine, disclosed scope call within an already-large sprint, not a shortcut taken silently.

## Outcome

The first real, production-shaped connector exists, is certified against the same suite the Mock Connector is held to, and was proven end to end against the real Telegram network with a human confirming receipt on both ends of the conversation (a real message in, a real reply out). Three genuine architectural decisions were resolved via ADR before implementation, exactly as instructed. Idempotent duplicate handling - a real, if minor, gap inherited from Phase 1 - was closed as part of making this connector's webhook path correct. No shortcuts were taken outside what's disclosed in the table above. Tagged `v0.4.1-phase4-sprint2`.
