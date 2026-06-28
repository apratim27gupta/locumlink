import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  validateSync,
} from 'class-validator';
export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
}
class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;
  @IsInt()
  @Min(1)
  PORT: number = 3000;
  @IsString()
  DATABASE_URL: string;
  @IsUrl({ require_tld: false })
  @IsOptional()
  SUPABASE_URL?: string;
  @IsString()
  @IsOptional()
  SUPABASE_ANON_KEY?: string;
  @IsString()
  @IsOptional()
  SUPABASE_SERVICE_ROLE_KEY?: string;
  @IsString()
  JWT_SECRET: string;
  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '7d';
  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '30d';
  @IsString()
  @IsOptional()
  CLOUDINARY_URL?: string;
  @IsString()
  @IsOptional()
  CLOUDINARY_CLOUD_NAME: string;
  @IsString()
  @IsOptional()
  CLOUDINARY_API_KEY: string;
  @IsString()
  @IsOptional()
  CLOUDINARY_API_SECRET: string;
  @IsString()
  @IsOptional()
  GCS_BUCKET_NAME: string;
  @IsString()
  @IsOptional()
  GCS_PROJECT_ID: string;
  @IsString()
  @IsOptional()
  GCS_CREDENTIALS_JSON?: string;
  @IsString()
  @IsOptional()
  GCS_KEY_FILE?: string;
  @IsString()
  @IsOptional()
  TWILIO_API_KEY_SID: string;

  @IsString()
  @IsOptional()
  TWILIO_API_KEY_SECRET: string;

  @IsString()
  @IsOptional()
  MAIL_FROM_ADDRESS: string = 'noreply@locumlink.ca';

  @IsString()
  @IsOptional()
  MAIL_FROM_NAME: string = 'Locum Link';
  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;
  @IsString()
  @IsOptional()
  ALLOWED_ORIGINS: string = 'http://localhost:3001';

  /** IANA timezone for shift start/end comparisons (e.g. America/Halifax). */
  @IsString()
  @IsOptional()
  PLATFORM_TIMEZONE: string = 'America/Halifax';

  @IsString()
  @IsOptional()
  SESSION_SECRET?: string;

  // Admin JWT cookie (email/password admin auth via Nest)
  @IsString()
  @IsOptional()
  ADMIN_JWT_SECRET?: string;

  @IsString()
  @IsOptional()
  ADMIN_JWT_EXPIRES_IN: string = '7d';

  @IsUrl({ require_tld: false })
  @IsOptional()
  ADMIN_FRONTEND_REDIRECT_URL: string = 'http://localhost:3001/admin';
}
export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });
  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }
  return validatedConfig;
}
