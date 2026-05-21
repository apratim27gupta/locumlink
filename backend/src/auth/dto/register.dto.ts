import { Role } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()\-_=+]).{8,}$/, {
    message:
      'Password must contain uppercase, lowercase, number, and special character',
  })
  password: string;

  @IsEnum(Role)
  role: Role;

  // PRD L2-E6.4 / Section 13.1: PIPEDA consent captured at registration
  @IsOptional()
  @IsBoolean()
  consentGiven?: boolean;

  // Version of privacy policy / terms accepted (e.g. "1.0")
  @IsOptional()
  @IsString()
  @MaxLength(20)
  consentVersion?: string;
}
