import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDemoRequestDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
