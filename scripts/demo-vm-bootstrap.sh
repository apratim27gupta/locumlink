#!/usr/bin/env bash
# One-time bootstrap for demo-vm (main branch, schema-only Postgres, fixed OTP).
set -euo pipefail

DEMO_ROOT=/root/locumlink
DEMO_DB_PASSWORD="${DEMO_DB_PASSWORD:-$(openssl rand -hex 16)}"
DEMO_IP="${DEMO_IP:-$(curl -fsS -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)}"

echo "==> Demo external IP: ${DEMO_IP}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git nginx curl ca-certificates gnupg

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null || echo v0)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

if [[ ! -d "${DEMO_ROOT}/.git" ]]; then
  git clone https://github.com/apratim27gupta/locumlink.git "${DEMO_ROOT}"
fi

cd "${DEMO_ROOT}"
git fetch origin main
git checkout main
git pull origin main

cat > docker-compose.demo-db.yml <<'YAML'
services:
  postgres_demo:
    image: postgres:16-alpine
    container_name: l2_postgres_demo
    restart: unless-stopped
    ports:
      - "5434:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DEMO_POSTGRES_PASSWORD}
      POSTGRES_DB: l2_demo
    volumes:
      - pgdata_demo:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d l2_demo"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata_demo:
YAML

export DEMO_POSTGRES_PASSWORD="${DEMO_DB_PASSWORD}"
docker compose -f docker-compose.demo-db.yml up -d

JWT_SECRET="$(openssl rand -hex 32)"
ADMIN_JWT_SECRET="$(openssl rand -hex 32)"
DATABASE_URL="postgresql://postgres:${DEMO_DB_PASSWORD}@127.0.0.1:5434/l2_demo"
APP_ORIGIN="http://${DEMO_IP}"

# Reuse staging Supabase project keys if staging exists on this project (OTP/email auth infra).
STAGING_ENV=/root/locumlink-staging-env-copy
if [[ -f "${STAGING_ENV}/supabase.env" ]]; then
  # shellcheck disable=SC1091
  source "${STAGING_ENV}/supabase.env"
fi

: "${SUPABASE_URL:=https://placeholder.supabase.co}"
: "${SUPABASE_ANON_KEY:=placeholder-anon-key}"
: "${SUPABASE_SERVICE_ROLE_KEY:=placeholder-service-role}"

mkdir -p backend
cat > backend/.env <<EOF
GCS_PROJECT_ID=locumlink-490817
GCS_BUCKET_NAME=documents_locumlink-staging
GCS_KEY_FILE=/root/gcs-key.json
GOOGLE_APPLICATION_CREDENTIALS=/root/gcs-key.json
MAIL_FROM_ADDRESS=noreply@locumlink.ca
MAIL_FROM_NAME=Locum Link Demo
EOF

cat > backend/.env.staging <<EOF
NODE_ENV=staging
PORT=3000
FIXED_OTP_CODE=000000
DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
ALLOWED_ORIGINS=${APP_ORIGIN}
ADMIN_FRONTEND_REDIRECT_URL=${APP_ORIGIN}/admin
EOF

cat > frontend/.env.local <<EOF
NEXT_PUBLIC_API_URL=${APP_ORIGIN}
NEXT_PUBLIC_APP_URL=${APP_ORIGIN}
API_INTERNAL_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
JWT_SECRET=${JWT_SECRET}
DATABASE_URL=${DATABASE_URL}
EOF

if [ "$(uname -s)" = "Linux" ] && [ -f .npmrc ]; then
  export npm_config_script_shell=/bin/bash
  sed -i '/^script-shell=/d' .npmrc
fi

npm install
export DATABASE_URL
npx prisma migrate deploy --schema=database/prisma/schema.prisma
npx prisma generate --schema=database/prisma/schema.prisma
npm run build -w backend
npm run build -w frontend

cat > /etc/nginx/sites-available/locumlink-demo <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 10m;
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
    large_client_header_buffers 4 32k;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/locumlink-demo /etc/nginx/sites-enabled/locumlink-demo
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

cat > /etc/systemd/system/locumlink-api.service <<'UNIT'
[Unit]
Description=Locum Link Demo API
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
ExecStartPre=/usr/bin/docker compose -f /root/locumlink/docker-compose.demo-db.yml up -d
ExecStart=/usr/bin/npm run start:staging
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/locumlink-web.service <<'UNIT'
[Unit]
Description=Locum Link Demo Web
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
UNIT

systemctl daemon-reload
systemctl enable --now locumlink-api locumlink-web

sleep 15
curl -fsS http://127.0.0.1:3000/api/health
echo ""
curl -fsS -o /dev/null -w "nginx:%{http_code}\n" "http://127.0.0.1/"
echo "DEMO_BOOTSTRAP_OK ip=${DEMO_IP}"
