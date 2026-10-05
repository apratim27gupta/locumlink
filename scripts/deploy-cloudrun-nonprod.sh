#!/usr/bin/env bash
# Deploy staging or demo (API + web) to Cloud Run via Cloud Build (no local Docker).
#
# Prerequisites: see docs/CLOUDRUN_NONPROD.md
#
# Usage:
#   ./scripts/deploy-cloudrun-nonprod.sh staging
#   ./scripts/deploy-cloudrun-nonprod.sh demo
#   SKIP_WEB=1 ./scripts/deploy-cloudrun-nonprod.sh staging
#   SKIP_API=1 ./scripts/deploy-cloudrun-nonprod.sh staging
#
# Web build needs public Supabase values (baked into the Next bundle):
#   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... ./scripts/deploy-cloudrun-nonprod.sh staging

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_NAME="${1:-}"
if [[ "${ENV_NAME}" != "staging" && "${ENV_NAME}" != "demo" ]]; then
  echo "Usage: $0 staging|demo" >&2
  exit 1
fi

GCP_PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
GCP_REGION="${GCP_REGION:-northamerica-northeast1}"
ARTIFACT_REPO="${ARTIFACT_REPO:-l2}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-locumlink-nonprod}"
CLOUD_SQL_CONNECTION="${GCP_PROJECT}:${GCP_REGION}:${CLOUD_SQL_INSTANCE}"

if [[ -z "${GCP_PROJECT}" || "${GCP_PROJECT}" == "(unset)" ]]; then
  echo "ERROR: Set GCP_PROJECT or run 'gcloud config set project YOUR_PROJECT'." >&2
  exit 1
fi

COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "manual")"
API_SERVICE="l2-api-${ENV_NAME}"
WEB_SERVICE="l2-web-${ENV_NAME}"
API_IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${ARTIFACT_REPO}/${API_SERVICE}:${COMMIT_SHA}"
WEB_IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${ARTIFACT_REPO}/${WEB_SERVICE}:${COMMIT_SHA}"

if [[ "${ENV_NAME}" == "staging" ]]; then
  PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://staging.locumlink.ca}"
  SECRET_PREFIX="STAGING"
else
  PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://demo.locumlink.ca}"
  SECRET_PREFIX="DEMO"
fi

echo "==> Env:       ${ENV_NAME}"
echo "==> Project:   ${GCP_PROJECT}"
echo "==> Region:    ${GCP_REGION}"
echo "==> Origin:    ${PUBLIC_ORIGIN}"
echo "==> Cloud SQL: ${CLOUD_SQL_CONNECTION}"
echo "==> Build:     Cloud Build (no local Docker)"

# Prefer env-vars-file when present (Editor accounts often cannot bind Secret Manager IAM).
ENV_FILE="${ENV_VARS_FILE:-}"
USE_SECRETS=1
if [[ -n "${ENV_FILE}" && -f "${ENV_FILE}" ]]; then
  USE_SECRETS=0
  echo "==> Using env file: ${ENV_FILE}"
fi

if [[ "${SKIP_API:-0}" != "1" ]]; then
  echo "==> Cloud Build: API image ${API_IMAGE}"
  gcloud builds submit \
    --project="${GCP_PROJECT}" \
    --config=cloudbuild.api.yaml \
    --substitutions="_REGION=${GCP_REGION},_REPOSITORY=${ARTIFACT_REPO},_SERVICE=${API_SERVICE},_TAG=${COMMIT_SHA}"

  echo "==> Deploying ${API_SERVICE}..."
  DEPLOY_ARGS=(
    run deploy "${API_SERVICE}"
    --project="${GCP_PROJECT}"
    --region="${GCP_REGION}"
    --platform=managed
    --image="${API_IMAGE}"
    --port=3000
    --min-instances=0
    --max-instances=3
    --memory=512Mi
    --cpu=1
    --allow-unauthenticated
    --add-cloudsql-instances="${CLOUD_SQL_CONNECTION}"
  )
  if [[ "${USE_SECRETS}" == "1" ]]; then
    DEPLOY_ARGS+=(
      --set-env-vars="NODE_ENV=staging,FIXED_OTP_CODE=000000,ALLOWED_ORIGINS=${PUBLIC_ORIGIN},ADMIN_FRONTEND_REDIRECT_URL=${PUBLIC_ORIGIN}/admin,MAIL_FROM_NAME=Locum Link ${ENV_NAME}"
      --set-secrets="DATABASE_URL=${SECRET_PREFIX}_DATABASE_URL:latest,JWT_SECRET=${SECRET_PREFIX}_JWT_SECRET:latest,ADMIN_JWT_SECRET=${SECRET_PREFIX}_ADMIN_JWT_SECRET:latest,SUPABASE_URL=${SECRET_PREFIX}_SUPABASE_URL:latest,SUPABASE_ANON_KEY=${SECRET_PREFIX}_SUPABASE_ANON_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=${SECRET_PREFIX}_SUPABASE_SERVICE_ROLE_KEY:latest,GCS_BUCKET_NAME=${SECRET_PREFIX}_GCS_BUCKET_NAME:latest,GCS_PROJECT_ID=${SECRET_PREFIX}_GCS_PROJECT_ID:latest,GCS_CREDENTIALS_JSON=${SECRET_PREFIX}_GCS_CREDENTIALS_JSON:latest,VAPID_PUBLIC_KEY=${SECRET_PREFIX}_VAPID_PUBLIC_KEY:latest,VAPID_PRIVATE_KEY=${SECRET_PREFIX}_VAPID_PRIVATE_KEY:latest,VAPID_EMAIL=${SECRET_PREFIX}_VAPID_EMAIL:latest,MAIL_FROM_ADDRESS=${SECRET_PREFIX}_MAIL_FROM_ADDRESS:latest"
    )
  else
    # Env file must be exclusive of --set-env-vars / --set-secrets (gcloud allows only one env mode).
    DEPLOY_ARGS+=(--env-vars-file="${ENV_FILE}" --clear-secrets)
  fi
  gcloud "${DEPLOY_ARGS[@]}"

  API_URL="$(gcloud run services describe "${API_SERVICE}" \
    --project="${GCP_PROJECT}" \
    --region="${GCP_REGION}" \
    --format='value(status.url)')"
  echo "==> API: ${API_URL}/api/health"
