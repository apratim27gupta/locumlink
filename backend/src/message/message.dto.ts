import {
  IsString,
  IsOptional,
  MinLength,
  ValidateNested,
  IsInt,
  Min,
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
