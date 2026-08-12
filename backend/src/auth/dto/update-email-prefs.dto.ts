import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateEmailPrefsDto {
  @IsOptional()
  @IsBoolean()
  messages?: boolean;

  @IsOptional()
  @IsBoolean()
  applications?: boolean;

  @IsOptional()
  @IsBoolean()
  reminders?: boolean;

  @IsOptional()
  @IsBoolean()
  account?: boolean;
}
