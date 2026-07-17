# 0005 - Event-Driven Core (Redis/BullMQ Message Bus)

- Status: Accepted
- Date: 2026-07-17
- Deciders: Founder/CTO
- Related: [ARCHITECTURE.md](../ARCHITECTURE.md) Section 4

## Context

Inbound messages must fan out to multiple independent concerns - the inbox read model, the automation engine, notifications - without any one of them blocking ingestion or each other. A synchronous, request-path design (connector calls automation engine directly, which calls notification service directly) would couple failure domains together and make retries/idempotency far harder to reason about.

## Decision

All inbound/outbound messages, rule evaluations, and notifications flow through a Redis-backed queue (BullMQ), not direct synchronous service calls. Connector workers publish canonical domain events (`message.received`, etc. - see ADR naming convention in API.md Section 14.1); the Automation Engine, Inbox Projector, and Notification Service each consume independently.

## Consequences

- A Telegram outage or Slack rate limit never blocks the API, other connectors, or automation processing for unrelated events.
- Every consumer job carries the source event's id as an idempotency key (ARCHITECTURE.md Section 4), so retries after a crash never double-fire an automation or duplicate a notification.
- Adds operational complexity (a queue to run, monitor, and reason about failure/retry semantics for) that a purely synchronous design would not have - accepted because the alternative (tight coupling across independently-failing external providers) is worse at this product's actual failure modes.
- `scheduled_jobs` (DATABASE.md Section 6.13) exists specifically because BullMQ/Redis alone is not treated as a durable source of truth for delayed automation triggers - Postgres is, with BullMQ as the execution mechanism only.
