-- Credentials security hardening: secret_records gains a key_version
-- column so CredentialsStoreService can support key rotation. Existing
-- rows deterministically become version 1 (the only key that has ever
-- existed) - non-destructive, no backfill script needed.

ALTER TABLE "secret_records" ADD COLUMN "key_version" INTEGER NOT NULL DEFAULT 1;
