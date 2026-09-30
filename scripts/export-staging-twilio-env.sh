#!/usr/bin/env bash
set -euo pipefail
grep -E '^TWILIO_|^MAIL_FROM' /root/locumlink/backend/.env > /tmp/twilio-mail.env
chmod 600 /tmp/twilio-mail.env
wc -l /tmp/twilio-mail.env
