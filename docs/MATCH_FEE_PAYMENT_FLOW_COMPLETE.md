# LocumLink match-fee payment flow (complete)

**Audience:** engineers, ops, security review.  
**Scope:** host **platform match fee** only (CAD + HST via Stripe Checkout).  
**Not in scope:** locum clinical pay / MSI billing, Stripe Connect payouts, or host↔locum money movement.

Companion docs:

- Shorter lifecycle + manual QA checklist: [`docs/MATCH_FEE_FLOWS.md`](./MATCH_FEE_FLOWS.md)
- Non-prod Cloud Run / Stripe env rules: [`docs/CLOUDRUN_NONPROD.md`](./CLOUDRUN_NONPROD.md)

Code links below are **repo-relative paths** (open in the IDE or on GitHub from the `staging`/`main` tip).

---

## 1. What the product charges

| Item | Rule | Code |
|------|------|------|
| Half-day tier | ≤ 3.5 claimed hours → **CA$5** (TEMP staging QA; was CA$125) | [`match-fee.constants.ts`](../backend/src/payments/match-fee.constants.ts) `MATCH_FEE_HALF_CENTS`, `computeMatchFeeAmountCents` |
| Full-day tier | \> 3.5 claimed hours → **CA$10** (TEMP; was CA$250) | same file `MATCH_FEE_FULL_CENTS` |
| Tax | **14% HST** snapshotted on invoice (`taxRateBps`, `taxCents`) | `MATCH_FEE_HST_RATE_BPS`, `computeMatchFeeTaxCents`, `matchFeeTotalCents` |
| Host pays | `amountCents + taxCents` | Checkout line items built from DB, never from the browser |
| Due date | min(invoice + 7 days, earliest claimed shift end-of-day) | [`match-fee-cancellation.util.ts`](../backend/src/payments/match-fee-cancellation.util.ts) `computeDueAt` |
| Grandfathering | Postings created before `MATCH_FEE_START_DATE` never invoiced | `isPostingGrandfatheredFromMatchFee` |
| Policy copy (UI) | Same constants exposed to host/locum | `MATCH_FEE_POLICY` → [`PaymentsService.getPolicy`](../backend/src/payments/payments.service.ts) → [`HostPaymentsController` `/policy`](../backend/src/payments/payments.controller.ts) |

**Tier top-up:** if PRIMARY was half-day but post-completion claimed hours are full-day, either bump unpaid PRIMARY or create a `TIER_TOP_UP` invoice for the fee delta (+ HST). See `reconcileTierTopUpsAfterCompletion` in [`payments.service.ts`](../backend/src/payments/payments.service.ts).

---

## 2. High-level architecture

```text
  Locum accept / Host cancel / Locum withdraw / Job delete / Admin
                         │
                         ▼
              ┌─────────────────────┐
              │  PaymentsService    │  ← policy, invoices, checkout, refunds
              │  (Nest API)         │
              └─────────┬───────────┘
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
  Postgres          Stripe API      Notifications
  match_fee_*       Checkout +      (host / admin emails)
  stripe_webhook_*  Refunds
       ▲                │
       │                ▼
       └────── Stripe webhooks ──────┘
              POST /api/payments/stripe/webhook
              + every-10-min reconcile cron
```

**PCI posture:** card data never touches LocumLink. Hosts pay on **Stripe Checkout** (SAQ-A friendly). LocumLink stores Stripe Customer / Session / PaymentIntent / Refund IDs only.

---

## 3. Data model (source of truth)

Prisma models: [`database/prisma/schema.prisma`](../database/prisma/schema.prisma) (`MatchFeeInvoice` ~L822+, `MatchFeePaymentAttempt`, `MatchFeeRefund`, `StripeWebhookEvent`, `MatchFeeInvoiceEvent`).

