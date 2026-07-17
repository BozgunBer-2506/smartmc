# 0004 - Pluggable Connector SDK for All Messaging Providers

- Status: Accepted
- Date: 2026-07-17
- Deciders: Founder/CTO
- Related: [ARCHITECTURE.md](../ARCHITECTURE.md) Section 2/4, [ROADMAP.md](../ROADMAP.md) Phase 4, [API.md](../API.md) Section 14.3

## Context

Smart Message Center's core differentiator (PRODUCT.md) is unifying multiple messaging providers behind consistent automation and priority logic. Without a deliberate abstraction, each new provider (Telegram, Discord, Slack, Email, and later WhatsApp, LinkedIn, third-party marketplace connectors) risks becoming a bespoke integration that touches core domain code every time, directly undermining the "add a provider without rearchitecting" promise.

## Decision

Every messaging provider integrates through a single `Connector` interface (`packages/connector-sdk`), mapping provider-native events into a canonical `Message`/`Conversation`/`Contact` domain model. Connectors run as independent worker deployables (not inline in the API request path), communicating via the event bus (ADR-0005).

## Consequences

- Core domain logic (unified inbox, automation, notifications) never knows or cares which provider a message came from.
- A provider outage or rate limit degrades that connector only, never the rest of the platform.
- New providers (Phase 6-8, and later WhatsApp/LinkedIn) are validated against the SDK; if adding one requires changing the SDK interface after Discord (the first real second connector), that is treated as a signal the SDK was under-designed (ROADMAP.md Phase 6-8 checkpoint), not a routine cost.
- This is also the foundation the Phase 18 connector marketplace and third-party Connector API (API.md Section 14.3) are built on - our own first-party connectors are required to use the exact external contract, so the contract is proven before any third party depends on it.
