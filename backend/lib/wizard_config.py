"""The wizard, defined once as data.

The frontend renders whatever WIZARD_STEPS returns from /api/wizard/steps. Adding a
question means adding one dict to the list — no React changes required. Conditionals
use `show_if`, which takes the current answers and returns True to show the step.

The `region_aware` flag on per-floor-type steps tells the frontend to look up the
regional default for the installer's country and province before showing the field.
A toggle at the top of those steps lets the installer accept those defaults or type
their own numbers.
"""

from lib.flooring import (
    EXTRA_WORK_PRESETS,
    FLOOR_TYPES,
    FLOOR_TYPE_NAMES,
    PATTERN_MULTIPLIERS,
)


# ---------------------------------------------------------------------------
# Choice sets
# ---------------------------------------------------------------------------

SCOPES = [
    {"value": "supply_install", "label": "Supply & Install",
     "hint": "You buy the material and install it — the standard flooring bid"},
    {"value": "install_only",   "label": "Install Only",
     "hint": "The GC or owner supplies the material; you bill labour only"},
    {"value": "supply_only",    "label": "Supply Only",
     "hint": "You supply material; someone else installs"},
]

# The install-method question now pre-fills which floor-type variants the installer
# uses most. It's not a global method switch — it shortcuts the rate step.
INSTALL_FOCUS = [
    {"value": "click",    "label": "Click-lock",
     "hint": "Floating floors — vinyl plank, vinyl tile, laminate"},
    {"value": "glued",    "label": "Glue-down",
     "hint": "Dryback vinyl, glue-assist and full-glue hardwood"},
    {"value": "mixed",    "label": "Mixed",
     "hint": "Depends on the job — show me every rate"},
]

ADHESIVE_SUPPLY = [
    {"value": "contractor",  "label": "You supply the adhesive",
     "hint": "Adhesive cost is in your bid"},
    {"value": "gc",          "label": "GC / owner supplies the adhesive",
     "hint": "Adhesive is not in your bid"},
    {"value": "not_required", "label": "Not required — floating or click-lock",
     "hint": "Adhesive never appears on your quotes"},
]

TRANSITION_RULES = [
    {"value": "on_flooring_change", "label": "Only at flooring changes",
     "hint": "Recommended — where LVP meets carpet, tile meets LVP, etc."},
    {"value": "every_door",         "label": "At every door opening",
     "hint": "Some installers charge a transition at every doorway regardless"},
]

# Which floor types each install-focus pre-fills.
FOCUS_FLOOR_TYPES = {
    "click": ["Click Vinyl Plank", "Click Vinyl Tile", "Laminate",
              "Broadloom Carpet", "Carpet Tile", "Ceramic Tile", "Porcelain Tile"],
    "glued": ["Glue Down Vinyl Plank", "Glue Down Vinyl Tile", "Sheet Vinyl",
              "Engineered Hardwood — Glue Assist", "Engineered Hardwood — Full Glue",
              "Solid Hardwood — Glue Assist", "Solid Hardwood — Full Glue",
              "Ceramic Tile", "Porcelain Tile", "Slab Tile / Stone"],
    "mixed": FLOOR_TYPE_NAMES,
}

PATTERN_OPTIONS = [
    {"value": k, "label": v["label"], "multiplier": v["multiplier"]}
    for k, v in PATTERN_MULTIPLIERS.items()
]


# ---------------------------------------------------------------------------
# Extras — built from the flooring module so the wizard and the takeoff agree
# ---------------------------------------------------------------------------

EXTRA_WORK_ITEMS = [
    {
        "value": key,
        "label": item["label"],
        "type": item["type"],              # per_sqft | flat
        "rate": item.get("rate"),          # present when type == per_sqft
        "amount": item.get("amount"),      # present when type == flat
        "install_only": item.get("install_only", False),
        "default_on": False,
    }
    for key, item in EXTRA_WORK_PRESETS.items()
]


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------

