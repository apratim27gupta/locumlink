-- AlterTable
ALTER TABLE "locum_profiles" ADD COLUMN "credential_submitted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "host_profiles" ADD COLUMN "credential_submitted_at" TIMESTAMP(3);

-- Backfill queue timestamps from last profile update for existing pending rows
UPDATE "locum_profiles"
SET "credential_submitted_at" = "updated_at"
WHERE "credential_submitted_at" IS NULL
  AND "cpsns_verification_status" IN ('UNVERIFIED', 'PENDING_REVIEW', 'REJECTED');

UPDATE "host_profiles"
SET "credential_submitted_at" = "updated_at"
WHERE "credential_submitted_at" IS NULL
  AND "cpsns_verification_status" IN ('UNVERIFIED', 'PENDING_REVIEW', 'REJECTED');
