/**
 * check-errors-and-alert.js
 *
 * Runs every 5 minutes via cron. Checks error_logs for unalerted rows,
 * filters noise, emails ops-worthy errors via Twilio Email, marks alerted.
 *
 * Run manually: node check-errors-and-alert.js
 */

const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Keep in sync with backend/src/common/ops-alert.constants.ts
const NOISE_ERROR_PATTERNS = [
  'invalid or expired verification code',
  'invalid otp',
  'expired otp',
  'otp has expired',
  'invalid credentials',
  'invalid session',
  'unauthorized exception',
  'please wait',
  'a 6-digit verification code is required',
  'email is required',
  'must be an email',
  'email must be an email',
  'invalid email',
  'must be one of the following values',
  'bad request exception',
  'this email is not authorized for admin access',
  'captcha verification',
  'too many requests',
  'throttler',
];

const FORCE_ALERT_PATTERNS = [
  'otp email failed',
  'could not send verification email',
];

const SLOW_API_LOG_PREFIX = 'SLOW_API:';
const HEALTH_CHECK_LOG_PREFIX = 'HEALTH_CHECK_FAILED:';

const ENV_PATH = path.join(__dirname, '.env');
const ROOT_ENV_PATH = path.join(__dirname, '..', '.env');

function readEnvVar(filePath, key) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const line = content.split('\n').find((l) => l.trim().startsWith(`${key}=`));
    if (!line) return null;
    return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}

const TWILIO_API_KEY_SID = readEnvVar(ENV_PATH, 'TWILIO_API_KEY_SID');
const TWILIO_API_KEY_SECRET = readEnvVar(ENV_PATH, 'TWILIO_API_KEY_SECRET');
const MAIL_FROM_ADDRESS = readEnvVar(ENV_PATH, 'MAIL_FROM_ADDRESS');
const ADMIN_ALERT_EMAIL = readEnvVar(ROOT_ENV_PATH, 'ADMIN_ALERT_EMAIL');

function isNoiseError(statusCode, message) {
  if (statusCode >= 500) return false;
  const lower = (message ?? '').toLowerCase();
  if (statusCode === 401) return true;
  if (statusCode === 429) return true;
  if (statusCode === 400 && lower === 'bad request exception') return true;
  return NOISE_ERROR_PATTERNS.some((p) => lower.includes(p));
}

