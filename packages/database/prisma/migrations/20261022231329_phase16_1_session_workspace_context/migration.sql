-- AlterTable: add nullable first, backfill, then enforce NOT NULL - the
-- generated migration couldn't do this in one step since `sessions` had
-- existing rows with no way to default this value.
ALTER TABLE "sessions" ADD COLUMN "workspace_id" UUID;

-- Backfill: give every existing session the exact same workspace
-- AuthService.refresh()/login() would already have picked for it before
-- this migration (the user's oldest membership, by joined_at) - this is
-- not a behavior change for any already-issued session, only a
-- persistence of what was already being recomputed on every refresh.
UPDATE "sessions" s
SET "workspace_id" = (
  SELECT wm."workspace_id"
  FROM "workspace_members" wm
  WHERE wm."user_id" = s."user_id" AND wm."deleted_at" IS NULL
  ORDER BY wm."joined_at" ASC
  LIMIT 1
)
WHERE s."workspace_id" IS NULL;

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
