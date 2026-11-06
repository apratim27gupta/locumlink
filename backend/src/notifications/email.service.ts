import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  getReviewPlaygroundEmails,
  isReviewPlaygroundEmail,
} from '../config/review-playground.util.js';
import { sanitizeNotificationCopy } from './sanitize-notification-copy.js';
import { recordDependencyFailure } from '../telemetry/app-metrics.js';

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

const TEAM_SIGNOFF = 'Team LocumLink';

/** Absolute logo URL for HTML email (PNG — SVG is unreliable in clients). */
function emailLogoUrl(frontendOrigin: string | undefined): string {
  const base = (frontendOrigin?.trim() || 'https://locumlink.ca').replace(/\/$/, '');
  return `${base}/logo1.png`;
}

function signoffHtmlBlock(logoUrl: string): string {
  return `
<div style="margin:24px 0 0">
  <img src="${logoUrl}" width="36" height="36" alt="LocumLink" style="display:block;width:36px;height:36px;margin:0 0 8px;border:0;outline:none" />
  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937">${TEAM_SIGNOFF}</p>
</div>`;
}

function withTeamSignoff(
  text: string,
  html: string | undefined,
  logoUrl: string,
): { text: string; html: string } {
  const trimmed = text.trimEnd();
  const signedText = /Team LocumLink\s*$/i.test(trimmed)
    ? trimmed
    : `${trimmed}\n\n${TEAM_SIGNOFF}`;
  const block = signoffHtmlBlock(logoUrl);
  if (html) {
    if (/Team LocumLink/i.test(html)) {
      // Insert logo above an existing text signoff when not already present.
      if (!/logo1\.png/i.test(html)) {
        const signedHtml = html.replace(
          /(<p[^>]*>\s*)?Team LocumLink(\s*<\/p>)?/i,
          block,
        );
        return { text: signedText, html: signedHtml };
      }
      return { text: signedText, html };
    }
    return { text: signedText, html: `${html}\n${block}` };
  }
  const bodyOnly = signedText.replace(/\n*Team LocumLink\s*$/i, '').trimEnd();
  return {
    text: signedText,
    html: `<p>${bodyOnly.replace(/\n/g, '<br>')}</p>${block}`,
  };
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
    const subject = sanitizeNotificationCopy(params.subject);
    const logoUrl = emailLogoUrl(this.config.get<string>('HOST_FRONTEND_URL'));
    const { text, html } = withTeamSignoff(
      sanitizeNotificationCopy(params.text),
      params.html ? sanitizeNotificationCopy(params.html) : undefined,
      logoUrl,
    );

    const credentials = Buffer.from(`${sid}:${secret}`).toString('base64');
    let res: Response;
    try {
      res = await fetch('https://comms.twilio.com/v1/Emails', {
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
            subject,
            html,
            text,
          },
        }),
      });
    } catch (err) {
      recordDependencyFailure('twilio');
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Twilio Email API request failed: ${error}`);
      return { ok: false, error };
    }

    if (!res.ok) {
      recordDependencyFailure('twilio');
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
