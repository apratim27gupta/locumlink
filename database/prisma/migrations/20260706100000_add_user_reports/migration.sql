-- CreateEnum
CREATE TYPE "UserReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'WARNED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserReportReason" AS ENUM ('HARASSMENT', 'SPAM', 'INAPPROPRIATE_CONTENT', 'FRAUD', 'OTHER');

-- CreateTable
CREATE TABLE "user_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reported_id" TEXT NOT NULL,
    "reason" "UserReportReason" NOT NULL,
    "details" VARCHAR(2000),
    "status" "UserReportStatus" NOT NULL DEFAULT 'OPEN',
    "warning_note" VARCHAR(2000),
    "also_blocked_reporter" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_reports_reported_id_idx" ON "user_reports"("reported_id");

-- CreateIndex
CREATE INDEX "user_reports_reporter_id_idx" ON "user_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "user_reports_status_created_at_idx" ON "user_reports"("status", "created_at");

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
