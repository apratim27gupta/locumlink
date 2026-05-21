-- Sync DB columns with schema.prisma (PIPEDA consent, suspension, rejection, placement, audit)

-- User (maps: consentGivenAt, consentVersion, suspensionNote, suspendedAt)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consent_given_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consent_version" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspension_note" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3);

-- LocumProfile (maps: rejectionReason, rejectedAt)
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
ALTER TABLE "locum_profiles" ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3);

-- Application (maps: placedAt)
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "placed_at" TIMESTAMP(3);

-- AuditLog (maps: outcome, actorRole)
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "outcome" TEXT NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_role" TEXT;
