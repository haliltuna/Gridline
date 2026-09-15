"""Real-world flooring reference data: floor types, regional install rates, extras, tax.

Each floor type is ONE product at ONE install method. Click Vinyl Plank and Glue Down
Vinyl Plank are separate entries even though both are vinyl — they're different products
to an installer, with different rates, different adhesive rules, and different names on
a quote.

Regional rates live in REGIONAL_RATES, keyed country -> region -> floor type.
Installers override them in the wizard. Everything else in the app reads through
rate_for() and range_for() so there is one place that decides "what does this cost".
"""

# ---------------------------------------------------------------------------
# Floor types — one method each. The fallback rates here are used only when the
# installer's country/region has no entry in REGIONAL_RATES.
# ---------------------------------------------------------------------------

FLOOR_TYPES: dict[str, dict] = {
    # --- Vinyl -------------------------------------------------------------
    "Click Vinyl Plank": {
        "waste": 10,
        "adhesive": "",
        "coverage_sqft_per_gal": 0,
        "material": 3.00,
        "install_fallback": 1.55,
        "labor_hr_per_100sqft": 1.3,
        "adhesive_required": False,
        "family": "vinyl",
    },
    "Click Vinyl Tile": {
        "waste": 10,
        "adhesive": "",
        "coverage_sqft_per_gal": 0,
        "material": 3.00,
        "install_fallback": 1.55,
        "labor_hr_per_100sqft": 1.3,
        "adhesive_required": False,
        "family": "vinyl",
    },
    "Glue Down Vinyl Plank": {
        "waste": 8,
        "adhesive": "Acrylic LVT adhesive",
        "coverage_sqft_per_gal": 200,
        "material": 2.00,
        "install_fallback": 1.00,
        "labor_hr_per_100sqft": 1.1,
        "adhesive_required": True,
        "primer_optional": True,
        "family": "vinyl",
    },
    "Glue Down Vinyl Tile": {
        "waste": 8,
        "adhesive": "Acrylic LVT adhesive",
        "coverage_sqft_per_gal": 200,
        "material": 2.00,
        "install_fallback": 1.00,
        "labor_hr_per_100sqft": 1.1,
        "adhesive_required": True,
        "primer_optional": True,
        "family": "vinyl",
    },
    "Sheet Vinyl": {
        "waste": 12,
        "adhesive": "Epoxy sheet-vinyl adhesive",
        "coverage_sqft_per_gal": 180,
        "material": 2.40,
        "install_fallback": 1.10,
        "labor_hr_per_100sqft": 1.1,
        "adhesive_required": True,
        "family": "vinyl",
    },
    # --- Laminate ----------------------------------------------------------
    "Laminate": {
        "waste": 10,
        "adhesive": "",
        "coverage_sqft_per_gal": 0,
        "material": 3.00,
        "install_fallback": 1.55,
        "labor_hr_per_100sqft": 1.2,
        "adhesive_required": False,
        "family": "laminate",
    },
    # --- Hardwood ----------------------------------------------------------
    "Engineered Hardwood — Nail": {
        "waste": 12,
        "adhesive": "",
        "coverage_sqft_per_gal": 0,
        "material": 7.00,
        "install_fallback": 2.75,
        "labor_hr_per_100sqft": 1.8,
        "adhesive_required": False,
        "family": "engineered",
    },
    "Engineered Hardwood — Glue Assist": {
        "waste": 12,
        "adhesive": "Urethane wood-flooring adhesive",
        "coverage_sqft_per_gal": 60,
        "material": 7.00,
        "install_fallback": 3.75,
        "labor_hr_per_100sqft": 1.9,
        "adhesive_required": True,
        "family": "engineered",
    },
    "Engineered Hardwood — Full Glue": {
        "waste": 12,
        "adhesive": "Urethane wood-flooring adhesive",
        "coverage_sqft_per_gal": 60,
        "material": 7.00,
        "install_fallback": 4.00,
        "labor_hr_per_100sqft": 2.0,
        "adhesive_required": True,
        "family": "engineered",
    },
    "Solid Hardwood — Nail": {
        "waste": 12,
        "adhesive": "",
        "coverage_sqft_per_gal": 0,
        "material": 8.00,
        "install_fallback": 2.75,
        "labor_hr_per_100sqft": 2.2,
        "adhesive_required": False,
        "family": "solid",
    },
    "Solid Hardwood — Glue Assist": {
        "waste": 12,
        "adhesive": "Urethane wood-flooring adhesive",
        "coverage_sqft_per_gal": 55,
        "material": 8.00,
        "install_fallback": 3.75,
        "labor_hr_per_100sqft": 2.3,
        "adhesive_required": True,
        "family": "solid",
    },
    "Solid Hardwood — Full Glue": {
        "waste": 12,
        "adhesive": "Urethane wood-flooring adhesive",
        "coverage_sqft_per_gal": 55,
        "material": 8.00,
        "install_fallback": 4.00,
        "labor_hr_per_100sqft": 2.4,
        "adhesive_required": True,
        "family": "solid",
    },
    # --- Tile / stone ------------------------------------------------------
    "Ceramic Tile": {
        "waste": 10,
        "adhesive": "Modified thin-set mortar",
        "coverage_sqft_per_gal": 95,
        "material": 5.00,
        "install_fallback": 4.50,
        "labor_hr_per_100sqft": 2.4,
        "adhesive_required": True,
        "family": "tile",
    },
    "Porcelain Tile": {
        "waste": 12,
        "adhesive": "Large-format modified thin-set",
        "coverage_sqft_per_gal": 90,
        "material": 5.00,
        "install_fallback": 7.25,
        "labor_hr_per_100sqft": 2.6,
        "adhesive_required": True,
        "family": "tile",
    },
    "Slab Tile / Stone": {
        "waste": 15,
        "adhesive": "White polymer-modified thin-set",
        "coverage_sqft_per_gal": 85,
        "material": 5.00,
        "install_fallback": 11.00,
        "labor_hr_per_100sqft": 3.1,
        "adhesive_required": True,
        "family": "tile",
    },
    "Natural Stone": {
        "waste": 15,
        "adhesive": "White polymer-modified thin-set",
        "coverage_sqft_per_gal": 85,
        "material": 9.50,
        "install_fallback": 11.00,
        "labor_hr_per_100sqft": 3.1,
        "adhesive_required": True,
        "family": "stone",
    },
    # --- Soft surface ------------------------------------------------------
    "Broadloom Carpet": {
        "waste": 10,
        "adhesive": "Multipurpose carpet adhesive",
        "coverage_sqft_per_gal": 150,
        "material": 3.00,
        "install_fallback": 0.61,
        "labor_hr_per_100sqft": 1.2,
        "adhesive_required": True,
        "includes": ["underpad", "tackless"],
        "family": "carpet",
    },
    "Carpet Tile": {
        "waste": 5,
        "adhesive": "Pressure-sensitive release adhesive",
        "coverage_sqft_per_gal": 250,
        "material": 3.00,
        "install_fallback": 0.75,
        "labor_hr_per_100sqft": 0.9,
        "adhesive_required": True,
        "family": "carpet",
    },
    # --- Specialty ---------------------------------------------------------
    "Rubber / Sport": {
        "waste": 8,
        "adhesive": "Two-part epoxy rubber adhesive",
        "coverage_sqft_per_gal": 160,
        "material": 5.60,
        "install_fallback": 1.50,
        "labor_hr_per_100sqft": 1.5,
        "adhesive_required": True,
        "family": "rubber",
    },
    "Epoxy / Resinous": {
        "waste": 6,
        "adhesive": "Self-priming epoxy base coat",
        "coverage_sqft_per_gal": 120,
        "material": 4.80,
        "install_fallback": 2.50,
        "labor_hr_per_100sqft": 1.7,
        "adhesive_required": True,
        "family": "resinous",
    },
}

