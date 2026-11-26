import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * A saved-but-unsent broadcast. Every field is optional because a draft may be
 * half-finished — the admin is saving it precisely so they can come back later.
 */
export class AdminBroadcastDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  bodyText?: string;

  @IsOptional()
  @IsArray()
  @IsIn(['notification', 'email'], { each: true })
  channels?: Array<'notification' | 'email'>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipientIds?: string[];
}
