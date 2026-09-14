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

| Tier | Price | Pages | Jobs | Seats | Max PDF | Capabilities |
|---|---|---|---|---|---|---|
| Trial (14 days) | free | 15 | 1 | 1 | 60 MB | takeoff ONLY (read-only results) |
| Single Job | $49 one-off | 30 total | 1 | 1 | 80 MB | + edit_lines, pdf, quote (NO invoicing, NO spec sheet) |
| Job Pack 5 | $99/mo annual ($1,188/yr, saves $360) or $129/mo monthly | 60/mo | 5/mo | 2 | 120 MB | + invoice, change_order |
| Unlimited Pro | $259/mo annual ($3,108/yr, saves $840) or $329/mo monthly | unlimited | unlimited | 5 | 300 MB | + costing, export, templates, spec_sheet (exclusive) |
| Enterprise | custom | pooled | unlimited | unlimited | 500 MB | everything + api |

Billing cadence: annual = 12-month commitment billed monthly at the lower rate. Monthly cancels
anytime free. Cancelling an annual plan early raises exactly ONE closing invoice =
`early_exit_per_month` ($30 crew / $70 pro) x months already billed, then billing stops
(GET /api/billing/cancel-preview, POST /api/billing/cancel; fee rows in `exit_invoices`).
Terms copy is served by GET /api/billing/terms (`BILLING_TERMS`).

Enforcement: routers/jobs.py counts the incoming PDF's pages with PyMuPDF BEFORE any AI call
and refuses if `incoming > remaining`. Capability gating returns 402 with the upgrade message:
`lib/plan_gate.needs_cap` on tools.py (spec sheet, unit templates, all PDF exports, change
orders) and jobs.py (add/update/delete line, approve-all = `edit_lines`), plus `_needs` in
finance.py (quote, invoice, change order, costing, export).
Frontend gating reads capabilities from /api/billing/usage via `src/lib/plan.ts` (`usePlanCaps`)
and hides/locks: takeoff & quote PDF links, spec-sheet upload (Upload + Takeoff pages),
convert-to-quote and create-invoice buttons — each replaced by an upgrade link to /billing.
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

## Quote/invoice line editing & cove base (2026-09)
- `PATCH /api/quotes/{quote_id}/lines/{line_id}` and `PATCH /api/invoices/{invoice_id}/lines/{line_id}`
  (`DocLineUpdate`) retype the product name and any price/qty/hours on the DOCUMENT snapshot and
  re-total it with the discount % and tax % the document was built with (`_rate_from`).
  Superseded quote revisions and paid invoices are read-only (400) so history stays intact.
  UI: `components/DocLineEditor.tsx`, opened by `quote-edit-lines-{id}` on the takeoff and
  `invoice-edit-lines-{id}` on the Invoices page.
- Cove base: the AI now reports `cove_base_lf` per unit (room perimeter minus door openings) and
  `build_accessory_lines()` prices it from `ACCESSORIES["cove_base"]` ($3.40/lf, 0.02 hr/lf)
  exactly like transitions and nosings.
- Plan-id migration: the removed `agency` tier is aliased to `pro` in
  `lib/pricing.LEGACY_PLAN_IDS` and existing `agency` users were moved to `pro`, which restored
  invoice/costing capabilities for the demo accounts.

## Accessory catalogue & richer change-order diff (2026-09)
- Settings (`Settings`/`SettingsIn`) carry `acc_transition_price`, `acc_nosing_price`,
  `acc_cove_base_price` (defaults 18 / 42 / 3.40). `build_accessory_lines(..., prices=…)` uses
  them for every AI-counted accessory line, and a manually added `accessory` line with no unit
  price picks the right catalogue entry from its room name. UI: Accessory catalogue panel on
  the Settings page (`accessory-catalogue`).
- `GET /api/quotes/{id}/diff` now returns, per line, `delta` plus `changes[]`
  (`FieldChange{field,before,after}`) across scope, floor type, product, sq ft, waste, labor hr,
  $/sq ft, labor rate, flat price, qty and $ each. Rows sort biggest-mover-first; the Takeoff
  diff dialog renders before→after chips, a per-line ± delta and a `diff-biggest-mover` badge.

## Branding, waste defaults, trial countdown, change-order PDF, webhook edges (2026-09)
- **Branded products everywhere**: the AI prompt now REQUIRES the manufacturer+series+colour+code
  in `product` (never the category) and the "or equal" in `product_alt`; seed data carries real
  products per floor type (`seed.SPEC_PRODUCTS`) and existing rows were backfilled. PDFs print the
  product in bold with "{floor type} · or approved equal: {alt}" underneath; the takeoff flags a
  supply line with no product.
