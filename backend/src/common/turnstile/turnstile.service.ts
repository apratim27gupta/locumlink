import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return Boolean(this.config.get<string>('TURNSTILE_SECRET_KEY')?.trim());
  }

  /**
   * Verifies a Cloudflare Turnstile token before OTP is sent.
   * Skipped when TURNSTILE_SECRET_KEY is unset (local dev).
   */
  async assertValidToken(
    token: string | undefined,
    remoteIp?: string,
  ): Promise<void> {
    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY')?.trim();
    if (!secret) return;

    const response = token?.trim();
    if (!response) {
      throw new BadRequestException('Captcha verification is required.');
    }

    const body = new URLSearchParams({
      secret,
      response,
    });
    if (remoteIp?.trim()) {
      body.set('remoteip', remoteIp.trim());
    }

    let payload: TurnstileVerifyResponse;
    try {
      const res = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        { method: 'POST', body },
      );
      payload = (await res.json()) as TurnstileVerifyResponse;
    } catch (err) {
      this.logger.error(`Turnstile verify request failed: ${String(err)}`);
      throw new BadRequestException(
        'Captcha verification failed. Please try again.',
      );
    }

    if (!payload.success) {
      this.logger.warn(
        `Turnstile rejected token: ${(payload['error-codes'] ?? []).join(', ')}`,
      );
      throw new BadRequestException(
        'Captcha verification failed. Please try again.',
      );
    }
  }
}
