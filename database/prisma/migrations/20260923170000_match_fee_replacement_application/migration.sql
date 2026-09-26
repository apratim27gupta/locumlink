-- Track which application replaced the original invoiced locum (one per invoice).
ALTER TABLE "match_fee_invoices"
  ADD COLUMN IF NOT EXISTS "replacement_application_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "match_fee_invoices_replacement_application_id_key"
  ON "match_fee_invoices"("replacement_application_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'match_fee_invoices_replacement_application_id_fkey'
  ) THEN
    ALTER TABLE "match_fee_invoices"
      ADD CONSTRAINT "match_fee_invoices_replacement_application_id_fkey"
      FOREIGN KEY ("replacement_application_id") REFERENCES "applications"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
