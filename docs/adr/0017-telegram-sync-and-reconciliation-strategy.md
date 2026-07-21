# 0017 - Telegram Sync and Reconciliation Strategy Given Bot API's Shape

- Status: Accepted
- Date: 2026-07-19
- Deciders: Founder/CTO
- Related: [ADR-0010](0010-telegram-bot-api-only.md), [CONNECTOR_SDK.md](../CONNECTOR_SDK.md) Sections 4.3, 8.1, 8.3

## Context

`CONNECTOR_SDK.md` Section 8.1 specifies initial sync as a bounded backfill of recent history, and Section 4.3 requires every webhook-capable connector to also run a periodic reconciliation pass that fetches recent activity via "the provider's own list/history endpoint" and diffs it against what's already ingested, to catch messages a dropped webhook would otherwise lose.

The Telegram Bot API - which ADR-0010 already committed this project to exclusively, ruling out MTProto - has two properties that make both of those literally inapplicable as specified:

1. **No history/list endpoint.** Unlike Discord's channel message history or Slack's `conversations.history`, the Bot API exposes no method to fetch past messages for a chat. A bot only ever sees updates from the moment it starts receiving them (via webhook or `getUpdates`) forward. There is nothing for `initialSync`'s bounded backfill to fetch.
2. **`getUpdates` and `setWebhook` are mutually exclusive on the same bot.** Calling `getUpdates` while a webhook is registered returns a `409 Conflict` ("can't use getUpdates method while webhook is active"). A generic "poll a list endpoint and diff" reconciliation pass, running alongside an active webhook, is not possible for this provider - there is no third channel to poll.

This is exactly the kind of real implementation constraint `ROADMAP.md`'s working rules anticipate: not a reason to skip Section 4.3's requirement, but a reason to implement it correctly for what Telegram actually offers instead of what the SDK's general language assumed a "typical" provider would offer.

## Decision

**Initial sync is a documented no-op.** `TelegramConnector.initialSync()` returns immediately with zero messages and `complete: true` - there is nothing to backfill. The lifecycle state machine still passes through `syncing_initial` (Section 2's state table has no direct `authenticating -> active` edge), it just completes instantly rather than doing real backfill work. This is disclosed, not silently absorbed as if it were a real bounded sync that happened to find nothing.

**Reconciliation uses Telegram's own reliability signal, not a diff-against-a-list-endpoint pass.** Telegram already queues undelivered updates (for up to 24 hours) whenever a webhook endpoint is failing or unreachable, and exposes that queue's state via `getWebhookInfo` (`pending_update_count`, `last_error_date`, `last_error_message`). `TelegramConnector.reconcile()`:
1. Calls `getWebhookInfo`. If there is no pending backlog and no recent error, it returns immediately (`complete: true`, no messages) - a real, distinct network call every reconciliation cycle, not a fake pass.
2. If a backlog or recent error is detected, it **drains the backlog for real**: temporarily deletes the webhook, calls `getUpdates` with the connector's durable offset checkpoint to fetch everything Telegram was holding, maps each into a `NormalizedMessage`, then re-registers the webhook with the same URL and secret token. This is a genuine recovery mechanism (not a health-check-only stub) - it uses the one channel Telegram does expose for catching up, applied at exactly the moment the mutual-exclusivity constraint permits it (the webhook is briefly, deliberately not active during the drain).

This satisfies `CONNECTOR_SDK.md` Section 4.3's actual intent - "a missed webhook during a provider outage is caught and backfilled within one reconciliation cycle" - using the mechanism Telegram's API shape actually supports, rather than a mechanism the API doesn't have.

## Consequences

- A message that arrives during the brief drain window (webhook deleted, `getUpdates` draining, webhook not yet re-registered) is still captured, since `getUpdates` and the queued backlog cover exactly that window - no gap is introduced by the drain itself.
- If the drain's re-registration of the webhook fails (e.g. a transient network error calling `setWebhook` again), the `LinkedAccount` is left in a **polling-only** state until the next reconciliation cycle detects and repairs it - documented as a real, bounded failure mode, not treated as unreachable.
- Certification (`CONNECTOR_SDK.md` Section 16 item 5, "initial sync is bounded, resumable, and non-blocking") is satisfied trivially and correctly for this provider - "bounded" includes "bounded to zero," which is the honest answer for a provider with no history endpoint, not a workaround.
- Future connectors with a real history/list endpoint (Discord, Slack, Email/IMAP) are unaffected - they implement Section 4.3 and Section 8.1 as originally specified, since they have the API surface Telegram lacks. This ADR is Telegram-specific, not a revision to the SDK's general contract.
