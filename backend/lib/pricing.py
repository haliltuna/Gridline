"""Pricing, usage caps and plan capabilities — one source of truth for the whole app.

The unit cost that drives every price here is a single blueprint PAGE read by Claude Opus
vision at 200 DPI:

    image tokens  ~2,400 in  +  prompt ~600 in   = 3,000 in  @ $15.00 / 1M = $0.045
    structured takeoff JSON out         ~800 out             @ $75.00 / 1M = $0.060
    render (PyMuPDF), storage, egress, Mongo                                 $0.010
    ------------------------------------------------------------------------------
    TRUE COST PER PAGE                                                     ≈ $0.115

Every paid tier is sized so that a customer who burns 100% of the included pages still
leaves us a ~75% gross margin: allowances are deliberately tight (25 / 60 / 100 pages) — a fully-used tier costs us
under 5% of its price.
There is NO overage billing: when the allowance is gone the upload is refused with an
upgrade prompt, so a customer can never run pages we have not been paid for.
"""

PAGE_COST = 0.115
TARGET_MARGIN = 0.75
OVERAGE_PER_PAGE = 0.0   # hard stop: we never bill an overage and we never eat the cost

COST_BREAKDOWN = [
    {"item": "Claude Opus vision — page image + prompt", "detail": "≈3,000 input tokens @ $15/M", "cost": 0.045},
    {"item": "Claude Opus — structured takeoff JSON", "detail": "≈800 output tokens @ $75/M", "cost": 0.060},
    {"item": "200 DPI render, storage, egress, database", "detail": "PyMuPDF + object storage + Mongo", "cost": 0.010},
]

# Capability flags. A tier only shows a feature if the flag is present — this is what stops
# the $49 one-off from quietly becoming a free invoicing product.
CAP_TAKEOFF = "takeoff"        # read a blueprint, edit the line items
CAP_PDF = "pdf"                # branded takeoff / quote PDF export
CAP_QUOTE = "quote"            # convert to quote + email it
CAP_INVOICE = "invoice"        # invoice + collect by card
CAP_CHANGE_ORDER = "change_order"
CAP_COSTING = "costing"        # bid vs actual + expenses
CAP_EXPORT = "export"          # CSV / QuickBooks export
CAP_TEMPLATES = "templates"    # unit template library
CAP_API = "api"

