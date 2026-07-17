# 0001 - Use PostgreSQL as the Primary Database

- Status: Accepted
- Date: 2026-07-17
- Deciders: Founder/CTO
- Related: [DATABASE.md](../DATABASE.md), [ARCHITECTURE.md](../ARCHITECTURE.md)

## Context

Smart Message Center needs a primary datastore for relational, transactional data: users, workspaces, contacts, conversations, messages, automation rules, billing. The data has real relational integrity requirements (a Message belongs to exactly one Conversation, a Rule belongs to exactly one Workspace) but also needs flexible, semi-structured storage for the automation engine's trigger/condition/action definitions (see ADR-0004 dependency) and provider-specific raw payloads.

Alternatives considered: MongoDB (document-native, weaker relational integrity and transactional guarantees), MySQL (comparable relational fit, weaker native JSON/full-text/extension ecosystem), a managed NoSQL wide-column store (wrong fit for this data shape entirely).

## Decision

Use PostgreSQL as the single primary datastore for all relational and semi-structured (jsonb) data.

## Consequences

- Native `jsonb` support lets the automation engine's rule definitions (DATABASE.md Section 6.12) stay flexible without a rigid, migration-heavy relational tree.
- Native full-text search (`tsvector`) covers MVP search needs (DATABASE.md Section 14) without standing up a separate search service on day one.
- `pgvector` extension gives a clear, low-friction path to semantic search later (Phase 13) without a new datastore.
- Mature managed offerings (AWS RDS Multi-AZ) satisfy the infrastructure reliability bar (ARCHITECTURE.md Section 7) without custom operational tooling.
- Tradeoff accepted: horizontal write scaling is harder than some NoSQL alternatives; mitigated by the UUIDv7 + tenant-scoping design (ADR-0007, DATABASE.md Section 18) that keeps a future sharding path open if ever needed.
