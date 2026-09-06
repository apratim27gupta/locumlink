-- Soft-delete former CANCELLED postings, introduce SCHEDULED, drop CANCELLED.

UPDATE "job_postings"
SET "is_deleted" = true
WHERE status::text = 'CANCELLED';

UPDATE "job_postings"
SET status = 'EXPIRED'
WHERE status::text = 'CANCELLED';

CREATE TYPE "PostingStatus_new" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'SCHEDULED',
  'ONGOING',
  'COMPLETED',
  'EXPIRED'
);

ALTER TABLE "job_postings" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "job_postings"
  ALTER COLUMN "status" TYPE "PostingStatus_new"
  USING (
    CASE status::text
      WHEN 'ONGOING' THEN 'ONGOING'::"PostingStatus_new"
      WHEN 'COMPLETED' THEN 'COMPLETED'::"PostingStatus_new"
      WHEN 'EXPIRED' THEN 'EXPIRED'::"PostingStatus_new"
      WHEN 'ACTIVE' THEN 'ACTIVE'::"PostingStatus_new"
      WHEN 'DRAFT' THEN 'DRAFT'::"PostingStatus_new"
      ELSE 'EXPIRED'::"PostingStatus_new"
    END
  );

DROP TYPE "PostingStatus";
ALTER TYPE "PostingStatus_new" RENAME TO "PostingStatus";
ALTER TABLE "job_postings" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"PostingStatus";

-- Jobs that were marked ONGOING on accept before start should be SCHEDULED.
UPDATE "job_postings" j
SET status = 'SCHEDULED'
WHERE j.status = 'ONGOING'
  AND j.is_deleted = false
  AND j.start_date IS NOT NULL
  AND j.start_date > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
  AND EXISTS (
    SELECT 1 FROM applications a
    WHERE a."jobPostingId" = j.id
      AND (a."locumResponse" = 'ACCEPTED' OR a."locum_accepted_at" IS NOT NULL)
  );