| Table | Role |
|-------|------|
| `match_fee_invoices` | One **PRIMARY** per application (unique `applicationId+kind`); optional **TIER_TOP_UP**. Holds amount, tax snapshot, status, due, cancel/refund/replacement fields, Stripe IDs, `refundedCents`. |
| `match_fee_payment_attempts` | One row per Checkout session start. Statuses include `OPEN`, `PAID`, `EXPIRED`, `FAILED`, `DUPLICATE`, `REJECTED`. |
| `match_fee_refunds` | Admin-approved refund reservation. Stripe idempotency key = `match-fee-refund-{refundRowId}`. |
| `match_fee_invoice_events` | Append-only audit timeline (INVOICED, PAID, REFUND_PENDING_REVIEW, FEE_NON_REFUNDABLE, REFUNDED, …). |
| `stripe_webhook_events` | Idempotent webhook ledger (`PROCESSING` → `PROCESSED` / `FAILED` / `IGNORED`). |
| `host_profiles.stripe_customer_id` | Stripe Customer for Checkout reuse. |

### Invoice status (simplified)

```text
PENDING ──pay──► PAID ──early cancel (policy)──► PAID + refundResolution=PENDING ──admin refund──► REFUNDED
   │               │
   │               ├── host late cancel ──► PAID + FEE_NON_REFUNDABLE (fee retained)
   │               └── locum late cancel ──► PENDING_REPLACEMENT ──replacement accepts──► PAID (FOUND)
   │                                              └── admin no-replacement refund ──► REFUNDED
   ├── past due ──► OVERDUE ──pay──► PAID
   └── cancel unpaid ──► CANCELLED
```

**Important:** policy result `invoiceStatus: 'REFUNDED'` does **not** mean Stripe already refunded. `handleCancellation` keeps the invoice **`PAID`** and sets `refundResolution: PENDING` until an admin runs refund and Stripe succeeds. See comment in [`handleCancellation`](../backend/src/payments/payments.service.ts) (~L1665).

---

## 4. End-to-end data flows

### 4.1 Invoice creation (locum accepts match)

1. Locum accepts confirmed placement (locum API / application flow).
2. Backend calls `PaymentsService.createMatchFeeInvoice(applicationId)` — [`payments.service.ts`](../backend/src/payments/payments.service.ts) ~L1001.
3. Hours → tier → amount + HST; `dueAt` via `computeDueAt`.
4. Insert `match_fee_invoices` (`PENDING`) + event `INVOICED`.
5. Notify host (invoice due).

**Replacement shortcut:** if the posting already has a `PENDING_REPLACEMENT` invoice and this accept is after cancel → `markReplacementFound` / `registerReplacementLocumAccepted` — **no second PRIMARY invoice**.

### 4.2 Host pays (Stripe Checkout)

| Step | Where |
|------|--------|
| Host clicks Pay | UI → `POST /api/host/match-fees/:id/pay-stripe` [`payments.controller.ts`](../backend/src/payments/payments.controller.ts) |
| Authz | JWT + `Role.HOST`; invoice must belong to that host’s `hostProfileId` |
| Concurrency | `SELECT … FOR UPDATE` on invoice; reuse OPEN session if still valid; conflict if another create is in-flight | `createStripeCheckoutForHost` ~L2125 |
| Stripe session | [`stripe.service.ts`](../backend/src/payments/stripe.service.ts); idempotency `match-fee-checkout-{attemptId}` |
| Amounts | Line items from **DB** `amountCents` / `taxCents` only |
| Confirm pay | Prefer webhook; also host `POST …/sync-payment` on return URL; also 10‑min cron |

**Confirmation path (shared):** webhook / sync / reconcile all converge on applying the Checkout session (amount, currency, metadata, customer, livemode checks). Successful pay → attempt `PAID`, invoice `PENDING|OVERDUE` → `PAID` (conditional update), event `PAID`.

**Duplicate payment:** second completed session while invoice already paid → attempt marked `DUPLICATE`, admin alert; money not applied to a second invoice. Admin can refund the duplicate attempt (`refundDuplicatePayment`).

### 4.3 Cancellation policy (no automatic Stripe refund)

Policy pure function: [`evaluateCancellationPolicy`](../backend/src/payments/match-fee-cancellation.util.ts).

| Actor | ≥14 days before earliest claimed start | \<14 days |
|-------|----------------------------------------|-----------|
| **Host** | Paid → admin refund review (`PENDING`) | Paid → **non-refundable** (`FEE_NON_REFUNDABLE`) |
| **Locum** | Paid → admin refund review | Paid → **`PENDING_REPLACEMENT` + SEARCHING** |
| Either, unpaid | Invoice `CANCELLED` | Stays `PENDING`/`OVERDUE` (**remains due**) |
| Admin | Treated as refundable path when paid | — |

