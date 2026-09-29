-- CreateEnum
CREATE TYPE "MatchFeePaymentAttemptStatus" AS ENUM ('OPEN', 'PAID', 'EXPIRED', 'FAILED', 'SUPERSEDED', 'REJECTED', 'DUPLICATE_REFUNDED');

-- CreateEnum
CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- AlterTable: provider is only known once an invoice is paid
ALTER TABLE "match_fee_invoices" DROP COLUMN "mock_payment_ref",
ALTER COLUMN "payment_provider" DROP NOT NULL,
ALTER COLUMN "payment_provider" DROP DEFAULT;

UPDATE "match_fee_invoices" SET "payment_provider" = NULL WHERE "paid_at" IS NULL;

-- CreateTable
CREATE TABLE "match_fee_payment_attempts" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "host_profile_id" TEXT NOT NULL,
    "status" "MatchFeePaymentAttemptStatus" NOT NULL DEFAULT 'OPEN',
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "stripe_checkout_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "checkout_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_event_type" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_fee_payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "object_id" TEXT,
    "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'PROCESSING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_fee_payment_attempts_stripe_checkout_session_id_key" ON "match_fee_payment_attempts"("stripe_checkout_session_id");

-- CreateIndex
CREATE INDEX "match_fee_payment_attempts_invoice_id_created_at_idx" ON "match_fee_payment_attempts"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "match_fee_payment_attempts_status_created_at_idx" ON "match_fee_payment_attempts"("status", "created_at");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_status_received_at_idx" ON "stripe_webhook_events"("status", "received_at");

-- AddForeignKey
ALTER TABLE "match_fee_payment_attempts" ADD CONSTRAINT "match_fee_payment_attempts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "match_fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: Checkout sessions started before attempts were tracked. Open ones are settled by reconciliation.
INSERT INTO "match_fee_payment_attempts" (
    "id", "invoice_id", "host_profile_id", "status", "amount_cents", "currency",
    "stripe_checkout_session_id", "stripe_payment_intent_id", "completed_at", "last_event_type",
    "created_at", "updated_at"
)
SELECT
    'legacy_' || i."id",
    i."id",
    i."host_profile_id",
    CASE
        WHEN i."payment_provider" = 'STRIPE' AND i."paid_at" IS NOT NULL THEN 'PAID'::"MatchFeePaymentAttemptStatus"
        ELSE 'OPEN'::"MatchFeePaymentAttemptStatus"
    END,
    i."amount_cents",
    i."currency",
    i."stripe_checkout_session_id",
    i."stripe_payment_intent_id",
    CASE WHEN i."payment_provider" = 'STRIPE' THEN i."paid_at" ELSE NULL END,
    'backfill',
    i."updated_at",
    CURRENT_TIMESTAMP
FROM "match_fee_invoices" i
WHERE i."stripe_checkout_session_id" IS NOT NULL;
