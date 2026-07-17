# 0007 - UUIDv7 for All Primary Keys

- Status: Accepted
- Date: 2026-07-17
- Deciders: Founder/CTO
- Related: [DATABASE.md](../DATABASE.md) Section 3

## Context

Every table needs a primary key strategy that works safely in a multi-tenant SaaS expected to scale to millions of users, supports distributed ID generation (connector workers generating a Message id before it reaches Postgres, for idempotent writes), and doesn't leak information via enumeration. Candidates: sequential integers (`serial`/`bigserial`), UUIDv4 (fully random), UUIDv7 (time-ordered).

## Decision

Every primary key (and foreign key) is a UUID, specifically UUIDv7, not UUIDv4 or sequential integers.

## Consequences

- No enumeration risk and no row-count/growth-rate leakage, unlike sequential integers - required for a multi-tenant product where `/messages/1002` must not invite `/messages/1003`.
- UUIDv7's time-ordering gives most of integer-PK's B-tree index-locality performance at scale, avoiding the random-insert index bloat that plain UUIDv4 causes on high-volume tables (`messages` specifically, DATABASE.md Section 18's first-named bottleneck).
- Connector workers (ADR-0004) can generate a `Message.id` before any database round-trip, which is what makes the idempotent-insert pattern (`ON CONFLICT` on `(conversation_id, external_id)`) work cleanly under retries.
- Enables future tenant-to-region data migration and merge scenarios (DATABASE.md Section 19) without primary-key collisions, which a sequential-integer scheme would make effectively infeasible.
- Requires UUIDv7 generation support in the application layer/Postgres (extension or library-level generation) - a minor, one-time setup cost accepted for the long-term properties above.
