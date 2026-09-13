"""Real-world flooring reference data: waste factors, adhesives, labor rates, tax by region."""

# 12 covered floor types. waste = typical industry overage; labor_hours_per_sqft from RSMeans-style averages.
FLOOR_TYPES: dict[str, dict] = {
    "Carpet Tile": {"waste": 5, "adhesive": "Pressure-sensitive release adhesive", "coverage_sqft_per_gal": 250, "material": 3.10, "labor_hr_per_100sqft": 0.9},
    "Broadloom Carpet": {"waste": 10, "adhesive": "Multipurpose carpet adhesive", "coverage_sqft_per_gal": 150, "material": 2.75, "labor_hr_per_100sqft": 1.2},
    "Luxury Vinyl Plank": {"waste": 10, "adhesive": "Acrylic LVT adhesive", "coverage_sqft_per_gal": 200, "material": 3.85, "labor_hr_per_100sqft": 1.3},
    "Luxury Vinyl Tile": {"waste": 8, "adhesive": "Acrylic LVT adhesive", "coverage_sqft_per_gal": 200, "material": 3.60, "labor_hr_per_100sqft": 1.3},
    "Sheet Vinyl": {"waste": 12, "adhesive": "Epoxy sheet-vinyl adhesive", "coverage_sqft_per_gal": 180, "material": 2.40, "labor_hr_per_100sqft": 1.1},
    "Ceramic Tile": {"waste": 10, "adhesive": "Modified thin-set mortar", "coverage_sqft_per_gal": 95, "material": 4.20, "labor_hr_per_100sqft": 2.4},
    "Porcelain Tile": {"waste": 10, "adhesive": "Large-format modified thin-set", "coverage_sqft_per_gal": 90, "material": 5.10, "labor_hr_per_100sqft": 2.6},
    "Natural Stone": {"waste": 15, "adhesive": "White polymer-modified thin-set", "coverage_sqft_per_gal": 85, "material": 9.50, "labor_hr_per_100sqft": 3.1},
    "Engineered Hardwood": {"waste": 10, "adhesive": "Urethane wood-flooring adhesive", "coverage_sqft_per_gal": 60, "material": 6.40, "labor_hr_per_100sqft": 1.8},
    "Solid Hardwood": {"waste": 12, "adhesive": "Urethane wood-flooring adhesive", "coverage_sqft_per_gal": 55, "material": 7.80, "labor_hr_per_100sqft": 2.2},
    "Rubber / Sport": {"waste": 8, "adhesive": "Two-part epoxy rubber adhesive", "coverage_sqft_per_gal": 160, "material": 5.60, "labor_hr_per_100sqft": 1.5},
    "Epoxy / Resinous": {"waste": 6, "adhesive": "Self-priming epoxy base coat", "coverage_sqft_per_gal": 120, "material": 4.80, "labor_hr_per_100sqft": 1.7},
}

FLOOR_TYPE_NAMES = list(FLOOR_TYPES)
DEFAULT_LABOR_RATE = 58.0


def defaults_for(floor_type: str) -> dict:
    return FLOOR_TYPES.get(floor_type, FLOOR_TYPES["Luxury Vinyl Plank"])


def adhesive_gallons(floor_type: str, sqft_with_waste: float) -> float:
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
