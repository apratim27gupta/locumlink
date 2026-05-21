-- Align host_profiles rejection columns with schema.prisma (may already exist locally)
ALTER TABLE "host_profiles" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
ALTER TABLE "host_profiles" ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3);
