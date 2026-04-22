// src/config/env.validation.ts
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
  // ── App ─────────────────────────────────────────────────────────────
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  PORT: number = 3000;

  // ── Database (Supabase / PostgreSQL) ────────────────────────────────
  @IsString()
  DATABASE_URL: string;

  // ── Supabase (for Auth row-level security & storage helpers) ────────
  @IsUrl({ require_tld: false })
  @IsOptional()
  SUPABASE_URL?: string;

  @IsString()
  @IsOptional()
  SUPABASE_ANON_KEY?: string;

  @IsString()
  @IsOptional()
  SUPABASE_SERVICE_ROLE_KEY?: string;

  // ── JWT ─────────────────────────────────────────────────────────────
  /**
   * Must be a strong random secret (≥ 32 chars).
   * Generate with: openssl rand -hex 32
   */
  @IsString()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '7d';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '30d';

  // ── Cloudinary (license document uploads) ───────────────────────────
  /**
   * Full Cloudinary URL format:
   *   cloudinary://API_KEY:API_SECRET@CLOUD_NAME
   */
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

  // ── Google Cloud Storage (primary document store per PRD §11) ────────
  @IsString()
  @IsOptional()
  GCS_BUCKET_NAME: string;

  @IsString()
  @IsOptional()
  GCS_PROJECT_ID: string;

  /**
   * Optional. If set, should be a JSON string of a Google service account key.
   * This is the easiest way to configure GCS on hosts like Railway where
   * mounting a key file is inconvenient.
   */
  @IsString()
  @IsOptional()
  GCS_CREDENTIALS_JSON?: string;

  /**
   * Optional. Absolute path to a service account JSON file (local/dev friendly).
   * If both GCS_CREDENTIALS_JSON and GCS_KEY_FILE are set, JSON takes precedence.
   */
  @IsString()
  @IsOptional()
  GCS_KEY_FILE?: string;

  // ── Email (Zeptomail per PRD §11) ────────────────────────────────────
  @IsString()
  @IsOptional()
  ZEPTOMAIL_API_KEY: string;

  @IsString()
  @IsOptional()
  MAIL_FROM_ADDRESS: string = 'noreply@locumconnect.ca';

  // ── Sentry ───────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;

  // ── CORS ─────────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  ALLOWED_ORIGINS: string = 'http://localhost:3001';
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
