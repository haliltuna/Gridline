"""Real-world flooring reference data: waste factors, adhesives, labor rates, tax by region."""

# ---------------------------------------------------------------------------
# Floor types. Each entry says:
#   waste               — typical industry overage %
#   adhesive            — the product name that gets printed on quotes
#   coverage_sqft_per_gal — spread rate for that adhesive
#   material            — the industry-average $/sf (used as a fallback when the
#                         installer hasn't set their own rate in the wizard)
#   labor_hr_per_100sqft — RSMeans-style install hours
#   install_methods     — which methods are valid for this product.
#                         "glued"   → adhesive required
#                         "click"   → no adhesive, no underlayment
#                         "floating"→ underlayment only, edges may use adhesive
#   adhesive_required   — per install method: does the bid include adhesive?
# ---------------------------------------------------------------------------

FLOOR_TYPES: dict[str, dict] = {
    "Carpet Tile": {
        "waste": 5,
        "adhesive": "Pressure-sensitive release adhesive",
        "coverage_sqft_per_gal": 250,
        "material": 3.10,
        "labor_hr_per_100sqft": 0.9,
        "install_methods": ["glued"],
        "adhesive_required": {"glued": True},
    },
    "Broadloom Carpet": {
        "waste": 10,
        "adhesive": "Multipurpose carpet adhesive",
        "coverage_sqft_per_gal": 150,
        "material": 2.75,
        "labor_hr_per_100sqft": 1.2,
        "install_methods": ["glued"],
        "adhesive_required": {"glued": True},
    },
    "Luxury Vinyl Plank": {
        "waste": 10,
        "adhesive": "Acrylic LVT adhesive",
        "coverage_sqft_per_gal": 200,
        "material": 3.85,
        "labor_hr_per_100sqft": 1.3,
        "install_methods": ["glued", "click"],
        "adhesive_required": {"glued": True, "click": False},
    },
    "Luxury Vinyl Tile": {
        "waste": 8,
        "adhesive": "Acrylic LVT adhesive",
        "coverage_sqft_per_gal": 200,
        "material": 3.60,
        "labor_hr_per_100sqft": 1.3,
        "install_methods": ["glued", "click"],
        "adhesive_required": {"glued": True, "click": False},
    },
    "Sheet Vinyl": {
        "waste": 12,
        "adhesive": "Epoxy sheet-vinyl adhesive",
        "coverage_sqft_per_gal": 180,
        "material": 2.40,
        "labor_hr_per_100sqft": 1.1,
        "install_methods": ["glued"],
        "adhesive_required": {"glued": True},
    },
    "Ceramic Tile": {
        "waste": 10,
        "adhesive": "Modified thin-set mortar",
        "coverage_sqft_per_gal": 95,
        "material": 4.20,
        "labor_hr_per_100sqft": 2.4,
        "install_methods": ["glued"],
        "adhesive_required": {"glued": True},
    },
    "Porcelain Tile": {
        "waste": 10,
        "adhesive": "Large-format modified thin-set",
        "coverage_sqft_per_gal": 90,
        "material": 5.10,
        "labor_hr_per_100sqft": 2.6,
        "install_methods": ["glued"],
        "adhesive_required": {"glued": True},
    },
    "Natural Stone": {
        "waste": 15,
        "adhesive": "White polymer-modified thin-set",
        "coverage_sqft_per_gal": 85,
        "material": 9.50,
        "labor_hr_per_100sqft": 3.1,
        "install_methods": ["glued"],
        "adhesive_required": {"glued": True},
    },
    "Engineered Hardwood": {
        "waste": 10,
        "adhesive": "Urethane wood-flooring adhesive",
        "coverage_sqft_per_gal": 60,
        "material": 6.40,
        "labor_hr_per_100sqft": 1.8,
        "install_methods": ["glued", "floating", "click"],
        "adhesive_required": {"glued": True, "floating": False, "click": False},
    },
    "Solid Hardwood": {
        "waste": 12,
        "adhesive": "Urethane wood-flooring adhesive",
        "coverage_sqft_per_gal": 55,
        "material": 7.80,
        "labor_hr_per_100sqft": 2.2,
        "install_methods": ["glued", "floating"],
        "adhesive_required": {"glued": True, "floating": False},
    },
    "Rubber / Sport": {
        "waste": 8,
        "adhesive": "Two-part epoxy rubber adhesive",
        "coverage_sqft_per_gal": 160,
        "material": 5.60,
        "labor_hr_per_100sqft": 1.5,
        "install_methods": ["glued", "click"],
        "adhesive_required": {"glued": True, "click": False},
    },
    "Epoxy / Resinous": {
        "waste": 6,
        "adhesive": "Self-priming epoxy base coat",
        "coverage_sqft_per_gal": 120,
        "material": 4.80,
        "labor_hr_per_100sqft": 1.7,
        "install_methods": ["glued"],
        "adhesive_required": {"glued": True},
    },
}

