-- AlterTable
ALTER TABLE "email_logs" ALTER COLUMN "provider" SET DEFAULT 'twilio';

-- CreateTable
CREATE TABLE "broadcast_drafts" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body_html" TEXT NOT NULL DEFAULT '',
    "body_text" TEXT NOT NULL DEFAULT '',
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcast_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcast_drafts_admin_id_idx" ON "broadcast_drafts"("admin_id");

-- AddForeignKey
ALTER TABLE "broadcast_drafts" ADD CONSTRAINT "broadcast_drafts_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
