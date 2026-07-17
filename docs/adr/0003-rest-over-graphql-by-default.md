# 0003 - REST by Default, GraphQL Only Where It Adds Value

- Status: Accepted
- Date: 2026-07-17
- Deciders: Founder/CTO
- Related: [API.md](../API.md) Section 6

## Context

The API needs to serve our own web/desktop/mobile clients today and third-party integrations from Phase 18 onward. GraphQL and REST were both considered as the default paradigm for the whole API.

Full-GraphQL would give clients complete query flexibility everywhere, but at the cost of a single-endpoint model that is harder for third-party developers to reason about with standard HTTP tooling, harder to cache/rate-limit per-resource, and harder to keep a stable, versioned contract on for a decade (API.md Section 1's design horizon). Full-REST would be simpler and more predictable but would force either chronic over-fetching or a proliferation of screen-specific endpoints for the unified inbox's genuinely variable data shape.

## Decision

REST is the default for everything with a side effect: auth, mutations, resource CRUD, webhooks, billing, admin. GraphQL is scoped to exactly two capabilities where its aggregation/introspection model earns its cost: the unified inbox read path, and rule-builder schema introspection (API.md Section 6).

## Consequences

- Third-party developers (Phase 18) can safely assume "REST unless I'm building an inbox UI or a rule builder" - a predictable, learnable API surface.
- Billing, admin, and webhook endpoints keep REST's per-endpoint versioning and caching characteristics (API.md Section 3), which matters more for those domains than query flexibility does.
- The inbox and rule-builder screens get client-shaped queries without over-fetching, and the rule builder can introspect the trigger/condition/action schema at runtime without a redeploy.
- Two query paradigms must both be documented, tested, and kept in the engineering team's working knowledge - an accepted ongoing cost, deliberately bounded to two domains rather than left to grow ad hoc.
