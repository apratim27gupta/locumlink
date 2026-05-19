-- Legacy DB used PostingStatus FILLED; schema uses ONGOING / COMPLETED instead.
UPDATE "job_postings" SET status = 'ACTIVE' WHERE status::text = 'FILLED';

-- PostingStatus: replace FILLED with ONGOING + COMPLETED
BEGIN;
CREATE TYPE "PostingStatus_new" AS ENUM ('DRAFT', 'ACTIVE', 'ONGOING', 'COMPLETED', 'CANCELLED', 'EXPIRED');
ALTER TABLE "job_postings" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "job_postings" ALTER COLUMN "status" TYPE "PostingStatus_new" USING ("status"::text::"PostingStatus_new");
ALTER TYPE "PostingStatus" RENAME TO "PostingStatus_old";
ALTER TYPE "PostingStatus_new" RENAME TO "PostingStatus";
DROP TYPE "PostingStatus_old";
ALTER TABLE "job_postings" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- Application.locumResponse (schema field, never migrated)
DO $$ BEGIN
  CREATE TYPE "LocumResponse" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "locumResponse" "LocumResponse";
