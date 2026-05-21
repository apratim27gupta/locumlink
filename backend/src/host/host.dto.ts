import {
    IsString,
    IsBoolean,
    IsArray,
    IsOptional,
    IsIn,
    IsNumber,
    Min,
    MaxLength,
  } from 'class-validator';
  
  // PRD Section 2.2: leave types required on every job posting
  export const LEAVE_TYPES = [
    'VACATION',
    'CME',
    'PARENTAL',
    'ILLNESS',
    'OTHER',
  ] as const;
  export type LeaveType = (typeof LEAVE_TYPES)[number];
  
  // PRD Section 2.2: full day = 7.5hrs, half day = 3.75hrs
  export const FULL_HALF_DAY_OPTIONS = [
    'FULL_DAY',
    'HALF_DAY_AM',
    'HALF_DAY_PM',
  ] as const;
  export type FullHalfDay = (typeof FULL_HALF_DAY_OPTIONS)[number];
  
  export class SaveHostProfileDto {
    @IsString()
    clinicName!: string;
  
    @IsString()
    @IsOptional()
    contactFirstName?: string;
  
    @IsString()
    @IsOptional()
    contactLastName?: string;
  
    @IsString()
    @IsOptional()
    cpsnsNumber?: string;
  
    @IsString()
    @IsOptional()
    speciality?: string;
  
    @IsString()
    @IsOptional()
    address1?: string;
  
    @IsString()
    @IsOptional()
    address2?: string;
  
    @IsString()
    @IsOptional()
    postalCode?: string;
  
    @IsString()
    @IsOptional()
    city?: string;
  
    @IsString()
    @IsOptional()
    province?: string;
  
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    amenities?: string[];
  
    @IsBoolean()
    @IsOptional()
    accommodationProvided?: boolean;
  
    @IsString()
    @IsOptional()
    practiceType?: string;
  
    @IsString()
    @IsOptional()
    numPhysicians?: string;
  
    @IsString()
    @IsOptional()
    emrSystem?: string;
  
    @IsString()
    @IsOptional()
    emr?: string;
  
    @IsString()
    @IsOptional()
    patientVolume?: string;
  
    @IsString()
    @IsOptional()
    patientVol?: string;
  
    @IsString()
    @IsOptional()
    clinicDescription?: string;
  
    @IsString()
    @IsOptional()
    clinicDesc?: string;
  
    @IsString()
    @IsOptional()
    licenseFile?: string | null;
  
    @IsString()
    @IsOptional()
    licenseOriginalName?: string | null;
  
    // PRD 9.1 comment AT42: host must upload photo ID
    @IsString()
    @IsOptional()
    photoIdFile?: string | null;
  
    @IsString()
    @IsOptional()
    photoIdOriginalName?: string | null;
  }
  
  export class CreateJobDto {
    @IsString()
    title!: string;
  
    @IsOptional()
    @IsString()
    @IsIn(['ACTIVE', 'DRAFT'])
    status?: string;
  
    @IsBoolean()
    @IsOptional()
    saveAsDraft?: boolean;
  
    @IsString()
    @IsOptional()
    description?: string;
  
    @IsString()
    @IsOptional()
    location?: string;
  
    @IsString()
    @IsOptional()
    expiresAt?: string;
  
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    servicesRequired?: string[];
  
    @IsBoolean()
    @IsOptional()
    isRural?: boolean;
  
    @IsBoolean()
    @IsOptional()
    accommodationProvided?: boolean;
  
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    keyResponsibilities?: string[];
  
    @IsString()
    @IsOptional()
    startDate?: string;
  
    @IsString()
    @IsOptional()
    endDate?: string;
  
    @IsString()
    @IsOptional()
    startTime?: string;
  
    @IsString()
    @IsOptional()
    endTime?: string;
  
    @IsNumber()
    @IsOptional()
    payPerDay?: number;
  
    @IsNumber()
    @IsOptional()
    minYearsExperience?: number;
  
    @IsNumber()
    @IsOptional()
    maxApplicants?: number;
  
    @IsBoolean()
    @IsOptional()
    travelRequired?: boolean;
  
    @IsBoolean()
    @IsOptional()
    scheduleFlexible?: boolean;
  
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    requiredCredentials?: string[];
  
    // PRD Section 2.2: leave type required on every posting
    @IsOptional()
    @IsString()
    @IsIn([...LEAVE_TYPES])
    leaveType?: LeaveType;
  
    // PRD Section 2.2: full/half day designation
    @IsOptional()
    @IsString()
    @IsIn([...FULL_HALF_DAY_OPTIONS])
    fullHalfDay?: FullHalfDay;
  }
  
  export class UpdateJobDto {
    @IsString()
    @IsOptional()
    title?: string;
  
    @IsString()
    @IsOptional()
    description?: string;
  
    @IsString()
    @IsOptional()
    location?: string;
  
    @IsString()
    @IsIn(['DRAFT', 'ACTIVE', 'ONGOING', 'COMPLETED', 'CANCELLED', 'EXPIRED'])
    @IsOptional()
    status?: 'DRAFT' | 'ACTIVE' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    keyResponsibilities?: string[];
  
    @IsString()
    @IsOptional()
    startDate?: string;
  
    @IsString()
    @IsOptional()
    endDate?: string;
  
    @IsString()
    @IsOptional()
    startTime?: string;
  
    @IsString()
    @IsOptional()
    endTime?: string;
  
    @IsNumber()
    @IsOptional()
    payPerDay?: number;
  
    @IsNumber()
    @IsOptional()
    minYearsExperience?: number;
  
    @IsNumber()
    @IsOptional()
    maxApplicants?: number;
  
    @IsBoolean()
    @IsOptional()
    travelRequired?: boolean;
  
    @IsBoolean()
    @IsOptional()
    scheduleFlexible?: boolean;
  
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    requiredCredentials?: string[];
  
    // PRD Section 2.2: allow updating leave type and full/half day
    @IsOptional()
    @IsString()
    @IsIn([...LEAVE_TYPES])
    leaveType?: LeaveType;
  
    @IsOptional()
    @IsString()
    @IsIn([...FULL_HALF_DAY_OPTIONS])
    fullHalfDay?: FullHalfDay;
  }
  
  export class UpdateApplicationDto {
    @IsString()
    @IsIn(['SHORTLISTED', 'REJECTED', 'CONFIRMED'])
    status!: 'SHORTLISTED' | 'REJECTED' | 'CONFIRMED';
  }
  
  export class ReopenJobDto {
    @IsNumber()
    @Min(1)
    additionalApplicants!: number;
  
    @IsString()
    @IsOptional()
    startDate?: string;
  
    @IsString()
    @IsOptional()
    endDate?: string;
  }