FLOOR_TYPE_NAMES = list(FLOOR_TYPES)
DEFAULT_LABOR_RATE = 58.0


# ---------------------------------------------------------------------------
# Regional rate tables — country code -> region code -> floor type
# Rates are $/sf. Ranges are hints shown under the field in the wizard.
# Every floor type from FLOOR_TYPES should appear in a region block; anything
# missing falls back to FLOOR_TYPES's material / install_fallback.
# ---------------------------------------------------------------------------

REGIONAL_RATES: dict[str, dict[str, dict[str, dict]]] = {
    "CA": {
        "AB": {   # Alberta
            "Click Vinyl Plank":               {"material": 3.00, "material_range": [2.50, 3.50], "install": 1.55, "install_range": [1.35, 1.75]},
            "Click Vinyl Tile":                {"material": 3.00, "material_range": [2.50, 3.50], "install": 1.55, "install_range": [1.35, 1.75]},
            "Glue Down Vinyl Plank":           {"material": 2.00, "material_range": [1.50, 2.50], "install": 1.00, "install_range": [0.90, 1.10]},
            "Glue Down Vinyl Tile":            {"material": 2.00, "material_range": [1.50, 2.50], "install": 1.00, "install_range": [0.90, 1.10]},
            "Sheet Vinyl":                     {"material": 2.40, "material_range": [2.00, 3.00], "install": 1.10, "install_range": [1.00, 1.25]},
            "Laminate":                        {"material": 3.00, "material_range": [2.50, 3.50], "install": 1.55, "install_range": [1.35, 1.75]},
            "Engineered Hardwood — Nail":      {"material": 7.00, "material_range": [6.00, 8.50], "install": 2.75, "install_range": [2.50, 3.00]},
            "Engineered Hardwood — Glue Assist":{"material": 7.00, "material_range": [6.00, 8.50], "install": 3.75, "install_range": [3.50, 4.00]},
            "Engineered Hardwood — Full Glue": {"material": 7.00, "material_range": [6.00, 8.50], "install": 4.00, "install_range": [3.75, 4.25]},
            "Solid Hardwood — Nail":           {"material": 8.00, "material_range": [7.00, 9.50], "install": 2.75, "install_range": [2.50, 3.00]},
            "Solid Hardwood — Glue Assist":    {"material": 8.00, "material_range": [7.00, 9.50], "install": 3.75, "install_range": [3.50, 4.00]},
            "Solid Hardwood — Full Glue":      {"material": 8.00, "material_range": [7.00, 9.50], "install": 4.00, "install_range": [3.75, 4.25]},
            "Ceramic Tile":                    {"material": 5.00, "material_range": [4.00, 6.50], "install": 4.50, "install_range": [4.00, 5.00]},
            "Porcelain Tile":                  {"material": 5.00, "material_range": [4.00, 6.50], "install": 7.25, "install_range": [6.50, 8.00]},
            "Slab Tile / Stone":               {"material": 5.00, "material_range": [4.00, 7.00], "install": 11.00, "install_range": [10.00, 12.00]},
            "Natural Stone":                   {"material": 9.50, "material_range": [8.00, 12.00], "install": 11.00, "install_range": [10.00, 12.00]},
            "Broadloom Carpet":                {"material": 3.00, "material_range": [2.50, 3.50], "install": 0.61, "install_range": [0.55, 0.70], "install_per_sqyd": 5.50},
            "Carpet Tile":                     {"material": 3.00, "material_range": [2.50, 3.50], "install": 0.75, "install_range": [0.50, 1.00]},
            "Rubber / Sport":                  {"material": 5.60, "material_range": [4.50, 7.00], "install": 1.50, "install_range": [1.25, 1.75]},
            "Epoxy / Resinous":                {"material": 4.80, "material_range": [4.00, 6.00], "install": 2.50, "install_range": [2.00, 3.00]},
        },
        "ON": {   # Ontario — provincial averages, adjust as real data comes in
            "Click Vinyl Plank":               {"material": 3.25, "material_range": [2.75, 4.00], "install": 1.75, "install_range": [1.50, 2.00]},
            "Click Vinyl Tile":                {"material": 3.25, "material_range": [2.75, 4.00], "install": 1.75, "install_range": [1.50, 2.00]},
            "Glue Down Vinyl Plank":           {"material": 2.25, "material_range": [1.75, 2.75], "install": 1.15, "install_range": [1.00, 1.30]},
            "Glue Down Vinyl Tile":            {"material": 2.25, "material_range": [1.75, 2.75], "install": 1.15, "install_range": [1.00, 1.30]},
            "Sheet Vinyl":                     {"material": 2.60, "material_range": [2.10, 3.25], "install": 1.25, "install_range": [1.10, 1.40]},
            "Laminate":                        {"material": 3.25, "material_range": [2.75, 4.00], "install": 1.75, "install_range": [1.50, 2.00]},
            "Engineered Hardwood — Nail":      {"material": 7.25, "material_range": [6.25, 8.75], "install": 3.00, "install_range": [2.75, 3.25]},
            "Engineered Hardwood — Glue Assist":{"material": 7.25, "material_range": [6.25, 8.75], "install": 4.25, "install_range": [3.75, 4.75]},
            "Engineered Hardwood — Full Glue": {"material": 7.25, "material_range": [6.25, 8.75], "install": 4.75, "install_range": [4.25, 5.25]},
            "Solid Hardwood — Nail":           {"material": 8.25, "material_range": [7.25, 9.75], "install": 3.00, "install_range": [2.75, 3.25]},
            "Solid Hardwood — Glue Assist":    {"material": 8.25, "material_range": [7.25, 9.75], "install": 4.25, "install_range": [3.75, 4.75]},
            "Solid Hardwood — Full Glue":      {"material": 8.25, "material_range": [7.25, 9.75], "install": 4.75, "install_range": [4.25, 5.25]},
            "Ceramic Tile":                    {"material": 5.25, "material_range": [4.25, 6.75], "install": 5.00, "install_range": [4.50, 5.75]},
            "Porcelain Tile":                  {"material": 5.25, "material_range": [4.25, 6.75], "install": 7.75, "install_range": [7.00, 8.75]},
            "Slab Tile / Stone":               {"material": 5.25, "material_range": [4.25, 7.25], "install": 11.50, "install_range": [10.50, 12.50]},
            "Natural Stone":                   {"material": 9.75, "material_range": [8.25, 12.25], "install": 11.50, "install_range": [10.50, 12.50]},
            "Broadloom Carpet":                {"material": 3.25, "material_range": [2.75, 3.75], "install": 0.70, "install_range": [0.60, 0.80]},
            "Carpet Tile":                     {"material": 3.25, "material_range": [2.75, 3.75], "install": 0.85, "install_range": [0.60, 1.10]},
            "Rubber / Sport":                  {"material": 5.85, "material_range": [4.75, 7.25], "install": 1.75, "install_range": [1.50, 2.00]},
            "Epoxy / Resinous":                {"material": 5.00, "material_range": [4.25, 6.25], "install": 2.75, "install_range": [2.25, 3.25]},
        },
        "BC": {   # British Columbia
            "Click Vinyl Plank":               {"material": 3.50, "material_range": [3.00, 4.25], "install": 1.90, "install_range": [1.60, 2.20]},
            "Click Vinyl Tile":                {"material": 3.50, "material_range": [3.00, 4.25], "install": 1.90, "install_range": [1.60, 2.20]},
            "Glue Down Vinyl Plank":           {"material": 2.40, "material_range": [1.90, 2.90], "install": 1.25, "install_range": [1.10, 1.40]},
            "Glue Down Vinyl Tile":            {"material": 2.40, "material_range": [1.90, 2.90], "install": 1.25, "install_range": [1.10, 1.40]},
            "Sheet Vinyl":                     {"material": 2.75, "material_range": [2.25, 3.50], "install": 1.30, "install_range": [1.15, 1.50]},
            "Laminate":                        {"material": 3.50, "material_range": [3.00, 4.25], "install": 1.90, "install_range": [1.60, 2.20]},
            "Engineered Hardwood — Nail":      {"material": 7.50, "material_range": [6.50, 9.00], "install": 3.25, "install_range": [3.00, 3.50]},
            "Engineered Hardwood — Glue Assist":{"material": 7.50, "material_range": [6.50, 9.00], "install": 4.50, "install_range": [4.00, 5.00]},
            "Engineered Hardwood — Full Glue": {"material": 7.50, "material_range": [6.50, 9.00], "install": 5.00, "install_range": [4.50, 5.50]},
            "Solid Hardwood — Nail":           {"material": 8.50, "material_range": [7.50, 10.00], "install": 3.25, "install_range": [3.00, 3.50]},
            "Solid Hardwood — Glue Assist":    {"material": 8.50, "material_range": [7.50, 10.00], "install": 4.50, "install_range": [4.00, 5.00]},
            "Solid Hardwood — Full Glue":      {"material": 8.50, "material_range": [7.50, 10.00], "install": 5.00, "install_range": [4.50, 5.50]},
            "Ceramic Tile":                    {"material": 5.50, "material_range": [4.50, 7.00], "install": 5.25, "install_range": [4.75, 6.00]},
            "Porcelain Tile":                  {"material": 5.50, "material_range": [4.50, 7.00], "install": 8.25, "install_range": [7.50, 9.25]},
            "Slab Tile / Stone":               {"material": 5.50, "material_range": [4.50, 7.50], "install": 12.00, "install_range": [11.00, 13.00]},
            "Natural Stone":                   {"material": 10.00, "material_range": [8.50, 12.50], "install": 12.00, "install_range": [11.00, 13.00]},
            "Broadloom Carpet":                {"material": 3.50, "material_range": [3.00, 4.00], "install": 0.75, "install_range": [0.65, 0.85]},
            "Carpet Tile":                     {"material": 3.50, "material_range": [3.00, 4.00], "install": 0.90, "install_range": [0.65, 1.15]},
            "Rubber / Sport":                  {"material": 6.00, "material_range": [5.00, 7.50], "install": 1.85, "install_range": [1.60, 2.10]},
            "Epoxy / Resinous":                {"material": 5.25, "material_range": [4.50, 6.50], "install": 2.85, "install_range": [2.40, 3.30]},
        },
    },
    "US": {
        "DEFAULT": {   # US national averages — used when no state-specific data exists
            "Click Vinyl Plank":               {"material": 3.85, "material_range": [3.00, 4.75], "install": 2.25, "install_range": [2.00, 2.50]},
            "Click Vinyl Tile":                {"material": 3.85, "material_range": [3.00, 4.75], "install": 2.25, "install_range": [2.00, 2.50]},
            "Glue Down Vinyl Plank":           {"material": 2.50, "material_range": [2.00, 3.00], "install": 1.25, "install_range": [1.00, 1.50]},
            "Glue Down Vinyl Tile":            {"material": 2.50, "material_range": [2.00, 3.00], "install": 1.25, "install_range": [1.00, 1.50]},
            "Sheet Vinyl":                     {"material": 2.40, "material_range": [1.75, 3.00], "install": 1.40, "install_range": [1.10, 1.75]},
            "Laminate":                        {"material": 2.75, "material_range": [2.25, 3.50], "install": 2.00, "install_range": [1.75, 2.25]},
            "Engineered Hardwood — Nail":      {"material": 6.40, "material_range": [5.50, 7.75], "install": 3.75, "install_range": [3.25, 4.25]},
            "Engineered Hardwood — Glue Assist":{"material": 6.40, "material_range": [5.50, 7.75], "install": 4.75, "install_range": [4.25, 5.25]},
            "Engineered Hardwood — Full Glue": {"material": 6.40, "material_range": [5.50, 7.75], "install": 5.25, "install_range": [4.75, 5.75]},
            "Solid Hardwood — Nail":           {"material": 7.80, "material_range": [6.50, 9.25], "install": 3.75, "install_range": [3.25, 4.25]},
            "Solid Hardwood — Glue Assist":    {"material": 7.80, "material_range": [6.50, 9.25], "install": 4.75, "install_range": [4.25, 5.25]},
            "Solid Hardwood — Full Glue":      {"material": 7.80, "material_range": [6.50, 9.25], "install": 5.25, "install_range": [4.75, 5.75]},
            "Ceramic Tile":                    {"material": 4.20, "material_range": [3.25, 5.50], "install": 6.00, "install_range": [5.00, 7.50]},
            "Porcelain Tile":                  {"material": 5.10, "material_range": [4.00, 6.50], "install": 7.50, "install_range": [6.50, 9.00]},
            "Slab Tile / Stone":               {"material": 5.00, "material_range": [4.00, 7.00], "install": 12.00, "install_range": [10.00, 14.00]},
            "Natural Stone":                   {"material": 9.50, "material_range": [8.00, 12.00], "install": 12.00, "install_range": [10.00, 14.00]},
            "Broadloom Carpet":                {"material": 2.75, "material_range": [2.25, 3.50], "install": 0.55, "install_range": [0.45, 0.65]},
            "Carpet Tile":                     {"material": 3.10, "material_range": [2.50, 3.75], "install": 0.80, "install_range": [0.50, 1.10]},
            "Rubber / Sport":                  {"material": 5.60, "material_range": [4.50, 7.00], "install": 1.75, "install_range": [1.50, 2.00]},
            "Epoxy / Resinous":                {"material": 4.80, "material_range": [4.00, 6.00], "install": 3.00, "install_range": [2.50, 3.75]},
        },
    },
}


