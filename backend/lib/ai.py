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
 "lines": [
   {{"building":"Building A","unit":"Unit 101","room":"Living Room",
     "floor_type":"Luxury Vinyl Plank","length_ft":18.0,"width_ft":14.0,"sqft":252.0,
     "source":"written dimension 18'-0\\" x 14'-0\\"","needs_review":false,"review_note":null}}
 ]
}}"""


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


def build_line(raw: dict[str, Any], job_id: str, labor_rate: float) -> dict[str, Any]:
    ft = raw.get("floor_type") or "Luxury Vinyl Plank"
    if ft not in FLOOR_TYPE_NAMES:
        ft = "Luxury Vinyl Plank"
    d = defaults_for(ft)
    sqft = float(raw.get("sqft") or 0) or round(float(raw.get("length_ft") or 0) * float(raw.get("width_ft") or 0), 1)
    waste = float(d["waste"])
    total_sqft = round(sqft * (1 + waste / 100), 1)
    return {
        "id": str(uuid.uuid4()),
        "job_id": job_id,
        "building": raw.get("building") or "Building A",
        "unit": raw.get("unit") or "Main",
        "room": raw.get("room") or "Room",
        "floor_type": ft,
        "sqft": sqft,
        "waste_pct": waste,
        "adhesive": d["adhesive"],
        "adhesive_gallons": adhesive_gallons(ft, total_sqft),
        "material_cost_per_sqft": float(d["material"]),
        "labor_hours": round(total_sqft / 100 * float(d["labor_hr_per_100sqft"]), 2),
        "labor_rate": labor_rate,
        "needs_review": bool(raw.get("needs_review")),
        "review_note": raw.get("review_note"),
        "source": raw.get("source"),
        "approved": False,
    }


def line_cost(line: dict[str, Any]) -> float:
    total_sqft = float(line["sqft"]) * (1 + float(line["waste_pct"]) / 100)
    return round(total_sqft * float(line["material_cost_per_sqft"]) + float(line["labor_hours"]) * float(line["labor_rate"]), 2)