PLANS: list[dict] = [
    {
        "id": "trial", "name": "14-day Trial", "price": 0.0, "monthly_price": 0.0,
        "cadence": "free for 14 days", "kind": "trial", "seats": "1 seat", "badge": "",
        "blurb": "Read one real set end to end before you pay a cent.",
        "pages_included": 10, "jobs_included": 1, "max_file_mb": 60, "seat_count": 1,
        "overage_per_page": 0.0, "lookup_key": "", "lookup_key_monthly": "",
        "capabilities": [CAP_TAKEOFF, CAP_PDF, CAP_QUOTE],
        "features": [
            "10 blueprint pages, 1 job", "Full 12-type flooring logic",
            "Takeoff + quote PDF export", "No card required", "Invoicing needs a paid plan",
        ],
        "highlight": False,
    },
    {
        "id": "single", "name": "Single Job", "price": 39.0, "monthly_price": 0.0,
        "cadence": "per job, one-off", "kind": "one_time", "seats": "1 seat",
        "badge": "No subscription",
        "blurb": "One set, read properly. For the contractor bidding the occasional job.",
        "pages_included": 25, "jobs_included": 1, "max_file_mb": 80, "seat_count": 1,
        "overage_per_page": 0.0, "lookup_key": "gridline_single", "lookup_key_monthly": "",
        "capabilities": [CAP_TAKEOFF, CAP_PDF],
        "features": [
            "1 job, up to 25 blueprint pages", "Every room measured, priced and flagged",
            "Editable takeoff + branded takeoff PDF", "Spec-sheet reading included",
            "Quotes, invoicing and payments are NOT included",
        ],
        "highlight": False,
    },
    {
        "id": "crew", "name": "Job Pack 5", "price": 99.0, "monthly_price": 99.0,
        "cadence": "per month", "kind": "subscription", "seats": "2 seats",
        "badge": "Most popular",
        "blurb": "The working estimator's plan: bid, quote, invoice and get paid.",
        "pages_included": 60, "jobs_included": 5, "max_file_mb": 120, "seat_count": 2,
        "overage_per_page": 0.0, "lookup_key": "gridline_crew_annual",
        "lookup_key_monthly": "gridline_crew_monthly",
        "capabilities": [CAP_TAKEOFF, CAP_PDF, CAP_QUOTE, CAP_INVOICE, CAP_CHANGE_ORDER],
        "features": [
            "60 pages / month · up to 5 jobs / month", "Quotes emailed with the PDF attached",
            "Invoices with a real card checkout", "Change orders with full revision history",
            "2 seats (owner + estimator)", "Upgrade any time — pages never auto-bill",
        ],
        "highlight": True,
    },
    {
        "id": "pro", "name": "Unlimited Pro", "price": 999.0, "monthly_price": 999.0,
        "cadence": "per month", "kind": "subscription", "seats": "5 seats",
        "badge": "Best for multi-family",
        "blurb": "Unlimited uploads, buildings, costing and change orders. 14-day free trial.",
        "pages_included": -1, "jobs_included": -1, "max_file_mb": 300, "seat_count": 5,
        "overage_per_page": 0.0, "lookup_key": "gridline_pro_annual",
        "lookup_key_monthly": "gridline_pro_monthly",
        "capabilities": [CAP_TAKEOFF, CAP_PDF, CAP_QUOTE, CAP_INVOICE, CAP_CHANGE_ORDER,
                         CAP_COSTING, CAP_EXPORT, CAP_TEMPLATES],
        "features": [
            "Unlimited pages · unlimited jobs", "Everything in Job Pack 5",
            "Bid vs actual job costing + expense log", "Unit-template library across buildings",
            "CSV / QuickBooks export", "5 seats with owner / estimator / viewer roles",
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
        "capabilities": [CAP_TAKEOFF, CAP_PDF, CAP_QUOTE, CAP_INVOICE, CAP_CHANGE_ORDER,
                         CAP_COSTING, CAP_EXPORT, CAP_TEMPLATES, CAP_API],
        "features": [
            "Pooled page volume, negotiated rate", "Unlimited seats and sub-accounts",
            "Custom floor types and cost books", "Single sign-on", "API + webhooks",
            "Dedicated support with an SLA",
        ],
        "highlight": False,
    },
]

# One-off page packs: bought when a set overruns the allowance, instead of jumping a tier.
# 25 pages costs us $2.88, so $29 holds a 90% margin — and the customer only ever pays
# when they choose to.
TOP_UPS: list[dict] = [
    {"id": "topup25", "name": "25-page top-up", "price": 29.0, "pages": 25,
     "lookup_key": "gridline_topup_25",
     "blurb": "One-off pack for a set that runs past your allowance. Never expires, never auto-renews."},
    {"id": "topup60", "name": "60-page top-up", "price": 59.0, "pages": 60,
     "lookup_key": "gridline_topup_60",
     "blurb": "For a large set or a busy month. Cheaper per page than the 25-pack."},
]
TOP_UP_BY_ID = {t["id"]: t for t in TOP_UPS}

BY_ID = {p["id"]: p for p in PLANS}
DEFAULT_PLAN = "trial"

# What the trade pays elsewhere, for the landing-page comparison.
COMPETITORS = [
    {"name": "PlanSwift", "price": "$1,749 up front + $500/yr", "note": "Manual click-to-measure; no AI reading, no quoting or invoicing."},
    {"name": "STACK", "price": "≈$2,500 / yr per seat", "note": "Cloud takeoff, still manual tracing. Flooring waste/adhesive logic is DIY."},
    {"name": "Togal.AI", "price": "≈$6,000 / yr", "note": "AI area detection for GCs — not flooring-specific, no invoicing."},
    {"name": "Bluebeam Revu", "price": "$260 / yr per seat", "note": "PDF markup tool. You measure every room yourself."},
    {"name": "Gridline Crew", "price": "$149 / mo annual", "note": "AI reads the set, prices it with flooring logic, quotes, invoices and collects."},
]


# Plan ids that no longer exist in PLANS but may still be stored on old accounts.
LEGACY_PLAN_IDS = {"agency": "pro", "starter": "crew", "unlimited": "pro"}


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
        CAP_COSTING: "Bid vs actual job costing",
        CAP_EXPORT: "CSV / QuickBooks export",
        CAP_TEMPLATES: "The unit-template library",
        CAP_PDF: "PDF export",
    }.get(cap, cap)


def upgrade_message(plan_id: str | None, cap: str) -> str:
    current = plan_for(plan_id)
    target = next((p["name"] for p in PLANS if cap in p["capabilities"] and p["kind"] == "subscription"), "Crew")
    return f"{cap_label(cap)} is not included in {current['name']} — upgrade to {target} on the Billing page."
