#!/usr/bin/env bash
safe_show() {
  local f="$1"
  echo "==== $f (non-secret values) ===="
  [ ! -f "$f" ] && echo MISSING && return
  grep -v '^#' "$f" | grep -v '^$' | while IFS= read -r line; do
    key="${line%%=*}"
    val="${line#*=}"
    case "$key" in
      *_SECRET|*_KEY|*_KEY_SID|*_KEY_SECRET|JWT_SECRET|ADMIN_JWT_SECRET|DATABASE_URL|SUPABASE_*|GCS_KEY_FILE|GOOGLE_APPLICATION_CREDENTIALS|*_CREDENTIALS*|*_PASSWORD*|VAPID_PRIVATE_KEY)
        echo "$key=***"
        ;;
      *)
        echo "$key=$val"
        ;;
    esac
  done
}
safe_show /root/locumlink/backend/.env
safe_show /root/locumlink/backend/.env.staging
safe_show /root/locumlink/frontend/.env.local
