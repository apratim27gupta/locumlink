# Non-prod on Cloud Run + Cloud SQL

Staging and demo run as **Cloud Run** services against one shared **Cloud SQL** instance. VMs are retired after cutover.

## Cost model

| Piece | Behavior | Bill |
|-------|----------|------|
| `l2-api-staging`, `l2-web-staging`, `l2-api-demo`, `l2-web-demo` | `--min-instances=0` | Near $0 when idle |
| `locumlink-nonprod` (Cloud SQL `db-f1-micro`) | Always on | Small fixed monthly cost |
| `staging-vm` + `demo-vm` (`e2-medium` × 2) | Was 24/7 | Removed after cutover |

**Net:** you trade two always-on app VMs for scale-to-zero Cloud Run + one small shared database. That is usually a large saving. Do **not** create two Cloud SQL instances.

Keep prod (`instance-20260508-075323` / `locumlink.ca`) unchanged until a separate prod migration.

## Architecture

```text
staging.locumlink.ca → Cloud Run l2-web-staging
                         └─ rewrites /api/* → l2-api-staging → Cloud SQL DB l2_staging

demo.locumlink.ca    → Cloud Run l2-web-demo
                         └─ rewrites /api/* → l2-api-demo    → Cloud SQL DB l2_demo

Instance: locumlink-nonprod (northamerica-northeast1)
OTP: NODE_ENV=staging + FIXED_OTP_CODE=000000 on both APIs
```

## One-time GCP setup

```bash
gcloud config set project locumlink-490817

# APIs (if not already)
gcloud services enable sqladmin.googleapis.com run.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com

# Artifact Registry
gcloud artifacts repositories create l2 \
  --repository-format=docker --location=northamerica-northeast1

# Cloud SQL (Enterprise + db-f1-micro)
gcloud sql instances create locumlink-nonprod \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --edition=ENTERPRISE \
  --region=northamerica-northeast1 \
  --storage-size=20GB \
  --storage-auto-increase \
  --root-password='<strong-password>' \
  --assign-ip

gcloud sql databases create l2_staging --instance=locumlink-nonprod
gcloud sql databases create l2_demo --instance=locumlink-nonprod
```

Cloud Run connects via the Cloud SQL Auth socket. Store `DATABASE_URL` like (Prisma needs `localhost` + `host=` socket):

```text
postgresql://postgres:<url-encoded-password>@localhost/l2_staging?host=/cloudsql/locumlink-490817:northamerica-northeast1:locumlink-nonprod
postgresql://postgres:<url-encoded-password>@localhost/l2_demo?host=/cloudsql/locumlink-490817:northamerica-northeast1:locumlink-nonprod
```

## Secrets (Secret Manager)

Create pairs prefixed `STAGING_` and `DEMO_`:

- `DATABASE_URL`, `JWT_SECRET`, `ADMIN_JWT_SECRET`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`, `GCS_CREDENTIALS_JSON` (JSON string, not a key file path)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`
- `MAIL_FROM_ADDRESS`

Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor` and Cloud SQL Client.

**If your account is only `roles/editor`** (cannot `setIamPolicy`), an **Owner** must run:

```bash
PROJECT=locumlink-490817
SA="${PROJECT_NUMBER:-995673135030}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$SA" \
  --role="roles/cloudsql.client"

for svc in l2-api-staging l2-web-staging l2-api-demo l2-web-demo; do
  gcloud run services add-iam-policy-binding $svc \
    --region=northamerica-northeast1 \
    --member=allUsers \
    --role=roles/run.invoker \
    --project=$PROJECT || true
done
```

Until Secret Manager IAM is granted, deploys can use `--env-vars-file` instead of `--set-secrets`. Staging/demo web+API must stay publicly invokable (`--allow-unauthenticated` / `allUsers` `run.invoker`); without that, the LB shows Forbidden and login breaks.

Copy values from each VM’s `backend/.env` + `backend/.env.staging` (do not commit).

## Dump VM Postgres → Cloud SQL

```bash
# Staging
gcloud compute ssh staging-vm --zone=northamerica-northeast1-a --command \
  "sudo docker exec l2_postgres_staging pg_dump -U postgres -Fc l2_staging" > l2_staging.dump

