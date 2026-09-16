"""Pricing, usage caps and plan capabilities — one source of truth for the whole app.

Cost basis per blueprint page read by Claude Opus 4.7 vision at 2200px cap:

    image tokens  ~1,500 in  +  prompt ~600 in   = 2,100 in  @ $5.00 / 1M = $0.0105
    structured takeoff JSON out         ~800 out             @ $25.00 / 1M = $0.0200
    render (pypdfium2), storage, egress, Mongo                                $0.0030
    --------------------------------------------------------------------------------
    TRUE COST PER PAGE                                                       ≈ $0.024

Every paid tier is sized so that a customer who burns 100% of the included pages still
leaves a healthy gross margin. Overage is billed per page at a rate that keeps > 70%
margin even at full consumption.
"""

PAGE_COST = 0.024
TARGET_MARGIN = 0.70

COST_BREAKDOWN = [
    {"item": "Claude Opus 4.7 vision — page image + prompt", "detail": "≈2,100 input tokens @ $5/M", "cost": 0.0105},
    {"item": "Claude Opus 4.7 — structured takeoff JSON", "detail": "≈800 output tokens @ $25/M", "cost": 0.0200},
    {"item": "PDF render, storage, egress, database", "detail": "pypdfium2 + object storage + Mongo", "cost": 0.0030},
]

# ---------------------------------------------------------------------------
# Capability flags — a tier only shows a feature if the flag is present.
# ---------------------------------------------------------------------------

CAP_TAKEOFF = "takeoff"          # read a blueprint, edit the line items
CAP_EDIT = "edit_lines"          # editing the takeoff (trial results are read-only)
CAP_PDF = "pdf"                  # takeoff / quote PDF export
CAP_QUOTE = "quote"              # convert to quote + email it
CAP_INVOICE = "invoice"          # invoice + collect by card
CAP_CHANGE_ORDER = "change_order"
CAP_BRANDING = "branding"        # custom logo + branded PDF header (NEW)
CAP_SPEC = "spec_sheet"          # spec-sheet upload + automatic product transfer
CAP_COSTING = "costing"          # bid vs actual + expenses
CAP_EXPORT = "export"            # CSV / QuickBooks export
CAP_TEMPLATES = "templates"      # unit template library
CAP_PRIORITY = "priority"        # priority AI processing queue (NEW)
CAP_API = "api"

# ---------------------------------------------------------------------------
# Plans
# ---------------------------------------------------------------------------

