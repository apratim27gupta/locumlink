#!/usr/bin/env bash
# Build, tag, push, and deploy the NestJS backend to GCP Cloud Run.
#
# Prerequisites:
#   - gcloud CLI authenticated (`gcloud auth login`)
#   - Docker running
#   - Artifact Registry repo created:
#       gcloud artifacts repositories create l2 \
#         --repository-format=docker --location=$GCP_REGION
#   - Secrets created in Secret Manager (see env list below)
#
# Usage:
#   GCP_PROJECT=my-project GCP_REGION=northamerica-northeast1 ./scripts/deploy.sh
#   DEPLOY_TARGET=cloudbuild ./scripts/deploy.sh   # trigger Cloud Build instead of local docker push

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GCP_PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
GCP_REGION="${GCP_REGION:-northamerica-northeast1}"
ARTIFACT_REPO="${ARTIFACT_REPO:-l2}"
SERVICE_NAME="${SERVICE_NAME:-l2-backend}"
DEPLOY_TARGET="${DEPLOY_TARGET:-local}"

if [[ -z "${GCP_PROJECT}" || "${GCP_PROJECT}" == "(unset)" ]]; then
  echo "ERROR: Set GCP_PROJECT or run 'gcloud config set project YOUR_PROJECT'." >&2
  exit 1
fi

COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "local")"
IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${ARTIFACT_REPO}/${SERVICE_NAME}:${COMMIT_SHA}"
IMAGE_LATEST="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${ARTIFACT_REPO}/${SERVICE_NAME}:latest"

echo "==> Project:  ${GCP_PROJECT}"
echo "==> Region:   ${GCP_REGION}"
echo "==> Service:  ${SERVICE_NAME}"
echo "==> Image:    ${IMAGE}"

if [[ "${DEPLOY_TARGET}" == "cloudbuild" ]]; then
  echo "==> Submitting Cloud Build..."
  gcloud builds submit \
    --project="${GCP_PROJECT}" \
    --config=cloudbuild.yaml \
    --substitutions="_REGION=${GCP_REGION},_REPOSITORY=${ARTIFACT_REPO},_SERVICE=${SERVICE_NAME}"
  echo "==> Cloud Build deploy complete."
  exit 0
fi

echo "==> Configuring docker for Artifact Registry..."
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

echo "==> Building image..."
docker build -f backend/Dockerfile -t "${IMAGE}" -t "${IMAGE_LATEST}" .

echo "==> Pushing image..."
docker push "${IMAGE}"
docker push "${IMAGE_LATEST}"

echo "==> Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION}" \
  --platform=managed \
  --image="${IMAGE}" \
  --port=3000 \
  --min-instances=1 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --allow-unauthenticated \
  --set-secrets="\
DATABASE_URL=DATABASE_URL:latest,\
JWT_SECRET=JWT_SECRET:latest,\
SUPABASE_URL=SUPABASE_URL:latest,\
SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,\
SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,\
GCS_BUCKET_NAME=GCS_BUCKET_NAME:latest,\
GCS_PROJECT_ID=GCS_PROJECT_ID:latest,\
GCS_CREDENTIALS_JSON=GCS_CREDENTIALS_JSON:latest,\
ZEPTOMAIL_API_KEY=ZEPTOMAIL_API_KEY:latest,\
ADMIN_JWT_SECRET=ADMIN_JWT_SECRET:latest,\
VAPID_PUBLIC_KEY=VAPID_PUBLIC_KEY:latest,\
VAPID_PRIVATE_KEY=VAPID_PRIVATE_KEY:latest,\
VAPID_EMAIL=VAPID_EMAIL:latest" \
  --set-env-vars="NODE_ENV=production,PORT=3000,ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-https://your-frontend.example.com},MAIL_FROM_ADDRESS=noreply@locumconnect.ca,ADMIN_FRONTEND_REDIRECT_URL=${ADMIN_FRONTEND_REDIRECT_URL:-https://your-frontend.example.com/admin}"

URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION}" \
  --format='value(status.url)')"

echo "==> Deployed: ${URL}"
echo "==> Health:   ${URL}/api/health"
