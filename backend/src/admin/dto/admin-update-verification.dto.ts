import { VerificationStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminUpdateVerificationDto {
  @IsIn([VerificationStatus.VERIFIED, VerificationStatus.REJECTED])
  cpsnsVerificationStatus!: VerificationStatus.VERIFIED | VerificationStatus.REJECTED;

  // PRD L2-E7.3 / AD-02: mandatory reason on rejection
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;
}