Orchestration: `PaymentsService.handleCancellation` — updates invoice + events + admin notify (`A_007`) and host in-app/email (`H_019`). Also used from job delete / match cancel / locum withdraw (`cancelInvoicesForJob`, etc.).

Deploy must be **image-only** so Console Stripe keys are not overwritten ([`deploy-cloudrun-nonprod.sh`](../scripts/deploy-cloudrun-nonprod.sh)).

### 4.4 Admin refund to original payment method

Entry points ([`admin.controller.ts`](../backend/src/admin/admin.controller.ts)):

| Route | Method |
|-------|--------|
| `POST /api/admin/match-fees/:id/resolve-refund` | `resolveRefund` — policy-qualified or no-replacement |
| `POST /api/admin/match-fees/:id/discretionary-refund` | `discretionaryRefund` — post-completion / goodwill (capped) |
| `POST /api/admin/match-fees/payment-attempts/:attemptId/refund-duplicate` | `refundDuplicatePayment` |

Core: private `processRefund` (same service file):

1. `FOR UPDATE` invoice.
2. Block if non-duplicate refund already `REQUESTED` or `PENDING`.
3. Insert `match_fee_refunds` (`REQUESTED`); increment `refundedCents` (reservation).
4. Stripe `refunds.create` with idempotency `match-fee-refund-{refundId}`.
5. On **succeeded** → refund `SUCCEEDED`, invoice → `REFUNDED` if fully refunded, event, **host email**.
6. On **pending** → refund `PENDING`; invoice stays `PAID` / `PENDING_REPLACEMENT` (no success email yet).
7. On Stripe timeout → leave `REQUESTED`; return 503; reconcile retries.
8. On failure / `refund.failed` webhook → `failRefund`: release reservation, restore pending review when appropriate.

Admin UI: [`admin-payments-page.tsx`](../frontend/src/app/admin/payments/admin-payments-page.tsx), [`AdminMatchFeeRefundConfirmModal.tsx`](../frontend/src/components/payments/AdminMatchFeeRefundConfirmModal.tsx).

### 4.5 Replacement flow

1. Late locum cancel (flag off) → `PENDING_REPLACEMENT`, `replacementStatus=SEARCHING`.
2. New locum accepts after cancel → `registerReplacementLocumAccepted` / mark FOUND; original fee stands.
3. No replacement → admin `resolve-refund` with `NO_REPLACEMENT` kind → Stripe refund when approved.

**Rule:** FOUND is set only by a real accepting application, not by admin toggle alone.

### 4.6 Overdue, reminders, escalation, posting block

| Job | Cron | Service |
|-----|------|---------|
| Mark overdue | Daily (match-fee lifecycle) | `markOverdueInvoices` |
| Reminders every 7d | Daily | `sendRecurringOverdueReminders` |
| Escalate after 30d overdue | Daily | `escalateLongOverdueInvoices` + admin notify |
| Block new host posts | On create job | Host with `OVERDUE` invoice rejected |

Scheduler: [`scheduler.service.ts`](../backend/src/scheduler/scheduler.service.ts) (`handleMatchFeeInvoiceLifecycle`, `reconcileStripeCheckouts`).

Host invoices UI: [`host-invoices-page.tsx`](../frontend/src/app/host/invoices/host-invoices-page.tsx).

---

## 5. Stripe webhook + reconciliation (money truth)

### 5.1 Webhook endpoint

- **URL:** `POST /api/payments/stripe/webhook`
- **Controller:** [`stripe.webhook.controller.ts`](../backend/src/payments/stripe.webhook.controller.ts)
- **Auth:** `@Public()` but **HMAC** via `Stripe-Signature` + raw body (`constructWebhookEvent`).
- Invalid signature → **400** (no retry value / no DB apply).
- Processing errors → **5xx** so Stripe retries (~3 days live).
- Concurrent claim → **409** while another worker holds `PROCESSING`.

