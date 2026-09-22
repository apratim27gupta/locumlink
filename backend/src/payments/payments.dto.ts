import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminResolveRefundDto {
  @IsString()
  resolution!: 'REFUND' | 'CREDIT';

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
    | 'CREDITED'
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
