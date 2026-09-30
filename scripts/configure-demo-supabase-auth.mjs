#!/usr/bin/env node
/**
 * Add demo.locumlink.ca OAuth redirect URLs to Supabase (shared prod/staging project).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/configure-demo-supabase-auth.mjs
 *
 * Optional:
 *   SUPABASE_PROJECT_REF=dkfzestlyqgqnsztgymd  (default)
 *   DEMO_BASE_URL=https://demo.locumlink.ca     (default)
 */
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef =
  process.env.SUPABASE_PROJECT_REF?.trim() || 'dkfzestlyqgqnsztgymd';
const base = (process.env.DEMO_BASE_URL || 'https://demo.locumlink.ca').replace(
  /\/$/,
  '',
);

const DEMO_REDIRECTS = [
  `${base}/auth/callback`,
  `${base}/auth/callback/**`,
  `${base}/auth/callback/complete`,
  `${base}/auth/callback/complete/**`,
  `${base}/auth/callback/apple`,
  `${base}/auth/callback/apple/**`,
];

if (!token) {
  console.error(
    'Set SUPABASE_ACCESS_TOKEN (Supabase dashboard → Account → Access tokens).',
  );
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};
const authUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

async function main() {
  const getRes = await fetch(authUrl, { headers });
  const body = await getRes.text();
  if (!getRes.ok) {
    throw new Error(`GET auth config ${getRes.status}: ${body}`);
  }
  const cfg = JSON.parse(body);
  const current = (cfg.uri_allow_list || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  let changed = false;
  for (const u of DEMO_REDIRECTS) {
    if (!current.includes(u)) {
      current.push(u);
      changed = true;
    }
  }
  if (!changed) {
    console.log('Demo redirect URLs already present in uri_allow_list.');
    return;
  }

  const patchRes = await fetch(authUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      site_url: cfg.site_url,
      uri_allow_list: current.join(','),
    }),
  });
  const patchBody = await patchRes.text();
  if (!patchRes.ok) {
    throw new Error(`PATCH auth config ${patchRes.status}: ${patchBody}`);
  }
  const out = JSON.parse(patchBody);
  console.log('Updated uri_allow_list (site_url unchanged):', out.site_url);
  console.log(out.uri_allow_list);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
