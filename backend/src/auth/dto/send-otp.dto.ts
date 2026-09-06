import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class SendOtpDto {
  @IsEmail()
  email: string;

  @IsIn(['locum', 'clinic'])
  role: 'locum' | 'clinic';

  @IsOptional()
  @IsString()
  captchaToken?: string;
}
