-- Allow a second invoice per application for half→full tier top-ups after placement ends.
CREATE TYPE "MatchFeeInvoiceKind" AS ENUM ('PRIMARY', 'TIER_TOP_UP');

ALTER TABLE "match_fee_invoices"
  ADD COLUMN "kind" "MatchFeeInvoiceKind" NOT NULL DEFAULT 'PRIMARY';

DROP INDEX IF EXISTS "match_fee_invoices_application_id_key";

CREATE UNIQUE INDEX "match_fee_invoices_application_id_kind_key"
  ON "match_fee_invoices"("application_id", "kind");

CREATE INDEX "match_fee_invoices_job_posting_id_status_idx"
  ON "match_fee_invoices"("job_posting_id", "status");
