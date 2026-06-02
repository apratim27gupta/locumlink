import { IsString, MinLength } from 'class-validator';
export class UpdateAvatarDto {
  @IsString()
  @MinLength(1, { message: 'storagePath is required' })
  storagePath!: string;
}
