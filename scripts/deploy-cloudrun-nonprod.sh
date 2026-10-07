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
# Default: **image-only** deploy. Cloud Run env/secrets already on the service
# (including Console-set STRIPE_*, HST_*, etc.) are left untouched.
#
# Full env replace (rare; Editor accounts / bootstrap only):
#   FORCE_ENV_REPLACE=1 ENV_VARS_FILE=/path/to/env.yaml ./scripts/deploy-cloudrun-nonprod.sh staging
# Console-owned keys on the live service always win over the YAML file.
#
# Web build needs public Supabase values (baked into the Next bundle):
#   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... ./scripts/deploy-cloudrun-nonprod.sh staging

set -euo pipefail

# Force UTF-8 for Python/gcloud YAML merges (Windows PowerShell often injects BOM/CP1252).
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Fail fast on UTF-16 / UTF-8 BOM / non-UTF-8 text in deploy-critical files.
assert_utf8_text() {
  local path="$1"
  local py
  py="$(command -v python3 || command -v python || true)"
  if [[ -z "${py}" ]]; then
    echo "ERROR: python3/python required for UTF-8 deploy checks" >&2
    exit 1
  fi
  "${py}" - "$path" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
if not path.is_file():
    print(f"ERROR: missing file for UTF-8 check: {path}", file=sys.stderr)
    sys.exit(1)
raw = path.read_bytes()
if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
    print(f"ERROR: {path} is UTF-16; rewrite as UTF-8 without BOM", file=sys.stderr)
    sys.exit(1)
if raw.startswith(b"\xef\xbb\xbf"):
    print(f"ERROR: {path} has a UTF-8 BOM; strip BOM and redeploy", file=sys.stderr)
    sys.exit(1)
try:
    raw.decode("utf-8")
except UnicodeDecodeError as exc:
    print(f"ERROR: {path} is not valid UTF-8: {exc}", file=sys.stderr)
    sys.exit(1)
print(f"==> UTF-8 OK: {path}", file=sys.stderr)
PY
}

assert_utf8_text "scripts/deploy-cloudrun-nonprod.sh"
if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" != "scripts/deploy-cloudrun-nonprod.sh" ]]; then
  assert_utf8_text "${BASH_SOURCE[0]}"
fi
if [[ -n "${ENV_VARS_FILE:-}" && -f "${ENV_VARS_FILE}" ]]; then
  assert_utf8_text "${ENV_VARS_FILE}"
fi

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

# Keys set in Cloud Console (or prior revisions) must survive deploys.
CONSOLE_OWNED_ENV_KEYS=(
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  HST_REGISTRATION_NUMBER
)

echo "==> Env:       ${ENV_NAME}"
echo "==> Project:   ${GCP_PROJECT}"
echo "==> Region:    ${GCP_REGION}"
echo "==> Origin:    ${PUBLIC_ORIGIN}"
echo "==> Cloud SQL: ${CLOUD_SQL_CONNECTION}"
echo "==> Build:     Cloud Build (no local Docker)"

ENV_FILE="${ENV_VARS_FILE:-}"
FORCE_ENV_REPLACE="${FORCE_ENV_REPLACE:-0}"
REPLACE_ENV=0
if [[ "${FORCE_ENV_REPLACE}" == "1" ]]; then
  if [[ -z "${ENV_FILE}" || ! -f "${ENV_FILE}" ]]; then
    echo "ERROR: FORCE_ENV_REPLACE=1 requires ENV_VARS_FILE pointing at an existing YAML file." >&2
    exit 1
  fi
  REPLACE_ENV=1
  echo "==> FORCE_ENV_REPLACE: will apply ${ENV_FILE} (console-owned keys preserved from live service)"
else
  echo "==> Image-only deploy (Cloud Run env/secrets unchanged; Console is source of truth)"
  if [[ -n "${ENV_FILE}" ]]; then
    echo "==> Note: ENV_VARS_FILE is set but ignored unless FORCE_ENV_REPLACE=1"
  fi
fi

