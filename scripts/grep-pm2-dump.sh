#!/usr/bin/env bash
grep -o 'aroradamini[^"]*' /home/aroradamini873/.pm2/dump.pm2 | head -3 || true
grep 'ADMIN_ALERT' /home/aroradamini873/.pm2/dump.pm2 | head -3 || true
