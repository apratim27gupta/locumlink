/**
 * check-billing-and-alert.js
 *
 * Automated ops checks (no manual renewal dates required):
 *   - TLS certificate expiry for configured hosts
 *   - Domain expiry via RDAP
 *   - Twilio account balance (credits)
 *   - GCP Cloud Billing budgets (spend vs budget)
 *   - Supabase project health via Management API
 *
 * Env (repo root .env and/or backend/.env):
 *   ADMIN_ALERT_EMAIL, TWILIO_*, MAIL_FROM_*  — same as other monitors
 *
 *   TLS_CHECK_HOSTS=locumlink.ca,staging.locumlink.ca
 *   DOMAIN_CHECK_NAMES=locumlink.ca
 *   RENEWAL_REMINDER_DAYS=30,14,7,1
 *
 *   TWILIO_ACCOUNT_SID=ACxxxx          — required for balance check
 *   TWILIO_BALANCE_ALERT_USD=10        — alert when balance <= this (default 10)
 *
 *   GCP_BILLING_ACCOUNT_ID=01XXXX-...  — billing account id (no billingAccounts/ prefix)
 *   GCS_CREDENTIALS_JSON or GCS_KEY_FILE — service account with billing.budgets.list
 *   GCP_BUDGET_ALERT_PERCENT=80        — alert when spend >= this % of budget (default 80)
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_...      — Management API personal access token
 *   SUPABASE_PROJECT_REF=dkfzest...    — optional; checks all org projects if unset
 *
 * Run daily or via scripts/run-ops-monitors.sh
 */

const path = require('path');
const fs = require('fs');
const tls = require('tls');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ENV_PATH = path.join(__dirname, '.env');
const ROOT_ENV_PATH = path.join(__dirname, '..', '.env');
const DEFAULT_STATE_FILE = path.join(__dirname, '.ops-billing-alerts-state.json');
const DEFAULT_REMINDER_DAYS = [30, 14, 7, 1];
const DEFAULT_TLS_HOSTS = 'locumlink.ca,staging.locumlink.ca';
const DEFAULT_DOMAINS = 'locumlink.ca';

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
  return process.env[key] || readEnvVar(ROOT_ENV_PATH, key) || readEnvVar(ENV_PATH, key);
}

const TWILIO_API_KEY_SID = readEnvVar(ENV_PATH, 'TWILIO_API_KEY_SID') || readEnv('TWILIO_API_KEY_SID');
const TWILIO_API_KEY_SECRET =
  readEnvVar(ENV_PATH, 'TWILIO_API_KEY_SECRET') || readEnv('TWILIO_API_KEY_SECRET');
const MAIL_FROM_ADDRESS = readEnvVar(ENV_PATH, 'MAIL_FROM_ADDRESS') || readEnv('MAIL_FROM_ADDRESS');
const ADMIN_ALERT_EMAIL = readEnv('ADMIN_ALERT_EMAIL');
const STATE_FILE = readEnv('BILLING_ALERTS_STATE_FILE') || DEFAULT_STATE_FILE;

function parseList(raw, fallback) {
  return (raw || fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseReminderDays() {
  const raw = readEnv('RENEWAL_REMINDER_DAYS');
  if (!raw) return DEFAULT_REMINDER_DAYS;
  const days = raw
    .split(',')
    .map((d) => parseInt(d.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return days.length > 0 ? days : DEFAULT_REMINDER_DAYS;
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

function daysUntilDate(date) {
  const target = new Date(date);
  target.setUTCHours(12, 0, 0, 0);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function toDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
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

  const credentials = Buffer.from(
    `${TWILIO_API_KEY_SID}:${TWILIO_API_KEY_SECRET}`,
  ).toString('base64');
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

function getTlsExpiry(host, port = 443) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port, servername: host, rejectUnauthorized: false },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          socket.end();
          if (!cert || !cert.valid_to) {
            reject(new Error(`No certificate for ${host}`));
            return;
          }
          resolve(new Date(cert.valid_to));
        } catch (err) {
          reject(err);
        }
      },
    );
    socket.setTimeout(15_000, () => {
      socket.destroy();
      reject(new Error(`TLS timeout for ${host}`));
    });
    socket.on('error', reject);
  });
}

