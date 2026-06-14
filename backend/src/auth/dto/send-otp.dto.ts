import { IsEmail, IsIn, IsOptional } from 'class-validator';

export class SendOtpDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(['locum', 'clinic'])
  role?: 'locum' | 'clinic';
}
