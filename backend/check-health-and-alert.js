/**
 * check-health-and-alert.js
 *
 * Pings GET /api/health. On failure, writes to error_logs and emails admins.
 * Run via cron every 5 minutes alongside check-errors-and-alert.js.
 *
 * Env (repo root .env or backend/.env):
 *   HEALTH_CHECK_URL — default http://127.0.0.1:3000/api/health
 *   ADMIN_ALERT_EMAIL, TWILIO_*, MAIL_FROM_* — same as error alert script
 */

const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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
const HEALTH_CHECK_URL =
  readEnvVar(ROOT_ENV_PATH, 'HEALTH_CHECK_URL') ||
  readEnvVar(ENV_PATH, 'HEALTH_CHECK_URL') ||
  'http://127.0.0.1:3000/api/health';

const HEALTH_CHECK_LOG_PREFIX = 'HEALTH_CHECK_FAILED:';

async function sendAlertEmail(subject, text) {
  const toEmails = (ADMIN_ALERT_EMAIL || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((address) => ({ address }));

  if (toEmails.length === 0) {
    throw new Error('No admin alert emails configured (ADMIN_ALERT_EMAIL is empty)');
  }
  if (!TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET || !MAIL_FROM_ADDRESS) {
    throw new Error('Missing Twilio email credentials in backend/.env');
  }

  const credentials = Buffer.from(`${TWILIO_API_KEY_SID}:${TWILIO_API_KEY_SECRET}`).toString('base64');
  const response = await fetch('https://comms.twilio.com/v1/Emails', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: { address: MAIL_FROM_ADDRESS, name: 'Locum Link Monitor' },
      to: toEmails,
      content: {
        subject,
        text,
        html: `<p>${text.replace(/\n/g, '<br>')}</p>`,
      },
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Twilio Email responded ${response.status}: ${responseText}`);
  }
}

async function main() {
  const timestamp = new Date().toISOString();
  let detail = null;

  try {
    const res = await fetch(HEALTH_CHECK_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      detail = `${HEALTH_CHECK_URL} returned HTTP ${res.status}`;
    } else {
      const body = await res.json().catch(() => ({}));
      if (body.status !== 'ok' || body.database === 'unreachable') {
        detail = `${HEALTH_CHECK_URL} unhealthy: ${JSON.stringify(body)}`;
      }
    }
  } catch (err) {
    detail = `${HEALTH_CHECK_URL} unreachable: ${err.message || err}`;
  }

  if (!detail) {
    console.log(`[${timestamp}] Health OK (${HEALTH_CHECK_URL})`);
    return;
  }

  const message = `${HEALTH_CHECK_LOG_PREFIX} ${detail}`;
  console.error(`[${timestamp}] ${message}`);

  await prisma.errorLog.create({
    data: {
      route: '/api/health',
      method: 'GET',
      statusCode: 503,
      message,
      alerted: true,
    },
  });

  await sendAlertEmail(
    'Locum Link - Health Check Failed',
    `${message}\nTime: ${timestamp}`,
  );
  console.log(`[${timestamp}] Health failure alert sent.`);
}

main()
  .catch((err) => {
    console.error(`[health-check] FAILED:`, err.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
