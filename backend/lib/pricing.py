"""Pricing, usage caps and plan capabilities — one source of truth for the whole app.

The unit cost that drives every price here is a single blueprint PAGE read by Claude Opus
vision at 200 DPI:

    image tokens  ~2,400 in  +  prompt ~600 in   = 3,000 in  @ $15.00 / 1M = $0.045
    structured takeoff JSON out         ~800 out             @ $75.00 / 1M = $0.060
    render (PyMuPDF), storage, egress, Mongo                                 $0.010
    ------------------------------------------------------------------------------
    TRUE COST PER PAGE                                                     ≈ $0.115

Every paid tier is sized so that a customer who burns 100% of the included pages still
leaves us a ~75% gross margin: page allowance ≈ price / (4 x $0.115) ≈ 2 pages per $1.
Overage is $0.50/page, which holds the same margin on the marginal page.
"""

PAGE_COST = 0.115
TARGET_MARGIN = 0.75
OVERAGE_PER_PAGE = 0.50

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
        "pages_included": 60, "jobs_included": 2, "max_file_mb": 80, "seat_count": 1,
        "overage_per_page": 0.0, "lookup_key": "", "lookup_key_monthly": "",
        "capabilities": [CAP_TAKEOFF, CAP_PDF, CAP_QUOTE],
        "features": [
            "60 blueprint pages, 2 jobs", "Full 12-type flooring logic",
            "Takeoff + quote PDF export", "No card required", "Invoicing needs a paid plan",
        ],
        "highlight": False,
    },
    {
        "id": "single", "name": "Single Takeoff", "price": 49.0, "monthly_price": 0.0,
        "cadence": "per job, one-off", "kind": "one_time", "seats": "1 seat",
        "badge": "No subscription",
        "blurb": "One set, read properly. For the contractor bidding the occasional job.",
        "pages_included": 90, "jobs_included": 1, "max_file_mb": 80, "seat_count": 1,
        "overage_per_page": OVERAGE_PER_PAGE, "lookup_key": "gridline_single", "lookup_key_monthly": "",
        "capabilities": [CAP_TAKEOFF, CAP_PDF],
        "features": [
            "1 job, up to 90 pages", "Every room measured, priced and flagged",
            "Editable takeoff + branded takeoff PDF", "Spec-sheet reading included",
            "Quotes, invoicing and payments are NOT included",
        ],
        "highlight": False,
    },
    {
        "id": "crew", "name": "Crew", "price": 199.0, "monthly_price": 249.0,
        "cadence": "per month", "kind": "subscription", "seats": "2 seats",
        "badge": "Most popular",
        "blurb": "The working estimator's plan: bid, quote, invoice and get paid.",
        "pages_included": 400, "jobs_included": 10, "max_file_mb": 120, "seat_count": 2,
        "overage_per_page": OVERAGE_PER_PAGE, "lookup_key": "gridline_crew_annual",
        "lookup_key_monthly": "gridline_crew_monthly",
        "capabilities": [CAP_TAKEOFF, CAP_PDF, CAP_QUOTE, CAP_INVOICE, CAP_CHANGE_ORDER],
        "features": [
            "400 pages / month · 10 jobs / month", "Quotes emailed with the PDF attached",
            "Invoices with a real card checkout", "Change orders with full revision history",
            "2 seats (owner + estimator)", "Overage $0.50 / page — never a hard stop",
        ],
        "highlight": True,
    },
    {
        "id": "pro", "name": "Contractor Pro", "price": 499.0, "monthly_price": 624.0,
        "cadence": "per month", "kind": "subscription", "seats": "5 seats",
        "badge": "Best for multi-family",
        "blurb": "Unlimited jobs, job costing and the unit-template library.",
        "pages_included": 1000, "jobs_included": -1, "max_file_mb": 200, "seat_count": 5,
        "overage_per_page": OVERAGE_PER_PAGE, "lookup_key": "gridline_pro_annual",
        "lookup_key_monthly": "gridline_pro_monthly",
        "capabilities": [CAP_TAKEOFF, CAP_PDF, CAP_QUOTE, CAP_INVOICE, CAP_CHANGE_ORDER,
                         CAP_COSTING, CAP_EXPORT, CAP_TEMPLATES],
        "features": [
            "1,000 pages / month · unlimited jobs", "Everything in Crew",
            "Bid vs actual job costing + expense log", "Unit-template library across buildings",
            "CSV / QuickBooks export", "5 seats with owner / estimator / viewer roles",
        ],
        "highlight": False,
    },
    {
        "id": "agency", "name": "Agency", "price": 999.0, "monthly_price": 1249.0,
        "cadence": "per month", "kind": "subscription", "seats": "15 seats",
        "badge": "Multi-crew",
        "blurb": "Several estimators bidding at once across regions.",
        "pages_included": 2000, "jobs_included": -1, "max_file_mb": 300, "seat_count": 15,
        "overage_per_page": 0.40, "lookup_key": "gridline_agency_annual",
        "lookup_key_monthly": "gridline_agency_monthly",
        "capabilities": [CAP_TAKEOFF, CAP_PDF, CAP_QUOTE, CAP_INVOICE, CAP_CHANGE_ORDER,
                         CAP_COSTING, CAP_EXPORT, CAP_TEMPLATES, CAP_API],
        "features": [
            "2,000 pages / month, pooled across seats", "Everything in Contractor Pro",
            "15 seats · priority blueprint queue", "Shared template + cost-book library",
            "API access", "Overage $0.40 / page",
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

BY_ID = {p["id"]: p for p in PLANS}
DEFAULT_PLAN = "trial"

# What the trade pays elsewhere, for the landing-page comparison.
COMPETITORS = [
    {"name": "PlanSwift", "price": "$1,749 up front + $500/yr", "note": "Manual click-to-measure; no AI reading, no quoting or invoicing."},
    {"name": "STACK", "price": "≈$2,500 / yr per seat", "note": "Cloud takeoff, still manual tracing. Flooring waste/adhesive logic is DIY."},
    {"name": "Togal.AI", "price": "≈$6,000 / yr", "note": "AI area detection for GCs — not flooring-specific, no invoicing."},
    {"name": "Bluebeam Revu", "price": "$260 / yr per seat", "note": "PDF markup tool. You measure every room yourself."},
    {"name": "Gridline Crew", "price": "$199 / mo annual", "note": "AI reads the set, prices it with flooring logic, quotes, invoices and collects."},
]


def plan_for(plan_id: str | None) -> dict:
    return BY_ID.get(plan_id or "", BY_ID[DEFAULT_PLAN])


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
