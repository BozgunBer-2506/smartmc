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
