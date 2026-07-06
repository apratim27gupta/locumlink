import {
  IsString,
  IsOptional,
  MinLength,
  ValidateNested,
  IsInt,
  Min,
  IsIn,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
export class MessageAttachmentDto {
  @IsString()
  storagePath!: string;
  @IsString()
  fileName!: string;
  @IsString()
  mimeType!: string;
  @IsInt()
  @Min(0)
  size!: number;
}
export class SendMessageDto {
  @IsString()
  recipientId!: string;
  @IsString()
  @IsOptional()
  body?: string;
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentDto)
  @IsOptional()
  attachments?: MessageAttachmentDto[];
  @IsString()
  @IsOptional()
  jobPostingId?: string;
}
export class EditMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;
}
export class BlockUserDto {
  @IsString()
  userId!: string;
}

export class ReportUserDto {
  @IsString()
  userId!: string;

  @IsIn(['HARASSMENT', 'SPAM', 'INAPPROPRIATE_CONTENT', 'FRAUD', 'OTHER'])
  reason!: 'HARASSMENT' | 'SPAM' | 'INAPPROPRIATE_CONTENT' | 'FRAUD' | 'OTHER';

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  details?: string;

  @IsBoolean()
  @IsOptional()
  block?: boolean;
}
