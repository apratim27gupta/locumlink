import { IsIn } from 'class-validator';

export class UpdateTourDto {
  @IsIn(['host', 'locum'])
  tourKey!: 'host' | 'locum';
}
