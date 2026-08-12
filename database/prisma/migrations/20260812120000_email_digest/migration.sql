-- Per-user email digest state (last flush / rolling timer per category).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_digest_state" JSONB;

-- Marks notification events already included in a digest email.
ALTER TABLE "notification_events"
  ADD COLUMN IF NOT EXISTS "email_digest_included_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "notification_events_digest_idx"
  ON "notification_events" ("recipientId", "eventType", "email_digest_included_at");
