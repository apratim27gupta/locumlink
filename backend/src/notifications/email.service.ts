import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  getReviewPlaygroundEmails,
  isReviewPlaygroundEmail,
} from '../config/review-playground.util.js';

export type EmailSendResult =
  | { ok: true; messageId?: string; skipped?: boolean }
  | { ok: false; error: string };

/** Extra hard-bounce addresses (comma-separated) that must never be emailed. */
function getSuppressedEmails(config: ConfigService): Set<string> {
  const raw = config.get<string>('MAIL_SUPPRESS_EMAILS')?.trim() ?? '';
  const extras = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set(extras);
}

function looksLikeEmail(address: string): boolean {
  // Intentionally light — only block obvious garbage that causes hard bounces.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

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
    const to = params.to?.trim().toLowerCase() ?? '';
    if (!to || !looksLikeEmail(to)) {
      const error = `Invalid recipient address: ${params.to ?? '(empty)'}`;
      this.logger.warn(`Skipping email: ${error}`);
      return { ok: false, error };
    }

    // Review / App Store playground accounts use fixed OTP and often have no
    // real mailbox (Twilio hard-bounce: "User does not exist"). Never SMTP them.
    const reviewEmails = getReviewPlaygroundEmails(this.config);
    if (isReviewPlaygroundEmail(to, reviewEmails)) {
      this.logger.log(
        `Skipping email to review playground address ${to} (subject: ${params.subject})`,
      );
      return { ok: true, skipped: true };
    }

    if (getSuppressedEmails(this.config).has(to)) {
      this.logger.log(
        `Skipping email to suppressed address ${to} (subject: ${params.subject})`,
      );
      return { ok: true, skipped: true };
    }

    const sid = this.config.get<string>('TWILIO_API_KEY_SID')?.trim();
    const secret = this.config.get<string>('TWILIO_API_KEY_SECRET')?.trim();
    const from = this.config.get<string>('MAIL_FROM_ADDRESS')?.trim();
    if (!sid || !secret || !from) {
      const error =
        'Email not configured (set TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET and MAIL_FROM_ADDRESS)';
      this.logger.warn(`Skipping email to ${to}: ${error}`);
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
        to: [{ address: to }],
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
