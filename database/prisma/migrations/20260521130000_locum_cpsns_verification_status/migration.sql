-- Align locum_profiles CPSNS verification columns with host_profiles naming
ALTER TABLE "locum_profiles" RENAME COLUMN "verificationStatus" TO "cpsns_verification_status";
ALTER TABLE "locum_profiles" RENAME COLUMN "verifiedAt" TO "cpsns_verified_at";