- **Branding**: settings hold `logo_data` (data URI via POST/DELETE `/api/settings/logo`, PNG/JPEG
  ≤1.5 MB), `business_number`, `tax_number`. All three render in every PDF header (`lib/pdf._logo`)
  and the numbers appear in the quote/invoice email footer. PUT /settings preserves the logo.
- **Waste defaults**: `settings.waste_overrides{floor_type: pct}` feed `build_line(..., waste_overrides)`
  — a waste % read off the drawings still wins. UI: "Waste factor defaults" panel.
- **Trial countdown**: `/api/billing/usage` returns `plan_kind`, `trial_days_left`, `trial_ends_on`
  (14 days from `plan_started_at`/`created_at`); `components/TrialCountdown.tsx` on the dashboard
  shows the banner with a one-tap upgrade, turning red at ≤3 days.
- **Change-order PDF**: `GET /api/quotes/{id}/change-order.pdf?against={id}` (`lib/pdf.change_order_pdf`)
  — previous/revised/change strip, the field-level what-changed table and a signature block.
  Linked from the diff dialog (`change-order-pdf-link`).
- **Webhook edges**: `_mark_state()` never overwrites a paid record and handles
  `payment_intent.payment_failed|canceled`, `checkout.session.expired|async_payment_failed`,
  `charge.refunded`; `invoice.payment_failed`/`paid` set `plan_payment_state` (past_due/active);
  `customer.subscription.deleted` drops the account to `trial` with a note. `/payments/status`
  also marks a session expired when Stripe says so, so the result page never spins forever —
  it shows a distinct failed / expired card instead.

## Product library & change-order e-sign (2026-09)
- `products` collection (per account): `/api/products` GET(search q, floor_type) POST,
  PATCH/DELETE `/api/products/{id}`, and `POST /api/products/{id}/apply/{line_id}` which drops
  the name, approved alternative and the account's own cost per sq ft onto a takeoff line.
  The library self-learns: `routers.products.remember_product()` upserts and bumps
  `times_used` whenever a line's product is typed/changed, so results sort by what is quoted most.
  UI: `/products` page (nav "Products") plus `components/ProductLibraryDialog.tsx` opened from the
  `line-library-{id}` button on each takeoff row.
- Change-order e-sign: `POST /api/quotes/{id}/change-order/send?against={id}` emails the client the
  one-page change-order PDF with a link to `/approve/{approve_token}`. Public (no auth) routes
  `GET|POST /api/approve/{token}` (routers/approvals.py) return the revision summary and record
  `{name, at, ip}` into `quotes.signature`, setting the quote to accepted. Superseded revisions
  cannot be signed. UI: `pages/Approve.tsx`, triggered from `change-order-send-button` in the
  revision dialog.
- EMAIL DELIVERY IS BLOCKED: backend/.env has no `RESEND_API_KEY`/`SENDER_EMAIL`, so mailer.send()
  composes the message and returns delivered=false. Add the key + `resend>=2.0.0` to deliver.

## Accessory catalogue, invoice preview, closing-fee payment, usage alerts (latest)
- **Accessory catalogue** lives on the Products page behind a `Floor products | Accessory catalogue`
  tab (`GET /api/products?kind=accessory|floor`). Products gained `kind`, `accessory_kind`,
  `unit` (sf|lf|ea), `unit_price`, `labor_hr_each`; prices are editable inline. Built-in kinds are
  `transition`, `nosing`, `cove_base`, `tile_profile` (`lib/flooring.ACCESSORIES` /
  `ACCESSORY_SOURCES`), each mapped to the AI count field and the Settings price key.
- `GET /api/accessory-catalogue` = built-in kinds + this account's price.
  `GET /api/jobs/{id}/accessory-counts` = what the AI counted on the drawings (`doors`, `steps`,
  `cove_base_lf`, new `tile_profile_lf`) and what the spec sheet's trim schedules gave
  (`job.spec_accessories`), with the source labelled. `POST /api/products/{id}/add-line` drops any
  catalogue item onto a job's takeoff as its own line (accessory = qty x unit price + install hrs).
- **AI reading**: the blueprint prompt now also counts `tile_profile_lf` (tile edge profile / trim),
  and the spec-sheet prompt returns an `accessories[]` array (kind, qty, unit, product, unit_price)
  read from wall-base / nosing / transition / tile-profile schedules — stored on the job and
  returned in `SpecReadResult.accessories`.
