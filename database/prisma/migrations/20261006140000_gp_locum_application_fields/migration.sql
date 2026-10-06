-- AlterTable
ALTER TABLE "host_profiles" ADD COLUMN "msi_provider_number" TEXT;
ALTER TABLE "host_profiles" ADD COLUMN "fax" TEXT;
ALTER TABLE "host_profiles" ADD COLUMN "overhead_payee" TEXT;

-- AlterTable
ALTER TABLE "locum_profiles" ADD COLUMN "fax" TEXT;
