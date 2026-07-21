# 0018 - LinkedAccount.status Uses CONNECTOR_SDK.md's Full Lifecycle Vocabulary

- Status: Accepted
- Date: 2026-07-19
- Deciders: Founder/CTO
- Related: [DATABASE.md](../DATABASE.md) Section 6.5, [CONNECTOR_SDK.md](../CONNECTOR_SDK.md) Section 2

## Context

Two already-accepted documents specify a `LinkedAccount`/connector-account status value set, and they don't match:

- `DATABASE.md` Section 6.5 sketches `status` as a 5-value enum: `pending`, `active`, `error`, `reauth_required`, `disconnected`.
- `CONNECTOR_SDK.md` Section 2, written and formalized after `DATABASE.md`'s initial pass, specifies a full 9-state lifecycle: `registered`, `authenticating`, `syncing_initial`, `active`, `degraded`, `reauth_required`, `error`, `disconnecting`, `disconnected` - each with an explicit, named reason for existing (Section 2's own text: `degraded` is deliberately distinct from `error`/`active` because collapsing it either hides a worsening problem or triggers false alarms).

Phase 4 Sprint 1 already built and certified `packages/connector-sdk`'s `ConnectorLifecycle` state machine against the full 9-state version - it's tested, its transition table is verified for reachability and no dead ends, and the Certification Suite already drives connectors through it. Sprint 2 is the first phase that needs to actually persist a `LinkedAccount.status` column, which forces a choice between the two documents' conflicting value sets.

## Decision

`LinkedAccount.status` (`packages/database/prisma/schema.prisma`) stores `ConnectorLifecycle`'s full 9-state vocabulary, not `DATABASE.md`'s narrower 5-value sketch. `CONNECTOR_SDK.md` Section 2 is treated as the authoritative source for connector lifecycle state, since it is the more detailed, more recently formalized specification, and an already-built, already-certified state machine depends on exactly its 9 states - collapsing to 5 values now would mean either losing real distinctions the platform's own health-monitoring design (Section 6) explicitly wants (`degraded` vs `error`, `authenticating` vs `syncing_initial`) or maintaining a second, narrower parallel vocabulary with a lossy mapping between the two for no benefit.

`DATABASE.md` Section 6.5 is not rewritten - its 5-value sketch is superseded in effect by this ADR for the `status` column's actual value set, exactly as ADR-0015 left `API.md`'s GraphQL framing in place while recording a scoped deviation. A future `DATABASE.md` revision pass can fold this correction in directly; until then, this ADR is the record of which document wins for this one column.

## Consequences

- Every future connector (Discord, Slack, Email) persists `LinkedAccount.status` using the same 9-value set, driven by the same shared `ConnectorLifecycle` class - no per-connector status vocabulary to keep in sync.
- UI/health-check code (`CONNECTOR_SDK.md` Section 6, `API.md` Section 10.5's `GET /v1/linked-accounts/{id}/health`, not yet built) can rely on the full distinction set (e.g. showing "degraded" differently from "down") once that surface is built, without a later migration to widen a narrower column.
- `idx_linked_accounts_status` (`DATABASE.md` Section 6.5) is created against the 9-value set as implemented, not the 5-value sketch as originally documented.