FLOOR_TYPE_NAMES = list(FLOOR_TYPES)
DEFAULT_LABOR_RATE = 58.0
DEFAULT_INSTALL_METHOD = "glued"


def defaults_for(floor_type: str) -> dict:
    return FLOOR_TYPES.get(floor_type, FLOOR_TYPES["Luxury Vinyl Plank"])


def install_methods_for(floor_type: str) -> list[str]:
    """Which install methods this floor type supports. Falls back to glued."""
    return list(defaults_for(floor_type).get("install_methods") or ["glued"])


def adhesive_required(floor_type: str, install_method: str | None = None) -> bool:
    """Does this floor type, installed this way, need adhesive billed on the quote?

    If install_method is None, we assume the floor type's primary method (the first
    in its install_methods list) — that keeps every existing call site working.
    """
    ft = defaults_for(floor_type)
    method = install_method or (ft.get("install_methods") or ["glued"])[0]
    return bool((ft.get("adhesive_required") or {}).get(method, method == "glued"))


def adhesive_gallons(floor_type: str, sqft_with_waste: float,
                     install_method: str | None = None) -> float:
    """Gallons of adhesive for this square footage.

    Returns 0.0 for methods that don't use adhesive (click-lock, floating).
    When install_method is None, we use the floor type's primary method —
    which preserves the old behaviour for any caller that hasn't been updated.
    """
    if not adhesive_required(floor_type, install_method):
        return 0.0
    cov = defaults_for(floor_type)["coverage_sqft_per_gal"]
    return round(sqft_with_waste / cov, 2) if cov else 0.0


# country -> (label, default rate %, regions{region: (label, rate)})
TAX_TABLE: dict[str, dict] = {
    "United States": {"label": "Sales Tax", "rate": 6.0, "regions": {
        "California": ("Sales Tax", 7.25), "Texas": ("Sales Tax", 6.25), "New York": ("Sales Tax", 4.0),
        "Florida": ("Sales Tax", 6.0), "Illinois": ("Sales Tax", 6.25), "Washington": ("Sales Tax", 6.5),
        "Colorado": ("Sales Tax", 2.9), "Arizona": ("Sales Tax", 5.6), "Georgia": ("Sales Tax", 4.0),
        "Oregon": ("Sales Tax", 0.0),
    }},
    "Canada": {"label": "GST", "rate": 5.0, "regions": {
        "Ontario": ("HST", 13.0), "British Columbia": ("GST + PST", 12.0), "Alberta": ("GST", 5.0),
        "Quebec": ("GST + QST", 14.975), "Nova Scotia": ("HST", 14.0), "New Brunswick": ("HST", 15.0),
        "Manitoba": ("GST + PST", 12.0), "Saskatchewan": ("GST + PST", 11.0),
    }},
    "United Kingdom": {"label": "VAT", "rate": 20.0, "regions": {}},
    "Australia": {"label": "GST", "rate": 10.0, "regions": {}},
    "Ireland": {"label": "VAT", "rate": 23.0, "regions": {}},
    "New Zealand": {"label": "GST", "rate": 15.0, "regions": {}},
}


