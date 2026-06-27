import { IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushSubscriptionKeysDto {
  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

export class PushSubscribeDto {
  @IsString()
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class PushUnsubscribeDto {
  @IsString()
  endpoint!: string;
}
