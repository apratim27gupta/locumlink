# Demo OAuth (Google, Microsoft, Apple)

Demo runs at **https://demo.locumlink.ca**. The app already sends OAuth `redirectTo` from `NEXT_PUBLIC_APP_URL` (see `getAppOrigin()` / `getOAuthCallbackRedirect()`).

## Isolated accounts

| Layer | Demo today |
|--------|------------|
| **App users** (`l2_demo` Postgres) | Demo-only — created when someone completes sign-in on demo and hits `POST /api/auth/sync-supabase`. |
| **Supabase Auth** (shared project `dkfzestlyqgqnsztgymd`) | **Same project as prod/staging** — same Google/Microsoft/Apple identity can exist across environments until you add a **dedicated Supabase project** for demo. |

For sales demos, shared Supabase is usually fine (no prod *app* row until they use prod). For strict “no shared auth identities,” create **locumlink-demo** in Supabase, enable the same three providers, and point `demo-vm` `SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*` at that project.

## 1. Supabase redirect URLs (required)

In [Supabase → Authentication → URL configuration](https://supabase.com/dashboard/project/dkfzestlyqgqnsztgymd/auth/url-configuration), add to **Redirect URLs**:

- `https://demo.locumlink.ca/auth/callback`
- `https://demo.locumlink.ca/auth/callback/**`
- `https://demo.locumlink.ca/auth/callback/complete`
- `https://demo.locumlink.ca/auth/callback/apple`

Or run (Management API PAT):

```bash
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/configure-demo-supabase-auth.mjs
```

Do **not** change **Site URL** away from production unless you intend to; only extend the allow list.

## 2. Apple Developer (required for Apple on demo)

Services ID **`ca.locumlink.web`** → Sign in with Apple → **Return URLs**, add:

- `https://demo.locumlink.ca/auth/callback`
- `https://demo.locumlink.ca/auth/callback/apple`

Domains: ensure **demo.locumlink.ca** is allowed for the Services ID (same pattern as staging/prod).

## 3. Google & Microsoft

Configured inside **Supabase** (not per hostname). Once demo redirect URLs are allow-listed, Google and Azure OAuth from demo use the existing Supabase provider setup; users return to `https://demo.locumlink.ca/auth/callback?role=...`.

## 4. Redeploy demo (after env change only)

If you switch to a **new** Supabase project, on `demo-vm`:

```bash
# edit /root/locumlink/backend/.env.staging and frontend/.env.local SUPABASE_* keys
cd /root/locumlink && npm run build -w frontend && systemctl restart locumlink-api locumlink-web
```

Frontend must be rebuilt when `NEXT_PUBLIC_SUPABASE_*` changes.

## 5. Quick test

1. Open https://demo.locumlink.ca/auth  
2. Google or Microsoft → should land on `/auth/callback` then setup/dashboard.  
3. Apple → popup or redirect; failures with `invalid_request` usually mean missing Apple Return URL for demo.