# Pricing scope per line. A contractor bids the same room three different ways.
SCOPES = {
    "supply_install": "Supply & Install",
    "accessory": "Accessory (count x price)",
    "install_only": "Install Only (labor)",
    "supply_only": "Supply Only (material)",
    "misc": "Miscellaneous",
}

# Miscellaneous work is priced as a flat amount, not off square footage.
MISC_PRESETS = [
    "Floor prep / grinding",
    "Self-leveling underlayment",
    "Demo & haul-away of existing floor",
    "Moisture barrier / sealer",
    "Transition strips & trims",
    "Cove base",
    "Stair nosing",
    "Furniture move / protection",
    "Mobilization",
]


def scope_label(scope: str) -> str:
    return SCOPES.get(scope, SCOPES["supply_install"])


def detect_tax(country: str, region: str | None) -> tuple[str, float]:
    entry = TAX_TABLE.get(country)
    if not entry:
        return ("Sales Tax", 0.0)
    if region and region in entry["regions"]:
        return entry["regions"][region]
    return (entry["label"], entry["rate"])


# Accessories the AI counts instead of measuring: door openings become transition strips,
# stair treads become nosings. Each is priced per piece, with its own install minutes.
ACCESSORIES: dict[str, dict] = {
    "transition": {"label": "Transition strips", "unit": "door",
                   "unit_price": 18.0, "labor_hr_each": 0.2},
    "nosing": {"label": "Stair nosings (steps)", "unit": "step",
               "unit_price": 42.0, "labor_hr_each": 0.45},
    "cove_base": {"label": "Cove base", "unit": "lf", "unit_price": 3.4, "labor_hr_each": 0.02},
    # Tile edge profile / trim (Schluter-style) wherever tile meets another finish or turns a corner.
    "tile_profile": {"label": "Tile edge profile / trim", "unit": "lf",
                     "unit_price": 9.5, "labor_hr_each": 0.06},
}

ACCESSORY_KINDS = list(ACCESSORIES)

# Which AI count feeds which accessory, and the settings key holding the account's own price.
ACCESSORY_SOURCES: dict[str, dict] = {
    "transition": {"count_field": "doors", "price_key": "acc_transition_price",
                   "room": "Transition strips"},
    "nosing": {"count_field": "steps", "price_key": "acc_nosing_price",
               "room": "Stair nosings — steps"},
    "cove_base": {"count_field": "cove_base_lf", "price_key": "acc_cove_base_price",
                  "room": "Cove base — wall linear feet"},
    "tile_profile": {"count_field": "tile_profile_lf", "price_key": "acc_tile_profile_price",
                     "room": "Tile edge profiles — linear feet"},
}


def accessory_defaults(kind: str) -> dict:
    return ACCESSORIES.get(kind, ACCESSORIES["transition"])


# ---------------------------------------------------------------------------
# Extra work — billed as misc lines (a flat amount), never as hourly labor.
# The wizard lets the installer opt into which of these they bill for.
# ---------------------------------------------------------------------------

EXTRA_WORK_PRESETS: list[dict] = [
    {"id": "floor_prep",   "label": "Floor prep / grinding",
     "default_price_per_sqft": 0.75, "unit": "sf"},
    {"id": "self_level",   "label": "Self-leveling underlayment",
     "default_price_per_sqft": 1.85, "unit": "sf"},
    {"id": "demo",         "label": "Demo & haul-away of existing floor",
     "default_price_per_sqft": 1.10, "unit": "sf"},
    {"id": "moisture",     "label": "Moisture barrier / sealer",
     "default_price_per_sqft": 0.55, "unit": "sf"},
    {"id": "furniture",    "label": "Furniture move / protection",
     "default_price_per_sqft": 0.35, "unit": "sf"},
    {"id": "mobilization", "label": "Mobilization",
     "default_price_per_sqft": 0.25, "unit": "sf"},
]

EXTRA_WORK_IDS = [item["id"] for item in EXTRA_WORK_PRESETS]


def extra_work_defaults() -> dict[str, dict]:
    return {item["id"]: item for item in EXTRA_WORK_PRESETS}