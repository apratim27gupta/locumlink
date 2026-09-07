import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class AdminBroadcastUsersDto {
  @ValidateIf((o: AdminBroadcastUsersDto) => !o.selectAllFiltered)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsBoolean()
  selectAllFiltered?: boolean;

  /** Same search as list users (email contains). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(['LOCUM', 'HOST', 'all'])
  role?: 'LOCUM' | 'HOST' | 'all';

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['notification', 'email'], { each: true })
  channels!: Array<'notification' | 'email'>;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  bodyHtml!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  bodyText?: string;

  /**
   * Client-generated key for this compose/send attempt. Retries with the same
   * key must not start a second delivery (avoids duplicates after proxy timeouts).
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey?: string;
}
