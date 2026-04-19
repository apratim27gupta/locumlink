-- Locum profile: persist setup wizard address, specialization text, and document filenames.

ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "address1" TEXT;
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "address2" TEXT;
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "postal_code" TEXT;
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "province" TEXT;
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "specialization_text" TEXT;
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "license_file_name" TEXT;
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "resume_file_name" TEXT;
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "extra_file_name" TEXT;
