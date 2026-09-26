-- Allow re-apply after withdraw as a new application row.
-- Drop the full (job, locum) unique; keep at most one non-WITHDRAWN application
-- per job + locum via a partial unique index.
DROP INDEX IF EXISTS "applications_jobPostingId_locumProfileId_key";

CREATE UNIQUE INDEX "applications_jobPostingId_locumProfileId_active_key"
  ON "applications"("jobPostingId", "locumProfileId")
  WHERE "status" <> 'WITHDRAWN';

CREATE INDEX IF NOT EXISTS "applications_jobPostingId_locumProfileId_idx"
  ON "applications"("jobPostingId", "locumProfileId");
