import { IsString, IsOptional, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  recipientId!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsString()
  @IsOptional()
  jobPostingId?: string;
}

export class EditMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;
}
