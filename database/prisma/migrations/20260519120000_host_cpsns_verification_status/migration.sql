-- AlterTable
ALTER TABLE "host_profiles" ADD COLUMN "cpsns_verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE "host_profiles" ADD COLUMN "cpsns_verified_at" TIMESTAMP(3);
