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

from lib.flooring import FLOOR_TYPE_NAMES, adhesive_gallons, defaults_for

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

Return STRICT JSON only, no prose, no markdown fence:
{{
 "scale": "printed scale e.g. 1/4\\" = 1'-0\\" or null",
 "project_type": "single-family | multi-family | commercial",
 "buildings": <int>, "units": <int>, "bedrooms": <int>, "bathrooms": <int>,
 "stated_total_sqft": <number or null>,
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


async def read_blueprint(pdf_bytes: bytes, filename: str) -> dict[str, Any]:
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
- Copy manufacturer, product name/series, colour and item code EXACTLY as printed. Never invent one.
- room_pattern is the room or area the product applies to, as printed ("Kitchen", "Bathrooms",
  "All Unit Type A bedrooms", "Corridors", "Kitchen Backsplash"). Use "ALL" for a project-wide default.
- Map each product to one of these categories EXACTLY:
""" + ", ".join(FLOOR_TYPE_NAMES) + """
- Include wall tile / backsplash entries — mark those with surface "wall" (floors are "floor").
- If a printed adhesive / setting material / underlayment is named, record it.
- Anything unreadable goes in flags. Do NOT guess.

Return STRICT JSON only, no prose or markdown fence:
{
 "flags": ["..."],
 "brief": "1-2 sentence summary of the finish schedule",
 "specs": [
   {"room_pattern":"Kitchen Backsplash","surface":"wall","floor_type":"Ceramic Tile",
    "product":"Daltile Rittenhouse Square 3x6 Arctic White RS01",
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
        "spec_note": best.get("note") or f"Specified for '{best.get('room_pattern')}'",
    }
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


def build_line(raw: dict[str, Any], job_id: str, labor_rate: float) -> dict[str, Any]:
    scope = raw.get("scope") or "supply_install"
    if scope not in ("supply_install", "install_only", "supply_only", "misc"):
        scope = "supply_install"
    ft = raw.get("floor_type") or "Luxury Vinyl Plank"
    if ft not in FLOOR_TYPE_NAMES:
        ft = "Luxury Vinyl Plank"
    d = defaults_for(ft)
    sqft = float(raw.get("sqft") or 0) or round(float(raw.get("length_ft") or 0) * float(raw.get("width_ft") or 0), 1)
    waste = float(raw["waste_pct"]) if raw.get("waste_pct") is not None else float(d["waste"])
    total_sqft = round(sqft * (1 + waste / 100), 1)
    return {
        "id": str(uuid.uuid4()),
        "job_id": job_id,
        "building": raw.get("building") or "Building A",
        "unit": raw.get("unit") or "Main",
        "room": raw.get("room") or "Room",
        "scope": scope,
        "floor_type": "" if scope == "misc" else ft,
        "product": raw.get("product") or "",
        "spec_note": raw.get("spec_note") or "",
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
    total_sqft = float(line["sqft"]) * (1 + float(line["waste_pct"]) / 100)
    material = total_sqft * float(line["material_cost_per_sqft"])
    labor = float(line["labor_hours"]) * float(line["labor_rate"])
    if scope == "install_only":
        return round(labor, 2)
    if scope == "supply_only":
        return round(material, 2)
    return round(material + labor, 2)
