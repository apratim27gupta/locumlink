#!/usr/bin/env bash
# Merge Twilio + mail lines from /tmp/twilio-mail.env into demo backend/.env
set -euo pipefail
ENV_FILE=/root/locumlink/backend/.env
IMPORT=/tmp/twilio-mail.env
if [[ ! -f "$IMPORT" ]]; then
  echo "Missing $IMPORT" >&2
  exit 1
fi
touch "$ENV_FILE"
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  key="${line%%=*}"
  case "$key" in
    TWILIO_API_KEY_SID|TWILIO_API_KEY_SECRET|MAIL_FROM_ADDRESS|MAIL_SUPPRESS_EMAILS)
      if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
        sed -i "s|^${key}=.*|${line}|" "$ENV_FILE"
      else
        echo "$line" >> "$ENV_FILE"
      fi
      ;;
  esac
done < "$IMPORT"
if grep -q '^MAIL_FROM_NAME=' "$ENV_FILE"; then
  sed -i 's|^MAIL_FROM_NAME=.*|MAIL_FROM_NAME=Locum Link Demo|' "$ENV_FILE"
else
  echo 'MAIL_FROM_NAME=Locum Link Demo' >> "$ENV_FILE"
fi
echo "Updated $ENV_FILE (Twilio + mail from name)"
systemctl restart locumlink-api
sleep 3
systemctl is-active locumlink-api