WIZARD_STEPS: list[dict] = [
    {
        "id": "default_scope",
        "section": "The basics",
        "title": "What kind of bid do you usually write?",
        "subtitle": "This is the starting point for every line — you can change it per job.",
        "type": "choice_cards",
        "options": SCOPES,
        "default": "supply_install",
    },
    {
        "id": "default_install_method",
        "section": "The basics",
        "title": "Which do you install most?",
        "subtitle": "We'll shortcut the rate step to the floor types you actually install.",
        "type": "choice_cards",
        "options": INSTALL_FOCUS,
        "default": "click",
    },
    {
        "id": "adhesive_supplied_by",
        "section": "The basics",
        "title": "Who supplies the adhesive?",
        "subtitle": "If someone else supplies it, we don't put it on your quote.",
        "type": "choice_cards",
        "options": ADHESIVE_SUPPLY,
        "default": "contractor",
        "show_if": lambda a: a.get("default_install_method") in ("glued", "mixed", "click"),
    },
    {
        "id": "transition_rule",
        "section": "Counted work",
        "title": "When do you charge for a transition strip?",
        "subtitle": "Doorways with the same flooring on both sides usually don't need one.",
        "type": "choice_cards",
        "options": TRANSITION_RULES,
        "default": "on_flooring_change",
    },
    {
        "id": "rates_per_floor_type",
        "section": "Your pricing",
        "title": "Your rate per square foot",
        "subtitle": "Scope-aware — you only see the number that matches the bid type you chose.",
        "type": "per_floor_type_number",
        "unit": "$/sf",
        "field": "rate_per_sqft",
        "region_aware": True,
        "focus_from": "default_install_method",
        "toggleable": True,
        "toggle_label": "Apply regional industry standards",
    },
    {
        "id": "waste_per_floor_type",
        "section": "Your pricing",
        "title": "Waste factor by floor type",
        "subtitle": "Your overage %. A waste figure printed on the drawings always wins.",
        "type": "per_floor_type_number",
        "unit": "%",
        "field": "waste_pct",
        "region_aware": True,
        "focus_from": "default_install_method",
        "toggleable": True,
        "toggle_label": "Apply industry waste defaults",
    },
    {
        "id": "pattern_default",
        "section": "Your pricing",
        "title": "Default lay pattern",
        "subtitle": "Herringbone roughly doubles the install rate — diagonal adds about a quarter.",
        "type": "choice_cards",
        "options": [
            {"value": o["value"], "label": o["label"],
             "hint": (f"{o['multiplier']:.2f}× install rate" if o["value"] != "standard"
                      else "Straight lay — no multiplier")}
            for o in PATTERN_OPTIONS
        ],
        "default": "standard",
    },
    {
        "id": "extra_work_billed",
        "section": "Extras",
        "title": "Which extras do you bill for?",
        "subtitle": "Optional lines you can add to any takeoff — never auto-charged.",
        "type": "toggles",
        "options": EXTRA_WORK_ITEMS,
    },
]


def public_steps() -> list[dict]:
    """Strip Python-only keys (like show_if) so the config can go to the frontend as JSON."""
    out = []
    for step in WIZARD_STEPS:
        clean = {k: v for k, v in step.items() if k != "show_if"}
        out.append(clean)
    return out


def visible_steps(answers: dict) -> list[dict]:
    kept = []
    for step in WIZARD_STEPS:
        predicate = step.get("show_if")
        if predicate is None or predicate(answers):
            kept.append({k: v for k, v in step.items() if k != "show_if"})
    return kept


def focused_floor_types(focus: str) -> list[str]:
    """Which floor types the rate/waste step shows for a given install focus."""
    return list(FOCUS_FLOOR_TYPES.get(focus, FLOOR_TYPE_NAMES))


def default_profile() -> dict:
    """A fresh profile with every default pre-filled for a new account."""
    rates = {}
    waste = {}
    for name, ft in FLOOR_TYPES.items():
        rates[name] = float(ft.get("material", 0)) + float(ft.get("install_fallback", 0))
        waste[name] = float(ft.get("waste", 10))
    extras = {item["value"]: bool(item["default_on"]) for item in EXTRA_WORK_ITEMS}
    return {
        "default_scope": "supply_install",
        "default_install_method": "click",
        "adhesive_supplied_by": "contractor",
        "transition_rule": "on_flooring_change",
        "pattern_default": "standard",
        "rates_per_sqft": rates,
        "waste_pct": waste,
        "extra_work_billed": extras,
        "completed": False,
    }