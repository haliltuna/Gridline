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
One blueprint page read by Claude Opus at 200 DPI costs **$0.115** ($0.045 in, $0.060 out,
$0.010 render/storage). Allowances are deliberately tight and there is **NO overage billing**:
when the pages are gone the upload is refused (402) with an upgrade prompt, so we never read
pages we have not been paid for and the customer never gets a surprise charge.

| Tier | Price | Pages | Jobs | Seats | Max PDF | COGS at full use | Capabilities |
|---|---|---|---|---|---|---|---|
| Trial (14 days) | free | 10 | 1 | 1 | 60 MB | $1.15 | takeoff, pdf, quote |
| Single Job | $39 one-off | 25 total | 1 | 1 | 80 MB | $2.88 | takeoff, pdf ONLY |
| Job Pack 5 | $99/mo | 60/mo | 5/mo | 2 | 120 MB | $6.90 | + quote, invoice, change orders |
| Unlimited Pro | $999/mo (14-day trial) | unlimited | unlimited | 5 | 300 MB | usage-based | + costing, export, templates |
| Enterprise | custom | pooled | unlimited | unlimited | 500 MB | negotiated | everything |

Enforcement: routers/jobs.py counts the incoming PDF's pages with PyMuPDF BEFORE any AI call
and refuses if `incoming > remaining`; capability gating (`_needs` in routers/finance.py)
returns 402 with the upgrade message for quote/invoice/change order/costing/export.
Frontend surfaces this through `components/UsageMeter.tsx` (Upload page always, Dashboard when
near/at the limit) and the 402 detail is shown verbatim in the upload error toast.
GET /api/billing/usage now returns pages_remaining, limit_reached, near_limit.

## Themes (app-wide, user-selectable)
`src/lib/theme.tsx` (ThemeProvider + useTheme, persisted in localStorage under
`gridline-theme`) sets `data-theme` on <html>. Three complete skins defined in
`src/index.css` as palette tokens — **readout** (near-black + neon yellow, Space Grotesk),
**blueprint** (deep indigo + cyan, Archivo/Inter Tight), **daylight** (paper white + ink
blue). Every page paints from the tokens (`bg-base/base-2/surface/surface-2`,
`border-hairline`, `text-ink|ink-2|ink-3|ink-4`, `bg-brand/text-brand/brand-soft/on-brand`)
— never raw hex — so adding a theme means adding one `[data-theme=...]` block.
Picker: `components/ThemeSwitcher.tsx`, in the app header and on both landing pages.

## Margin alerts
`components/MarginAlerts.tsx` on the dashboard flags any job under 20% margin (actual
expenses vs invoiced/quoted) straight from GET /api/costing/overview.

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

## Theming note (2026-09)
`--color-base` was renamed to `--color-canvas` in index.css: it made Tailwind's `text-base` resolve to a near-black COLOR utility instead of a font size, which hid typed input text on dark themes. Use `bg-canvas` / `bg-canvas-2`; never re-add a `--color-base` token.

## Auth (2026-09)
Two paths into the same httpOnly `gl_session` cookie + `sessions` collection:
1. email/password — `POST /api/auth/login` | `/api/auth/signup`
2. Emergent-managed Google — `google-signin-button` on /login redirects to
   auth.emergentagent.com with `redirect={window.location.origin}/dashboard` (never hardcoded),
   returns to `#session_id=...`; App.tsx detects the hash during render and renders
   `pages/AuthCallback.tsx`, which posts the id to `POST /api/auth/google/session`
   (backend/routers/google_auth.py). That endpoint exchanges it server-side at
   demobackend.emergentagent.com, upserts the user by email (owner
   halilkocabiyikci@gmail.com lands on the `pro` plan, everyone else `trial`), stores the
   returned 7-day session_token in `sessions` and sets the cookie.
Test guidance: /app/auth_testing.md (seed a sessions row; OAuth itself is not scriptable).

## Spec-first quoting, counted trim work & landing motion (2026-09)
- **Spec-first**: Upload.tsx can read the finish schedule BEFORE the drawings
  (`spec-first-button` → POST /api/jobs/{id}/spec-sheet), then shows
  `components/MaterialPricing.tsx` so the estimator sets material $/sq ft per specified product
  and can flip any spec to its approved alternative
  (PUT /api/jobs/{id}/specs/pricing → `SpecPricingIn`). The blueprint read
  (`read_blueprint(..., specs=…)`) receives those products, so each room lands with the
  specified product name already on it. Spec reads are flooring-scope only (paint, millwork,
  casework etc. are ignored). Lines carry `product` + `product_alt`; the takeoff row has a
  one-tap `line-alt-swap-{id}` button that swaps them.
- **Nosings & transitions**: the AI counts door openings and stair treads
  (`accessories`, `doors`, `steps`); `build_accessory_lines()` turns them into scope
  `accessory` lines priced as qty x unit_price (+ install hours) from
  `lib/flooring.ACCESSORIES`. Editable on the takeoff (`line-qty-*`, `line-unitprice-*`) and
  rendered as "n ea @ $x" in the quote/invoice PDF.
- **Index sheet cross-check**: `index_stated` (buildings/units/total sq ft printed on the
  cover/index sheets) is recorded and `index_variance()` publishes the difference against
  what was measured; shown on the takeoff as `takeoff-index-variance`.
- **Landing motion**: `components/Scroll.tsx` (motion/react) provides ScrollProgress, Reveal,
  Parallax, DepthSection and CountUp — all reduced-motion aware. Landing.tsx uses them for the
  parallax hero grid/readout, count-up stats and depth on the stats/ROI blocks.
- **Top bar** shows the Google avatar (`shell-user-avatar`) or initials plus the display name.