else
  API_URL="$(gcloud run services describe "${API_SERVICE}" \
    --project="${GCP_PROJECT}" \
    --region="${GCP_REGION}" \
    --format='value(status.url)')"
fi

if [[ "${SKIP_WEB:-0}" != "1" ]]; then
  : "${NEXT_PUBLIC_SUPABASE_URL:?Set NEXT_PUBLIC_SUPABASE_URL for web build}"
  : "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?Set NEXT_PUBLIC_SUPABASE_ANON_KEY for web build}"

  echo "==> Cloud Build: web image ${WEB_IMAGE}"
  gcloud builds submit \
    --project="${GCP_PROJECT}" \
    --config=cloudbuild.web.yaml \
    --substitutions="_REGION=${GCP_REGION},_REPOSITORY=${ARTIFACT_REPO},_SERVICE=${WEB_SERVICE},_TAG=${COMMIT_SHA},_PUBLIC_ORIGIN=${PUBLIC_ORIGIN},_API_INTERNAL_URL=${API_URL},_NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL},_NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}"

  echo "==> Deploying ${WEB_SERVICE}..."
  # Web needs DATABASE_URL + JWT for server routes; pass via env file or secrets.
  if [[ "${USE_SECRETS}" == "1" ]]; then
    gcloud run deploy "${WEB_SERVICE}" \
      --project="${GCP_PROJECT}" \
      --region="${GCP_REGION}" \
      --platform=managed \
      --image="${WEB_IMAGE}" \
      --port=8080 \
      --min-instances=0 \
      --max-instances=3 \
      --memory=1Gi \
      --cpu=1 \
      --allow-unauthenticated \
      --add-cloudsql-instances="${CLOUD_SQL_CONNECTION}" \
      --set-secrets="DATABASE_URL=${SECRET_PREFIX}_DATABASE_URL:latest,JWT_SECRET=${SECRET_PREFIX}_JWT_SECRET:latest,SUPABASE_URL=${SECRET_PREFIX}_SUPABASE_URL:latest,SUPABASE_ANON_KEY=${SECRET_PREFIX}_SUPABASE_ANON_KEY:latest" \
      --set-env-vars="NODE_ENV=production,API_INTERNAL_URL=${API_URL},NEXT_PUBLIC_API_URL=${PUBLIC_ORIGIN},NEXT_PUBLIC_APP_URL=${PUBLIC_ORIGIN}"
  else
    # Merge runtime web vars into a temp env file (API_INTERNAL_URL etc.)
    WEB_ENV="$(mktemp)"
    {
      echo "NODE_ENV: \"production\""
      echo "API_INTERNAL_URL: \"${API_URL}\""
      echo "NEXT_PUBLIC_API_URL: \"${PUBLIC_ORIGIN}\""
      echo "NEXT_PUBLIC_APP_URL: \"${PUBLIC_ORIGIN}\""
      # Reuse DB/JWT/Supabase from the API env file if keys exist
      grep -E '^(DATABASE_URL|JWT_SECRET|SUPABASE_URL|SUPABASE_ANON_KEY):' "${ENV_FILE}" || true
    } > "${WEB_ENV}"
    # Clear secret-typed vars first; gcloud rejects literal JWT_SECRET if it was a secret.
    gcloud run services update "${WEB_SERVICE}" \
      --project="${GCP_PROJECT}" \
      --region="${GCP_REGION}" \
      --clear-secrets \
      --quiet || true
    gcloud run deploy "${WEB_SERVICE}" \
      --project="${GCP_PROJECT}" \
      --region="${GCP_REGION}" \
      --platform=managed \
      --image="${WEB_IMAGE}" \
      --port=8080 \
      --min-instances=0 \
      --max-instances=3 \
      --memory=1Gi \
      --cpu=1 \
      --allow-unauthenticated \
      --add-cloudsql-instances="${CLOUD_SQL_CONNECTION}" \
      --env-vars-file="${WEB_ENV}" \
      --clear-secrets
    rm -f "${WEB_ENV}"
  fi

  WEB_URL="$(gcloud run services describe "${WEB_SERVICE}" \
    --project="${GCP_PROJECT}" \
    --region="${GCP_REGION}" \
    --format='value(status.url)')"
  echo "==> Web: ${WEB_URL}"
fi

# Belt-and-suspenders: --allow-unauthenticated should set this, but prior deploys
# used --no-allow-unauthenticated and left staging intermittently Forbidden.
echo "==> Ensuring allUsers run.invoker on ${API_SERVICE} + ${WEB_SERVICE}"
gcloud run services add-iam-policy-binding "${API_SERVICE}" \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION}" \
  --member=allUsers \
  --role=roles/run.invoker \
  --quiet >/dev/null
gcloud run services add-iam-policy-binding "${WEB_SERVICE}" \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION}" \
  --member=allUsers \
  --role=roles/run.invoker \
  --quiet >/dev/null

echo "==> Done. Map custom domain ${PUBLIC_ORIGIN} → ${WEB_SERVICE}, then retire the VM."