# Demo
gcloud compute ssh demo-vm --zone=northamerica-northeast1-a --command \
  "sudo docker exec l2_postgres_demo pg_dump -U postgres -Fc l2_demo" > l2_demo.dump

# Restore (Cloud SQL Auth Proxy or gcloud sql import from GCS)
gsutil cp l2_staging.dump gs://<bucket>/imports/
gcloud sql import sql locumlink-nonprod gs://<bucket>/imports/l2_staging.dump \
  --database=l2_staging
# same for l2_demo
```

Or use Cloud SQL Auth Proxy + `pg_restore` from your laptop.

## Deploy

Builds run in **Cloud Build** (no local Docker):

```bash
export NEXT_PUBLIC_SUPABASE_URL=...
export NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Optional: Editor accounts that cannot bind Secret Manager IAM
# export ENV_VARS_FILE=/path/to/staging-env.yaml

./scripts/deploy-cloudrun-nonprod.sh staging
./scripts/deploy-cloudrun-nonprod.sh demo
```

Or build only:

```bash
gcloud builds submit --config=cloudbuild.web.yaml \
  --substitutions=_SERVICE=l2-web-staging,_TAG=$(git rev-parse --short HEAD),_PUBLIC_ORIGIN=https://staging.locumlink.ca,_NEXT_PUBLIC_SUPABASE_URL=...,_NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Flags: `SKIP_WEB=1` or `SKIP_API=1` for partial deploys.

## Custom domains

Direct Cloud Run domain mapping is **not available** in `northamerica-northeast1`. Staging/demo use the existing global HTTPS load balancer:

| Host | Backend | LB IP |
|------|---------|-------|
| `staging.locumlink.ca` | `l2-web-staging` (serverless NEG) | `8.232.192.13` (`locumlink-lb-ip`) |
| `demo.locumlink.ca` | `l2-web-demo` (serverless NEG) | same |
| `locumlink.ca` / `www` | prod VM instance group | same |

SSL: Google-managed cert `locumlink-nonprod-ssl-cert` (plus existing `locumlink-ssl-cert` for prod).

**DNS cutover** (wherever `locumlink.ca` is hosted): change **A records**:

```text
staging.locumlink.ca  →  8.232.192.13   (was staging-vm 34.47.59.251)
demo.locumlink.ca     →  8.232.192.13   (was demo-vm 34.95.6.106)
```

Leave TTL low if possible. Cert status stays `PROVISIONING` until DNS points at the LB, then becomes `ACTIVE`.

Check cert:

```bash
gcloud compute ssl-certificates describe locumlink-nonprod-ssl-cert --global \
  --format='yaml(managed)'
```

Then:

```bash
curl -sI https://staging.locumlink.ca | head -5
curl -s https://staging.locumlink.ca/api/health
curl -sI https://demo.locumlink.ca | head -5
```

Map hostnames to the **web** services only (Next proxies `/api/*` to the API `*.run.app` URLs).

## Cutover checklist

1. `curl https://l2-api-staging-….run.app/api/health`
2. Open web `run.app` URL; confirm OTP `000000`, OAuth, uploads
3. Flip DNS / domain mapping for `staging.locumlink.ca`, then demo
4. Monitor 24–48h
5. Stop VMs, then delete instances + static IPs (unused IPs still bill):

```bash
gcloud compute instances stop staging-vm demo-vm --zone=northamerica-northeast1-a
# after validation:
gcloud compute instances delete staging-vm demo-vm --zone=northamerica-northeast1-a
gcloud compute addresses list
# delete unused regional static IPs
```

## Day-to-day

Push code, then:

```bash
./scripts/deploy-cloudrun-nonprod.sh staging   # from staging branch
./scripts/deploy-cloudrun-nonprod.sh demo      # from main
```

API containers run `prisma migrate deploy` on start (see `backend/Dockerfile`).
