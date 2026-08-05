-- Phase 20.4: NotificationPreference gains a version column so
-- PATCH /v1/notification-preferences can use real If-Match optimistic
-- concurrency instead of a blind upsert.

ALTER TABLE "notification_preferences" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
