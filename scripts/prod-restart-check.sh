#!/usr/bin/env bash
set -euo pipefail
APP=/home/aroradamini873/locumlink
ENV=$APP/.env
PID=$(ps -eo pid,args | grep 'locumlink/backend/dist/main' | grep -v grep | awk '{print $1}' | head -1)
echo "=== API process ==="
if [ -n "$PID" ]; then
  ps -p "$PID" -o pid,lstart,etime,args
  echo "--- ADMIN_ALERT in live process env ---"
  tr '\0' '\n' < "/proc/$PID/environ" | grep ADMIN_ALERT || echo "(not set in process environment)"
else
  echo "no dist/main process found"
fi
echo ""
echo "=== Root .env ADMIN_ALERT line ==="
grep '^ADMIN_ALERT_EMAIL=' "$ENV" || true
echo ""
echo "=== File times ==="
stat "$ENV" 2>/dev/null | grep -E 'Modify|Change' || true
echo ""
echo "=== Recent .env / restart hints in bash history ==="
grep -E 'ADMIN_ALERT|restart|pm2|dist/main|start:prod|kill.*node' /home/aroradamini873/.bash_history 2>/dev/null | tail -25 || true
