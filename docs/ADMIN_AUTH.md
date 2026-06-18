# Admin OTP authentication

Admin login uses email + OTP (not Supabase, not Google OAuth, not passwords). Sessions are stored in the `ll_admin` HttpOnly cookie (JWT signed with `ADMIN_JWT_SECRET`).

## Seed allowed admins

```bash
npm run db:seed:admin
```

Creates (if missing):

- `admin@locumlink.ca` — Locum Link Admin
- `info@aebeolleconsulting.com` — Aebeolle Admin

Existing rows are **not** overwritten. No invite emails are sent from the seed script — admins sign in at `/admin/login` and receive an OTP on demand.

## `backend/.env`

```env
ADMIN_JWT_SECRET=replace-with-a-long-random-string
ADMIN_JWT_EXPIRES_IN=7d
ADMIN_FRONTEND_REDIRECT_URL=http://localhost:3001/admin

ZEPTOMAIL_API_KEY=...
MAIL_FROM_ADDRESS=noreply@locumlink.ca
MAIL_FROM_NAME=Locum Link
```

## Routes

| Route | Purpose |
|-------|---------|
| `POST /api/admin-auth/request-otp` | Send login OTP (generic response) |
| `POST /api/admin-auth/verify-otp` | Verify OTP → `ll_admin` cookie |
| `GET /api/admin-auth/logout` | Clear cookie |
| `GET /api/admin-auth/me` | Current session (DB-validated) |

## Security notes

- Only emails with a row in `admins` receive an OTP; unknown emails get the same generic success message with no email sent.
- OTPs are scoped with `purpose: admin_login` and `adminId` in all queries.
- JWT identity: `sub` (admin id) is authoritative; `email` in JWT is display-only.
- Rate limiting (in-memory, per email+IP): request throttling and verify lockout after repeated failures.
- **Known gap (deferred):** explicit CSRF tokens are not implemented. Interim posture: `SameSite=Lax` cookies, same-origin admin UI.
- **Known gap (deferred):** rate limits do not survive process restarts or scale across instances.

## Local dev

- API: port **3000**
- UI: port **3001** (or **3002** with `npm run dev:frontend:3002`)

Open `/admin/login`.
