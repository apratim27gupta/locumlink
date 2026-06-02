import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(params: {
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from = this.config.get<string>('NOTIFICATIONS_FROM_EMAIL')?.trim();
    if (!apiKey || !from) {
      this.logger.warn(
        'Skipping notification email (set RESEND_API_KEY and NOTIFICATIONS_FROM_EMAIL)',
      );
      return;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Resend API error (${res.status}): ${detail}`);
    }
  }
}
