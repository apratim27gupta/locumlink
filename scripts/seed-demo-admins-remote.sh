#!/usr/bin/env bash
set -euo pipefail
cd /root/locumlink
set -a
# shellcheck disable=SC1091
source backend/.env.staging
set +a
export ADMIN_SEED_EMAILS='aroradamini873@gmail.com:Testing Admin,bhumishukla456@gmail.com:bhumi,doctor@locumlink.ca:Doctor Admin,fayanife@gmail.com:Admin,info@aebeolleconsulting.com:Aebeolle Admin,rebecca.general.1@gmail.com:Rebecca,satyam24034@gmail.com:satyam'
npm run db:seed:admin
