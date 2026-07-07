# Staging deployment (dedicated VM)

Staging runs on its **own GCP VM** — not shared with production. Code from the **`staging`** branch; Postgres in **Docker** on the same machine.

## Architecture

```text
staging.locumlink.ca  →  nginx  →  Next.js :3001
                                    ↘ Nest API :3000 (via Next rewrites)
Postgres Docker :5433 / l2_staging
Supabase Auth (existing project) — OAuth only
OTP: FIXED_OTP_CODE=000000, no emails
```

| Item | Staging VM |
|------|------------|
| App directory | `/root/locumlink` |
| API port | `3000` |
| Web port | `3001` |
| Postgres | `127.0.0.1:5433/l2_staging` |
| URL (current) | `http://34.47.59.251` |
| URL (after DNS) | `https://staging.locumlink.ca` |
| GCS key on VM | `/root/gcs-key.json` (one-time copy; not in git) |

Production (`locumlink.ca`) stays on the **existing prod VM** — no changes required there.

---

## 1. Provision the staging VM

- GCP Compute Engine instance (same region as prod is fine)
- Ubuntu 22.04+ or Debian
- Open firewall: **22**, **80**, **443**
- Attach a static external IP
- DNS: **A record** `staging.locumlink.ca` → staging VM IP

Install on the VM:

```bash
apt update && apt install -y git nginx certbot python3-certbot-nginx
# Node 22 — use NodeSource or nvm
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
# Docker
curl -fsSL https://get.docker.com | sh
```

Copy GCS service account JSON to e.g. `/root/gcs-key.json` (do not commit).

---

## 2. Clone and configure

```bash
cd /root
git clone https://github.com/apratim27gupta/locumlink.git locumlink
cd /root/locumlink
git checkout staging
```

### Env files (never commit)

**`backend/.env`** — shared secrets:

```env
GCS_PROJECT_ID=locumlink-490817
GCS_BUCKET_NAME=documents_locumlink-staging
GCS_KEY_FILE=/root/gcs-key.json
GOOGLE_APPLICATION_CREDENTIALS=/root/gcs-key.json
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:...
MAIL_FROM_ADDRESS=noreply@locumlink.ca
MAIL_FROM_NAME=Locum Link Staging
```

**`backend/.env.staging`**:

```env
NODE_ENV=staging
PORT=3000
FIXED_OTP_CODE=000000
DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:5433/l2_staging
JWT_SECRET=<openssl rand -hex 32>
ADMIN_JWT_SECRET=<same-or-separate>
SUPABASE_URL=https://dkfzestlyqgqnsztgymd.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ALLOWED_ORIGINS=https://staging.locumlink.ca
ADMIN_FRONTEND_REDIRECT_URL=https://staging.locumlink.ca/admin
```

**`frontend/.env.local`** — `JWT_SECRET` and `DATABASE_URL` must match backend:

```env
NEXT_PUBLIC_API_URL=https://staging.locumlink.ca
NEXT_PUBLIC_APP_URL=https://staging.locumlink.ca
API_INTERNAL_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SUPABASE_URL=https://dkfzestlyqgqnsztgymd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
JWT_SECRET=<same as backend>
DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:5433/l2_staging
```

### Supabase Auth (OAuth only)

In Supabase → Authentication → URL configuration, add:

- Redirect URL: `https://staging.locumlink.ca/auth/callback`
- Redirect URL: `calocumlinkapp://auth/callback` (mobile app OAuth — PKCE returns via custom scheme)

---

## 3. Database, build, TLS

```bash
cd /root/locumlink
export STAGING_POSTGRES_PASSWORD='<strong-password>'
docker compose -f docker-compose.staging-db.yml up -d

export DATABASE_URL="postgresql://postgres:${STAGING_POSTGRES_PASSWORD}@127.0.0.1:5433/l2_staging"
npm install
npx prisma migrate deploy --schema=database/prisma/schema.prisma
npm run db:seed:admin   # optional

npm run build -w backend
npm run build -w frontend

certbot certonly --nginx -d staging.locumlink.ca
cp nginx/locumlink-staging.conf /etc/nginx/sites-available/locumlink-staging
ln -s /etc/nginx/sites-available/locumlink-staging /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## 4. systemd

**`/etc/systemd/system/locumlink-api.service`**

```ini
[Unit]
Description=Locum Link Staging API
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/locumlink/backend
EnvironmentFile=-/root/locumlink/backend/.env
EnvironmentFile=-/root/locumlink/backend/.env.staging
Environment=NODE_ENV=staging
Environment=PORT=3000
ExecStartPre=/usr/bin/docker compose -f /root/locumlink/docker-compose.staging-db.yml up -d
ExecStart=/usr/bin/npm run start:staging
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/locumlink-web.service`**

```ini
[Unit]
Description=Locum Link Staging Web
After=network.target locumlink-api.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/locumlink/frontend
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=API_INTERNAL_URL=http://127.0.0.1:3000
ExecStart=/usr/bin/npx next start -p 3001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now locumlink-api locumlink-web
```

---

## 5. OTP on staging

With `FIXED_OTP_CODE=000000` and `NODE_ENV=staging`:

- No OTP emails (user or admin)
- Enter **`000000`** at verify step

Twilio is **not** required on the staging VM.

---

## 6. Day-to-day deploy (by situation)

On your laptop: **push to `staging`**. On the VM (as root): run the matching mode.

```bash
cd /root/locumlink
chmod +x scripts/deploy-staging.sh   # once
./scripts/deploy-staging.sh          # default — see table below
```

### Which mode?

| Situation | Command | What it does |
|-----------|---------|--------------|
| **Normal code change** (most deploys) | `./scripts/deploy-staging.sh` | `git pull` → build → restart |
| **`package.json` / lockfile changed** | `./scripts/deploy-staging.sh install` | pull → `npm install` → build → restart |
| **New Prisma migration** | `./scripts/deploy-staging.sh migrate` | pull → migrate → build → restart |
| **Only edited env files on VM** | `./scripts/deploy-staging.sh env` | restart services only |
| **VM reboot / first deploy / unsure** | `./scripts/deploy-staging.sh full` | Postgres up → pull → install → migrate → build → restart |

### Do you need `npm install` every time?

**No.** Skip it unless `package.json` or `package-lock.json` changed in the pull. The default `quick` mode does not run it. Use `install` or `full` when dependencies changed.

### Do you need `git pull` + build every time?

**Yes**, for code changes. Services run compiled output (`backend/dist`, `frontend/.next`). Pull alone does not update what is running.

### Manual equivalents

**Quick (typical):**

```bash
cd /root/locumlink
git pull origin staging
npm run build -w backend
npm run build -w frontend
systemctl restart locumlink-api locumlink-web
curl http://127.0.0.1:3000/api/health
```

**Env-only:**

```bash
systemctl restart locumlink-api locumlink-web
```

---

## 7. Verify

```bash
curl http://127.0.0.1:3000/api/health
curl https://staging.locumlink.ca/api/health
docker exec l2_postgres_staging psql -U postgres -d l2_staging -c "SELECT count(*) FROM users;"
```

Sign up on staging → confirm data exists only in staging Postgres, not on prod.
