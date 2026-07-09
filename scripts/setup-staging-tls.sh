#!/usr/bin/env bash
# Run on the staging VM as root: bash scripts/setup-staging-tls.sh
set -euo pipefail

DOMAIN=staging.locumlink.ca
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_SITE=/etc/nginx/sites-available/locumlink-staging

echo "==> Locum Link staging TLS setup for ${DOMAIN}"

if ! command -v nginx >/dev/null 2>&1; then
  apt update && apt install -y nginx certbot python3-certbot-nginx
fi

if ! command -v certbot >/dev/null 2>&1; then
  apt update && apt install -y certbot python3-certbot-nginx
fi

# Port 443 must be open in GCP firewall (VPC → Firewall or gcloud).
if ! timeout 3 bash -c "echo >/dev/tcp/127.0.0.1/443" 2>/dev/null; then
  echo "NOTE: nothing listening on :443 yet (expected before cert)."
fi

echo "==> Ensuring HTTP server for ACME + app (port 80)"
cat > "${NGINX_SITE}" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 10m;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf "${NGINX_SITE}" /etc/nginx/sites-enabled/locumlink-staging
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Requesting Let's Encrypt certificate"
certbot certonly --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m admin@locumlink.ca || {
  echo "certbot failed. Ensure:"
  echo "  1) DNS A record ${DOMAIN} points to this VM"
  echo "  2) GCP firewall allows tcp:443 (and tcp:80 for validation)"
  exit 1
}

echo "==> Installing HTTPS nginx config"
cp "${REPO_ROOT}/nginx/locumlink-staging.conf" "${NGINX_SITE}"
nginx -t
systemctl reload nginx

echo "==> Restarting app services"
systemctl restart locumlink-api locumlink-web 2>/dev/null || true

echo ""
echo "Done. Verify:"
echo "  curl -I https://${DOMAIN}/api/health"
echo ""
echo "Update env on this VM if still using the raw IP:"
echo "  backend/.env.staging: ALLOWED_ORIGINS, ADMIN_FRONTEND_REDIRECT_URL"
echo "  frontend/.env.local:  NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_URL"
echo "  Supabase redirect:    https://${DOMAIN}/auth/callback"
echo "Then: systemctl restart locumlink-api locumlink-web"
