-- AlterTable
ALTER TABLE "job_postings" ADD COLUMN IF NOT EXISTS "practice_type" TEXT;
ALTER TABLE "job_postings" ADD COLUMN IF NOT EXISTS "num_physicians" TEXT;
ALTER TABLE "job_postings" ADD COLUMN IF NOT EXISTS "emr" TEXT;
ALTER TABLE "job_postings" ADD COLUMN IF NOT EXISTS "patient_vol" TEXT;
ALTER TABLE "job_postings" ADD COLUMN IF NOT EXISTS "clinic_desc" TEXT;
