-- Phase 21.6: user-initiated scheduled message send. Distinct from
-- scheduled_jobs, which is only ever created by a time.no_reply_after rule
-- and requires a rule_id - this table is for a reply the user schedules
-- directly, no rule involved.

CREATE TABLE "scheduled_messages" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "body_text" TEXT NOT NULL,
    "send_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_message_id" UUID,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_scheduled_messages_workspace_status_send_at" ON "scheduled_messages" ("workspace_id", "status", "send_at");