# ---------------------------------------------------------------------------
# Pattern multipliers — apply to INSTALL rate only, on top of the base rate
# ---------------------------------------------------------------------------

PATTERN_MULTIPLIERS: dict[str, dict] = {
    "standard":    {"label": "Standard (straight lay)", "multiplier": 1.00},
    "diagonal":    {"label": "Diagonal (45°)",          "multiplier": 1.25},
    "herringbone": {"label": "Herringbone / chevron",   "multiplier": 2.00},
    "border":      {"label": "Border / inlay",          "multiplier": 1.35},
}


# ---------------------------------------------------------------------------
# Extra work — optional, never auto-charged.
# type "per_sqft" → rate x job sq ft. type "flat" → fixed amount.
# install_only True means the rate covers labour + consumables only,
# material is supplied separately and not included.
# ---------------------------------------------------------------------------

EXTRA_WORK_PRESETS: dict[str, dict] = {
    "primer":       {"label": "Primer / bonding agent",      "type": "per_sqft", "rate": 0.18, "install_only": True},
    "self_level":   {"label": "Self-leveling underlayment",  "type": "per_sqft", "rate": 1.85, "install_only": True},
    "floor_prep":   {"label": "Floor prep / grinding",       "type": "per_sqft", "rate": 0.75, "install_only": True},
    "moisture":     {"label": "Moisture barrier / sealer",   "type": "per_sqft", "rate": 0.55, "install_only": True},
    "demo":         {"label": "Demo & haul-away",            "type": "flat",     "amount": 500.00},
    "furniture":    {"label": "Furniture move / protection", "type": "per_sqft", "rate": 0.35, "install_only": True},
    "mobilization": {"label": "Mobilization",                "type": "flat",     "amount": 0.00},
}

