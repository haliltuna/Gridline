"""Blueprint reading engine: PDF pages -> high-res PNG -> Claude Opus vision -> takeoff lines."""

import base64
import io
import json
import logging
import os
import re
import uuid
from typing import Any

import pypdfium2 as pdfium

from lib.flooring import FLOOR_TYPE_NAMES, accessory_defaults, adhesive_gallons, defaults_for

logger = logging.getLogger(__name__)

MODEL = "claude-opus-4-5-20251101"
MAX_PAGES_TO_READ = 12  # accuracy over speed; sets past 100 pages are sampled across the set
RENDER_SCALE = 2.6  # ~200 DPI

SYSTEM = f"""You are a senior commercial flooring estimator reading architectural blueprints.

STEP 1 — READ, DO NOT GUESS.
Record the printed drawing scale and every WRITTEN room dimension / area callout.
ALWAYS trust printed text over visual estimation. If a room's dimensions are blurry,
cut off, or unreadable, mark that room needs_review=true and explain in review_note
instead of inventing a number.

STEP 2 — CALCULATE.
For each room compute square footage, choose the floor type from EXACTLY this list:
{", ".join(FLOOR_TYPE_NAMES)}.
Count wall/backsplash tile areas as their own line items (floor_type Ceramic Tile or
Porcelain Tile, room name like "Kitchen Backsplash").
Group everything by building and unit. Count bedrooms and bathrooms per unit.
If the drawing states a building or unit total area, cross-check your room sum against it
and report the discrepancy.

STEP 2b — COUNT THE TRIM WORK.
Flooring bids are lost on the accessories, so COUNT them as well as measuring areas:
 * doors: every door opening / doorway in the scope (each one needs a transition strip)
 * steps: every stair tread / step (each one needs a stair nosing)
 * stair_runs: number of separate stair runs
 * tile_profile_lf: linear feet of tile edge profile / trim (Schluter-type) — every exposed tile
   edge, outside corner, threshold or transition where tile meets another finish
 * cove_base_lf: linear feet of wall base / cove base — measure the room perimeter from the
   printed dimensions and SUBTRACT the door openings (about 3 ft each). Only count rooms whose
   finish gets a wall base (typically resilient, VCT and tile rooms, not carpeted bedrooms
   unless the schedule says so).
Report them per unit in "accessories" AND as project totals. Count what you can actually see;
if a sheet is unreadable say so in flags instead of guessing.

STEP 2c — THE INDEX / COVER SHEET.
The first few sheets of a set often state the project totals: number of buildings, number of
units and total square footage. Record exactly what is printed in "index_stated" so we can
show the difference between the drawing's own numbers and what was measured. Use null for
anything not printed. Never copy a stated number into a room measurement.

Return STRICT JSON only, no prose, no markdown fence:
{{
 "scale": "printed scale e.g. 1/4\\" = 1'-0\\" or null",
 "project_type": "single-family | multi-family | commercial",
 "buildings": <int>, "units": <int>, "bedrooms": <int>, "bathrooms": <int>,
 "stated_total_sqft": <number or null>,
 "index_stated": {{"buildings": <int or null>, "units": <int or null>,
                  "total_sqft": <number or null>, "source": "sheet name/number or null"}},
 "doors": <int total door openings>, "steps": <int total stair treads>,
 "cove_base_lf": <number, total linear feet of wall base>,
 "tile_profile_lf": <number, total linear feet of tile edge profile / trim>,
 "accessories": [{{"building":"Building A","unit":"Unit 101","doors":4,"steps":0,
                  "cove_base_lf":128.5,"tile_profile_lf":22.0,"note":null}}],
 "cross_check_note": "string or null",
 "flags": ["anything blurry/unreadable/assumed"],
 "brief": "2-3 sentence plain-English summary for the contractor",
 "specs": [
   {{"room_pattern":"Kitchen Backsplash","surface":"wall","floor_type":"Ceramic Tile",
     "product":"exact manufacturer + product + colour + code as printed",
     "adhesive":"printed setting material or null","unit_type":null,"note":null}}
 ],
 "lines": [
   {{"building":"Building A","unit":"Unit 101","room":"Living Room",
     "floor_type":"Luxury Vinyl Plank","length_ft":18.0,"width_ft":14.0,"sqft":252.0,
     "product":"specified product if the sheet names one, else null",
     "source":"written dimension 18'-0\\" x 14'-0\\"","needs_review":false,"review_note":null}}
 ]
}}

STEP 2d — NAME THE PRODUCT, NOT THE CATEGORY.
Every supply line must carry the BRANDED product from the drawings' own finish schedule /
material legend: manufacturer + series + colour + item code, copied exactly
(e.g. "Shaw Fifth Avenue Oak 5mm SPC 0847V-00734 Ravine"). Put it in "product". If the sheet
names an approved alternative or "or equal", put that in "product_alt". Only leave "product"
empty when the drawings genuinely print no product name — then add a flag saying so. Never
invent a brand, and never put the generic category ("LVT", "ceramic tile") in "product".

STEP 3 — SPECS IF PRESENT.
Many sets include a finish schedule or keynote legend naming the actual products. If this set
has one, fill "specs" with each product-to-room mapping, copying manufacturer/product/colour/code
EXACTLY as printed, and put the specified product on the matching lines. If there is no schedule
in the drawings, return "specs": []."""