merge_console_owned_into_env_file() {
  local service="$1"
  local yaml_path="$2"
  local py
  py="$(command -v python3 || command -v python || true)"
  if [[ -z "${py}" ]]; then
    echo "ERROR: python3/python required to preserve console-owned env keys" >&2
    exit 1
  fi
  "${py}" - "$GCP_PROJECT" "$GCP_REGION" "$service" "$yaml_path" "${CONSOLE_OWNED_ENV_KEYS[@]}" <<'PY'
import json, subprocess, sys
from pathlib import Path

project, region, service, yaml_path, *owned = sys.argv[1:]
raw = subprocess.check_output(
    [
        "gcloud",
        "run",
        "services",
        "describe",
        service,
        f"--project={project}",
        f"--region={region}",
        "--format=json",
    ],
    text=True,
)
svc = json.loads(raw)
live = {}
for e in svc["spec"]["template"]["spec"]["containers"][0].get("env") or []:
    if e.get("value") is not None and e["name"] in owned:
        live[e["name"]] = e["value"]

path = Path(yaml_path)
raw = path.read_bytes()
if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
    raise SystemExit(f"ERROR: {path} is UTF-16; rewrite as UTF-8 without BOM")
if raw.startswith(b"\xef\xbb\xbf"):
    print(f"==> Stripping UTF-8 BOM from {path}", file=sys.stderr)
    raw = raw[3:]
try:
    text = raw.decode("utf-8")
except UnicodeDecodeError as exc:
    raise SystemExit(f"ERROR: {path} is not valid UTF-8: {exc}") from exc
lines_out = []
seen = set()
for line in text.splitlines():
    if not line.strip() or line.lstrip().startswith("#"):
        lines_out.append(line)
        continue
    key = line.split(":", 1)[0].strip()
    if key in live:
        esc = (
            live[key]
            .replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
        )
        lines_out.append(f'{key}: "{esc}"')
        seen.add(key)
        print(f"==> Preserved console-owned {key} from live {service}", file=sys.stderr)
    else:
        lines_out.append(line)
for key, val in live.items():
    if key in seen:
        continue
    esc = (
        val.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )
    lines_out.append(f'{key}: "{esc}"')
    print(f"==> Injected console-owned {key} from live {service}", file=sys.stderr)
# Always write UTF-8 (no BOM) with LF newlines.
path.write_bytes(("\n".join(lines_out) + "\n").encode("utf-8"))
if not live:
    print(
        f"==> Warning: no console-owned keys found on live {service}; YAML values used as-is",
        file=sys.stderr,
    )
PY
}

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
  if [[ "${REPLACE_ENV}" == "1" ]]; then
    MERGED_ENV="$(mktemp)"
    cp "${ENV_FILE}" "${MERGED_ENV}"
    merge_console_owned_into_env_file "${API_SERVICE}" "${MERGED_ENV}"
    # Env file exclusive of --set-env-vars / --set-secrets.
    DEPLOY_ARGS+=(--env-vars-file="${MERGED_ENV}" --clear-secrets)
    gcloud "${DEPLOY_ARGS[@]}"
    rm -f "${MERGED_ENV}"
  else
    # Image only — do not pass env/secret flags so Console values stay.
    gcloud "${DEPLOY_ARGS[@]}"
  fi

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
  WEB_DEPLOY_ARGS=(
    run deploy "${WEB_SERVICE}"
    --project="${GCP_PROJECT}"
    --region="${GCP_REGION}"
    --platform=managed
    --image="${WEB_IMAGE}"
    --port=8080
    --min-instances=0
    --max-instances=3
    --memory=1Gi
    --cpu=1
    --allow-unauthenticated
    --add-cloudsql-instances="${CLOUD_SQL_CONNECTION}"
  )
  if [[ "${REPLACE_ENV}" == "1" ]]; then
    WEB_ENV="$(mktemp)"
    {
      echo "NODE_ENV: \"production\""
      echo "API_INTERNAL_URL: \"${API_URL}\""
      echo "NEXT_PUBLIC_API_URL: \"${PUBLIC_ORIGIN}\""
      echo "NEXT_PUBLIC_APP_URL: \"${PUBLIC_ORIGIN}\""
      grep -E '^(DATABASE_URL|JWT_SECRET|SUPABASE_URL|SUPABASE_ANON_KEY):' "${ENV_FILE}" || true
    } > "${WEB_ENV}"
    gcloud run services update "${WEB_SERVICE}" \
      --project="${GCP_PROJECT}" \
      --region="${GCP_REGION}" \
      --clear-secrets \
      --quiet || true
    gcloud "${WEB_DEPLOY_ARGS[@]}" --env-vars-file="${WEB_ENV}" --clear-secrets
    rm -f "${WEB_ENV}"
  else
    # Keep web runtime env; only refresh public URL pointers if the service already exists.
    gcloud "${WEB_DEPLOY_ARGS[@]}" \
      --update-env-vars="API_INTERNAL_URL=${API_URL},NEXT_PUBLIC_API_URL=${PUBLIC_ORIGIN},NEXT_PUBLIC_APP_URL=${PUBLIC_ORIGIN}"
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
