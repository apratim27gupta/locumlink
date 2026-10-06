-- AlterTable
ALTER TABLE "applications" ADD COLUMN "gp_locum_application_draft" JSONB;
ALTER TABLE "applications" ADD COLUMN "gp_locum_application_saved_at" TIMESTAMP(3);