function shouldOpsAlert(statusCode, message) {
  const lower = (message ?? '').toLowerCase();
  if (FORCE_ALERT_PATTERNS.some((p) => lower.includes(p))) return true;
  if (statusCode >= 500) return true;
  if (lower.startsWith(SLOW_API_LOG_PREFIX.toLowerCase())) return true;
  if (lower.startsWith(HEALTH_CHECK_LOG_PREFIX.toLowerCase())) return true;
  return false;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmailBody(errors) {
  const htmlParts = [
    `<html><body style="font-family: Arial, sans-serif; padding: 20px;">`,
    `<h2 style="color: #333; border-bottom: 2px solid #c0392b; padding-bottom: 10px;">Locum Link - Error Alert Report</h2>`,
    `<p style="color: #555;">Generated: ${new Date().toISOString()}</p>`,
    `<p style="color: #555;"><strong>Total new errors: ${errors.length}</strong></p>`,
    `<hr style="border: 1px solid #ddd; margin: 20px 0;">`,
  ];

  const textParts = [
    `Locum Link - Error Alert Report`,
    `Generated: ${new Date().toISOString()}`,
    `Total new errors: ${errors.length}`,
    `${'='.repeat(50)}`,
  ];

  errors.forEach((err, idx) => {
    htmlParts.push(`
      <div style="margin-bottom: 25px; padding: 15px; background: #f9f9f9; border-left: 4px solid #c0392b; border-radius: 4px;">
        <h3 style="color: #c0392b; margin: 0 0 10px 0;">Error #${idx + 1} - ID: ${err.id}</h3>
        <p style="margin: 5px 0;"><strong>Time:</strong> ${err.createdAt.toISOString()}</p>
        <p style="margin: 5px 0;"><strong>Route:</strong> ${escapeHtml(err.route) || 'N/A'} &nbsp; <strong>Method:</strong> ${escapeHtml(err.method) || 'N/A'} &nbsp; <strong>Status:</strong> ${err.statusCode ?? 'N/A'}</p>
        ${err.userId ? `<p style="margin: 5px 0;"><strong>User ID:</strong> ${err.userId}</p>` : ''}
        <p style="margin: 10px 0 5px 0;"><strong>Message:</strong></p>
        <p style="margin: 0; padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 3px;">${escapeHtml(err.message) || 'N/A'}</p>
        ${err.stack ? `
          <p style="margin: 10px 0 5px 0;"><strong>Stack:</strong></p>
          <pre style="margin: 0; padding: 10px; background: #2d2d2d; color: #f8f8f2; border-radius: 3px; font-size: 11px; overflow-x: auto; white-space: pre-wrap;">${escapeHtml(err.stack)}</pre>
        ` : ''}
        ${err.metadata ? `
          <p style="margin: 10px 0 5px 0;"><strong>Metadata:</strong></p>
          <pre style="margin: 0; padding: 10px; background: #2d2d2d; color: #f8f8f2; border-radius: 3px; font-size: 11px; overflow-x: auto; white-space: pre-wrap;">${escapeHtml(JSON.stringify(err.metadata, null, 2))}</pre>
        ` : ''}
      </div>
    `);

    textParts.push(`\nError #${idx + 1} - ID: ${err.id}`);
    textParts.push(`Time: ${err.createdAt.toISOString()}`);
    textParts.push(`Route: ${err.route || 'N/A'}  Method: ${err.method || 'N/A'}  Status: ${err.statusCode ?? 'N/A'}`);
    if (err.userId) textParts.push(`User ID: ${err.userId}`);
    textParts.push(`Message: ${err.message || 'N/A'}`);
    if (err.stack) textParts.push(`Stack:\n${err.stack}`);
    if (err.metadata) textParts.push(`Metadata:\n${JSON.stringify(err.metadata, null, 2)}`);
    textParts.push(`${'-'.repeat(50)}`);
  });

  htmlParts.push(`</body></html>`);

  return {
    html: htmlParts.join('\n'),
    text: textParts.join('\n'),
  };
}

async function sendAlertEmail(errors) {
  const toEmails = (ADMIN_ALERT_EMAIL || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((address) => ({ address }));

  if (toEmails.length === 0) {
    throw new Error('No admin alert emails configured (ADMIN_ALERT_EMAIL is empty)');
  }
  if (!TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET || !MAIL_FROM_ADDRESS) {
    throw new Error('Missing TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET or MAIL_FROM_ADDRESS in backend/.env');
  }

  const { html, text } = buildEmailBody(errors);

  const payload = {
    from: { address: MAIL_FROM_ADDRESS, name: 'Locum Link Monitor' },
    to: toEmails,
    content: {
      subject: `Locum Link - ${errors.length} New Error(s) Detected`,
      html,
      text,
    },
  };

  const credentials = Buffer.from(`${TWILIO_API_KEY_SID}:${TWILIO_API_KEY_SECRET}`).toString('base64');
  const response = await fetch('https://comms.twilio.com/v1/Emails', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Twilio Email responded ${response.status}: ${responseText}`);
  }
  return { status: response.status, body: responseText };
}

async function main() {
  const timestamp = new Date().toISOString();
  try {
    const allErrors = await prisma.errorLog.findMany({
      where: { alerted: false },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    if (allErrors.length === 0) {
      console.log(`[${timestamp}] No new errors. Nothing to do.`);
      return;
    }

    const noiseErrors = allErrors.filter((err) => isNoiseError(err.statusCode, err.message));
    const realErrors = allErrors.filter(
      (err) => !isNoiseError(err.statusCode, err.message) && shouldOpsAlert(err.statusCode, err.message),
    );

    if (noiseErrors.length > 0) {
      console.log(`[${timestamp}] Filtered out ${noiseErrors.length} noise error(s).`);
    }

    const allIds = allErrors.map((e) => e.id);
    await prisma.errorLog.updateMany({
      where: { id: { in: allIds } },
      data: { alerted: true },
    });
    console.log(`[${timestamp}] Marked ${allIds.length} error(s) as alerted.`);

    if (realErrors.length === 0) {
      console.log(`[${timestamp}] No ops-worthy errors to report after filtering.`);
      return;
    }

    console.log(`[${timestamp}] Found ${realErrors.length} ops-worthy error(s). Sending alert email...`);
    await sendAlertEmail(realErrors);
    console.log(`[${timestamp}] Alert email sent successfully for ${realErrors.length} error(s).`);
  } catch (err) {
    console.error(`[${timestamp}] FAILED:`, err.message || err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
