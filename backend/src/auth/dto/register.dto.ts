// src/auth/dto/register.dto.ts
import { Role } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  /**
   * Password rules: ≥8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char.
   * Satisfies PIPEDA password complexity recommendations.
   */
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
}
