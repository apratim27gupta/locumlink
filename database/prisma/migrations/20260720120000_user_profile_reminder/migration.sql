-- Admin profile-completion reminder tracking on users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_profile_reminder_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_profile_reminder_channel" TEXT;