async function getDomainExpiry(domain) {
  const urls = [
    `https://rdap.org/domain/${encodeURIComponent(domain)}`,
    `https://rdap.iana.org/domain/${encodeURIComponent(domain)}`,
  ];
  let lastErr = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/rdap+json, application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        lastErr = new Error(`RDAP ${res.status} for ${domain}`);
        continue;
      }
      const body = await res.json();
      const events = Array.isArray(body.events) ? body.events : [];
      const expiry = events.find((e) =>
        /expir/i.test(String(e.eventAction || '')),
      );
      if (expiry?.eventDate) return new Date(expiry.eventDate);
      lastErr = new Error(`No expiry event in RDAP for ${domain}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`RDAP failed for ${domain}`);
}

function collectExpiryAlerts({ id, name, expiryDate, reminderDays, state, notes, billingUrl }) {
  const remaining = daysUntilDate(expiryDate);
  const dateOnly = toDateOnly(expiryDate);
  const due = [];

  if (remaining < 0) {
    const key = `${id}:${dateOnly}:expired`;
    if (!state[key]) {
      due.push({
        key,
        name,
        kind: 'expiry',
        renewalDate: dateOnly,
        remaining,
        notes: notes || '',
        billingUrl: billingUrl || '',
        detail: `EXPIRED ${Math.abs(remaining)} day(s) ago (${dateOnly})`,
      });
    }
    return due;
  }

  for (const threshold of reminderDays) {
    if (remaining !== threshold) continue;
    const key = `${id}:${dateOnly}:${threshold}`;
    if (state[key]) continue;
    due.push({
      key,
      name,
      kind: 'expiry',
      renewalDate: dateOnly,
      remaining,
      notes: notes || '',
      billingUrl: billingUrl || '',
      detail: `Expires ${dateOnly} (${remaining} day(s) away)`,
    });
  }
  return due;
}

async function checkTls(reminderDays, state) {
  const hosts = parseList(readEnv('TLS_CHECK_HOSTS'), DEFAULT_TLS_HOSTS);
  const due = [];
  for (const host of hosts) {
    try {
      const expiry = await getTlsExpiry(host);
      console.log(`[tls] ${host} expires ${toDateOnly(expiry)}`);
      due.push(
        ...collectExpiryAlerts({
          id: `tls:${host}`,
          name: `TLS certificate (${host})`,
          expiryDate: expiry,
          reminderDays,
          state,
          notes: 'Auto-checked via TLS handshake',
        }),
      );
    } catch (err) {
      console.error(`[tls] ${host}: ${err.message || err}`);
      const key = `tls-fail:${host}:${toDateOnly(new Date())}`;
      if (!state[key]) {
        due.push({
          key,
          name: `TLS check failed (${host})`,
          kind: 'failure',
          detail: String(err.message || err),
          notes: 'Could not read certificate — site may be down or TLS misconfigured',
          billingUrl: '',
          remaining: null,
          renewalDate: null,
        });
      }
    }
  }
  return due;
}

async function checkDomains(reminderDays, state) {
  const domains = parseList(readEnv('DOMAIN_CHECK_NAMES'), DEFAULT_DOMAINS);
  const due = [];
  for (const domain of domains) {
    try {
      const expiry = await getDomainExpiry(domain);
      console.log(`[domain] ${domain} expires ${toDateOnly(expiry)}`);
      due.push(
        ...collectExpiryAlerts({
          id: `domain:${domain}`,
          name: `Domain (${domain})`,
          expiryDate: expiry,
          reminderDays,
          state,
          notes: 'Auto-checked via RDAP',
          billingUrl: 'https://domains.google.com/',
        }),
      );
    } catch (err) {
      console.error(`[domain] ${domain}: ${err.message || err}`);
      const key = `domain-fail:${domain}:${toDateOnly(new Date())}`;
      if (!state[key]) {
        due.push({
          key,
          name: `Domain check failed (${domain})`,
          kind: 'failure',
          detail: String(err.message || err),
          notes: 'RDAP lookup failed — verify registrar manually',
          billingUrl: '',
          remaining: null,
          renewalDate: null,
        });
      }
    }
  }
  return due;
}

async function checkTwilioBalance(state) {
  const accountSid = readEnv('TWILIO_ACCOUNT_SID');
  if (!accountSid) {
    console.log('[twilio] Skipped — set TWILIO_ACCOUNT_SID to enable balance alerts');
    return [];
  }
  if (!TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET) {
    console.log('[twilio] Skipped — missing TWILIO_API_KEY_SID/SECRET');
    return [];
  }

  const threshold = parseFloat(readEnv('TWILIO_BALANCE_ALERT_USD') || '10');
  const auth = Buffer.from(
    `${TWILIO_API_KEY_SID}:${TWILIO_API_KEY_SECRET}`,
  ).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Balance.json`,
    {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Twilio Balance API ${res.status}: ${text}`);
  }
  const body = JSON.parse(text);
  const balance = parseFloat(body.balance);
  const currency = body.currency || 'USD';
  console.log(`[twilio] Balance ${balance} ${currency} (alert <= ${threshold})`);

  if (!Number.isFinite(balance) || balance > threshold) return [];

  // Dedup: one alert per calendar day while under threshold
  const key = `twilio-balance:${toDateOnly(new Date())}:${threshold}`;
  if (state[key]) return [];

  return [
    {
      key,
      name: 'Twilio credits / balance',
      kind: 'credits',
      detail: `Balance is ${balance} ${currency} (threshold ${threshold} ${currency})`,
      notes: 'Top up in Twilio Console to avoid email/OTP delivery failures',
      billingUrl: 'https://console.twilio.com/',
      remaining: null,
      renewalDate: null,
    },
  ];
}

function loadGcpCredentials() {
  const json = readEnv('GCS_CREDENTIALS_JSON');
  if (json) {
    try {
      return JSON.parse(json);
    } catch {
      /* fall through */
    }
  }
  const keyFile = readEnv('GCS_KEY_FILE');
  if (keyFile && fs.existsSync(keyFile)) {
    return JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  }
  return null;
}

async function getGoogleAccessToken(credentials) {
  const jwtHeader = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  ).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const jwtClaim = Buffer.from(
    JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-billing.readonly https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');

  const crypto = require('crypto');
  const unsigned = `${jwtHeader}.${jwtClaim}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(credentials.private_key, 'base64url');
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`GCP token error: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function checkGcpBudgets(state) {
  const billingAccountId = readEnv('GCP_BILLING_ACCOUNT_ID')?.replace(
    /^billingAccounts\//,
    '',
  );
  if (!billingAccountId) {
    console.log(
      '[gcp] Skipped — set GCP_BILLING_ACCOUNT_ID and grant billing.budgets.list on the GCS service account',
    );
    return [];
  }

  const credentials = loadGcpCredentials();
  if (!credentials?.client_email || !credentials?.private_key) {
    console.log('[gcp] Skipped — missing GCS_CREDENTIALS_JSON or GCS_KEY_FILE');
    return [];
  }

  const alertPercent = parseFloat(readEnv('GCP_BUDGET_ALERT_PERCENT') || '80');
  const token = await getGoogleAccessToken(credentials);
  const url =
    `https://billingbudgets.googleapis.com/v1/billingAccounts/${encodeURIComponent(billingAccountId)}/budgets`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GCP Budgets API ${res.status}: ${text}`);
  }
  const body = JSON.parse(text);
  const budgets = body.budgets || [];
  if (budgets.length === 0) {
    console.log(
      '[gcp] No budgets found — create a budget in Cloud Console Billing → Budgets & alerts',
    );
    return [];
  }

  const due = [];
  let anySpendReadable = false;

  for (const budget of budgets) {
    const name = budget.displayName || budget.name || 'GCP budget';
    const amountUnits = parseFloat(
      budget.amount?.specifiedAmount?.units ?? '0',
    );
    let currentSpend = NaN;
    if (budget.amountSpent?.units != null) {
      currentSpend = parseFloat(budget.amountSpent.units);
    } else if (typeof budget.amountSpent === 'string') {
      currentSpend = parseFloat(budget.amountSpent);
    } else if (budget.budgetUsage?.amountSpent?.units != null) {
      currentSpend = parseFloat(budget.budgetUsage.amountSpent.units);
    }

    if (!Number.isFinite(currentSpend) || !Number.isFinite(amountUnits) || amountUnits <= 0) {
      console.log(
        `[gcp] Budget "${name}" present; live spend not in list response (normal for some orgs). Rely on GCP Console budget threshold emails.`,
      );
      continue;
    }

    anySpendReadable = true;
    const pct = (currentSpend / amountUnits) * 100;
    console.log(
      `[gcp] Budget "${name}": spent ${currentSpend} / ${amountUnits} (${pct.toFixed(1)}%)`,
    );
    if (pct < alertPercent) continue;

    const key = `gcp-budget:${budget.name || name}:${toDateOnly(new Date())}:${alertPercent}`;
    if (state[key]) continue;
    due.push({
      key,
      name: `GCP budget (${name})`,
      kind: 'credits',
      detail: `Spend is ${pct.toFixed(1)}% of budget (${currentSpend} / ${amountUnits}); alert at ${alertPercent}%`,
      notes: 'Review Cloud Billing and raise budget or reduce usage',
      billingUrl: 'https://console.cloud.google.com/billing',
      remaining: null,
      renewalDate: null,
    });
  }

  if (!anySpendReadable && budgets.length > 0) {
    console.log(
      '[gcp] Budgets configured. Enable email thresholds in Console → Billing → Budgets (recommended primary alert).',
    );
  }

  return due;
}

