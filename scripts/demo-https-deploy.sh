#!/usr/bin/env bash
# HTTPS + env URLs for demo.locumlink.ca on demo-vm
set -euo pipefail

DOMAIN=demo.locumlink.ca
ROOT=/root/locumlink
BASE_URL="https://${DOMAIN}"

cd "$ROOT"

git fetch origin main && git checkout main && git pull origin main || true

if ! command -v certbot >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq certbot python3-certbot-nginx
fi

# HTTP vhost for ACME + app until cert exists
if [ ! -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ]; then
  cat > /etc/nginx/sites-available/locumlink-demo-http <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN} _;
    client_max_body_size 10m;
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
  ln -sf /etc/nginx/sites-available/locumlink-demo-http /etc/nginx/sites-enabled/locumlink-demo
  rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/locumlink-demo-https 2>/dev/null || true
  nginx -t && systemctl reload nginx
  certbot certonly --nginx -d "${DOMAIN}" \
    --non-interactive --agree-tos --register-unsafely-without-email
fi

mkdir -p "${ROOT}/nginx"
if [ -f /tmp/locumlink-demo.conf ]; then
  cp /tmp/locumlink-demo.conf "${ROOT}/nginx/locumlink-demo.conf"
fi
if [ ! -f "${ROOT}/nginx/locumlink-demo.conf" ]; then
  echo "Missing ${ROOT}/nginx/locumlink-demo.conf" >&2
  exit 1
fi
cp "${ROOT}/nginx/locumlink-demo.conf" /etc/nginx/sites-available/locumlink-demo
ln -sf /etc/nginx/sites-available/locumlink-demo /etc/nginx/sites-enabled/locumlink-demo
rm -f /etc/nginx/sites-enabled/locumlink-demo-http /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Update env URLs
STAGING_ENV="${ROOT}/backend/.env.staging"
FRONT_ENV="${ROOT}/frontend/.env.local"

if grep -q '^ALLOWED_ORIGINS=' "$STAGING_ENV"; then
  sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=${BASE_URL}|" "$STAGING_ENV"
else
  echo "ALLOWED_ORIGINS=${BASE_URL}" >> "$STAGING_ENV"
fi
if grep -q '^ADMIN_FRONTEND_REDIRECT_URL=' "$STAGING_ENV"; then
  sed -i "s|^ADMIN_FRONTEND_REDIRECT_URL=.*|ADMIN_FRONTEND_REDIRECT_URL=${BASE_URL}/admin|" "$STAGING_ENV"
else
  echo "ADMIN_FRONTEND_REDIRECT_URL=${BASE_URL}/admin" >> "$STAGING_ENV"
fi

sed -i "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=${BASE_URL}|" "$FRONT_ENV"
sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=${BASE_URL}|" "$FRONT_ENV"

if [ "$(uname -s)" = "Linux" ] && [ -f .npmrc ]; then
  export npm_config_script_shell=/bin/bash
  sed -i '/^script-shell=/d' .npmrc
fi

npm run build -w backend
npm run build -w frontend
systemctl restart locumlink-api locumlink-web
sleep 4
curl -fsS "http://127.0.0.1:3000/api/health"
echo ""
curl -fsSI "https://${DOMAIN}/api/health" | head -5
echo "DEMO_HTTPS_OK ${BASE_URL}"
