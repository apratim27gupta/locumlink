import { IsIn } from 'class-validator';

export class SwitchRoleDto {
  @IsIn(['HOST', 'LOCUM', 'clinic', 'locum'])
  role!: 'HOST' | 'LOCUM' | 'clinic' | 'locum';
}
