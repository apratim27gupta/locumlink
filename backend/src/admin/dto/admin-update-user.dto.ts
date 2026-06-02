import { Role, UserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  // PRD L2-E7.4 / AD-03: mandatory note on suspension
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  suspensionNote?: string;
}