EXTRA_WORK_IDS = list(EXTRA_WORK_PRESETS)


# ---------------------------------------------------------------------------
# Tax table
# ---------------------------------------------------------------------------

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


# Country name → ISO code used by REGIONAL_RATES
COUNTRY_CODES = {
    "Canada": "CA",
    "United States": "US",
}

# Province / state name → region code used by REGIONAL_RATES
REGION_CODES = {
    "Alberta": "AB",
    "Ontario": "ON",
    "British Columbia": "BC",
}


# ---------------------------------------------------------------------------
# Scopes
# ---------------------------------------------------------------------------

SCOPES = {
    "supply_install": "Supply & Install",
    "accessory": "Accessory (count x price)",
    "install_only": "Install Only (labor)",
    "supply_only": "Supply Only (material)",
    "misc": "Miscellaneous",
}

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


# ---------------------------------------------------------------------------
# Accessories
# ---------------------------------------------------------------------------

ACCESSORIES: dict[str, dict] = {
    "transition": {"label": "Transition strips", "unit": "door",
                   "unit_price": 18.0, "labor_hr_each": 0.2},
    "nosing": {"label": "Stair nosings (steps)", "unit": "step",
               "unit_price": 42.0, "labor_hr_each": 0.45},
    "cove_base": {"label": "Cove base", "unit": "lf", "unit_price": 3.4, "labor_hr_each": 0.02},
    "tile_profile": {"label": "Tile edge profile / trim", "unit": "lf",
                     "unit_price": 9.5, "labor_hr_each": 0.06},
}

