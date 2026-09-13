# Gridline — AI blueprint takeoffs for flooring subcontractors

## What it does
Commercial / multi-family flooring subs upload a blueprint PDF. The AI engine (Claude Opus
via emergentintegrations, `backend/lib/ai.py`) renders pages to ~200 DPI JPEGs, records the
printed scale and written dimensions, and returns a takeoff: rooms grouped by building and
unit with floor type (12 types), sq ft, waste %, adhesive + gallons, labor hours and cost,
plus a plain-English brief (units / bedrooms / bathrooms / backsplashes) and review flags.
The user edits/approves lines, applies a discount + regional tax line, converts to a quote,
emails it, marks accepted, invoices it, marks it paid, and paid invoices roll into a monthly
profit summary against a logged expense list.

## Stack
FastAPI + motor Mongo (`/api` router only) · Vite + React 19 + TS strict + Tailwind v4 +
shadcn (base-nova) · TanStack Query · httpOnly cookie sessions.

## Data model (collections)
- `users` — id, email, name, company, plan, password_hash (pbkdf2), created_at
- `sessions` — token, user_id, expires_at (TTL index)
- `settings` — one per user: country, region, tax_label, tax_rate, currency, labor_rate, company_*
- `jobs` — id, user_id, name, client_name/email, address, status
  (draft|takeoff|quoted|accepted|invoiced|paid), filename, pages, pages_read, engine, scale,
  project_type, buildings, units, bedrooms, bathrooms, cross_check_note, brief, flags[]
- `takeoff_lines` — id, job_id, building, unit, room, floor_type, sqft, waste_pct, adhesive,
  adhesive_gallons, material_cost_per_sqft, labor_hours, labor_rate, needs_review, approved
  (cost is computed on read: sqft*(1+waste)*$/sf + hours*rate)
- `quotes` — number, revision, parent_id, status (draft|sent|accepted|superseded), discount_pct,
  tax_label/rate, subtotal/discount_amount/tax_amount/total, lines[] snapshot
- `invoices` — number, status (unpaid|sent|paid), totals, sent_at, paid_at
- `expenses` — date, category, vendor, amount

## Key flows
1. `/upload` → POST /api/jobs → POST /api/jobs/{id}/upload (multipart PDF) → redirect to `/jobs/{id}`
2. `/jobs/{id}` takeoff — tap any number to edit (PATCH /api/lines/{id}); changing floor type
   resets adhesive/material/waste/labor defaults. "Approve all" → "Convert to quote".
3. A second quote on the same job = **change order**: revision N+1, prior revisions set to
   `superseded` but never deleted.
4. Quote: Email → Mark accepted → Create invoice → `/invoices` → Pay now → profit summary.
5. `/settings` auto-detects tax (GST/HST/PST/QST/VAT/sales tax) from country + state/province
   via GET /api/tax/detect; every field stays editable.

## Pricing tiers (backend/lib/pricing.py — single source of truth)
Unit cost that drives everything: one blueprint page read by Claude Opus at 200 DPI costs
**$0.115** ($0.045 input image+prompt, $0.060 output JSON, $0.010 render/storage/db). Every
paid tier is sized so a fully-used allowance still leaves ~75% gross margin (~2 pages per $1);
overage is $0.50/page ($0.40 on Agency) rather than a hard stop.

| Tier | Price | Pages | Jobs | Seats | Max PDF | Capabilities |
|---|---|---|---|---|---|---|
| Trial (14 days) | free | 60 | 2 | 1 | 80 MB | takeoff, pdf, quote |
| Single Takeoff | $49 one-off | 90 total | 1 | 1 | 80 MB | takeoff, pdf ONLY |
| Crew | $199/mo annual ($249 monthly) | 400/mo | 10/mo | 2 | 120 MB | + quote, invoice, change orders |
| Contractor Pro | $499/mo annual ($624) | 1000/mo | unlimited | 5 | 200 MB | + costing, export, templates |
| Agency | $999/mo annual ($1249) | 2000/mo | unlimited | 15 | 300 MB | + API |
| Enterprise | custom | pooled | unlimited | unlimited | 500 MB | everything |

Gating: `lib/pricing.has_cap` + `_needs()` in routers/finance.py return **402** with an upgrade
message when the plan lacks a capability (quote, invoice, change order, costing, export).
Upload caps (file MB, monthly pages, monthly jobs) are enforced in routers/jobs.py.
GET /api/billing/plans · /api/billing/usage · /api/billing/cost-model (cost breakdown +
competitor comparison, shown on the landing page and Billing page).

## Payments — real Stripe Checkout (TEST mode)
routers/payments.py. Keys in backend/.env (STRIPE_SECRET_KEY/WEBHOOK_SECRET), catalog created
by `python setup_stripe.py` (lookup keys gridline_<tier>_annual|monthly, gridline_single).
- POST /api/payments/checkout {plan_id, period, origin_url} → hosted Checkout (Managed
  Payments with automatic_tax fallback); fulfilment switches the account plan.
- POST /api/pay/{pay_token}/checkout → public ad-hoc session for a client invoice
  (managed_payments disabled: the contractor's own tax line is already in the total).
- GET /api/payments/status/{session_id} re-reads Stripe before reporting paid;
  POST /api/stripe/webhook handles completed/async/expired/refunded. Both share one
  idempotent `_mark_paid` guard on payment_transactions.
- Frontend: /billing (plan purchase), /pay/{token} (client), /payment/success, /payment/cancel.
- Test card 4242 4242 4242 4242. Verified end to end: INV-ORVIEW-R1 paid $8,189.98.

## Email — Resend with PDF attachment
backend/lib/mailer.py. Quote and invoice sends build the PDF (lib/pdf.quote_pdf) and attach it;
invoice emails carry a Stripe Pay Now button pointing at /pay/{token}. Requires RESEND_API_KEY
in backend/.env — when absent the send returns `mocked: true` with the reason and the flow
still completes.

## Lead inbox
POST /api/leads (public, landing pages) → `leads`; GET /api/leads (owner only) → /leads page.

## Job costing & exports
GET /api/jobs/{id}/costing drives the "Bid vs actual" panel on the takeoff page, and
GET /api/costing/overview drives the portfolio-wide /costing page (worst margin first).
GET /api/export/invoices.csv (QuickBooks-ready) and /api/export/expenses.csv are linked from
the Invoices and Profit page headers.

## Auth
Email + password, httpOnly `gl_session` cookie. All app routes redirect to `/login` when
`GET /api/auth/me` 401s. Credentials in `memory/test_credentials.md`.

## MOCKED
- **Stripe** — `/api/billing/checkout` just switches the user's plan; invoice "Pay now" flips
  status to paid locally. No real charge.
- **Email** — quote/invoice "Email" returns a SendOut envelope (to/subject) and flips status;
  no message is actually delivered.
- AI falls back to a deterministic starter takeoff (flagged for review) if the Claude call fails.

## Seed
`cd /app/backend && python seed.py` — demo user + 3 jobs (Oakridge Commons takeoff,
Harborview quoted, Linden Row paid), 18 takeoff lines, 2 quotes, 1 paid invoice, 5 expenses.

## Landing design variants
`/` = variant 1 (hero readout mock, ROI calculator, scan demo, testimonials, FAQ, cost math and
competitor panel). `/v2` = variant 2 (editorial type-led hero, numbered rail, pricing MATRIX,
single-field demo capture). Both read the same /api/billing endpoints; pick one and delete the
other when decided.