def render_pages(pdf_bytes: bytes) -> tuple[list[str], int]:
    """Return (base64 PNG pages, total page count)."""
    doc = pdfium.PdfDocument(io.BytesIO(pdf_bytes))
    total = len(doc)
    if total <= MAX_PAGES_TO_READ:
        indices = list(range(total))
    else:
        step = total / MAX_PAGES_TO_READ
        indices = sorted({int(i * step) for i in range(MAX_PAGES_TO_READ)})
    images: list[str] = []
    for i in indices:
        bitmap = doc[i].render(scale=RENDER_SCALE)
        buf = io.BytesIO()
        bitmap.to_pil().convert("RGB").save(buf, format="JPEG", quality=88)
        images.append(base64.b64encode(buf.getvalue()).decode())
    doc.close()
    return images, total


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no json in model output")
    return json.loads(text[start : end + 1])


def _spec_hint(specs: list[dict[str, Any]] | None) -> str:
    """Spec-first: the finish schedule is read BEFORE the drawings, so the specified products
    are handed to the measuring pass and land on each matching room as it is created."""
    if not specs:
        return ""
    lines = []
    for sp in specs[:60]:
        alt = f" | approved alternative: {sp.get('alternative')}" if sp.get("alternative") else ""
        lines.append(f"- {sp.get('room_pattern', 'ALL')} ({sp.get('surface', 'floor')}): "
                     f"{sp.get('floor_type', '')} — {sp.get('product', '')}{alt}")
    return ("\n\nTHE FINISH SCHEDULE FOR THIS SET HAS ALREADY BEEN READ. Use these products; "
            "put the matching product name on each room's line and do NOT invent other products:\n"
            + "\n".join(lines))


