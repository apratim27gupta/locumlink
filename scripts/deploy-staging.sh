#!/usr/bin/env bash
# Deploy latest staging branch on the dedicated staging VM.
#
# Usage (as root on staging-vm):
#   ./scripts/deploy-staging.sh              # default: pull + build + restart
#   ./scripts/deploy-staging.sh quick        # same as default
#   ./scripts/deploy-staging.sh full         # first deploy / after reboot / deps or schema changed
#   ./scripts/deploy-staging.sh env          # env file edits only — restart services
#   ./scripts/deploy-staging.sh migrate      # pull + migrate + build + restart
#   ./scripts/deploy-staging.sh install      # pull + npm install + build + restart
#
# See docs/STAGING_DEPLOY.md for when to use each mode.
set -euo pipefail

ROOT="${STAGING_ROOT:-/root/locumlink}"
MODE="${1:-quick}"

cd "$ROOT"

load_staging_env() {
  set -a
  # shellcheck disable=SC1091
  source <(grep -v '^#' backend/.env.staging | sed 's/^/export /')
  set +a
}

pull_staging() {
  echo "==> Pull latest staging"
  git fetch origin
  git checkout staging
  git pull origin staging
}

ensure_postgres() {
  echo "==> Ensure staging Postgres is up"
  docker compose -f docker-compose.staging-db.yml up -d
}

install_deps() {
  echo "==> Install dependencies"
  npm install
}

migrate_db() {
  echo "==> Migrate staging DB"
  load_staging_env
  npx prisma migrate deploy --schema=database/prisma/schema.prisma
  npx prisma generate --schema=database/prisma/schema.prisma
}

build_apps() {
  echo "==> Build backend + frontend"
  npm run build -w backend
  npm run build -w frontend
}

restart_services() {
  echo "==> Restart app services"
  systemctl restart locumlink-api
  systemctl restart locumlink-web
}

health_check() {
  echo "==> Health check"
  sleep 3
  curl -fsS http://127.0.0.1:3000/api/health
  echo ""
  echo "Staging deploy OK"
}

case "$MODE" in
  quick | --quick)
    pull_staging
    build_apps
    restart_services
    health_check
    ;;
  full | --full)
    ensure_postgres
    pull_staging
    install_deps
    migrate_db
    build_apps
    restart_services
    health_check
    ;;
  env | --env)
    restart_services
    health_check
    ;;
  migrate | --migrate)
    pull_staging
    migrate_db
    build_apps
    restart_services
    health_check
    ;;
  install | --install)
    pull_staging
    install_deps
    build_apps
    restart_services
    health_check
    ;;
  -h | --help)
    sed -n '2,12p' "$0"
    exit 0
    ;;
  *)
    echo "Unknown mode: $MODE (try: quick, full, env, migrate, install)" >&2
    exit 1
    ;;
esac
