-- One support ticket per match fee invoice.
-- Drop orphan tickets (no invoice) and keep the earliest ticket when duplicates exist.

DELETE FROM "support_tickets"
WHERE "match_fee_invoice_id" IS NULL;

DELETE FROM "support_tickets" st
USING "support_tickets" newer
WHERE st."match_fee_invoice_id" = newer."match_fee_invoice_id"
  AND (
    st."created_at" > newer."created_at"
    OR (st."created_at" = newer."created_at" AND st."id" > newer."id")
  );

ALTER TABLE "support_tickets"
  DROP CONSTRAINT IF EXISTS "support_tickets_match_fee_invoice_id_fkey";

ALTER TABLE "support_tickets"
  ALTER COLUMN "match_fee_invoice_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_match_fee_invoice_id_key"
  ON "support_tickets"("match_fee_invoice_id");

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_match_fee_invoice_id_fkey"
  FOREIGN KEY ("match_fee_invoice_id") REFERENCES "match_fee_invoices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
