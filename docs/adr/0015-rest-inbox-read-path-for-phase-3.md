# 0015 - REST (Not GraphQL) for Phase 3's Inbox Read Path

- Status: Accepted
- Date: 2026-07-18
- Deciders: Founder/CTO
- Related: [ADR-0003](0003-rest-over-graphql-by-default.md), [API.md](../API.md) Section 6/10.3

## Context

`API.md` Section 10.3 states the unified-inbox read path is "primarily GraphQL," per ADR-0003's scoping of GraphQL specifically to the inbox read path and rule-builder introspection. Phase 3 needs a working conversation list and message-history read path to prove the `Mock Connector → Message → IdentityGraph → Conversation → Inbox → Realtime → Notification` pipeline end to end. No GraphQL server (Apollo, `@nestjs/graphql`, a schema, resolvers) exists anywhere in this codebase - standing one up now would be genuinely new infrastructure, not an extension of anything already present, directly contradicting this phase's explicit "do not introduce new technologies" instruction.

## Decision

Phase 3 implements the inbox read path as plain REST (`GET /v1/conversations`, `GET /v1/conversations/{id}/messages`), not GraphQL. This is a deliberate, scoped-in-time deviation from `API.md` Section 10.3's GraphQL framing for the inbox specifically - not a reversal of ADR-0003, which remains correct about GraphQL being the right tool once the inbox's actual query shape earns it (client-varying filters, multi-entity joins in one round trip, per ADR-0003's own reasoning). Phase 3's need is a single fixed view (a conversation list, a message-history view) with no client-shaped variance yet - a REST endpoint returning a fixed, reasonably-scoped payload serves that need without over-fetching in any way that would justify GraphQL's setup cost at this stage.

## Consequences

- `API.md` is not rewritten - it still correctly documents GraphQL as the target inbox read mechanism; this ADR is the record of why Phase 3 doesn't build it yet, so a future reader isn't left wondering why no GraphQL server exists despite the API contract describing one.
- The REST endpoints added in Phase 3 are additive, matching the same resources a future GraphQL layer would resolve against (`Conversation`, `Message`) - they are expected to coexist with a GraphQL layer later, not be awkwardly replaced by it, since REST already owns the inbox's write path (`POST /v1/conversations/{id}/messages`, `API.md` Section 10.3) regardless of ADR-0003.
- The natural trigger to actually build the GraphQL inbox layer is `ROADMAP.md` Phase 9 (Smart Inbox), where filtering, priority scoring, and multi-entity shaped queries make GraphQL's aggregation model earn its cost the way ADR-0003 originally argued - not before.
