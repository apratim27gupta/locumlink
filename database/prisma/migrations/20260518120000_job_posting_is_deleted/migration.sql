-- Align DB with schema.prisma JobPosting.isDeleted @map("is_deleted")
ALTER TABLE "job_postings" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
