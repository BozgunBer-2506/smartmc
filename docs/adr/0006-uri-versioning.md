# 0006 - URI-Based API Versioning

- Status: Accepted
- Date: 2026-07-17
- Deciders: Founder/CTO
- Related: [API.md](../API.md) Section 3

## Context

The API contract must survive a decade (API.md Section 1) and eventually serve third-party developers (Phase 18 marketplace). A versioning mechanism was needed: URI-based (`/v1/...`) versus header-based (`Accept: application/vnd.smc.v1+json`) content negotiation.

## Decision

Version via the URI path (`/v1/...`), not via Accept-header content negotiation.

## Consequences

- Third-party developers can discover, bookmark, curl, and debug a version directly from the URL - lower friction than header-based negotiation, which matters given the target audience (marketplace integrators, automation-tool developers who want it working quickly, not REST purists).
- A specific endpoint that needs to evolve faster than the rest of `v1` (anticipated: AI endpoints, API.md Section 10.8) can carry its own version segment (`/v1/ai/v2/...`) as a scoped escape hatch, without forcing a whole-API major version bump.
- Accepted tradeoff: URI versioning is considered less "pure" REST than content negotiation by some practitioners - explicitly deprioritized in favor of real-world developer ergonomics for this product's audience.
- A major version (`v1`) is a stability contract: no breaking changes within it, ever, only strictly additive changes, enforced per API.md Section 3's deprecation lifecycle (minimum 12-month notice).