Handled in `handleStripeWebhookEvent` / `dispatchStripeEvent` ([`payments.service.ts`](../backend/src/payments/payments.service.ts) ~L2487+):

| Event | Effect |
|-------|--------|
| `checkout.session.completed` / `async_payment_succeeded` | Apply paid session |
| `checkout.session.expired` | Attempt EXPIRED |
| `checkout.session.async_payment_failed` / PI failed | Attempt FAILED |
| `refund.created` / `updated` / `failed` | `applyStripeRefund` |

**Livemode guard:** event livemode must match configured key mode; mismatch → `IGNORED`.

**Idempotency:** `stripe_webhook_events.id = event.id`. Stale `PROCESSING` (>5 min) can be reclaimed; successful `PROCESSED` is not re-applied.

### 5.2 Reconciliation safety nets (every 10 minutes)

[`scheduler.service.ts`](../backend/src/scheduler/scheduler.service.ts) `reconcileStripeCheckouts`:

1. **`reconcileOpenCheckoutSessions`** — OPEN attempts older than ~2 min → retrieve session from Stripe → apply paid/expired; orphan OPEN without session id >15 min → FAILED.
2. **`reconcileRefunds`** — `REQUESTED`/`PENDING` refunds older than ~2 min → retrieve or recreate Stripe refund → finalize.

Also: host **sync-payment** on Checkout return (up to several client retries) uses the same apply path as webhooks.

**Principle:** UI status is not authoritative for money. Stripe + DB attempt/refund rows + reconcile are.

---

## 6. Security checklist (how money stays safe)

| Threat | Mitigation | Where |
|--------|------------|--------|
| Host pays wrong amount | Checkout built from DB invoice totals | `createStripeCheckoutForHost` |
| Host pays another host’s invoice | JWT + `hostProfileId` ownership check | Host controller + service |
| Admin refund without auth | Admin JWT on admin match-fee routes | [`admin.controller.ts`](../backend/src/admin/admin.controller.ts) |
| Spoofed webhook | Signature verification + raw body | `StripeWebhookController` |
| Replay webhook | Event-id table + status machine | `claimWebhookEvent` |
| Test/live mix-up | Livemode must match API key | `handleStripeWebhookEvent` |
| Double apply pay | Conditional invoice update PENDING/OVERDUE→PAID once; extras `DUPLICATE` | apply checkout |
| Double Checkout click | `FOR UPDATE` + reuse OPEN session + in-flight conflict | `createStripeCheckoutForHost` |
| Double refund click | Block REQUESTED/PENDING; Stripe idempotency key per refund row | `processRefund` |
| Refund over-cap | Reserve `refundedCents` under lock before Stripe call | `processRefund` |
| Auto refund on cancel | Never; always admin approval after policy flags PENDING | `handleCancellation` |
| Card data exposure | Stripe Checkout only; no PAN/CVC stored | Architecture |
| Secrets in deploy | Image-only Cloud Run deploy; Console owns `STRIPE_*` | [`CLOUDRUN_NONPROD.md`](./CLOUDRUN_NONPROD.md), deploy script |
| Prod boot without Stripe | Env validation requires secret + webhook secret in prod | [`env.validation.ts`](../backend/src/config/env.validation.ts) |

---

## 7. API surface (quick map)

### Host (`Role.HOST`) — [`payments.controller.ts`](../backend/src/payments/payments.controller.ts)

| Method | Path |
|--------|------|
| GET | `/api/host/match-fees/policy` |
| GET | `/api/host/match-fees/due-count` |
| GET | `/api/host/match-fees` |
| GET | `/api/host/match-fees/:id` |
| GET | `/api/host/match-fees/:id/receipt.pdf` |
| POST | `/api/host/match-fees/:id/pay-stripe` |
| POST | `/api/host/match-fees/:id/sync-payment` |

### Locum

| Method | Path |
|--------|------|
| GET | `/api/locum/match-fees/policy` |

### Public webhook

| Method | Path |
|--------|------|
| POST | `/api/payments/stripe/webhook` |

### Admin — [`admin.controller.ts`](../backend/src/admin/admin.controller.ts)

