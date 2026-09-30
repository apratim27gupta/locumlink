#!/usr/bin/env bash
pid=$(ps -eo pid,args | grep 'dist/main' | grep -v grep | awk '{print $1}' | head -1)
if [ -z "$pid" ]; then
  echo "no dist/main process"
  ps -eo pid,args | grep node | grep -v grep
  exit 0
fi
echo "pid=$pid"
tr '\0' '\n' < "/proc/$pid/environ" | grep -E 'ADMIN_ALERT|MAIL_FROM_NAME|NODE_ENV'
