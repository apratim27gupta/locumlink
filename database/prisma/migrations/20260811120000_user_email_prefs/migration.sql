-- Email notification preferences (JSON). Null / missing keys = all categories ON.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_prefs" JSONB;