PLANS: list[dict] = [
    {
        "id": "trial", "name": "14-day Trial", "price": 0.0, "monthly_price": 0.0,
        "cadence": "free for 14 days", "kind": "trial", "seats": "1 seat", "badge": "",
        "blurb": "Read one real set end to end before you pay a cent.",
        "pages_included": 20, "jobs_included": 1, "max_file_mb": 60, "seat_count": 1,
        "overage_per_page": 0.0, "lookup_key": "", "lookup_key_monthly": "",
        "capabilities": [CAP_TAKEOFF],
        "features": [
            "20 blueprint pages, 1 job",
            "Full 12-type flooring logic",
            "AI takeoff only — results are read-only on screen",
            "No quote, no invoice, no logo, no spec-sheet upload",
            "No card required",
        ],
        "highlight": False,
    },
    {
        "id": "starter", "name": "Starter", "price": 59.0, "monthly_price": 79.0,
        "cadence": "per month", "kind": "subscription", "seats": "1 seat",
        "badge": "Best for solo installers",
        "blurb": "Read the drawing, quote the job, invoice the client, get paid.",
        "pages_included": 75, "jobs_included": 5, "max_file_mb": 100, "seat_count": 1,
        "overage_per_page": 0.75, "lookup_key": "gridreader_starter_annual",
        "lookup_key_monthly": "gridreader_starter_monthly",
        "annual_total": 708.0, "annual_saving": 240.0,
        "early_exit_per_month": 20.0,
        "capabilities": [CAP_TAKEOFF, CAP_EDIT, CAP_PDF, CAP_QUOTE, CAP_INVOICE],
        "features": [
            "75 pages / month · up to 5 jobs / month",
            "Editable takeoff + branded quote PDF",
            "Convert to invoice + Stripe card checkout",
            "Client pay links, email delivery",
            "Overage billed at $0.75/page",
        ],
        "highlight": False,
    },
    {
        "id": "pro", "name": "Pro", "price": 149.0, "monthly_price": 189.0,
        "cadence": "per month", "kind": "subscription", "seats": "3 seats",
        "badge": "Most popular",
        "blurb": "The working estimator's plan: spec sheet reading, change orders, custom branding.",
        "pages_included": 300, "jobs_included": 20, "max_file_mb": 200, "seat_count": 3,
        "overage_per_page": 0.60, "lookup_key": "gridreader_pro_annual",
        "lookup_key_monthly": "gridreader_pro_monthly",
        "annual_total": 1788.0, "annual_saving": 480.0,
        "early_exit_per_month": 40.0,
        "capabilities": [
            CAP_TAKEOFF, CAP_EDIT, CAP_PDF, CAP_QUOTE, CAP_INVOICE,
            CAP_CHANGE_ORDER, CAP_BRANDING, CAP_SPEC, CAP_PRIORITY,
        ],
        "features": [
            "300 pages / month · up to 20 jobs / month",
            "Everything in Starter, plus:",
            "Change orders with full revision history",
            "Custom logo + branded PDF headers",
            "Spec-sheet upload — products write themselves into quotes",
            "Priority AI processing queue",
            "3 seats (owner + 2 estimators)",
            "Overage billed at $0.60/page",
        ],
        "highlight": True,
    },
    {
        "id": "commercial", "name": "Commercial", "price": 299.0, "monthly_price": 379.0,
        "cadence": "per month", "kind": "subscription", "seats": "5 seats",
        "badge": "Best for multi-crew shops",
        "blurb": "Everything in Pro, plus costing, QuickBooks export, and 1,200 pages.",
        "pages_included": 1200, "jobs_included": -1, "max_file_mb": 400, "seat_count": 5,
        "overage_per_page": 0.45, "lookup_key": "gridreader_commercial_annual",
        "lookup_key_monthly": "gridreader_commercial_monthly",
        "annual_total": 3588.0, "annual_saving": 960.0,
        "early_exit_per_month": 60.0,
        "capabilities": [
            CAP_TAKEOFF, CAP_EDIT, CAP_PDF, CAP_QUOTE, CAP_INVOICE,
            CAP_CHANGE_ORDER, CAP_BRANDING, CAP_SPEC, CAP_PRIORITY,
            CAP_COSTING, CAP_EXPORT, CAP_TEMPLATES,
        ],
        "features": [
            "1,200 pages / month · unlimited jobs",
            "Everything in Pro, plus:",
            "Bid vs actual job costing + expense log",
            "Unit-template library across buildings",
            "CSV / QuickBooks export",
            "5 seats with owner / estimator / viewer roles",
            "Overage billed at $0.45/page",
        ],
        "highlight": False,
    },
    {
        "id": "enterprise", "name": "Enterprise", "price": 0.0, "monthly_price": 0.0,
        "cadence": "custom quote", "kind": "contact", "seats": "Unlimited seats",
        "badge": "Talk to us",
        "blurb": "Regional and national subcontractors with custom workflows.",
        "pages_included": -1, "jobs_included": -1, "max_file_mb": 500, "seat_count": -1,
        "overage_per_page": 0.0, "lookup_key": "", "lookup_key_monthly": "",
        "capabilities": [
            CAP_TAKEOFF, CAP_EDIT, CAP_PDF, CAP_QUOTE, CAP_INVOICE,
            CAP_CHANGE_ORDER, CAP_BRANDING, CAP_SPEC, CAP_PRIORITY,
            CAP_COSTING, CAP_EXPORT, CAP_TEMPLATES, CAP_API,
        ],
        "features": [
            "Unlimited everything, pooled across the team",
            "Pooled page volume, negotiated rate",
            "Unlimited seats and sub-accounts",
            "Custom floor types and cost books",
            "Single sign-on",
            "API + webhooks",
            "Dedicated support with an SLA",
        ],
        "highlight": False,
    },
]

# ---------------------------------------------------------------------------
# One-off page packs
# ---------------------------------------------------------------------------

TOP_UPS: list[dict] = [
    {"id": "topup25", "name": "25-page top-up", "price": 29.0, "pages": 25,
     "lookup_key": "gridreader_topup_25",
     "blurb": "One-off pack for a set that runs past your allowance. Never expires, never auto-renews."},
    {"id": "topup60", "name": "60-page top-up", "price": 59.0, "pages": 60,
     "lookup_key": "gridreader_topup_60",
     "blurb": "For a large set or a busy month. Cheaper per page than the 25-pack."},
    {"id": "topup250", "name": "250-page top-up", "price": 199.0, "pages": 250,
     "lookup_key": "gridreader_topup_250",
     "blurb": "For commercial sets that run into the hundreds of pages."},
]
TOP_UP_BY_ID = {t["id"]: t for t in TOP_UPS}

BY_ID = {p["id"]: p for p in PLANS}
DEFAULT_PLAN = "trial"

# ---------------------------------------------------------------------------
# Competitor table for the landing page (SEO / AEO gold)
# ---------------------------------------------------------------------------

