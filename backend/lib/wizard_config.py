"""The wizard, defined once as data.

The frontend renders whatever is in WIZARD_STEPS. Adding a question means adding one
dict to the list — no React changes required. Conditionals use `show_if`, which takes
the current answers dict and returns True to show the step, False to skip it.

Keep this file as the single source of truth. If a question needs different wording
or a new default, change it here. If a floor type is added to lib/flooring.py, the
per-type questions expand automatically — nothing in this file needs to know.
"""

from lib.flooring import FLOOR_TYPES, FLOOR_TYPE_NAMES

# ---------------------------------------------------------------------------
# Choice sets — defined once, reused where relevant
# ---------------------------------------------------------------------------

INSTALL_METHODS = [
    {"value": "glued",    "label": "Glue-down",   "hint": "Adhesive everywhere"},
    {"value": "click",    "label": "Click-lock",  "hint": "No adhesive, no underlayment"},
    {"value": "floating", "label": "Floating",    "hint": "Underlayment only, some edges glued"},
    {"value": "mixed",    "label": "Mixed",       "hint": "Depends on the product"},
]

SCOPES = [
    {"value": "supply_install", "label": "Supply & Install",
     "hint": "You buy the material and install it — the standard flooring bid"},
    {"value": "install_only",   "label": "Install Only",
     "hint": "The GC or owner supplies the material; you bill labor only"},
    {"value": "supply_only",    "label": "Supply Only",
     "hint": "You supply material; someone else installs"},
]

ADHESIVE_SUPPLY = [
    {"value": "contractor", "label": "You supply the adhesive",
     "hint": "Adhesive cost is in your bid"},
    {"value": "gc",         "label": "GC / owner supplies the adhesive",
     "hint": "Adhesive is not in your bid"},
    {"value": "not_required", "label": "Not required — floating or click-lock",
     "hint": "Adhesive never appears on your quotes"},
]

TRANSITION_RULES = [
    {"value": "on_flooring_change", "label": "Only at flooring changes",
     "hint": "Recommended — a transition strip where LVP meets carpet, tile meets LVP, etc."},
    {"value": "every_door",         "label": "At every door opening",
     "hint": "Some installers charge a transition at every doorway regardless"},
]

# Extra work items the installer can opt into — billed as misc lines, not hourly
EXTRA_WORK_ITEMS = [
    {"value": "floor_prep",   "label": "Floor prep / grinding",         "default_on": False},
    {"value": "self_level",   "label": "Self-leveling underlayment",    "default_on": False},
    {"value": "demo",         "label": "Demo & haul-away",              "default_on": False},
    {"value": "moisture",     "label": "Moisture barrier / sealer",     "default_on": False},
    {"value": "furniture",    "label": "Furniture move / protection",   "default_on": False},
    {"value": "mobilization", "label": "Mobilization",                  "default_on": False},
]

# ---------------------------------------------------------------------------
# The steps. Rendered top to bottom; conditional steps are skipped if show_if
# returns False for the current answers.
# ---------------------------------------------------------------------------

WIZARD_STEPS: list[dict] = [
    # 1. Scope — the biggest fork in the road
    {
        "id": "default_scope",
        "section": "The basics",
        "title": "What kind of bid do you usually write?",
        "subtitle": "This is the starting point for every line — you can change it per job.",
        "type": "choice_cards",
        "options": SCOPES,
        "default": "supply_install",
    },

    # 2. Install method — default across the account
    {
        "id": "default_install_method",
        "section": "The basics",
        "title": "How do you install most of your floors?",
        "subtitle": "Adhesive is only billed when the method requires it.",
        "type": "choice_cards",
        "options": INSTALL_METHODS,
        "default": "glued",
    },

    # 3. Adhesive supplier — conditional on glue being used somewhere
    {
        "id": "adhesive_supplied_by",
        "section": "The basics",
        "title": "Who supplies the adhesive?",
        "subtitle": "If someone else supplies it, we don't put it on your quote.",
        "type": "choice_cards",
        "options": ADHESIVE_SUPPLY,
        "default": "contractor",
        "show_if": lambda a: a.get("default_install_method") in ("glued", "mixed", "floating"),
    },

    # 4. Transition rule — the fix for the doorway bug
    {
        "id": "transition_rule",
        "section": "Counted work",
        "title": "When do you charge for a transition strip?",
        "subtitle": "Doorways with the same flooring on both sides usually don't need one.",
        "type": "choice_cards",
        "options": TRANSITION_RULES,
        "default": "on_flooring_change",
    },

    # 5. Rates per floor type — the big one for pricing
    {
        "id": "rates_per_floor_type",
        "section": "Your pricing",
        "title": "Your rate per square foot",
        "subtitle": "Industry averages are pre-filled — adjust any that don't match your book.",
        "type": "per_floor_type_number",
        "unit": "$/sf",
        "field": "rate_per_sqft",
        "prefill_from": "material",   # pulls the industry default from FLOOR_TYPES
    },

    # 6. Waste per floor type — already exists in Settings, surfaced here in the wizard
    {
        "id": "waste_per_floor_type",
        "section": "Your pricing",
        "title": "Waste factor by floor type",
        "subtitle": "Your overage %. A waste figure printed on the drawings always wins.",
        "type": "per_floor_type_number",
        "unit": "%",
        "field": "waste_pct",
        "prefill_from": "waste",
    },

    # 7. Extras — opt-in list of work that's billed as misc, not hourly
    {
        "id": "extra_work_billed",
        "section": "Extras",
        "title": "Which extras do you bill for?",
        "subtitle": "These appear as optional lines you can add to any takeoff — never auto-charged.",
        "type": "toggles",
        "options": EXTRA_WORK_ITEMS,
    },
]


def public_steps() -> list[dict]:
    """Strip Python-only keys (like show_if) so the config can be sent to the frontend as JSON."""
    out = []
    for step in WIZARD_STEPS:
        clean = {k: v for k, v in step.items() if k not in ("show_if",)}
        out.append(clean)
    return out


def visible_steps(answers: dict) -> list[dict]:
    """Which steps to actually show given the answers so far — used server-side for validation."""
    kept = []
    for step in WIZARD_STEPS:
        predicate = step.get("show_if")
        if predicate is None or predicate(answers):
            kept.append({k: v for k, v in step.items() if k != "show_if"})
    return kept


def default_profile() -> dict:
    """A fresh profile with every default pre-filled, ready for a brand-new account."""
    rates = {ft: float(FLOOR_TYPES[ft]["material"]) for ft in FLOOR_TYPE_NAMES}
    waste = {ft: float(FLOOR_TYPES[ft]["waste"])    for ft in FLOOR_TYPE_NAMES}
    extras = {item["value"]: bool(item["default_on"]) for item in EXTRA_WORK_ITEMS}
    return {
        "default_scope": "supply_install",
        "default_install_method": "glued",
        "adhesive_supplied_by": "contractor",
        "transition_rule": "on_flooring_change",
        "rates_per_sqft": rates,
        "waste_pct": waste,
        "extra_work_billed": extras,
        "completed": False,
    }