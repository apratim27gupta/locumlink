import { IsIn, IsString } from 'class-validator';

export class RegisterExpoPushDto {
  @IsString()
  token!: string;

  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';
}

export class UnregisterExpoPushDto {
  @IsString()
  token!: string;
}