ACCESSORY_KINDS = list(ACCESSORIES)

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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def defaults_for(floor_type: str) -> dict:
    return FLOOR_TYPES.get(floor_type, FLOOR_TYPES["Click Vinyl Plank"])


def adhesive_required(floor_type: str) -> bool:
    """Whether this floor type needs adhesive billed on the quote."""
    return bool(defaults_for(floor_type).get("adhesive_required", True))


def adhesive_gallons(floor_type: str, sqft_with_waste: float) -> float:
    """Gallons of adhesive for this square footage. Zero when the floor type doesn't use any."""
    if not adhesive_required(floor_type):
        return 0.0
    cov = defaults_for(floor_type).get("coverage_sqft_per_gal") or 0
    return round(sqft_with_waste / cov, 2) if cov else 0.0


def scope_label(scope: str) -> str:
    return SCOPES.get(scope, SCOPES["supply_install"])


def detect_tax(country: str, region: str | None) -> tuple[str, float]:
    entry = TAX_TABLE.get(country)
    if not entry:
        return ("Sales Tax", 0.0)
    if region and region in entry["regions"]:
        return entry["regions"][region]
    return (entry["label"], entry["rate"])


def accessory_defaults(kind: str) -> dict:
    return ACCESSORIES.get(kind, ACCESSORIES["transition"])


