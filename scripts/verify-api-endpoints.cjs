/**
 * Smoke-test API routes: reachable, no 5xx, auth routes return expected codes.
 * Run while `npm run dev` is up (backend :3000, frontend :3001).
 */
const BACKEND = 'http://127.0.0.1:3000';
const FRONTEND = 'http://127.0.0.1:3001';

/** @type {{ method: string, path: string, expect: number[], label?: string, body?: object }[]} */
const backendRoutes = [
  { method: 'GET', path: '/api/health', expect: [200] },
  { method: 'GET', path: '/api/locum/jobs/browse-count', expect: [200] },
  { method: 'GET', path: '/api/admin-auth/oauth-setup', expect: [200] },
  { method: 'GET', path: '/api/admin-auth/google', expect: [302, 503] },
  { method: 'GET', path: '/api/admin-auth/me', expect: [401] },
  { method: 'POST', path: '/api/auth/login', expect: [400, 401], body: {} },
  { method: 'POST', path: '/api/auth/register', expect: [400], body: {} },
  { method: 'GET', path: '/api/auth/me', expect: [401] },
  { method: 'GET', path: '/api/host/profile', expect: [401] },
  { method: 'GET', path: '/api/host/stats', expect: [401] },
  { method: 'GET', path: '/api/host/jobs', expect: [401] },
  { method: 'GET', path: '/api/locum/profile', expect: [401] },
  { method: 'GET', path: '/api/locum/jobs', expect: [401] },
  { method: 'GET', path: '/api/locum/applications', expect: [401] },
  { method: 'GET', path: '/api/messages/conversations', expect: [401] },
  { method: 'GET', path: '/api/notifications', expect: [401] },
  { method: 'GET', path: '/api/admin/stats', expect: [401] },
  { method: 'GET', path: '/api/admin/users', expect: [401] },
  { method: 'GET', path: '/api/admin/verifications', expect: [401] },
  { method: 'GET', path: '/api/admin/audit-logs', expect: [401] },
];

/** Frontend Next.js handlers (not proxied to Nest) */
const frontendAdminRoutes = [
  { method: 'GET', path: '/api/admin/stats', expect: [401] },
  { method: 'GET', path: '/api/admin/users', expect: [401] },
  { method: 'GET', path: '/api/admin/users/export', expect: [401] },
  { method: 'GET', path: '/api/admin/verifications', expect: [401] },
  { method: 'GET', path: '/api/admin/audit-logs', expect: [401] },
  { method: 'GET', path: '/api/admin/analytics/summary', expect: [401] },
];

/** Rewritten through Next to Nest */
const frontendProxyRoutes = [
  { method: 'GET', path: '/api/health', expect: [200] },
  { method: 'GET', path: '/api/locum/jobs/browse-count', expect: [200] },
  { method: 'GET', path: '/api/auth/me', expect: [401] },
  { method: 'GET', path: '/api/host/profile', expect: [401] },
];

async function hit(base, { method, path, expect, body }) {
  const url = `${base}${path}`;
  const opts = { method, redirect: 'manual', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, opts);
    const ok = expect.includes(res.status);
    const snippet = await res.text().then((t) => t.slice(0, 120).replace(/\s+/g, ' '));
    return { url, status: res.status, ok, expect, snippet };
  } catch (err) {
    return {
      url,
      status: 0,
      ok: false,
      expect,
      snippet: err instanceof Error ? err.message : String(err),
    };
  }
}

function printResults(title, results) {
  console.log(`\n=== ${title} ===`);
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? 'OK' : 'FAIL';
    if (!r.ok) failed++;
    console.log(
      `[${mark}] ${r.status || 'ERR'} ${r.url} (expected ${r.expect.join('|')})${r.ok ? '' : ` — ${r.snippet}`}`,
    );
  }
  return failed;
}

(async () => {
  const b = await Promise.all(backendRoutes.map((r) => hit(BACKEND, r)));
  const fAdmin = await Promise.all(frontendAdminRoutes.map((r) => hit(FRONTEND, r)));
  const fProxy = await Promise.all(frontendProxyRoutes.map((r) => hit(FRONTEND, r)));

  let failed = 0;
  failed += printResults(`Nest backend (${BACKEND})`, b);
  failed += printResults(`Next admin routes (${FRONTEND})`, fAdmin);
  failed += printResults(`Next → Nest rewrites (${FRONTEND})`, fProxy);

  console.log(failed === 0 ? '\nAll endpoint checks passed.\n' : `\n${failed} check(s) failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
