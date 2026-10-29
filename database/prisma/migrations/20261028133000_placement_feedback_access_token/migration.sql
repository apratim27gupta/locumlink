-- AlterTable
ALTER TABLE "placement_feedback" ADD COLUMN "access_token" TEXT;

-- Backfill existing rows with unique tokens
UPDATE "placement_feedback"
SET "access_token" = md5(random()::text || id || clock_timestamp()::text)
WHERE "access_token" IS NULL;

-- Enforce NOT NULL + unique
ALTER TABLE "placement_feedback" ALTER COLUMN "access_token" SET NOT NULL;

CREATE UNIQUE INDEX "placement_feedback_access_token_key" ON "placement_feedback"("access_token");
