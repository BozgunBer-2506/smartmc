# 0016 - Interim Envelope-Encrypted Secrets Store for Connector Credentials

- Status: Accepted
- Date: 2026-07-19
- Deciders: Founder/CTO
- Related: [SECURITY.md](../SECURITY.md) Section 5, [DATABASE.md](../DATABASE.md) Section 6.5, [CONNECTOR_SDK.md](../CONNECTOR_SDK.md) Section 3.2

## Context

`SECURITY.md` Section 5 is explicit and stated as a hard boundary: connector credentials (bot tokens, OAuth tokens, IMAP passwords) are stored in an external secrets manager (AWS Secrets Manager / HashiCorp Vault), never in the primary database, "even temporarily or for debugging." `DATABASE.md` Section 6.5's `LinkedAccount.credentials_ref` is designed as an opaque pointer into that external store, never the credential itself.

Phase 4 Sprint 2 needs to persist a real Telegram bot token to make real Bot API calls (`getMe`, `setWebhook`, `sendMessage`) on the user's behalf. No external secrets manager exists in this project - provisioning Vault (self-hosted infrastructure) or AWS Secrets Manager (a cloud account/IAM setup) is genuinely new infrastructure with real operational cost, and standing one up is not what "build the first real connector" scope calls for. Building it anyway, just to satisfy this one field, would be exactly the kind of premature infrastructure `ROADMAP.md`'s working rules warn against.

This is a real implementation constraint, not a preference - the connector cannot function without storing the token somewhere retrievable, and the documented external-secrets-manager design isn't buildable yet.

## Decision

Ship a `CredentialsStoreService` interface (`apps/api/src/credentials-store/credentials-store.service.ts` - named to avoid colliding with `.gitignore`'s broad `secrets/`/`secrets.*` patterns, which are there to catch accidental credential-dump commits, not to block a legitimately-named source module) with exactly the operations a connector needs: `putSecret(plaintext) -> { ref }`, `getSecret(ref) -> plaintext`, `deleteSecret(ref) -> void`. `LinkedAccount.credentialsRef` stores whatever opaque `ref` this service returns - the connector and platform code that calls through it never know or care whether the backing store is a real secrets manager or not.

Sprint 2 implements this interface with **envelope encryption inside Postgres**: a new `secret_records` table (`id`, `ciphertext`, `iv`, `auth_tag`, `created_at`) holds AES-256-GCM-encrypted blobs, keyed by a master key read from `CREDENTIALS_ENCRYPTION_KEY` (an environment variable, not committed anywhere, following this project's existing config pattern - `apps/api/src/config/auth.config.ts`). `secret_records` is deliberately **not** a soft-deletable model (unlike almost every other table in this schema) - `deleteSecret()` performs a real, hard `DELETE`, because `SECURITY.md` Section 5.2's guarantee ("disconnecting a LinkedAccount unconditionally deletes the secret") requires the plaintext to actually become unrecoverable, which a soft-deleted, still-decryptable row would not achieve.

This is disclosed as an interim measure, not presented as the final design:
- It preserves the *architecture* `SECURITY.md`/`DATABASE.md` already specify - `credentials_ref` indirection, no raw credential ever touching `LinkedAccount` or application logs, unconditional deletion on disconnect - while being honest that the *backing implementation* is local encryption, not a managed external secrets manager.
- Swapping to real Vault/AWS Secrets Manager later means implementing `CredentialsStoreService` against that backend and changing one provider wiring point (`apps/api/src/credentials-store/credentials-store.module.ts`) - no change to `LinkedAccount`, `TelegramConnector`, or any other connector's code, since none of them talk to the secrets backend directly.

## Consequences

- A single compromised `CREDENTIALS_ENCRYPTION_KEY` (e.g. a leaked environment variable) can decrypt every stored connector credential, since there is no per-secret KMS-managed key rotation or IAM-scoped per-connector access the way a real secrets manager would provide. This is a real, disclosed security posture reduction versus `SECURITY.md` Section 5's target design, acceptable only because this is pre-production and the alternative (standing up Vault/AWS for one field) is disproportionate to Sprint 2's actual need.
- Recorded as a known gap in `docs/reviews/phase-4-sprint-2-review.md` and `docs/STATUS.md`'s open-gaps list, to be closed before any real customer credential is ever stored in a production deployment - not deferred silently.
- `SECURITY.md` is not rewritten - it still correctly documents the target design; this ADR is the record of why Sprint 2 doesn't build it yet.

## Update (2026-08-23): Key rotation hardening

A credentials-security audit (`docs/STATUS.md`) confirmed the AES-256-GCM implementation itself was correct (unique IVs, verified auth tags, real hard-delete) but found the operational gaps this ADR already predicted in Consequences above were still real: one static key with no rotation path, and a hardcoded fallback that could theoretically reach production if the env var were ever unset there. Closed in this pass, without introducing an external secrets manager (still out of scope - see below):

- **Key versioning**: `SecretRecord.keyVersion` records which key encrypted each row; `credentials-store.config.ts` now supports a small key ring (`CREDENTIALS_ENCRYPTION_KEY` = v1, optional `CREDENTIALS_ENCRYPTION_KEY_V2` = v2, `CREDENTIALS_ENCRYPTION_ACTIVE_VERSION` selects which one new secrets use). `getSecret` picks the matching key per row instead of assuming there's only ever been one.
- **Rotation tooling**: `scripts/rotate-credentials-key.mjs` (dry-run by default, explicit `--execute` to write) re-encrypts old-version rows to the active key without touching `credentialsRef` or any connector code, and without ever requiring a user to reconnect. `scripts/verify-credentials-key-rotation.mjs` covers the rotation round-trip and tamper-detection paths at the data layer. See `docs/runbooks/credentials-key-rotation.md`.
- **Hardcoded fallback closed off in production**: `credentialsStoreConfig` now throws at `apps/api` startup (`main.ts`, before the server binds) if `NODE_ENV === "production"` and no real key is configured - the dev-derived fallback key is inside a runtime `NODE_ENV !== "production"` branch, not just a doc comment, so it cannot be reached in a real deployment even by accident. Local development is unaffected.
- **Retrieval audit trail (partial)**: `getSecret` now optionally logs a `credential.retrieved` audit event via the existing `AuditLogService` - enabled for actual credential *use* (a live or scheduled message send, a rule-triggered send, a disconnect flow, establishing a Discord Gateway connection), deliberately **not** enabled for routine reconciliation/poll-cycle retrievals (every 15 minutes per connected account) to avoid flooding `audit_logs` with routine, low-value entries; a poller's decrypt failure still surfaces via the pre-existing `LinkedAccount.lastError`/`status: "degraded"` mechanism, unchanged by this pass.

**Still open, unchanged by this pass** (both already disclosed in Consequences above, neither addressed by Postgres-side hardening alone): no IAM-scoped per-connector-worker access (any code path in the single `@smc/api` process that can call `CredentialsStoreService` can still decrypt any secret); no independent, secrets-manager-native audit trail outside the application's own database. `CredentialsStoreService.getSecret` also still performs no workspace-scoping check of its own - every caller already supplies a `ref` obtained from a workspace-scoped `LinkedAccount` query, but that's caller discipline, not something the credentials layer enforces by construction. A real external secrets manager (AWS Secrets Manager / Vault) remains the documented target design for closing these - evaluated and deliberately not built in this pass, since SmartMC's current single-process architecture doesn't yet have anywhere else that would benefit from IAM-scoped worker isolation either. Recorded as a future option, not implemented.
