ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "requested_shift_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterEnum: add HALF_DAY for SLOTS postings (legacy HALF_DAY_AM/PM unchanged)
ALTER TYPE "ShiftType" ADD VALUE IF NOT EXISTS 'HALF_DAY';

-- CreateEnum
CREATE TYPE "ScheduleModel" AS ENUM ('LEGACY', 'SLOTS');

-- AlterTable: existing postings stay LEGACY
ALTER TABLE "job_postings"
  ADD COLUMN IF NOT EXISTS "schedule_model" "ScheduleModel" NOT NULL DEFAULT 'LEGACY';

-- AlterTable: optional fee tier snapshot on invoices
ALTER TABLE "match_fee_invoices"
  ADD COLUMN IF NOT EXISTS "claimed_hours" DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS "match_fee_tier" TEXT;

-- CreateTable: per-shift locum claims (SLOTS)
CREATE TABLE IF NOT EXISTS "application_shift_claims" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_shift_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "application_shift_claims_application_id_shift_id_key"
  ON "application_shift_claims"("application_id", "shift_id");

CREATE UNIQUE INDEX IF NOT EXISTS "application_shift_claims_shift_id_key"
  ON "application_shift_claims"("shift_id");

CREATE INDEX IF NOT EXISTS "application_shift_claims_application_id_idx"
  ON "application_shift_claims"("application_id");

DO $$ BEGIN
  ALTER TABLE "application_shift_claims"
    ADD CONSTRAINT "application_shift_claims_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "applications"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "application_shift_claims"
    ADD CONSTRAINT "application_shift_claims_shift_id_fkey"
    FOREIGN KEY ("shift_id") REFERENCES "shifts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
