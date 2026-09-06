-- AlterTable
ALTER TABLE "job_postings" ADD COLUMN "published_at" TIMESTAMP(3);

-- Intentionally no backfill: existing jobs keep using createdAt via
-- publishedAt ?? createdAt. Only future publishes set published_at.
