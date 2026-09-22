-- CreateEnum
CREATE TYPE "MatchFeeInvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED', 'CREDITED', 'PENDING_REPLACEMENT');

-- CreateEnum
CREATE TYPE "MatchFeeCancelledBy" AS ENUM ('HOST', 'LOCUM', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MatchFeeRefundResolution" AS ENUM ('NONE', 'REFUND', 'CREDIT', 'PENDING');

-- CreateEnum
CREATE TYPE "MatchFeeReplacementStatus" AS ENUM ('NONE', 'SEARCHING', 'FOUND', 'NOT_FOUND');

-- AlterTable
ALTER TABLE "host_profiles" ADD COLUMN "match_fee_review_required" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "match_fee_invoices" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "host_profile_id" TEXT NOT NULL,
    "job_posting_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL DEFAULT 25000,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "status" "MatchFeeInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "due_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "mock_payment_ref" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" "MatchFeeCancelledBy",
    "cancellation_reason" TEXT,
    "refund_resolution" "MatchFeeRefundResolution" NOT NULL DEFAULT 'NONE',
    "replacement_status" "MatchFeeReplacementStatus" NOT NULL DEFAULT 'NONE',
    "admin_notes" TEXT,
    "escalated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_fee_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_fee_invoices_application_id_key" ON "match_fee_invoices"("application_id");

-- CreateIndex
CREATE INDEX "match_fee_invoices_host_profile_id_status_idx" ON "match_fee_invoices"("host_profile_id", "status");

-- CreateIndex
CREATE INDEX "match_fee_invoices_status_due_at_idx" ON "match_fee_invoices"("status", "due_at");

-- CreateIndex
CREATE INDEX "match_fee_invoices_escalated_at_idx" ON "match_fee_invoices"("escalated_at");

-- AddForeignKey
ALTER TABLE "match_fee_invoices" ADD CONSTRAINT "match_fee_invoices_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_fee_invoices" ADD CONSTRAINT "match_fee_invoices_host_profile_id_fkey" FOREIGN KEY ("host_profile_id") REFERENCES "host_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_fee_invoices" ADD CONSTRAINT "match_fee_invoices_job_posting_id_fkey" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
