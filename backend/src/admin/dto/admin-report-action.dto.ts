import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminReportActionDto {
  @IsIn(['DISMISS', 'WARN', 'SUSPEND'])
  action!: 'DISMISS' | 'WARN' | 'SUSPEND';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  warningNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  suspensionNote?: string;
}
