-- One-click pay links in match-fee reminder emails: per-invoice secret token.
ALTER TABLE "match_fee_invoices"
  ADD COLUMN "pay_access_token" TEXT;

CREATE UNIQUE INDEX "match_fee_invoices_pay_access_token_key"
  ON "match_fee_invoices" ("pay_access_token");
