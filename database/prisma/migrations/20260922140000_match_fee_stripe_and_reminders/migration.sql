-- CreateEnum
CREATE TYPE "MatchFeePaymentProvider" AS ENUM ('MOCK', 'STRIPE');

-- AlterTable
ALTER TABLE "host_profiles" ADD COLUMN "stripe_customer_id" TEXT;

-- AlterTable
ALTER TABLE "match_fee_invoices" ADD COLUMN "payment_provider" "MatchFeePaymentProvider" NOT NULL DEFAULT 'MOCK';
ALTER TABLE "match_fee_invoices" ADD COLUMN "stripe_checkout_session_id" TEXT;
ALTER TABLE "match_fee_invoices" ADD COLUMN "stripe_payment_intent_id" TEXT;
ALTER TABLE "match_fee_invoices" ADD COLUMN "last_reminder_at" TIMESTAMP(3);
