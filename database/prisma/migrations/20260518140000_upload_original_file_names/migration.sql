ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "license_original_name" TEXT;
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "resume_original_name" TEXT;
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "extra_original_name" TEXT;
ALTER TABLE "host_profiles" ADD COLUMN IF NOT EXISTS "license_original_name" TEXT;
