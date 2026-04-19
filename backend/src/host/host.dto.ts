import {
  IsString,
  IsBoolean,
  IsArray,
  IsOptional,
  IsIn,
  IsNumber,
  Min,
} from 'class-validator';

// ── Profile DTO (unchanged) ───────────────────────────────────────────────────

export class SaveHostProfileDto {
  @IsString()
  clinicName!: string;

  @IsString() @IsOptional() contactFirstName?: string;
  @IsString() @IsOptional() contactLastName?: string;
  @IsString() @IsOptional() cpsnsNumber?: string;
  @IsString() @IsOptional() speciality?: string;
  @IsString() @IsOptional() address1?: string;
  @IsString() @IsOptional() address2?: string;
  @IsString() @IsOptional() postalCode?: string;
  @IsString() @IsOptional() city?: string;
  @IsString() @IsOptional() province?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];

  @IsBoolean() @IsOptional() accommodationProvided?: boolean;
  @IsString() @IsOptional() practiceType?: string;
  @IsString() @IsOptional() numPhysicians?: string;
  @IsString() @IsOptional() emrSystem?: string;
  @IsString() @IsOptional() patientVolume?: string;
  @IsString() @IsOptional() clinicDescription?: string;
}

// ── Create Job ────────────────────────────────────────────────────────────────

export class CreateJobDto {
  @IsString()
  title!: string;
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'DRAFT'])
  status?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() location?: string;
  @IsString() @IsOptional() expiresAt?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  servicesRequired?: string[];

  @IsBoolean() @IsOptional() isRural?: boolean;
  @IsBoolean() @IsOptional() accommodationProvided?: boolean;

  // Extended fields from the 3-step form
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keyResponsibilities?: string[];

  @IsString() @IsOptional() startDate?: string;
  @IsString() @IsOptional() endDate?: string;
  @IsString() @IsOptional() startTime?: string;
  @IsString() @IsOptional() endTime?: string;

  @IsNumber() @IsOptional() payPerDay?: number;
  @IsNumber() @IsOptional() minYearsExperience?: number;
  @IsNumber() @IsOptional() maxApplicants?: number;

  @IsBoolean() @IsOptional() travelRequired?: boolean;
  @IsBoolean() @IsOptional() scheduleFlexible?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredCredentials?: string[];
}

// ── Update Job ────────────────────────────────────────────────────────────────

export class UpdateJobDto {
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() location?: string;

  @IsString()
  @IsIn(['DRAFT', 'ACTIVE', 'FILLED', 'CANCELLED', 'EXPIRED'])
  @IsOptional()
  status?: 'DRAFT' | 'ACTIVE' | 'FILLED' | 'CANCELLED' | 'EXPIRED';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keyResponsibilities?: string[];

  @IsString() @IsOptional() startDate?: string;
  @IsString() @IsOptional() endDate?: string;
  @IsString() @IsOptional() startTime?: string;
  @IsString() @IsOptional() endTime?: string;

  @IsNumber() @IsOptional() payPerDay?: number;
  @IsNumber() @IsOptional() minYearsExperience?: number;
  @IsNumber() @IsOptional() maxApplicants?: number;

  @IsBoolean() @IsOptional() travelRequired?: boolean;
  @IsBoolean() @IsOptional() scheduleFlexible?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredCredentials?: string[];
}

// ── Application ───────────────────────────────────────────────────────────────

export class UpdateApplicationDto {
  @IsString()
  @IsIn(['SHORTLISTED', 'REJECTED', 'CONFIRMED'])
  status!: 'SHORTLISTED' | 'REJECTED' | 'CONFIRMED';
}

// ── Re-open Job ───────────────────────────────────────────────────────────────

export class ReopenJobDto {
  @IsNumber()
  @Min(1)
  additionalApplicants!: number;
}
