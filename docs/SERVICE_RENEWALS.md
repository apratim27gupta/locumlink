# Service renewals & billing alerts

Two scripts cover paid services:

| Script | What it does |
|--------|----------------|
| [`check-billing-and-alert.js`](../backend/check-billing-and-alert.js) | **Automatic** — TLS, domain, Twilio balance, GCP budgets, Supabase project health |
| [`check-renewal-reminders.js`](../backend/check-renewal-reminders.js) | **Manual dates** — Apple Developer, Expo/EAS (vendors with no public credit API) |

Both email `ADMIN_ALERT_EMAIL` via Twilio Email.

---

## Automatic checks (`check-billing-and-alert.js`)

### TLS certificates
Probes HTTPS and reads cert expiry. Default hosts: `locumlink.ca`, `staging.locumlink.ca`.

```env
TLS_CHECK_HOSTS=locumlink.ca,staging.locumlink.ca
```

Alerts at **30 / 14 / 7 / 1** days before expiry (same as `RENEWAL_REMINDER_DAYS`).

### Domain expiry
Looks up expiry via **RDAP** (no registrar login).

```env
DOMAIN_CHECK_NAMES=locumlink.ca
```

### Twilio credits (balance)
Uses Twilio Account Balance API.

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_BALANCE_ALERT_USD=10
```

Also needs existing `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` (same keys as email).  
Alert once per day while balance ≤ threshold (default **$10**).

### GCP (spend vs budget)
There is no simple “credits remaining” API for all GCP accounts. Use a **Billing budget** in Console, then this script lists budgets:

```env
GCP_BILLING_ACCOUNT_ID=01XXXX-XXXXXX-XXXXXX
GCP_BUDGET_ALERT_PERCENT=80
```

Uses `GCS_CREDENTIALS_JSON` or `GCS_KEY_FILE`. Grant the service account:

- `roles/billing.viewer` or at least permission to list budgets (`billing.budgets.list`)

**Also turn on** native budget emails in [Cloud Console → Billing → Budgets & alerts](https://console.cloud.google.com/billing) (thresholds at 50/80/100%) — those work even when the list API omits live spend.

### Supabase credits
Supabase does **not** expose prepaid credit balance via API. This script uses the **Management API** and alerts if a project status looks unhealthy (`INACTIVE`, `GOING_DOWN`, etc. — often billing-related):

```env
SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx
SUPABASE_PROJECT_REF=dkfzestlyqgqnsztgymd
```

Create a PAT: [Supabase Account → Access Tokens](https://supabase.com/dashboard/account/tokens).

**Also enable** billing emails in the Supabase org billing page.

---

## Manual date reminders (`check-renewal-reminders.js`)

For Apple / Expo only (or anything else you want):

```bash
cp backend/renewals.example.json backend/renewals.json
# edit renewalDate
```

```env
RENEWAL_REMINDER_DAYS=30,14,7,1
```

---

## Cloudflare Turnstile (already implemented)

OTP request endpoints require captcha when keys are set:

| Env | Where |
|-----|--------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Frontend |
| `TURNSTILE_SECRET_KEY` | Backend |

If unset → captcha skipped (local/dev). After you create a Turnstile widget in Cloudflare, add both keys and redeploy.

---

## Cron

```cron
# Every 5 minutes — errors, health, billing, optional manual renewals
*/5 * * * * cd /path/to/locumlink/backend && bash scripts/run-ops-monitors.sh

# Or daily billing-only at 09:00
0 9 * * * cd /path/to/locumlink/backend && node check-billing-and-alert.js
```

---

## Quick setup checklist

1. `ADMIN_ALERT_EMAIL` + Twilio email creds (already used for error alerts)
2. `TWILIO_ACCOUNT_SID` + `TWILIO_BALANCE_ALERT_USD=10`
3. `TLS_CHECK_HOSTS` / `DOMAIN_CHECK_NAMES` (defaults work for locumlink.ca)
4. Create GCP billing budget + set `GCP_BILLING_ACCOUNT_ID`
5. Create Supabase Management PAT → `SUPABASE_ACCESS_TOKEN`
6. (Later) Turnstile site + secret keys
7. Optional: `renewals.json` for Apple/Expo dates

## Manual test

```bash
cd backend
node check-billing-and-alert.js
```
