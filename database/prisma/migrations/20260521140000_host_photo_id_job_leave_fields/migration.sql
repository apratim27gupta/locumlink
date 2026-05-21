-- Align DB with schema.prisma (HostProfile photo ID, JobPosting leave fields)

ALTER TABLE "host_profiles" ADD COLUMN IF NOT EXISTS "photo_id_file" TEXT;
ALTER TABLE "host_profiles" ADD COLUMN IF NOT EXISTS "photo_id_original_name" TEXT;

ALTER TABLE "job_postings" ADD COLUMN IF NOT EXISTS "leave_type" TEXT;
ALTER TABLE "job_postings" ADD COLUMN IF NOT EXISTS "full_half_day" TEXT;
