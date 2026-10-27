-- Migration-safety fix (pre-production review): the index this backfill
-- actually needs is created FIRST, before any backfill query runs against
-- `workspace_members` - the original version of this migration ran the
-- backfill with no usable index on `workspace_members.user_id` at all
-- (the table's only existing index, the composite unique on
-- (workspace_id, user_id), can't serve a user_id-only lookup since
-- user_id isn't its leading column), making the backfill an effective
-- sequential scan of `workspace_members` once per row of `sessions`.
CREATE INDEX "idx_workspace_members_user_id" ON "workspace_members"("user_id");

-- AlterTable: add nullable first, backfill, then enforce NOT NULL - the
-- generated migration couldn't do this in one step since `sessions` had
-- existing rows with no way to default this value.
ALTER TABLE "sessions" ADD COLUMN "workspace_id" UUID;

-- Backfill: give every existing session the exact same workspace
-- AuthService.refresh()/login() would already have picked for it before
-- this migration (the user's oldest membership, by joined_at) - this is
-- not a behavior change for any already-issued session, only a
-- persistence of what was already being recomputed on every refresh.
--
-- Rewritten (pre-production review) from a correlated subquery
-- (re-executed once per `sessions` row) to a single pre-aggregated
-- `DISTINCT ON` pass over `workspace_members` - now backed by the index
-- created above - joined once against `sessions`. One scan of each
-- table instead of one scan of `workspace_members` per session row;
-- EXPLAIN ANALYZE confirms the query plan actually uses the new index
-- (see this task's benchmark results, not re-derived here).
UPDATE "sessions" s
SET "workspace_id" = oldest_membership."workspace_id"
FROM (
  SELECT DISTINCT ON (wm."user_id") wm."user_id", wm."workspace_id"
  FROM "workspace_members" wm
  WHERE wm."deleted_at" IS NULL
  ORDER BY wm."user_id", wm."joined_at" ASC
) AS oldest_membership
WHERE oldest_membership."user_id" = s."user_id" AND s."workspace_id" IS NULL;

-- A session whose user has no remaining membership at all (e.g. the
-- account was since deleted but a session row outlived it in a way the
-- normal deletion flow doesn't produce) cannot be backfilled and is
-- already unusable - refresh()/login() could never have resolved a
-- workspace for it either. Removed rather than leaving a NULL that would
-- fail the NOT NULL constraint below.
DELETE FROM "sessions" WHERE "workspace_id" IS NULL;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "workspace_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "idx_sessions_workspace_id" ON "sessions"("workspace_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
