import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Admin may only approve or reject (matches Prisma VerificationStatus enum values). */
const ADMIN_VERIFICATION_DECISIONS = ['VERIFIED', 'REJECTED'] as const;

export class AdminUpdateVerificationDto {
  @IsIn(ADMIN_VERIFICATION_DECISIONS)
  cpsnsVerificationStatus!: (typeof ADMIN_VERIFICATION_DECISIONS)[number];

  // PRD L2-E7.3 / AD-02: mandatory reason on rejection
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;

  @IsOptional()
  @IsIn(['locum', 'host'])
  profileType?: 'locum' | 'host';
}