| Method | Path |
|--------|------|
| GET | `/api/admin/match-fees/summary` |
| GET | `/api/admin/match-fees` |
| POST | `/api/admin/match-fees/:id/send-reminder` |
| POST | `/api/admin/match-fees/:id/resolve-refund` |
| POST | `/api/admin/match-fees/:id/discretionary-refund` |
| POST | `/api/admin/match-fees/payment-attempts/:attemptId/refund-duplicate` |
| POST | `/api/admin/match-fees/:id/admin-note` |
| POST | `/api/admin/match-fees/:id/replacement-status` |
| POST | `/api/admin/match-fees/:id/write-off` |
| POST | `/api/admin/hosts/:hostProfileId/clear-match-fee-review` |

---

## 8. Frontend touchpoints

| Concern | File |
|---------|------|
| Policy modal / copy | [`frontend/src/components/payments/MatchFeePolicy.tsx`](../frontend/src/components/payments/MatchFeePolicy.tsx) |
| Host invoices / pay | [`frontend/src/app/host/invoices/host-invoices-page.tsx`](../frontend/src/app/host/invoices/host-invoices-page.tsx) |
| Host cancel match + fee outcome | [`frontend/src/app/host/applicants/[jobId]/page-client.tsx`](../frontend/src/app/host/applicants/[jobId]/page-client.tsx) |
| Invoice chip on applicants | [`ApplicationInvoiceCell.tsx`](../frontend/src/components/payments/ApplicationInvoiceCell.tsx) |
| Timeline | [`MatchFeeEventTimeline.tsx`](../frontend/src/components/payments/MatchFeeEventTimeline.tsx) |
| Host refund confirm copy | [`MatchFeeRefundConfirmModal.tsx`](../frontend/src/components/payments/MatchFeeRefundConfirmModal.tsx) |
| Admin payments console | [`admin-payments-page.tsx`](../frontend/src/app/admin/payments/admin-payments-page.tsx) |

---

## 9. Environment / ops knobs

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | API key (`sk_live` / `rk_live` or `sk_test`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `HST_REGISTRATION_NUMBER` | Shown on receipts / tax context |
| `MATCH_FEE_START_DATE` | `YYYY-MM-DD` grandfather cutoff (optional) |

**Staging rule:** prefer **image-only** Cloud Run deploys so Console-set Stripe/HST keys survive. Helper to restore live Stripe from an old revision: [`scripts/restore-staging-stripe-from-revision.py`](../scripts/restore-staging-stripe-from-revision.py).

---

## 10. Automated tests

| Suite | Path |
|-------|------|
| Stripe journey (checkout, webhook, duplicate, refund, reconcile) | [`backend/test/journeys/journey-stripe-payments.spec.ts`](../backend/test/journeys/journey-stripe-payments.spec.ts) |
| Match fee tiering | [`backend/test/journeys/journey-match-fee.spec.ts`](../backend/test/journeys/journey-match-fee.spec.ts) |
| Cancellation policy unit | [`match-fee-cancellation.util.spec.ts`](../backend/src/payments/match-fee-cancellation.util.spec.ts) |
| Constants unit | [`match-fee.constants.spec.ts`](../backend/src/payments/match-fee.constants.spec.ts) |

Manual cases: see section 11 of [`MATCH_FEE_FLOWS.md`](./MATCH_FEE_FLOWS.md).

---

## 11. Mental model (one paragraph)

When a locum accepts, LocumLink creates a **PENDING** host invoice for a computed fee + HST. The host pays via **Stripe Checkout**; payment is confirmed by **signed webhooks**, reinforced by **return-URL sync** and a **10‑minute reconcile**. Cancellations never auto-hit Stripe: policy only marks invoices cancelled, non-refundable, replacement-searching, or **refund-pending**, and the host is notified in-app and by email. Only **admins** create Stripe refunds, under DB locks and Stripe idempotency keys; when an admin approves a refund the host is told the amount and that it returns to the original payment method in about 10-14 business days. Reconciliation jobs close gaps if webhooks are late or lost. Card numbers never enter LocumLink systems.

---

*Last aligned with production replacement flow (no skip-replacement testing flag) and image-only deploy defaults. TEMP dollar amounts ($5/$10) are staging QA — update this doc when production rates return.*
