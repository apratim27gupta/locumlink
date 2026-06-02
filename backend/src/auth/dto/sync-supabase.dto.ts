import { IsIn } from 'class-validator';
export class SyncSupabaseDto {
  @IsIn(['locum', 'clinic'])
  role: 'locum' | 'clinic';
}
