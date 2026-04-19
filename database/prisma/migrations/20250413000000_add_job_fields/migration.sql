-- Add extended fields to job_postings
ALTER TABLE IF EXISTS "job_postings" ADD COLUMN IF NOT EXISTS "key_responsibilities" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE IF EXISTS "job_postings" ADD COLUMN IF NOT EXISTS "start_date" DATE;
ALTER TABLE IF EXISTS "job_postings" ADD COLUMN IF NOT EXISTS "end_date" DATE;
ALTER TABLE IF EXISTS "job_postings" ADD COLUMN IF NOT EXISTS "start_time" VARCHAR(10);
ALTER TABLE IF EXISTS "job_postings" ADD COLUMN IF NOT EXISTS "end_time" VARCHAR(10);
ALTER TABLE IF EXISTS "job_postings" ADD COLUMN IF NOT EXISTS "pay_per_day" DECIMAL(10,2);
ALTER TABLE IF EXISTS "job_postings" ADD COLUMN IF NOT EXISTS "min_years_experience" INTEGER;
ALTER TABLE IF EXISTS "job_postings" ADD COLUMN IF NOT EXISTS "max_applicants" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE IF EXISTS "job_postings" ADD COLUMN IF NOT EXISTS "travel_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "job_postings" ADD COLUMN IF NOT EXISTS "schedule_flexible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "job_postings" ADD COLUMN IF NOT EXISTS "required_credentials" TEXT[] NOT NULL DEFAULT '{}';

-- Add name fields to locum_profiles for display in applicants list
ALTER TABLE IF EXISTS "locum_profiles" ADD COLUMN IF NOT EXISTS "first_name" TEXT;
ALTER TABLE IF EXISTS "locum_profiles" ADD COLUMN IF NOT EXISTS "last_name" TEXT;