async function checkSupabase(state) {
  const token = readEnv('SUPABASE_ACCESS_TOKEN');
  if (!token) {
    console.log(
      '[supabase] Skipped — set SUPABASE_ACCESS_TOKEN (Management API PAT) for project health alerts',
    );
    return [];
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  const projectRef = readEnv('SUPABASE_PROJECT_REF');
  let projects = [];

  if (projectRef) {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Supabase Management API ${res.status}: ${text}`);
    }
    projects = [JSON.parse(text)];
  } else {
    const res = await fetch('https://api.supabase.com/v1/projects', {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Supabase Management API ${res.status}: ${text}`);
    }
    projects = JSON.parse(text);
  }

  const due = [];
  const unhealthy = ['INACTIVE', 'GOING_DOWN', 'REMOVED', 'UNKNOWN'];
  for (const p of projects) {
    const status = String(p.status || '').toUpperCase();
    const id = p.id || p.ref || p.name;
    console.log(`[supabase] Project ${id} status=${status || 'n/a'}`);
    if (!unhealthy.includes(status)) continue;

    const key = `supabase-status:${id}:${status}:${toDateOnly(new Date())}`;
    if (state[key]) continue;
    due.push({
      key,
      name: `Supabase project (${p.name || id})`,
      kind: 'credits',
      detail: `Project status is ${status} — often means billing/credits issue or pause`,
      notes:
        'Check https://supabase.com/dashboard/org/_/billing — Management API has no prepaid credit balance endpoint',
      billingUrl: 'https://supabase.com/dashboard/org/_/billing',
      remaining: null,
      renewalDate: null,
    });
  }

  // Optional soft spend threshold if org invoices/usage exposed later — not available on free PAT for all orgs.
  return due;
}

