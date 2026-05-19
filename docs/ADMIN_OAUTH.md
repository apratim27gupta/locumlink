# Admin Google OAuth setup

Admin login does **not** use Supabase. It uses a separate Google OAuth client and the Nest route `/api/admin-auth/google`.

## Google Cloud Console

1. **APIs & Services → Credentials → OAuth 2.0 Client ID** (Web application).
2. **Authorized redirect URIs** — add exactly one URI per environment (must match `GOOGLE_ADMIN_CALLBACK_URL` in `backend/.env`):

| Environment | Redirect URI |
|-------------|--------------|
| Local (frontend on port 3002) | `http://localhost:3002/api/admin-auth/google/callback` |
| GitHub Codespaces | `https://<YOUR-CODESPACE-NAME>-3002.<REGION>.github.dev/api/admin-auth/google/callback` |
| Production | `https://<your-domain>/api/admin-auth/google/callback` |

3. Copy **Client ID** and **Client secret** into `backend/.env` as `GOOGLE_ADMIN_CLIENT_ID` and `GOOGLE_ADMIN_CLIENT_SECRET`.

Do **not** use `/admin/oauth/callback` or the Supabase callback URL for admin.

## `backend/.env`

```env
GOOGLE_ADMIN_CLIENT_ID=your-client-id
GOOGLE_ADMIN_CLIENT_SECRET=your-client-secret
ADMIN_FRONTEND_REDIRECT_URL=http://localhost:3002/admin/dashboard
```

The Google callback URL is **derived automatically** from that line:

`http://localhost:3002/api/admin-auth/google/callback`

If you still have `GOOGLE_ADMIN_CALLBACK_URL=http://localhost:3000/...` in `.env`, **delete it** or update it — a stale `:3000` value was causing Google errors.

Restart the Nest API after changing `.env`.

### Verify before signing in

Open (with the API running):

- http://localhost:3002/api/admin-auth/oauth-setup  
  or http://localhost:3000/api/admin-auth/oauth-setup  

Copy `callbackUrl` from the JSON into Google Cloud → **Authorized redirect URIs** (exact match).

## GitHub Codespaces

1. Open the **Ports** tab and set port **3002** to **Public**.
2. Copy the forwarded URL, e.g. `https://abc123-3002.app.github.dev`.
3. Set in `backend/.env`:

```env
GOOGLE_ADMIN_CALLBACK_URL=https://abc123-3002.app.github.dev/api/admin-auth/google/callback
ADMIN_FRONTEND_REDIRECT_URL=https://abc123-3002.app.github.dev/admin/dashboard
```

4. Add the same callback URL in Google Cloud → Authorized redirect URIs.
5. Optional in `frontend/.env.local`:

```env
NEXT_PUBLIC_ADMIN_OAUTH_CALLBACK_URL=https://abc123-3002.app.github.dev/api/admin-auth/google/callback
```

## Allow your Google account

```bash
ADMIN_SEED_EMAIL="you@gmail.com" ADMIN_SEED_NAME="You" node database/seed-admin.mjs
```

## Run locally

- API: port **3000** (`npm run dev` in backend or root)
- UI: port **3002** (`npm run dev:frontend:3002` or `npm run dev:3002 -w frontend`)

Open `http://localhost:3002/admin/login` → Continue with Google.
