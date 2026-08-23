# Runbook: Connector Credentials Encryption Key Rotation

Applies to `CredentialsStoreService` (`apps/api/src/credentials-store/`), the interim Postgres+AES-256-GCM envelope-encryption store for connector credentials (ADR-0016). This runbook does not apply to `JWT_SECRET`, database credentials, or any other secret - only `CREDENTIALS_ENCRYPTION_KEY`.

**No production key rotation has been performed using this runbook yet.** It documents the procedure; the current production key was set once (see `docs/STATUS.md`) and has not been rotated.

## 1. How the current key is defined

`CREDENTIALS_ENCRYPTION_KEY` (Railway env var, `@smc/api` production service) - a 64-character hex string (32 bytes, AES-256), treated as key version 1. Never committed anywhere. In any non-production environment, if unset, `apps/api` derives an insecure, deterministic dev-only key instead (loudly logged, and structurally incapable of running in production - see Section 9).

## 2. How a new key is generated

Same method used for the `JWT_SECRET` rotation earlier this project:

```
node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))' | npx @railway/cli variable set CREDENTIALS_ENCRYPTION_KEY_V2 --stdin --json
```

This pipes the value directly into Railway - it is never displayed in a terminal, never logged, never written to a file.

## 3. How the key version is incremented

1. Generate and set `CREDENTIALS_ENCRYPTION_KEY_V2` (Section 2) - `CREDENTIALS_ENCRYPTION_KEY` (v1) stays set and unchanged.
2. Set `CREDENTIALS_ENCRYPTION_ACTIVE_VERSION=2` - from this point on, every new `putSecret` call encrypts under v2; every existing v1 row still decrypts correctly (`SecretRecord.keyVersion` routes each row to its own key).
3. Redeploy `@smc/api` so both env vars are live.

## 4. Old + new key overlap period

Both `CREDENTIALS_ENCRYPTION_KEY` (v1) and `CREDENTIALS_ENCRYPTION_KEY_V2` (v2) must remain set simultaneously for as long as any `SecretRecord` row still has `keyVersion=1` - removing v1 early makes those rows permanently undecryptable. There is no time pressure to shorten this window; the only requirement is completing Section 6 before Section 8.

## 5. How to dry-run

```
pnpm --filter @smc/scripts run rotate:credentials-key
```

Reports the total record count and a breakdown by `keyVersion`, and how many records would be rotated to the active version. Makes no changes. Never prints a plaintext, a key, a ciphertext, an IV, or an auth tag - only refs (UUIDs) and counts.

## 6. How to perform the re-encryption

```
pnpm --filter @smc/scripts run rotate:credentials-key -- --execute
```

For each record not already on the active key version: decrypts with its recorded key version (plaintext held only in process memory, never logged), re-encrypts under the active version with a fresh IV, and updates the same row (`id`/`credentialsRef` unchanged - connectors and `LinkedAccount` are completely unaffected). Idempotent - safe to re-run; already-current records are skipped. If any record fails, the script logs its ref (never its content), continues with the rest, and **exits non-zero** if `errors > 0` - do not treat a "rotation completed" message alone as success without checking the exit code.

Not run automatically anywhere - no `prestart` hook, no CI step, no scheduled job. Always a deliberate, manual action.

## 7. How to verify

```
pnpm --filter @smc/scripts run verify:credentials-key-rotation
```

Runs scenarios A-K against an isolated test org/workspace (created and cleaned up by the script itself) - multi-version encrypt/decrypt, cross-version read correctness, tamper detection (ciphertext and auth tag), the rotation round-trip, audit-log correctness, and post-delete unreadability. This is a data-layer check independent of the running API process.

Separately, re-run the dry-run (Section 5) - it should now report zero records on the old version.

## 8. When to remove the old key

Only after: the dry-run (Section 5) reports zero records on the old version, `verify:credentials-key-rotation` passes, and at least one real connector send has been confirmed working end-to-end post-rotation (a live smoke test, not just the script). Then unset `CREDENTIALS_ENCRYPTION_KEY` (the old v1 value) and rename `CREDENTIALS_ENCRYPTION_KEY_V2` to `CREDENTIALS_ENCRYPTION_KEY` (or introduce a v3 slot for the next rotation - either is fine, `credentialsStoreConfig` doesn't require the active key to always be named `_V2`).

## 9. Rollback

- **Before Section 6 (`--execute`) has run**: trivial - nothing has changed. Unset `CREDENTIALS_ENCRYPTION_ACTIVE_VERSION` and/or the new key var.
- **After `--execute`**: rotation is a per-row `UPDATE`, not a bulk irreversible operation - as long as the *old* key is still configured (Section 4's overlap window), any record can be manually reverted by re-running the same decrypt/encrypt logic in the opposite direction. There is no automated rollback tool for this - if needed, treat it as a repeat of Section 6 with the active version pointed back at the old one.
- If the *new* key itself turns out to be compromised or wrong: do not remove the old key until every affected row has been confirmed rotated back or the new key is fixed and re-rotated.

## 10. When a connector reconnect is required

Never, as a consequence of key rotation itself. `LinkedAccount.credentialsRef` never changes, and the plaintext credential is byte-for-byte identical before and after rotation - only the encryption key protecting it changes. A reconnect is only needed for the usual, unrelated reasons (the provider revoked the token, `status: reauth_required`, etc.).

## 11. Production key handling rules (apply throughout this entire runbook)

- Never print, log, or echo a production key value, in full or in part - not to a terminal, not to a file, not into a commit, not into this runbook's own output.
- Use `--stdin`/piped input for every `railway variable set` call (Section 2) - never `--set KEY=value` with the value inline in a command (it would appear in shell history).
- The rotation and verification scripts (Sections 5-7) are designed to never require printing a key to do their job - if a future change to either script would need to display one, stop and reconsider the design rather than adding a print statement.
