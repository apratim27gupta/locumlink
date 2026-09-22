-- CreateEnum
CREATE TYPE "MatchFeeInvoiceEventType" AS ENUM ('INVOICED', 'PAID', 'OVERDUE', 'PAYMENT_REMINDER', 'CANCELLED', 'REPLACEMENT_SEARCHING', 'REPLACEMENT_FOUND', 'REPLACEMENT_NOT_FOUND', 'REFUNDED', 'ESCALATED', 'ADMIN_NOTE');

-- CreateEnum
CREATE TYPE "MatchFeeInvoiceEventActor" AS ENUM ('SYSTEM', 'HOST', 'LOCUM', 'ADMIN');

-- AlterTable
ALTER TABLE "match_fee_invoices" ADD COLUMN "stripe_refund_id" TEXT;

-- CreateTable
CREATE TABLE "match_fee_invoice_events" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "event_type" "MatchFeeInvoiceEventType" NOT NULL,
    "actor" "MatchFeeInvoiceEventActor" NOT NULL DEFAULT 'SYSTEM',
    "detail" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_fee_invoice_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_fee_invoice_events_invoice_id_occurred_at_idx" ON "match_fee_invoice_events"("invoice_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "match_fee_invoice_events" ADD CONSTRAINT "match_fee_invoice_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "match_fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
