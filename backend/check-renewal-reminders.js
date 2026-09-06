/**
 * check-renewal-reminders.js
 *
 * Sends admin email reminders before paid service renewals.
 * Configure via SERVICE_RENEWAL_ALERTS (JSON array) or SERVICE_RENEWAL_ALERTS_FILE path.
 *
 * Default reminder days: 30, 14, 7, 1 (override with RENEWAL_REMINDER_DAYS=30,14,7)
 *
 * Run daily via cron, or via scripts/run-ops-monitors.sh
 */

const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ENV_PATH = path.join(__dirname, '.env');
const ROOT_ENV_PATH = path.join(__dirname, '..', '.env');
const DEFAULT_STATE_FILE = path.join(__dirname, '.ops-renewal-alerts-state.json');
const DEFAULT_REMINDER_DAYS = [30, 14, 7, 1];

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

function readEnv(key) {
  return readEnvVar(ROOT_ENV_PATH, key) || readEnvVar(ENV_PATH, key);
}

const TWILIO_API_KEY_SID = readEnvVar(ENV_PATH, 'TWILIO_API_KEY_SID');
const TWILIO_API_KEY_SECRET = readEnvVar(ENV_PATH, 'TWILIO_API_KEY_SECRET');
const MAIL_FROM_ADDRESS = readEnvVar(ENV_PATH, 'MAIL_FROM_ADDRESS');
const ADMIN_ALERT_EMAIL = readEnv('ADMIN_ALERT_EMAIL');
const STATE_FILE = readEnv('RENEWAL_ALERTS_STATE_FILE') || DEFAULT_STATE_FILE;

function parseReminderDays() {
  const raw = readEnv('RENEWAL_REMINDER_DAYS');
  if (!raw) return DEFAULT_REMINDER_DAYS;
  const days = raw
    .split(',')
    .map((d) => parseInt(d.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return days.length > 0 ? days : DEFAULT_REMINDER_DAYS;
}

function loadRenewals() {
  const inline = readEnv('SERVICE_RENEWAL_ALERTS');
  if (inline) {
    try {
      return JSON.parse(inline);
    } catch (err) {
      throw new Error(`SERVICE_RENEWAL_ALERTS is not valid JSON: ${err.message}`);
    }
  }

  const filePath =
    readEnv('SERVICE_RENEWAL_ALERTS_FILE') ||
    path.join(__dirname, 'renewals.json');
  if (!fs.existsSync(filePath)) {
    console.log(`[renewals] No config at ${filePath} — copy renewals.example.json to renewals.json`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function daysUntil(dateStr) {
  const target = new Date(`${dateStr}T12:00:00.000Z`);
  const now = new Date();
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

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
        html: `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${text.replace(/</g, '&lt;')}</pre>`,
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
  const renewals = loadRenewals();
  if (!Array.isArray(renewals) || renewals.length === 0) {
    console.log(`[${timestamp}] No renewal entries configured.`);
    return;
  }

  const reminderDays = parseReminderDays();
  const state = loadState();
  const due = [];

  for (const entry of renewals) {
    const id = entry.id || entry.name;
    const name = entry.name || id;
    const renewalDate = entry.renewalDate;
    if (!id || !renewalDate) continue;

    const remaining = daysUntil(renewalDate);
    for (const threshold of reminderDays) {
      if (remaining !== threshold) continue;
      const key = `${id}:${renewalDate}:${threshold}`;
      if (state[key]) continue;

      due.push({
        key,
        name,
        renewalDate,
        remaining,
        threshold,
        billingUrl: entry.billingUrl || '',
        notes: entry.notes || '',
      });
    }
  }

  if (due.length === 0) {
    console.log(`[${timestamp}] No renewal reminders due today.`);
    return;
  }

  const lines = [
    'Locum Link — Service renewal reminders',
    `Generated: ${timestamp}`,
    '',
    ...due.map((d) => [
      `• ${d.name}`,
      `  Renewal date: ${d.renewalDate} (${d.remaining} day(s) away)`,
      d.billingUrl ? `  Billing: ${d.billingUrl}` : null,
      d.notes ? `  Notes: ${d.notes}` : null,
      '',
    ].filter(Boolean).join('\n')),
    'Update renewal dates in backend/renewals.json (or SERVICE_RENEWAL_ALERTS env).',
  ];

  const text = lines.join('\n');
  await sendAlertEmail(
    `Locum Link - ${due.length} service renewal reminder(s)`,
    text,
  );

  for (const item of due) {
    state[item.key] = timestamp;
  }
  saveState(state);

  await prisma.errorLog.create({
    data: {
      route: 'ops/renewal-reminders',
      method: 'CRON',
      statusCode: 200,
      message: `RENEWAL_REMINDER: sent ${due.length} reminder(s)`,
      metadata: { services: due.map((d) => d.name) },
      alerted: true,
    },
  });

  console.log(`[${timestamp}] Sent ${due.length} renewal reminder(s).`);
}

main()
  .catch((err) => {
    console.error(`[renewals] FAILED:`, err.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
