-- AlterTable
ALTER TABLE "applications" ADD COLUMN "host_viewed_at" TIMESTAMP(3);

-- Intentionally no backfill: existing applications show as not yet viewed
-- until the host next opens the applicant.
