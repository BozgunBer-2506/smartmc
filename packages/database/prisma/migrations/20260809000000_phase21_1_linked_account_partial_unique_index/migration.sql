-- Phase 21.1: replace linked_accounts' full-table unique index with a
-- partial unique index scoped to active (non-soft-deleted) rows.
--
-- The old index blocked ever reconnecting the same external account
-- after a disconnect: the soft-deleted row still occupied the
-- (workspace_id, provider_id, external_account_id) key, so a reconnect's
-- INSERT hit a real Postgres unique-violation (P2002) regardless of any
-- deletedAt filtering in application code.
--
-- Real index name confirmed live against a running dev database
-- (`\d linked_accounts`) rather than assumed from schema.prisma's own
-- `@@unique(..., name: "uq_linked_accounts_workspace_provider_external")` -
-- this database predates that `name:` being added, so Postgres is still
-- using its own auto-generated name for the original index.

DROP INDEX IF EXISTS "linked_accounts_workspace_id_provider_id_external_account_i_key";
DROP INDEX IF EXISTS "uq_linked_accounts_workspace_provider_external";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_linked_accounts_workspace_provider_external_active"
ON "linked_accounts" ("workspace_id", "provider_id", "external_account_id")
WHERE "deleted_at" IS NULL;
