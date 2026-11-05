import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envText = fs.readFileSync(path.join(root, 'backend/.env'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const sid = env.TWILIO_API_KEY_SID;
const secret = env.TWILIO_API_KEY_SECRET;
const from = env.MAIL_FROM_ADDRESS || 'noreply@locumlink.ca';
const fromName = env.MAIL_FROM_NAME || 'Locum Link';
if (!sid || !secret) {
  console.error('Missing Twilio credentials in backend/.env');
  process.exit(1);
}

const html = fs.readFileSync(
  path.join(root, 'docs/email-templates/release-bulletin-2026-11-06-wide.html'),
  'utf8',
);
const subject = 'LocumLink Update: Flexible Scheduling, Easier Bookings & More';
const text = [
  'LocumLink Update: Flexible Scheduling, Easier Bookings & More',
  '',
  "Here's what's new for hosts and locums: half-day blocks, partial coverage, a pre-filled MSI GP Locum Application, and transparent match fees.",
  '',
  'Open LocumLink: https://locumlink.ca',
  '',
  'Team LocumLink',
].join('\n');

const recipients = process.argv.slice(2);
if (recipients.length === 0) {
  console.error('Usage: node scripts/send-release-bulletin.mjs email1 [email2 ...]');
  process.exit(1);
}

const credentials = Buffer.from(`${sid}:${secret}`).toString('base64');

for (const to of recipients) {
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
      content: { subject, html, text },
    }),
  });
  const body = await res.text();
  console.log(`${to} => ${res.status} ${body.slice(0, 400)}`);
  if (!res.ok) process.exitCode = 1;
}
