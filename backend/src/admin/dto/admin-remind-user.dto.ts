import { IsIn } from 'class-validator';

export class AdminRemindUserDto {
  @IsIn(['email', 'notification'])
  channel!: 'email' | 'notification';
}
