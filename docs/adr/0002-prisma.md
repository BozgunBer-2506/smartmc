# 0002 - Use Prisma as the ORM

- Status: Accepted
- Date: 2026-07-17
- Deciders: Founder/CTO
- Related: [DATABASE.md](../DATABASE.md) Section 20, [ARCHITECTURE.md](../ARCHITECTURE.md)

## Context

The backend (NestJS, TypeScript) needs a data access layer for PostgreSQL. Candidates: Prisma, TypeORM, Drizzle, raw SQL with a query builder (Kysely).

## Decision

Use Prisma ORM as the primary data access layer.

## Consequences

- Type-safe queries generated directly from the schema, matching the TypeScript-everywhere stack (ARCHITECTURE.md tech choices).
- Migration tooling (Prisma Migrate) fits the expand/contract, zero-downtime deploy pattern (ARCHITECTURE.md Section 8).
- No built-in optimistic locking or row-level-security awareness - both must be implemented as explicit repository-layer patterns (DATABASE.md Section 20), not relied on as framework features. This is an accepted, documented gap, not an oversight.
- Multi-file schema (`prismaSchemaFolder`) will be adopted once the schema exceeds ~15-20 models, to keep migrations reviewable (DATABASE.md Section 20).
- Global Prisma Client extensions are required (not optional) for soft-delete filtering and workspace-scoping (DATABASE.md Section 20) - this is a mandatory implementation detail flowing directly from this ADR, tracked as a Phase 1 bootstrap task in ROADMAP.md.
