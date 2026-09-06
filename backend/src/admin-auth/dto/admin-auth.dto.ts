import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class AdminRequestOtpDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;
}

export class AdminVerifyOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  otp: string;
}
