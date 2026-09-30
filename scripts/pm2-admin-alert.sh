#!/usr/bin/env bash
export HOME=/home/aroradamini873
export PM2_HOME=/home/aroradamini873/.pm2
sudo -u aroradamini873 pm2 jlist 2>/dev/null | head -c 8000