def _region_entry(country: str, region: str, floor_type: str) -> dict | None:
    """Look up a floor type in the regional table with sane fallbacks."""
    country_code = COUNTRY_CODES.get(country, country)  # accept "Canada" or "CA"
    region_code = REGION_CODES.get(region, region)      # accept "Alberta" or "AB"
    by_country = REGIONAL_RATES.get(country_code, {})
    entry = (by_country.get(region_code) or {}).get(floor_type)
    if entry:
        return entry
    entry = (by_country.get("DEFAULT") or {}).get(floor_type)
    if entry:
        return entry
    return None


def rate_for(
    floor_type: str,
    scope: str,
    country: str = "Canada",
    region: str = "Alberta",
    pattern: str = "standard",
) -> float:
    """The correct per-square-foot rate for the user's settings.

    scope: "supply_install" → material + install (pattern applied to install)
           "install_only"   → install only
           "supply_only"    → material only
    pattern: multiplier from PATTERN_MULTIPLIERS, applied to install only
    """
    entry = _region_entry(country, region, floor_type)
    ft = defaults_for(floor_type)

    if entry:
        material = float(entry.get("material") or ft.get("material") or 0)
        install = float(entry.get("install") or ft.get("install_fallback") or 0)
    else:
        material = float(ft.get("material") or 0)
        install = float(ft.get("install_fallback") or 0)

    mult = float(PATTERN_MULTIPLIERS.get(pattern, PATTERN_MULTIPLIERS["standard"])["multiplier"])
    install = install * mult

    if scope == "install_only":
        return round(install, 2)
    if scope == "supply_only":
        return round(material, 2)
    return round(material + install, 2)


def range_for(
    floor_type: str,
    scope: str,
    country: str = "Canada",
    region: str = "Alberta",
) -> tuple[float, float] | None:
    """Return (low, high) for the field hint, or None when we have no range."""
    entry = _region_entry(country, region, floor_type)
    if not entry:
        return None
    mat_r = entry.get("material_range")
    inst_r = entry.get("install_range")
    if scope == "install_only":
        return tuple(inst_r) if inst_r else None
    if scope == "supply_only":
        return tuple(mat_r) if mat_r else None
    if mat_r and inst_r:
        return (round(mat_r[0] + inst_r[0], 2), round(mat_r[1] + inst_r[1], 2))
    return None


def waste_default_for(floor_type: str) -> float:
    return float(defaults_for(floor_type).get("waste") or 10)