- **Invoices page**: `Preview PDF` renders the real invoice PDF inline in an iframe (keyed on total
  and line count so it re-renders after an edit) next to the existing `Edit lines` editor, plus an
  open/download link. Edit → preview → Email is the intended order.
- **Closing fee via Stripe**: `POST /api/payments/exit-fee/checkout` opens a one-off Checkout for the
  outstanding `exit_invoices` row; `_fulfil` (kind `exit_fee`) marks it paid and clears
  `plan_exit_fee`. `GET /api/billing/exit-fee` drives the amber Pay-and-close panel on Billing.
- **Downgrade warnings**: `GET /api/billing/downgrade-impact?plan_id=` lists lost capabilities plus
  counts of open quotes / unpaid invoices / spec-priced jobs. Billing opens a confirm dialog with
  those warnings before any checkout starts (nothing already created is ever deleted).
- **80% usage alert**: `lib/usage_alerts.maybe_alert_usage` is called right after a successful
  blueprint read in `routers/jobs.py`; it emails once per billing period (deduped with
  `users.page_alert_period`) and is a no-op on unlimited plans. MOCKED to the backend console
  without `RESEND_API_KEY`.
- Settings gained `acc_tile_profile_price` (default $9.50/lf).

## Accessory auto-lines + quote PDF preview (latest)
- `lib/ai.build_accessory_lines(parsed, job_id, labor_rate, prices, catalogue=, spec_rows=)`:
  a saved accessory product (Products → Accessory catalogue, matched on `accessory_kind`, most-used
  first) now wins on name, price and install hours; a spec-sheet trim row supplies the quantity when
  the drawings counted nothing (only for the single whole-job group, so schedule totals are never
  double-counted) and its product name otherwise. Each line records its provenance in `source`
  ("counted from the drawings (6 doors)" / "read from the spec sheet (420 lf)").
- `routers/jobs.py` upload passes the catalogue + `job.spec_accessories`, so every new takeoff lands
  with its trim already priced. `routers/tools.py` spec-sheet upload inserts any trim line the
  takeoff does not already have (matched on room label) and counts them in `applied_to_lines`.
- Takeoff quote cards gained `Preview PDF` — the real quote PDF inline in an iframe (keyed on total
  and line count so it re-renders after a line edit) plus an open/download link, gated on the `pdf`
  capability exactly like the existing PDF link. Same pattern as the Invoices page preview.

## Per-unit trim + in-preview letterhead switch (latest)
- `build_accessory_lines(..., unit_weights=[(building, unit, sqft)])`: a single whole-job trim total
  is now split into one line per unit, weighted by that unit's measured floor area. Linear-foot
  items (cove base, tile edge profiles) split proportionally; counted items (doors → transitions,
  steps → nosings) use largest-remainder allocation so the per-unit lines add up to exactly what
  was counted. Each line's `source` states the share ("… · 50% of the job total by floor area").
  Jobs with one measured unit keep the single whole-job line. Spec-sheet quantities follow the same
  split. Wired from `routers/jobs.py` (blueprint upload) and `routers/tools.py` (spec upload, which
  now dedupes on building+unit+room).
- Quote and invoice PDF previews carry their own letterhead Select (options from
  `GET /api/reference/options` → `pdf_templates`: contractor_clean, technical_readout,
  classic_professional). Switching re-keys the iframe so the client-facing PDF re-renders in place;
  the open/download link uses the same template. Takeoff's page-level template select still drives
  the takeoff PDF.

## Config template + boot-time config check (latest)
- `backend/.env.example` is the committed template for every key the app reads, grouped into
  required (MONGO_URL, DB_NAME, CORS_ORIGINS, APP_URL), AI (EMERGENT_LLM_KEY), billing
  (STRIPE_SECRET_KEY / PUBLISHABLE / ACCOUNT_ID / WEBHOOK_SECRET / MODE), email (RESEND_API_KEY,
  SENDER_EMAIL) and optional (APP_TZ), each with a comment saying what breaks without it. A fresh
  clone copies it to `backend/.env`. `.gitignore` keeps real `.env` files out while whitelisting
  `*.env.example` (negations sit at the END of the file — an earlier `*.env` block would otherwise
  re-ignore them).
- `backend/lib/config.py::check_config()` runs in the FastAPI lifespan and logs one readable report
  at boot: ERROR lines for missing required keys (plus the copy/restart instruction) and WARNING
  lines for optional ones naming the feature that switches off. The result is stored on
  `app.state.config` and surfaced by `GET /api/health` as `{status, missing_required,
  missing_optional, hint}` — key names only, never values.
