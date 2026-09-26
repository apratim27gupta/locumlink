import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { MATCH_FEE_FULL_CENTS, MATCH_FEE_HALF_CENTS } from './match-fee.constants.js';

export class CancelMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminResolveRefundDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}

export class AdminReplacementStatusDto {
  @IsString()
  replacementStatus!: 'SEARCHING' | 'FOUND' | 'NOT_FOUND';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}

export class AdminWriteOffDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}

export class AdminOverrideDto {
  @IsString()
  status!:
    | 'PENDING'
    | 'PAID'
    | 'OVERDUE'
    | 'CANCELLED'
    | 'REFUNDED'
    | 'PENDING_REPLACEMENT';

  @IsString()
  @MaxLength(2000)
  adminNotes!: string;
}

export class AdminSendReminderDto {
  @IsBoolean()
  sendEmail!: boolean;

  @IsBoolean()
  sendNotification!: boolean;
}

/** Post-completion discretionary refund: $125 or $250 (cents). */
export class AdminDiscretionaryRefundDto {
  @IsInt()
  @IsIn([MATCH_FEE_HALF_CENTS, MATCH_FEE_FULL_CENTS])
  amountCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;

  @IsOptional()
  @IsString()
  ticketId?: string;
}
