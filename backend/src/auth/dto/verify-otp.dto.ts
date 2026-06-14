import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  otp: string;

  @IsOptional()
  @IsIn(['locum', 'clinic'])
  role?: 'locum' | 'clinic';
}
