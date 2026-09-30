#!/usr/bin/env bash
for f in /root/locumlink/backend/.env /root/locumlink/backend/.env.staging /root/locumlink/frontend/.env.local; do
  echo "==== $f ===="
  if [ -f "$f" ]; then
    grep -v '^#' "$f" | grep -v '^$' | cut -d= -f1 | sort
  else
    echo MISSING
  fi
done