async def read_blueprint(pdf_bytes: bytes, filename: str,
                         specs: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    images, total_pages = render_pages(pdf_bytes)
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    parsed: dict[str, Any] | None = None
    engine = "claude-opus"
    if key and images:
        try:
            from emergentintegrations.llm.chat import ImageContent, LlmChat, StreamDone, TextDelta, UserMessage

            chat = LlmChat(
                api_key=key,
                session_id=f"takeoff-{uuid.uuid4()}",
                system_message=SYSTEM,
            ).with_model("anthropic", MODEL)
            msg = UserMessage(
                text=(
                    f"Blueprint set '{filename}' — {total_pages} page(s), {len(images)} rendered here. "
                    "Produce the takeoff JSON exactly as specified."
                    + _spec_hint(specs)
                ),
                file_contents=[ImageContent(image_base64=b) for b in images],
            )
            out = ""
            async for ev in chat.stream_message(msg):
                if isinstance(ev, TextDelta):
                    out += ev.content
                elif isinstance(ev, StreamDone):
                    break
            parsed = _extract_json(out)
        except Exception as exc:  # never dead-end the upload
            logger.error("blueprint AI read failed: %s", exc)
            parsed = None
            engine = "fallback"
    else:
        engine = "fallback"

    if not parsed or not parsed.get("lines"):
        parsed = _fallback(filename, total_pages)
        engine = "fallback"

    parsed["engine"] = engine
    parsed["pages"] = total_pages
    parsed["pages_read"] = len(images)
    return parsed


def _fallback(filename: str, pages: int) -> dict[str, Any]:
    rooms = [
        ("Unit 101", "Living Room", "Luxury Vinyl Plank", 18.0, 14.0),
        ("Unit 101", "Bedroom 1", "Carpet Tile", 12.0, 11.5),
        ("Unit 101", "Bathroom 1", "Porcelain Tile", 8.0, 6.0),
        ("Unit 101", "Kitchen Backsplash", "Ceramic Tile", 12.0, 1.5),
        ("Unit 102", "Living Room", "Luxury Vinyl Plank", 17.0, 13.5),
        ("Unit 102", "Bedroom 1", "Carpet Tile", 12.5, 11.0),
        ("Unit 102", "Bathroom 1", "Porcelain Tile", 7.5, 6.0),
    ]
    return {
        "scale": None,
        "project_type": "multi-family",
        "buildings": 1,
        "units": 2,
        "bedrooms": 2,
        "bathrooms": 2,
        "stated_total_sqft": None,
        "index_stated": {"buildings": None, "units": None, "total_sqft": None, "source": None},
        "doors": 6,
        "steps": 0,
        "cove_base_lf": 96.0,
        "accessories": [{"building": "Building A", "unit": "Unit 101", "doors": 4, "steps": 0,
                         "cove_base_lf": 64.0, "note": None},
                        {"building": "Building A", "unit": "Unit 102", "doors": 2, "steps": 0,
                         "cove_base_lf": 32.0, "note": None}],
        "cross_check_note": None,
        "specs": [],
        "flags": ["AI reader unavailable — starter takeoff generated. Verify every dimension before quoting."],
        "brief": f"Starter takeoff for {filename} ({pages} page(s)). 1 building, 2 units, 2 bedrooms, 2 bathrooms, including backsplash tile. Review and edit each line before converting to a quote.",
        "lines": [
            {
                "building": "Building A", "unit": u, "room": r, "floor_type": ft,
                "length_ft": l, "width_ft": w, "sqft": round(l * w, 1),
                "source": "estimated", "needs_review": True,
                "review_note": "Generated without AI read — confirm dimensions.",
            }
            for (u, r, ft, l, w) in rooms
        ],
    }


SPEC_SYSTEM = """You are reading a flooring FINISH SCHEDULE / PRODUCT SPECIFICATION for a
construction project. These sheets tell the installer WHICH product goes WHERE.

Extract every product-to-location mapping you can read. Typical sources: finish schedules,
room finish matrices, keynote legends, product data sheets, "FLOORING" spec sections.

Rules:
- FLOORING SCOPE ONLY. Take flooring, wall/backsplash tile, stair nosings, transitions, cove base,
  underlayment and setting materials. IGNORE paint, wallcovering, millwork, casework, countertops,
  plumbing and anything else outside the flooring subcontractor's scope.
- If the schedule names an approved alternative / "or equal" product, record it in "alternative".
- If a unit price is printed (per sq ft, per piece), record it in "price_per_sqft"; otherwise null.
- Copy manufacturer, product name/series, colour and item code EXACTLY as printed. Never invent one.
- room_pattern is the room or area the product applies to, as printed ("Kitchen", "Bathrooms",
  "All Unit Type A bedrooms", "Corridors", "Kitchen Backsplash"). Use "ALL" for a project-wide default.
- Map each product to one of these categories EXACTLY:
""" + ", ".join(FLOOR_TYPE_NAMES) + """
- Include wall tile / backsplash entries — mark those with surface "wall" (floors are "floor").
- If a printed adhesive / setting material / underlayment is named, record it.
- Anything unreadable goes in flags. Do NOT guess.
- ALSO read the ACCESSORY / TRIM schedules if the sheet has them (wall base schedule, stair
  nosing schedule, transition or threshold schedule, tile edge profile / Schluter trim). For each
  one record kind EXACTLY as one of: transition, nosing, cove_base, tile_profile — with the
  printed quantity (qty), its unit ("ea" for pieces, "lf" for linear feet), the product as
  printed and the printed unit price if any. Use qty 0 when the schedule names the product but
  prints no quantity.

Return STRICT JSON only, no prose or markdown fence:
{
 "flags": ["..."],
 "brief": "1-2 sentence summary of the finish schedule",
 "accessories": [
   {"kind":"cove_base","qty":420.0,"unit":"lf",
    "product":"Roppe 700 Series 4in rubber wall base, colour 123","unit_price":null,"note":null}
 ],
 "specs": [
   {"room_pattern":"Kitchen Backsplash","surface":"wall","floor_type":"Ceramic Tile",
    "product":"Daltile Rittenhouse Square 3x6 Arctic White RS01",
    "alternative":"approved equal as printed, else null",
    "price_per_sqft": null,
    "adhesive":"White polymer-modified thin-set","unit_type":"Type A or null","note":null}
 ]
}"""


async def read_spec_sheet(pdf_bytes: bytes, filename: str) -> dict[str, Any]:
    """Read a standalone spec / finish-schedule PDF into product-to-room mappings."""
    images, total_pages = render_pages(pdf_bytes)
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key or not images:
        return {"specs": [], "flags": ["AI reader unavailable — add products manually."],
                "brief": "", "engine": "fallback", "pages": total_pages}
    try:
        from emergentintegrations.llm.chat import ImageContent, LlmChat, StreamDone, TextDelta, UserMessage

        chat = LlmChat(api_key=key, session_id=f"spec-{uuid.uuid4()}", system_message=SPEC_SYSTEM).with_model(
            "anthropic", MODEL
        )
        msg = UserMessage(
            text=f"Finish schedule '{filename}' — {total_pages} page(s). Extract the product-to-room mappings as JSON.",
            file_contents=[ImageContent(image_base64=b) for b in images],
        )
        out = ""
        async for ev in chat.stream_message(msg):
            if isinstance(ev, TextDelta):
                out += ev.content
            elif isinstance(ev, StreamDone):
                break
        parsed = _extract_json(out)
        parsed.setdefault("specs", [])
        parsed.setdefault("accessories", [])
        parsed.setdefault("flags", [])
        parsed.setdefault("brief", "")
        parsed["engine"] = "claude-opus"
        parsed["pages"] = total_pages
        return parsed
    except Exception as exc:
        logger.error("spec sheet read failed: %s", exc)
        return {"specs": [], "flags": [f"Could not read the spec sheet automatically: {exc}"],
                "brief": "", "engine": "fallback", "pages": total_pages}


def _spec_matches(spec: dict[str, Any], line: dict[str, Any]) -> int:
    """Score how well a spec entry matches a takeoff line. 0 = no match."""
    pattern = str(spec.get("room_pattern") or "").strip().lower()
    if not pattern:
        return 0
    room = str(line.get("room") or "").lower()
    unit = str(line.get("unit") or "").lower()
    if pattern in ("all", "*", "all rooms", "all areas"):
        return 1
    haystack = f"{room} {unit}"
    # A backsplash/wall spec must not land on a floor line, and vice versa.
    wall_spec = str(spec.get("surface") or "floor").lower() == "wall"
    wall_line = any(w in room for w in ("backsplash", "wall", "wainscot", "shower surround"))
    if wall_spec != wall_line:
        return 0
    words = [w for w in re.split(r"[^a-z0-9]+", pattern) if len(w) > 2]
    if not words:
        return 0
    hits = sum(1 for w in words if w in haystack)
    if hits == 0:
        # singular/plural fallback: "bathrooms" spec vs "Bathroom 1" line
        hits = sum(1 for w in words if w.rstrip("s") and w.rstrip("s") in haystack)
    return hits * 10 if hits else 0


def apply_specs_to_line(line: dict[str, Any], specs: list[dict[str, Any]]) -> dict[str, Any]:
    """Attach the best-matching specified product to a line. Returns the changed fields only."""
    best, best_score = None, 0
    for spec in specs:
        score = _spec_matches(spec, line)
        if score > best_score:
            best, best_score = spec, score
    if not best:
        return {}
    patch: dict[str, Any] = {
        "product": best.get("product") or line.get("product") or "",
        "product_alt": best.get("alternative") or "",
        "spec_note": best.get("note") or f"Specified for '{best.get('room_pattern')}'",
    }
    if best.get("price_per_sqft"):
        patch["material_cost_per_sqft"] = float(best["price_per_sqft"])
    ft = best.get("floor_type")
    if ft in FLOOR_TYPE_NAMES and line.get("scope") != "misc":
        patch["floor_type"] = ft
        d = defaults_for(ft)
        patch["waste_pct"] = float(d["waste"])
        patch["material_cost_per_sqft"] = float(d["material"])
        total_sqft = float(line["sqft"]) * (1 + float(d["waste"]) / 100)
        patch["adhesive"] = best.get("adhesive") or d["adhesive"]
        patch["adhesive_gallons"] = adhesive_gallons(ft, total_sqft)
        patch["labor_hours"] = round(total_sqft / 100 * float(d["labor_hr_per_100sqft"]), 2)
    elif best.get("adhesive") and line.get("scope") != "misc":
        patch["adhesive"] = best["adhesive"]
    return patch


def build_line(raw: dict[str, Any], job_id: str, labor_rate: float,
               waste_overrides: dict[str, float] | None = None) -> dict[str, Any]:
    scope = raw.get("scope") or "supply_install"
    if scope not in ("supply_install", "install_only", "supply_only", "misc", "accessory"):
        scope = "supply_install"
    ft = raw.get("floor_type") or "Luxury Vinyl Plank"
    if ft not in FLOOR_TYPE_NAMES:
        ft = "Luxury Vinyl Plank"
    d = defaults_for(ft)
    sqft = float(raw.get("sqft") or 0) or round(float(raw.get("length_ft") or 0) * float(raw.get("width_ft") or 0), 1)
    # Waste: what the AI read on the sheet wins; otherwise the account's own default for that
    # floor type; otherwise the industry figure in lib/flooring.
    default_waste = float((waste_overrides or {}).get(ft, d["waste"]))
    waste = float(raw["waste_pct"]) if raw.get("waste_pct") is not None else default_waste
    total_sqft = round(sqft * (1 + waste / 100), 1)
    qty = float(raw.get("qty") or 0)
    unit_price = float(raw.get("unit_price") or 0)
    if scope == "accessory":
        # Counted trim work: qty pieces at a unit price, plus its own install minutes each.
        return {
            "id": str(uuid.uuid4()),
            "job_id": job_id,
            "building": raw.get("building") or "Building A",
            "unit": raw.get("unit") or "Main",
            "room": raw.get("room") or "Accessories",
            "scope": "accessory",
            "floor_type": "",
            "product": raw.get("product") or "",
            "product_alt": raw.get("product_alt") or "",
            "spec_note": raw.get("spec_note") or "",
            "sqft": 0.0, "waste_pct": 0.0, "adhesive": "", "adhesive_gallons": 0.0,
            "material_cost_per_sqft": 0.0,
            "qty": qty,
            "unit_price": unit_price,
            "labor_hours": float(raw.get("labor_hours") or 0),
            "labor_rate": labor_rate,
            "flat_cost": 0.0,
            "needs_review": bool(raw.get("needs_review")),
            "review_note": raw.get("review_note"),
            "source": raw.get("source"),
            "approved": False,
        }
    return {
        "id": str(uuid.uuid4()),
        "job_id": job_id,
        "building": raw.get("building") or "Building A",
        "unit": raw.get("unit") or "Main",
        "room": raw.get("room") or "Room",
        "scope": scope,
        "floor_type": "" if scope == "misc" else ft,
        "product": raw.get("product") or "",
        "product_alt": raw.get("product_alt") or "",
        "spec_note": raw.get("spec_note") or "",
        "qty": 0.0,
        "unit_price": 0.0,
        "sqft": 0.0 if scope == "misc" else sqft,
        "waste_pct": 0.0 if scope == "misc" else waste,
        "adhesive": "" if scope in ("misc", "install_only") else d["adhesive"],
        "adhesive_gallons": 0.0 if scope in ("misc", "install_only") else adhesive_gallons(ft, total_sqft),
        "material_cost_per_sqft": 0.0 if scope == "misc" else float(d["material"]),
        "labor_hours": 0.0 if scope == "misc" else round(total_sqft / 100 * float(d["labor_hr_per_100sqft"]), 2),
        "labor_rate": labor_rate,
        "flat_cost": float(raw.get("flat_cost") or 0),
        "needs_review": bool(raw.get("needs_review")),
        "review_note": raw.get("review_note"),
        "source": raw.get("source"),
        "approved": False,
    }


def line_cost(line: dict[str, Any]) -> float:
    """Scope decides which halves of the price are actually billed."""
    scope = line.get("scope", "supply_install")
    if scope == "misc":
        return round(float(line.get("flat_cost") or 0), 2)
    if scope == "accessory":
        pieces = float(line.get("qty") or 0) * float(line.get("unit_price") or 0)
        return round(pieces + float(line.get("labor_hours") or 0) * float(line.get("labor_rate") or 0), 2)
    total_sqft = float(line["sqft"]) * (1 + float(line["waste_pct"]) / 100)
    material = total_sqft * float(line["material_cost_per_sqft"])
    labor = float(line["labor_hours"]) * float(line["labor_rate"])
    if scope == "install_only":
        return round(labor, 2)
    if scope == "supply_only":
        return round(material, 2)
    return round(material + labor, 2)


def build_accessory_lines(parsed: dict[str, Any], job_id: str, labor_rate: float,
                          prices: dict[str, float] | None = None,
                          catalogue: dict[str, dict[str, Any]] | None = None,
                          spec_rows: dict[str, dict[str, Any]] | None = None,
                          unit_weights: list[tuple[str, str, float]] | None = None,
                          ) -> list[dict[str, Any]]:
    """Turn the AI's door, step, wall-base and tile-profile counts into priced accessory lines.

    `prices` is the account's own accessory pricing (settings) keyed by kind; anything missing
    falls back to the built-in defaults in lib/flooring.ACCESSORIES. `catalogue` is the saved
    accessory product per kind (name, unit_price, labor_hr_each) — a saved product wins, so the
    trim lands on the takeoff already named the way this contractor buys it. `spec_rows` are the
    trim schedule rows read off the spec sheet, used as the quantity when the drawings counted
    nothing and always as the product name. `unit_weights` is [(building, unit, sqft)] from the
    measured lines: a whole-job total (cove base, tile profiles, doors, steps) is then split out
    per unit in proportion to that unit's floor area instead of landing as one lump line, so the
    client sees the trim priced against the unit it belongs to.
    """
    groups = parsed.get("accessories") or []
    if not groups:
        totals = {"doors": int(parsed.get("doors") or 0), "steps": int(parsed.get("steps") or 0),
                  "cove_base_lf": float(parsed.get("cove_base_lf") or 0),
                  "tile_profile_lf": float(parsed.get("tile_profile_lf") or 0)}
        if not any(totals.values()) and not any(
                float((r or {}).get("qty") or 0) > 0 for r in (spec_rows or {}).values()):
            return []
        groups = [{"building": "Building A", "unit": "Whole job", **totals}]
    # Spec-sheet quantities only stand in when there is a single whole-job group; per-unit
    # groups are trusted as-is so a schedule total is never double-counted.
    single_group = len(groups) == 1
    # A single whole-job group becomes one group per unit, weighted by measured floor area.
    weights = [w for w in (unit_weights or []) if float(w[2]) > 0]
    if single_group and len(weights) > 1:
        total_sqft = sum(float(w[2]) for w in weights)
        g0 = groups[0]
        spread: list[dict[str, Any]] = []
        for building, unit, sqft in weights:
            share = float(sqft) / total_sqft
            row: dict[str, Any] = {"building": building, "unit": unit, "share": share,
                                   "note": g0.get("note")}
            for key in ("cove_base_lf", "tile_profile_lf"):
                row[key] = float(g0.get(key) or 0) * share
            spread.append(row)
        # Counted items are whole pieces: allocate by largest remainder so the per-unit lines
        # still add up to exactly what was counted on the drawings.
        for key in ("doors", "steps"):
            total = int(round(float(g0.get(key) or 0)))
            if total <= 0:
                for row in spread:
                    row[key] = 0
                continue
            raw = [total * float(r["share"]) for r in spread]
            base = [int(x) for x in raw]
            left = total - sum(base)
            order = sorted(range(len(spread)), key=lambda i: raw[i] - base[i], reverse=True)
            for i in order[:left]:
                base[i] += 1
            for row, n in zip(spread, base):
                row[key] = n
        groups = spread
    out: list[dict[str, Any]] = []
    for g in groups:
        if not isinstance(g, dict):
            continue
        for kind, key, room in (("transition", "doors", "Transition strips — door openings"),
                                ("nosing", "steps", "Stair nosings — steps"),
                                ("cove_base", "cove_base_lf", "Cove base — wall linear feet"),
                                ("tile_profile", "tile_profile_lf", "Tile edge profiles — linear feet")):
            spec = (spec_rows or {}).get(kind) or {}
            qty = float(g.get(key) or 0)
            counted = qty > 0
            share = float(g.get("share") or 0)
            if not counted and single_group and share > 0:
                # whole-job group was spread per unit: the spec total follows the same split
                qty = float(spec.get("qty") or 0) * share
            elif not counted and single_group:
                # Nothing on the drawings for this trim, but the finish schedule printed a
                # quantity — quote it rather than dropping the scope.
                qty = float(spec.get("qty") or 0)
            if qty <= 0:
                continue
            d = accessory_defaults(kind)
            saved = (catalogue or {}).get(kind) or {}
            unit_price = float(saved.get("unit_price") or 0) or float(spec.get("unit_price") or 0) \
                or float((prices or {}).get(kind) or 0) or float(d["unit_price"])
            hr_each = float(saved.get("labor_hr_each") or d["labor_hr_each"])
            product = str(saved.get("name") or spec.get("product") or "")
            if key in ("doors", "steps"):
                qty = float(round(qty))          # you cannot install half a nosing
                if qty <= 0:
                    continue
            where = (f"counted from the drawings ({qty:,.0f} {d['unit']}"
                     + ("" if d["unit"] == "lf" else "s") + ")") if counted \
                else f"read from the spec sheet ({qty:,.0f} {d['unit']})"
            if share > 0:
                where += f" · {share * 100:,.0f}% of the job total by floor area"
            out.append(build_line({
                "building": g.get("building") or "Building A",
                "unit": g.get("unit") or "Main",
                "room": room,
                "scope": "accessory",
                "qty": round(qty, 2),
                "unit_price": unit_price,
                "labor_hours": round(qty * hr_each, 2),
                "product": product,
                "spec_note": ("From your accessory catalogue" if saved
                              else "From the spec sheet trim schedule" if product else ""),
                "source": where,
                "review_note": g.get("note"),
            }, job_id, labor_rate))
    return out


def index_variance(parsed: dict[str, Any], measured_sqft: float, measured_units: int) -> str:
    """Compare the index/cover sheet's own stated totals against what we measured."""
    stated = parsed.get("index_stated") or {}
    bits: list[str] = []
    s_units = stated.get("units")
    s_sqft = stated.get("total_sqft") or parsed.get("stated_total_sqft")
    if s_units:
        delta = measured_units - int(s_units)
        bits.append(f"index sheet states {int(s_units)} unit(s); we measured {measured_units}"
                    + (f" ({delta:+d})" if delta else " — match"))
    if s_sqft:
        delta_sf = measured_sqft - float(s_sqft)
        pct = (delta_sf / float(s_sqft) * 100) if float(s_sqft) else 0
        bits.append(f"index sheet states {float(s_sqft):,.0f} sq ft; we measured {measured_sqft:,.0f}"
                    f" ({delta_sf:+,.0f} sf, {pct:+.1f}%)")
    if stated.get("source"):
        bits.append(f"source: {stated['source']}")
    return " · ".join(bits)
