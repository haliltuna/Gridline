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

## Pricing tiers (GET /api/billing/plans)
Single Job $39/takeoff · Five Pack $99 one-time (5 jobs) · Unlimited Pro $999/mo, 14-day trial.

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
