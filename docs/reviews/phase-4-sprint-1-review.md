# Phase 4 Sprint 1 Review

```yaml
Title: phase-4-sprint-1-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-19
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0004
  - ADR-0010
```

A point-in-time comparison of the actual Phase 4 Sprint 1 (Connector SDK Foundation) implementation against `CONNECTOR_SDK.md`, `ARCHITECTURE.md`, `EVENT_MODEL.md`, `DATABASE.md`, all ADRs current at the time, and `ROADMAP.md` - the fourth in the standing per-phase review practice. Per the user's explicit Sprint 1 spec: implementation-first, no architectural shortcuts, review before closing the sprint. This report follows that same discipline.

---

## What Was Built

The production Connector SDK (`packages/connector-sdk`) every future connector implements:

- **`Connector` interface** (`connector.ts`) - the contract: capability manifest, credential validation, authentication (ordering-guaranteed via `BaseConnector`, which implements `authenticate()` once so `validateCredential()` cannot be skipped by a subclass), bounded/resumable initial sync, a distinct reconciliation pass, a pure normalization mapper, standardized error mapping, an optional outbound `send`, and a fresh lifecycle state machine per account.
- **Capability Manifest** (`capability-manifest.ts`) - `defineCapabilityManifest()` is the only constructor a connector uses; it enforces `CONNECTOR_SDK.md` Section 4.3's hybrid-by-default rule (a webhook/hybrid manifest with no `reconciliationIntervalMinutes` throws at declaration time, not just at certification time) and rejects a non-positive declared rate limit.
- **Lifecycle state machine** (`lifecycle.ts`) - the exact 9-state, `CONNECTOR_SDK.md` Section 2 table (`registered` through `disconnected`), shared by every connector via `ConnectorLifecycle`. `checkLifecycleGraphIntegrity()` verifies the shared transition table itself has no unreachable state and no non-terminal dead end - a property of the SDK's definition, checked once, not re-derived per connector.
- **Standardized error taxonomy** (`errors.ts`) - the 7 `CONNECTOR_SDK.md` Section 15 codes, with credential redaction applied inside `ConnectorError`'s constructor itself, so redaction is structural rather than a convention each connector's `mapError()` has to remember to apply.
- **Connector registry** (`registry.ts`) - in-process, keyed by provider key.
- **Connector Certification Suite** (`certification/`) - `certifyConnector()`, a shared, provider-agnostic conformance test suite (`CONNECTOR_SDK.md` Section 17) mechanically exercising 16 checks drawn from the Section 16 checklist: manifest completeness, the hybrid/reconciliation requirement, lifecycle graph integrity, a full lifecycle happy-path run, illegal-transition rejection, credential-validation-before-authentication ordering (both the accept and reject paths), fixture presence, mapper determinism, the required-field contract, checkpoint-resume across a simulated worker restart, bounded-completion of initial sync, a distinct reconciliation pass, the full error taxonomy, credential redaction, and rate-limit backpressure (structured to skip, not fail, for a connector exposing no failure-simulation hook - relevant once a second, real connector is certified in Sprint 2).
- **The Mock Connector migrated onto the SDK** (`mock-connector.ts`) - a real `MockConnector extends BaseConnector`, with a deterministic synthetic sync generator (a pure function of its checkpoint, which is what makes the checkpoint-resume certification check meaningful rather than superficial) and a configurable `simulateFailure()` hook covering the full error taxonomy. `generateMockMessage()` (Phase 1 Sprint 2's original helper) is kept as a thin adapter over `MockConnector.mapMessage()` - `apps/api`'s existing mock-connector controller needed zero changes.
- **`direction` added to `InboundMessagePayload`** (`packages/shared`) - `CONNECTOR_SDK.md` Section 11 requires it as a mandatory normalization field; it was previously hardcoded to `"inbound"` in `events.processor.ts` rather than actually carried through the payload. Now populated by the connector's mapper and read by the processor.

All verified live via `pnpm --filter @smc/scripts certify:mock-connector` (16/16 checks passing) - not just typechecked. `verify:phase3` (11/11), `verify:auth` (16/16), and `verify:soft-delete` were re-run against the migrated Mock Connector and remain clean, confirming the migration changed nothing about existing, already-verified behavior. `pnpm typecheck`/`pnpm lint`/`pnpm build` all pass clean across the whole monorepo.

## Scope Boundary: What Sprint 1 Deliberately Does Not Include

`CONNECTOR_SDK.md` describes a much larger contract than any first sprint can meaningfully implement without a real provider to implement it against - building webhook receivers, OAuth flows, or attachment storage against nothing but the Mock Connector would be building untested scaffolding, not a proven contract. Per the user's own Sprint 1 scope (SDK foundation now, first real connector in Sprint 2), the following `CONNECTOR_SDK.md` sections are intentionally not yet implemented:

| Section | Item | Why deferred |
|---|---|---|
| 3.1 | OAuth2/credential-entry/bot-token auth flows | No real provider exists yet to authenticate against; `validateCredential`/`authenticate` exist and are ordering-safe, but nothing calls a real provider API yet |
| 4.1/4.2 | Webhook receiver / poll scheduler transport | The `Connector` interface's `initialSync`/`reconcile` produce sync *results*; wiring an actual HTTP webhook endpoint or a cron-driven poll loop is connector-specific integration work, meaningless to build against a synthetic provider |
| 6 | Health monitoring surfaced via `GET /v1/linked-accounts/{id}/health` | No `LinkedAccount` exists to have health | 
| 7 | Retry/backoff for real outbound provider calls | Nothing to retry against yet - the Mock Connector's `send()` simulates backpressure directly, which is what Sprint 1's certification actually needs |
| 9 (persistence) | `LinkedAccount` row + durable checkpoint storage in Postgres | The lifecycle state machine and checkpoint *shape* are real and certified; nothing writes either to a database yet - `DATABASE.md` Section 6.5's schema is not yet added to `packages/database/prisma/schema.prisma` |
| 12 | Attachment abstraction (pre-signed-URL upload, streaming) | Not part of the `Connector` interface itself; needs real media from a real provider to be meaningful |
| 13 | Identity-mapping platform integration | Already correctly out of the connector's own API surface per Section 13 itself ("connectors supply signal, they never make the merge decision") - `packages/identity`'s exact-match resolver (Phase 3) is the platform-side half of this and is unchanged |

None of these are silently dropped - each is exactly the kind of thing Sprint 2 (Telegram) will add for real, at which point the SDK's interface may need small, disclosed extensions (e.g., a webhook-payload-to-raw-event adapter shape) rather than a redesign, since Sprint 1's interface was deliberately built to accommodate them without needing to change `Connector`'s core shape.

## New Findings From This Review

### Deliberate simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | The lifecycle state machine's `onTransition` listener is not yet wired to real `EVENT_MODEL.md` `connector.*` events (`connector.connected`, `connector.reauth_required`, etc.) - `EventType` in `packages/event-model` was not extended. | `EVENT_MODEL.md`'s own stated policy is that the ~40-event catalog is "implemented incrementally as later phases need it," and nothing in Sprint 1 owns a persisted `LinkedAccount` to actually publish these events about yet - adding unused constants now would be dead code, not real wiring. | **Deferred** to Sprint 2, when Telegram integration gives the listener a real event-bus destination to wire to. |
| 2 | `MockConnector`'s synthetic sync data (12 initial-sync messages, 6 reconciliation messages) is a fixed, hardcoded bound rather than configurable per test run. | Sufficient for the certification suite's bounded-completion and checkpoint-resume checks; making it configurable would be speculative flexibility with no current consumer. | **Accepted** - can be revisited if a future test genuinely needs a different bound. |
| 3 | The Certification Suite's rate-limiting/backpressure check is structured to *skip* (not fail) for a connector that exposes no `simulateFailure()`/`send()` hook. | `simulateFailure()` is a Mock-Connector-specific test affordance (`CONNECTOR_SDK.md` Section 18: "configurable to simulate every failure mode... on demand"), not part of the core `Connector` interface - a real connector (Telegram) may not need or want this exact hook shape. Failing certification for every future connector that doesn't happen to implement this exact test seam would be the suite dictating implementation details beyond what Section 16's actual checklist requires. | **Accepted as designed** - the skip is visible in the certification report (`skipped: true`), never silently treated as a pass without being labeled as such. |

### Already-tracked gaps, still open (not new)

| # | Finding | First noted |
|---|---|---|
| 4 | Real ESLint/format/Husky - now closed (2026-07-18, prior session), listed here only to confirm it did not regress: `packages/connector-sdk`'s new code lints clean with 0 errors. | Phase 1/2 reviews, closed before this sprint |
| 5 | `packages/database`'s Prisma schema remains a pragmatic subset of `DATABASE.md`'s full spec - `LinkedAccount` (Section 6.5) is still spec-only, unchanged this sprint since Sprint 1 explicitly does not persist connector state. | Phase 1/2/3 reviews |

**TODOs**: none - grepped `packages/connector-sdk` and `scripts/certify-mock-connector.mjs` for `TODO`/`FIXME`/`HACK`/`XXX`, zero matches, consistent with every prior phase.

**Confirmed on-track, no deviation**: the lifecycle table matches `CONNECTOR_SDK.md` Section 2 verbatim (verified by the certification suite's graph-integrity and happy-path checks); the hybrid-by-default rule (Section 4.3) is enforced structurally, not just documented; the error taxonomy's 7 codes match Section 15 exactly; credential redaction is automatic, not opt-in; the normalization contract's required fields (Section 11) match exactly, including the newly-added `direction` field; UUIDv7 is unaffected (no new persisted rows this sprint).

## Decision Rule Applied

Same rule as every prior phase: implement now only what's more expensive to retrofit later; defer everything else to its already-assigned scope. This sprint's design choices (`BaseConnector`'s structural credential-validation ordering guarantee, automatic redaction inside `ConnectorError`, the checkpoint-purity requirement that makes the restart-simulation certification check meaningful rather than superficial) were all "build it right the first time" calls, since retrofitting structural guarantees after Telegram (Sprint 2) already exists would mean either a breaking interface change or a connector shipped without them. Everything in the scope-boundary table above was correctly left for Sprint 2, where a real provider makes each item testable for real instead of against synthetic data.

## Outcome

The Connector SDK exists as a real, certified contract - not a diagram. The Capability Manifest and lifecycle state machine are implemented and structurally enforce `CONNECTOR_SDK.md`'s stated rules rather than merely documenting them. The Connector Certification Suite exists and is CI-runnable (`pnpm --filter @smc/scripts certify:mock-connector`), mechanically verifying 16 checks drawn from the Section 16 checklist. The Mock Connector is migrated onto the SDK with zero disruption to `apps/api`'s existing consumer. All pre-existing verification scripts (`verify:phase3`, `verify:auth`, `verify:soft-delete`) pass unchanged, confirming the migration was additive, not disruptive. One field (`direction`) was added to the shared canonical message shape to close a real, if minor, normalization-contract gap. No ADR was required - this sprint implements previously-documented architecture (`CONNECTOR_SDK.md`, gating Phase 1 since 2026-07-18) rather than deviating from it.
