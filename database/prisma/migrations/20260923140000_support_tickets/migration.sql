-- Host post-completion support tickets + partial refund tracking on match fees.
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "host_profile_id" TEXT NOT NULL,
    "job_posting_id" TEXT NOT NULL,
    "match_fee_invoice_id" TEXT,
    "message" VARCHAR(2000) NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "admin_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at");
CREATE INDEX "support_tickets_host_profile_id_created_at_idx" ON "support_tickets"("host_profile_id", "created_at");
CREATE INDEX "support_tickets_job_posting_id_idx" ON "support_tickets"("job_posting_id");

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_host_profile_id_fkey"
  FOREIGN KEY ("host_profile_id") REFERENCES "host_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_job_posting_id_fkey"
  FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_match_fee_invoice_id_fkey"
  FOREIGN KEY ("match_fee_invoice_id") REFERENCES "match_fee_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "match_fee_invoices"
  ADD COLUMN IF NOT EXISTS "refunded_cents" INTEGER NOT NULL DEFAULT 0;
