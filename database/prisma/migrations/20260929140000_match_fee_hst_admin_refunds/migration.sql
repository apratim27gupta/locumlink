-- CreateEnum
CREATE TYPE "MatchFeeRefundStatus" AS ENUM ('REQUESTED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MatchFeeRefundKind" AS ENUM ('CANCELLATION', 'NO_REPLACEMENT', 'POST_COMPLETION', 'DUPLICATE_PAYMENT');

-- AlterEnum
ALTER TYPE "MatchFeeInvoiceEventType" ADD VALUE 'REFUND_PENDING_REVIEW';
ALTER TYPE "MatchFeeInvoiceEventType" ADD VALUE 'REFUND_FAILED';

-- AlterEnum
ALTER TYPE "MatchFeePaymentAttemptStatus" ADD VALUE 'DUPLICATE';

-- AlterTable: existing invoices keep no HST (rate 0); new invoices snapshot 14%
ALTER TABLE "match_fee_invoices" ADD COLUMN     "tax_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tax_rate_bps" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "match_fee_refunds" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "payment_attempt_id" TEXT,
    "kind" "MatchFeeRefundKind" NOT NULL,
    "status" "MatchFeeRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "amount_cents" INTEGER NOT NULL,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "stripe_payment_intent_id" TEXT,
    "stripe_refund_id" TEXT,
    "reason" TEXT NOT NULL,
    "requested_by_admin_id" TEXT,
    "requested_by_admin_email" TEXT,
    "failure_reason" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_fee_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_fee_refunds_stripe_refund_id_key" ON "match_fee_refunds"("stripe_refund_id");

-- CreateIndex
CREATE INDEX "match_fee_refunds_invoice_id_created_at_idx" ON "match_fee_refunds"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "match_fee_refunds_status_created_at_idx" ON "match_fee_refunds"("status", "created_at");

-- AddForeignKey
ALTER TABLE "match_fee_refunds" ADD CONSTRAINT "match_fee_refunds_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "match_fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
