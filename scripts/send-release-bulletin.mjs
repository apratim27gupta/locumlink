/**
 * Send the Nov 8 release bulletin to unique real users (one email per person).
 *
 * Dry-run by default — does not send until you pass --send.
 *
 *   node scripts/send-release-bulletin.mjs
 *   node scripts/send-release-bulletin.mjs --send
 *   node scripts/send-release-bulletin.mjs --send --limit 5
 *   node scripts/send-release-bulletin.mjs --only you@example.com --send
 *   node scripts/send-release-bulletin.mjs --send you@example.com other@example.com
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envText = fs.readFileSync(path.join(root, 'backend/.env'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let value = m[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  env[m[1]] = value;
}

const REVIEW_PLAYGROUND_EMAILS = new Set([
  'reviewlocum@locumlink.ca',
  'reviewlocum1@locumlink.ca',
  'reviewlocum2@locumlink.ca',
  'reviewlocum3@locumlink.ca',
  ...(env.REVIEW_OTP_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
]);

const SUPPRESSED_EMAILS = new Set(
  (env.MAIL_SUPPRESS_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

const TEST_EMAIL_RE = /@(example\.com|locumlink\.test)$/i;

function looksLikeEmail(address) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

function isRealUserEmail(email) {
  const n = email.trim().toLowerCase();
  if (!looksLikeEmail(n)) return false;
  if (REVIEW_PLAYGROUND_EMAILS.has(n)) return false;
  if (SUPPRESSED_EMAILS.has(n)) return false;
  if (TEST_EMAIL_RE.test(n)) return false;
  if (n.startsWith('reviewlocum')) return false;
  return true;
}

const args = process.argv.slice(2);
const doSend = args.includes('--send');
const limitIdx = args.indexOf('--limit');
const limit =
  limitIdx >= 0 && args[limitIdx + 1] ? Number(args[limitIdx + 1]) : null;
const onlyIdx = args.indexOf('--only');
const onlyEmail =
  onlyIdx >= 0 && args[onlyIdx + 1]
    ? args[onlyIdx + 1].trim().toLowerCase()
    : null;

const consumed = new Set();
if (doSend) consumed.add(args.indexOf('--send'));
if (limitIdx >= 0) {
  consumed.add(limitIdx);
  consumed.add(limitIdx + 1);
}
if (onlyIdx >= 0) {
  consumed.add(onlyIdx);
  consumed.add(onlyIdx + 1);
}
const explicitEmails = [
  ...new Set(
    args
      .filter((_, i) => !consumed.has(i) && !String(args[i]).startsWith('--'))
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ),
];
if (onlyEmail && !explicitEmails.includes(onlyEmail)) explicitEmails.push(onlyEmail);

if (limit != null && (!Number.isFinite(limit) || limit < 1)) {
  console.error('--limit must be a positive number');
  process.exit(1);
}

const sid = env.TWILIO_API_KEY_SID;
const secret = env.TWILIO_API_KEY_SECRET;
const from = env.MAIL_FROM_ADDRESS || 'noreply@locumlink.ca';
const fromName = env.MAIL_FROM_NAME || 'Locum Link';
const databaseUrl = env.DATABASE_URL;
if (!explicitEmails.length && !databaseUrl) {
  console.error('Missing DATABASE_URL in backend/.env');
  process.exit(1);
}
if (doSend && (!sid || !secret)) {
  console.error('Missing Twilio credentials in backend/.env');
  process.exit(1);
}

const html = fs.readFileSync(
  path.join(root, 'docs/email-templates/release-bulletin-2026-11-06-wide.html'),
  'utf8',
);
const subject =
  'LocumLink Update: Flexible Schedule, Easier Bookings & more on Nov 11th, 2026';
const text = [
  subject,
  '',
  "Here's what's new for hosts and locums: half-day blocks, partial coverage, a pre-filled MSI GP Locum Application, and transparent match fees.",
  '',
  'Open LocumLink: https://locumlink.ca',
  '',
  'Team LocumLink',
].join('\n');

let toSend = [];

if (explicitEmails.length) {
  const invalid = explicitEmails.filter((e) => !looksLikeEmail(e));
  if (invalid.length) {
    console.error(`Invalid email(s): ${invalid.join(', ')}`);
    process.exit(1);
  }
  toSend = explicitEmails.map((email) => ({ email, role: 'explicit', accounts: 1 }));
  console.log(`Mode: ${doSend ? 'SEND' : 'DRY-RUN (pass --send to actually email)'}`);
  console.log(`Subject: ${subject}`);
  console.log(`Explicit recipients (DB skipped): ${toSend.length}`);
  console.log('');
  for (const r of toSend) console.log(`  ${r.email}`);
} else {
  const pool = new Pool({ connectionString: databaseUrl });

  const { rows } = await pool.query(`
    SELECT
      u.id,
      u.email,
      u.role,
      u.status,
      COUNT(*) OVER (PARTITION BY LOWER(u.email)) AS account_rows
    FROM users u
    WHERE u.role IN ('HOST', 'LOCUM')
      AND u.status <> 'DEACTIVATED'
      AND u.email IS NOT NULL
      AND btrim(u.email) <> ''
    ORDER BY LOWER(u.email), u."updatedAt" DESC
  `);
  await pool.end();

  const seen = new Set();
  const skippedDupes = [];
  const skippedFilter = [];
  const recipients = [];

  for (const row of rows) {
    const email = String(row.email).trim().toLowerCase();
    if (seen.has(email)) {
      skippedDupes.push({ email, role: row.role, id: row.id });
      continue;
    }
    seen.add(email);
    if (!isRealUserEmail(email)) {
      skippedFilter.push({ email, role: row.role, reason: 'test/review/suppressed' });
      continue;
    }
    recipients.push({ email, role: row.role, id: row.id, accounts: Number(row.account_rows) });
  }

  toSend = limit != null ? recipients.slice(0, limit) : recipients;

  console.log(`Mode: ${doSend ? 'SEND' : 'DRY-RUN (pass --send to actually email)'}`);
  console.log(`Subject: ${subject}`);
  console.log(`User rows (HOST/LOCUM, not deactivated): ${rows.length}`);
  console.log(`Duplicate extra rows (same email, extra host/locum account): ${skippedDupes.length}`);
  console.log(`Filtered test/review/suppressed: ${skippedFilter.length}`);
  console.log(`Unique real recipients: ${recipients.length}`);
  if (limit != null) console.log(`Limit: ${limit} → sending/listing ${toSend.length}`);
  console.log('');
  for (const r of toSend) {
    const extra =
      r.accounts > 1 ? ` (${r.accounts} accounts, 1 mail)` : '';
    console.log(`  ${r.email}\t${r.role}${extra}`);
  }
}

if (!doSend) {
  console.log('\nNo emails sent. Re-run with --send when ready.');
  process.exit(0);
}

const credentials = Buffer.from(`${sid}:${secret}`).toString('base64');
let ok = 0;
let failed = 0;

for (const r of toSend) {
  const res = await fetch('https://comms.twilio.com/v1/Emails', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { address: from, name: fromName },
      to: [{ address: r.email }],
      content: { subject, html, text },
    }),
  });
  const body = await res.text();
  if (res.ok) {
    ok += 1;
    console.log(`SENT ${r.email} => ${res.status} ${body.slice(0, 200)}`);
  } else {
    failed += 1;
    console.error(`FAIL ${r.email} => ${res.status} ${body.slice(0, 400)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

console.log(`\nDone. sent=${ok} failed=${failed}`);
if (failed) process.exitCode = 1;
