-- Phase 20.3: indexes backing GET /v1/contacts, /v1/conversations,
-- /v1/notifications, and /v1/rules' keyset pagination (default order and
-- new ?sortBy= options). Contact/Conversation/Notification had no index at
-- all prior to this migration - every page of every workspace's list was a
-- full table scan.

CREATE INDEX "idx_contacts_workspace_id_display_name_id" ON "contacts"("workspace_id", "display_name", "id");
CREATE INDEX "idx_contacts_workspace_id_created_at_id" ON "contacts"("workspace_id", "created_at", "id");

CREATE INDEX "idx_conversations_workspace_id_priority_last_message_id" ON "conversations"("workspace_id", "priority_score", "last_message_at", "id");
CREATE INDEX "idx_conversations_workspace_id_last_message_at_id" ON "conversations"("workspace_id", "last_message_at", "id");
CREATE INDEX "idx_conversations_workspace_id_created_at_id" ON "conversations"("workspace_id", "created_at", "id");

CREATE INDEX "idx_notifications_workspace_id_created_at_id" ON "notifications"("workspace_id", "created_at", "id");

CREATE INDEX "idx_rules_workspace_id_priority_created_at_id" ON "rules"("workspace_id", "priority", "created_at", "id");
CREATE INDEX "idx_rules_workspace_id_created_at_id" ON "rules"("workspace_id", "created_at", "id");
CREATE INDEX "idx_rules_workspace_id_updated_at_id" ON "rules"("workspace_id", "updated_at", "id");
CREATE INDEX "idx_rules_workspace_id_name_id" ON "rules"("workspace_id", "name", "id");
