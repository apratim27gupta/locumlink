const APP_URL = 'https://locumlink.ca';
const SUPPORT_EMAIL = 'support@locumlink.ca';

export type OtpEmailCopy = {
  subject: string;
  text: string;
  html: string;
};

/**
 * Branded transactional OTP copy for better inbox trust signals.
 * Keep HTML light — heavy marketing templates hurt OTP deliverability.
 */
export function buildOtpEmail(params: {
  otp: string;
  ttlMinutes: number;
  /** e.g. "Locum Link" or "the Locum Link admin portal" */
  productLabel: string;
  subject: string;
}): OtpEmailCopy {
  const { otp, ttlMinutes, productLabel, subject } = params;
  const text = [
    `You requested a sign-in code for ${productLabel} (${APP_URL}).`,
    '',
    `Your code: ${otp}`,
    '',
    `This code expires in ${ttlMinutes} minutes. Do not share it with anyone.`,
    '',
    'If you did not request this code, you can ignore this email.',
    `Questions? ${SUPPORT_EMAIL}`,
  ].join('\n');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937;max-width:480px">
  <p style="margin:0 0 16px">You requested a sign-in code for <strong>${escapeHtml(productLabel)}</strong> (<a href="${APP_URL}" style="color:#1d4ed8;text-decoration:none">${APP_URL.replace(/^https:\/\//, '')}</a>).</p>
  <p style="margin:0 0 8px;color:#4b5563">Your code:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:0 0 24px;font-family:ui-monospace,Menlo,Consolas,monospace">${escapeHtml(otp)}</p>
  <p style="margin:0 0 16px;color:#4b5563">This code expires in ${ttlMinutes} minutes. Do not share it with anyone.</p>
  <p style="margin:0 0 24px;color:#6b7280;font-size:14px">If you did not request this code, you can ignore this email.</p>
  <p style="margin:0;color:#6b7280;font-size:13px">Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:#1d4ed8;text-decoration:none">${SUPPORT_EMAIL}</a></p>
</div>
  `.trim();

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
