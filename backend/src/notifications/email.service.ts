import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type EmailSendResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<EmailSendResult> {
    const sid = this.config.get<string>('TWILIO_API_KEY_SID')?.trim();
    const secret = this.config.get<string>('TWILIO_API_KEY_SECRET')?.trim();
    const from = this.config.get<string>('MAIL_FROM_ADDRESS')?.trim();
    if (!sid || !secret || !from) {
      const error =
        'Email not configured (set TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET and MAIL_FROM_ADDRESS)';
      this.logger.warn(`Skipping email to ${params.to}: ${error}`);
      return { ok: false, error };
    }

    const fromName =
      this.config.get<string>('MAIL_FROM_NAME')?.trim() || 'Locum Link';

    const credentials = Buffer.from(`${sid}:${secret}`).toString('base64');
    const res = await fetch('https://comms.twilio.com/v1/Emails', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: { address: from, name: fromName },
        to: [{ address: params.to }],
        content: {
          subject: params.subject,
          html: params.html ?? `<p>${params.text.replace(/\n/g, '<br>')}</p>`,
          text: params.text,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      const error = `Twilio Email API error (${res.status}): ${detail}`;
      this.logger.error(error);
      return { ok: false, error };
    }

    try {
      const body = (await res.json()) as {
        operationId?: string;
        operationLocation?: string;
      };
      const messageId = body.operationId;
      return { ok: true, messageId };
    } catch {
      return { ok: true };
    }
  }
}