COMPETITORS = [
    {
        "name": "Togal.AI", "price": "$299 / month / user",
        "note": "Proprietary CV model. 98% claimed accuracy. Takeoff only — no quote, no invoice, no payment.",
        "best_at": "Fast area detection on clean commercial plans",
        "worst_at": "Accuracy varies wildly between plan types; no workflow past takeoff",
    },
    {
        "name": "Exayard", "price": "$99–$249 / month",
        "note": "AI takeoff with credit allowances. Published pricing, 3-day trial.",
        "best_at": "Cheaper entry point, unlimited manual takeoffs on Professional",
        "worst_at": "AI credits are capped, no overage pricing, no payment collection",
    },
    {
        "name": "MeasureSquare", "price": "$540–$3,530 / year",
        "note": "Industry standard. AI deep learning on floor plans. Four separate products.",
        "best_at": "Material optimization, mature desktop + iPad workflow",
        "worst_at": "Windows-only desktop, per-seat pricing, storage caps, phone-call cancellation",
    },
    {
        "name": "Handoff H1", "price": "Enterprise / API only",
        "note": "Purpose-built takeoff model. 81.6% benchmark vs 55% for general LLMs.",
        "best_at": "Highest accuracy on residential takeoffs",
        "worst_at": "Residential only, 90-minute turnarounds, not self-serve",
    },
    {
        "name": "PlanSwift", "price": "$1,749 + $500/yr",
        "note": "Manual click-to-measure. No AI reading, no quoting or invoicing.",
        "best_at": "Full control for estimators who prefer to measure everything by hand",
        "worst_at": "No AI, no workflow past takeoff, expensive upfront",
    },
    {
        "name": "Bluebeam Revu", "price": "$260 / year / seat",
        "note": "PDF markup tool. You measure every room yourself.",
        "best_at": "Best-in-class PDF markup, industry standard for annotations",
        "worst_at": "No takeoff logic, no flooring-specific rules, no invoicing",
    },
    {
        "name": "Gridreader", "price": "$59–$299 / month",
        "note": "AI reads the set, prices it with flooring logic, quotes, invoices and collects — all in one tool.",
        "best_at": "The only tool that runs the full workflow from blueprint to bank deposit",
        "worst_at": "Newer. Less battle-tested on the messiest commercial sets.",
    },
]

# ---------------------------------------------------------------------------
# Legacy plan ids — old accounts get mapped to the new tiers
# ---------------------------------------------------------------------------

LEGACY_PLAN_IDS = {
    "single": "starter",
    "crew": "pro",
    "pro": "commercial",
    "agency": "commercial",
    "unlimited": "commercial",
    "starter": "starter",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def plan_for(plan_id: str | None) -> dict:
    key = plan_id or ""
    key = LEGACY_PLAN_IDS.get(key, key)
    return BY_ID.get(key, BY_ID[DEFAULT_PLAN])


def has_cap(plan_id: str | None, cap: str) -> bool:
    return cap in plan_for(plan_id)["capabilities"]


def cap_label(cap: str) -> str:
    return {
        CAP_QUOTE: "Converting a takeoff into a quote",
        CAP_INVOICE: "Invoicing and taking payment",
        CAP_CHANGE_ORDER: "Change-order revisions",
        CAP_BRANDING: "Custom logo and branded PDFs",
        CAP_SPEC: "Spec-sheet upload and automatic product transfer",
        CAP_COSTING: "Bid vs actual job costing",
        CAP_EXPORT: "CSV / QuickBooks export",
        CAP_TEMPLATES: "The unit-template library",
        CAP_PDF: "PDF export",
        CAP_EDIT: "Editing the takeoff",
        CAP_PRIORITY: "Priority AI processing",
    }.get(cap, cap)


def upgrade_message(plan_id: str | None, cap: str) -> str:
    current = plan_for(plan_id)
    target = next(
        (p["name"] for p in PLANS if cap in p["capabilities"] and p["kind"] == "subscription"),
        "Pro",
    )
    return f"{cap_label(cap)} is not included in {current['name']} — upgrade to {target} on the Billing page."


def overage_cost(plan_id: str | None, pages_over: int) -> float:
    """The cost of N pages of overage on the given plan."""
    plan = plan_for(plan_id)
    return round(float(plan.get("overage_per_page") or 0) * max(0, pages_over), 2)


# ---------------------------------------------------------------------------
# Billing terms — commitment, cancellation, retention
# ---------------------------------------------------------------------------

BILLING_TERMS = {
    "default_cadence": "annual",
    "fine_print": (
        "Annual plans are billed monthly at the discounted rate as a 12-month commitment. "
        "Cancelling before 12 months triggers one final invoice for the difference between the "
        "Annual and Monthly rate for the months you were billed — then billing stops immediately, "
        "with no charge for the months remaining. Monthly plans have no commitment and can be "
        "cancelled anytime at no cost. Your job history, quotes, and invoices stay accessible "
        "and exportable no matter your plan or cancellation status."
    ),
    "cancellation": [
        "Monthly plans cancel anytime, no fee.",
        "Annual plans are a 12-month commitment paid monthly.",
        "Cancelling an annual plan early triggers exactly one closing invoice for the "
        "Annual/Monthly difference on the months already billed.",
        "Billing then stops completely — no charge for the remaining unused months.",
    ],
    "retention": (
        "Every job, blueprint, takeoff, quote and invoice stays permanently viewable and "
        "exportable as PDF/CSV, whatever your plan or cancellation status. Only NEW actions — "
        "a new upload, a new AI takeoff, a new invoice or spec-sheet auto-transfer — need an "
        "active plan at the right tier."
    ),
}


def early_exit_invoice(plan_id: str | None, months_billed: int) -> float:
    """The single closing invoice for leaving an annual commitment early."""
    plan = plan_for(plan_id)
    return round(float(plan.get("early_exit_per_month") or 0) * max(0, months_billed), 2)