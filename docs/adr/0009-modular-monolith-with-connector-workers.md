# 0009 - Modular Monolith Core with Independently Deployable Connector Workers

- Status: Accepted
- Date: 2026-07-17
- Deciders: Founder/CTO
- Related: [ARCHITECTURE.md](../ARCHITECTURE.md) Section 11

## Context

A choice was needed between a full microservices architecture (every module - users, inbox, rules, notifications - as a separately deployed service) and a monolith, for the core API. Full microservices before product-market fit typically pays a large coordination/operational tax without a matching benefit; a pure monolith risks coupling the core domain to flaky third-party provider APIs (Telegram/Discord/Slack/Email), which is a real, distinct scaling and reliability concern (ADR-0004, ADR-0005).

## Decision

The core API (users, inbox, rules, notifications, contacts) ships as a modular monolith (NestJS feature modules, ARCHITECTURE.md's folder structure). Connector workers (per provider) are split out as independently deployable services from day one, communicating with the core only via the event bus (ADR-0005).

## Consequences

- Gets the specific isolation benefit that actually matters at this stage (a Slack outage or Discord rate limit cannot take down the core API or other providers) without paying the full operational cost of microservices for the core domain, which doesn't have an equivalent scaling-skew problem yet.
- Connector workers scale independently via Kubernetes HPA (ARCHITECTURE.md Section 7), matched to each provider's actual load characteristics, while the core API scales as one unit.
- If the core monolith later needs to split further (e.g. billing as its own service), the feature-module boundaries and DDD/repository-pattern discipline (ARCHITECTURE.md Section 10) already in place are the seams that split would follow - this decision does not foreclose that path, it just doesn't take it prematurely.
- Revisit trigger: if a specific core module (not a connector) develops its own distinct scaling or reliability profile that the monolith can't serve well, that's the signal to reassess this ADR, not a fixed timeline.