async function main() {
  const timestamp = new Date().toISOString();
  const reminderDays = parseReminderDays();
  const state = loadState();
  const due = [];

  due.push(...(await checkTls(reminderDays, state)));
  due.push(...(await checkDomains(reminderDays, state)));

  try {
    due.push(...(await checkTwilioBalance(state)));
  } catch (err) {
    console.error(`[twilio] ${err.message || err}`);
    const key = `twilio-fail:${toDateOnly(new Date())}`;
    if (!state[key]) {
      due.push({
        key,
        name: 'Twilio balance check failed',
        kind: 'failure',
        detail: String(err.message || err),
        notes: 'Verify TWILIO_ACCOUNT_SID and API key permissions',
        billingUrl: 'https://console.twilio.com/',
        remaining: null,
        renewalDate: null,
      });
    }
  }

  try {
    due.push(...(await checkGcpBudgets(state)));
  } catch (err) {
    console.error(`[gcp] ${err.message || err}`);
    const key = `gcp-fail:${toDateOnly(new Date())}`;
    if (!state[key]) {
      due.push({
        key,
        name: 'GCP budget check failed',
        kind: 'failure',
        detail: String(err.message || err),
        notes:
          'Grant billing.budgets.list on the service account, or use native GCP budget emails',
        billingUrl: 'https://console.cloud.google.com/billing',
        remaining: null,
        renewalDate: null,
      });
    }
  }

  try {
    due.push(...(await checkSupabase(state)));
  } catch (err) {
    console.error(`[supabase] ${err.message || err}`);
    const key = `supabase-fail:${toDateOnly(new Date())}`;
    if (!state[key]) {
      due.push({
        key,
        name: 'Supabase check failed',
        kind: 'failure',
        detail: String(err.message || err),
        notes: 'Verify SUPABASE_ACCESS_TOKEN (Management API PAT)',
        billingUrl: 'https://supabase.com/dashboard',
        remaining: null,
        renewalDate: null,
      });
    }
  }

  if (due.length === 0) {
    console.log(`[${timestamp}] No billing/expiry alerts due.`);
    return;
  }

  const lines = [
    'Locum Link — Billing / expiry alerts',
    `Generated: ${timestamp}`,
    '',
    ...due.map((d) =>
      [
        `• ${d.name}`,
        d.detail ? `  ${d.detail}` : null,
        d.renewalDate ? `  Date: ${d.renewalDate}` : null,
        d.billingUrl ? `  Billing: ${d.billingUrl}` : null,
        d.notes ? `  Notes: ${d.notes}` : null,
        '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ];

  await sendAlertEmail(
    `Locum Link - ${due.length} billing/expiry alert(s)`,
    lines.join('\n'),
  );

  for (const item of due) {
    state[item.key] = timestamp;
  }
  saveState(state);

  await prisma.errorLog.create({
    data: {
      route: 'ops/billing-alerts',
      method: 'CRON',
      statusCode: 200,
      message: `BILLING_ALERT: sent ${due.length} alert(s)`,
      metadata: { items: due.map((d) => d.name) },
      alerted: true,
    },
  });

  console.log(`[${timestamp}] Sent ${due.length} billing/expiry alert(s).`);
}

main()
  .catch((err) => {
    console.error(`[billing] FAILED:`, err.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
