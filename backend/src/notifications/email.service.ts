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
    const apiKey = this.config.get<string>('ZEPTOMAIL_API_KEY')?.trim();
    const from = this.config.get<string>('MAIL_FROM_ADDRESS')?.trim();
    if (!apiKey || !from) {
      const error =
        'Email not configured (set ZEPTOMAIL_API_KEY and MAIL_FROM_ADDRESS)';
      this.logger.warn(`Skipping email to ${params.to}: ${error}`);
      return { ok: false, error };
    }

    const fromName =
      this.config.get<string>('MAIL_FROM_NAME')?.trim() || 'Locum Link';

    const apiBase =
      this.config.get<string>('ZEPTOMAIL_API_URL')?.trim() ||
      'https://api.zeptomail.ca';

    const authHeader = apiKey.startsWith('Zoho-enczapikey')
      ? apiKey
      : `Zoho-enczapikey ${apiKey}`;

    const res = await fetch(`${apiBase.replace(/\/$/, '')}/v1.1/email`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: { address: from, name: fromName },
        to: [
          {
            email_address: {
              address: params.to,
            },
          },
        ],
        subject: params.subject,
        textbody: params.text,
        htmlbody: params.html ?? `<p>${params.text.replace(/\n/g, '<br>')}</p>`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      const error = `ZeptoMail API error (${res.status}): ${detail}`;
      this.logger.error(error);
      return { ok: false, error };
    }

    try {
      const body = (await res.json()) as {
        data?: Array<{ message_id?: string }>;
      };
      const messageId = body.data?.[0]?.message_id;
      return { ok: true, messageId };
    } catch {
      return { ok: true };
    }
  }
}
