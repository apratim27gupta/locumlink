-- AlterTable: admin password fields
ALTER TABLE "admins" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "admins" ADD COLUMN "password_changed_at" TIMESTAMP(3);

-- AlterTable: OTP purpose + admin scoping
ALTER TABLE "otps" ADD COLUMN "purpose" TEXT;
ALTER TABLE "otps" ADD COLUMN "admin_id" TEXT;

-- CreateIndex
CREATE INDEX "otps_email_purpose_idx" ON "otps"("email", "purpose");

-- CreateIndex
CREATE INDEX "otps_admin_id_purpose_idx" ON "otps"("admin_id", "purpose");
