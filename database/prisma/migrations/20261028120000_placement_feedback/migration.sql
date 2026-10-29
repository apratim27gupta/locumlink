-- CreateEnum
CREATE TYPE "PlacementFeedbackRating" AS ENUM ('MET', 'SOME', 'SIGNIFICANT', 'UNABLE');

-- CreateEnum
CREATE TYPE "PlacementFeedbackBookAgain" AS ENUM ('YES', 'MAYBE', 'NO');

-- CreateEnum
CREATE TYPE "PlacementFeedbackBasedOn" AS ENUM ('DIRECT', 'STAFF', 'BOTH');

-- CreateEnum
CREATE TYPE "PlacementFeedbackStatus" AS ENUM ('PENDING', 'SUBMITTED');

-- CreateTable
CREATE TABLE "placement_feedback" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "job_posting_id" TEXT NOT NULL,
    "host_user_id" TEXT NOT NULL,
    "locum_profile_id" TEXT NOT NULL,
    "status" "PlacementFeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "professionalism" "PlacementFeedbackRating",
    "communication" "PlacementFeedbackRating",
    "reliability" "PlacementFeedbackRating",
    "documentation" "PlacementFeedbackRating",
    "book_again" "PlacementFeedbackBookAgain",
    "based_on" "PlacementFeedbackBasedOn",
    "comments" TEXT,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "reminder_sent_at" TIMESTAMP(3),

    CONSTRAINT "placement_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "placement_feedback_application_id_key" ON "placement_feedback"("application_id");

-- CreateIndex
CREATE INDEX "placement_feedback_status_requested_at_idx" ON "placement_feedback"("status", "requested_at");

-- CreateIndex
CREATE INDEX "placement_feedback_host_user_id_status_idx" ON "placement_feedback"("host_user_id", "status");

-- CreateIndex
CREATE INDEX "placement_feedback_job_posting_id_idx" ON "placement_feedback"("job_posting_id");

-- CreateIndex
CREATE INDEX "placement_feedback_needs_review_submitted_at_idx" ON "placement_feedback"("needs_review", "submitted_at");

-- AddForeignKey
ALTER TABLE "placement_feedback" ADD CONSTRAINT "placement_feedback_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_feedback" ADD CONSTRAINT "placement_feedback_job_posting_id_fkey" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_feedback" ADD CONSTRAINT "placement_feedback_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_feedback" ADD CONSTRAINT "placement_feedback_locum_profile_id_fkey" FOREIGN KEY ("locum_profile_id") REFERENCES "locum_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
