"""Takeoff / quote / invoice PDF export in three selectable templates (reportlab)."""

import base64
import binascii
import io
from datetime import datetime, timezone
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

from lib.flooring import scope_label

TEMPLATES = {
    "contractor_clean": "Contractor Clean",
    "technical_readout": "Technical Readout",
    "classic_professional": "Classic Professional",
}
DEFAULT_TEMPLATE = "contractor_clean"


def _theme(template: str) -> dict[str, Any]:
    if template == "technical_readout":
        return {
            "page_bg": colors.HexColor("#0B121A"),
            "ink": colors.HexColor("#F1F5F9"),
            "muted": colors.HexColor("#94A3B8"),
            "accent": colors.HexColor("#E2F952"),
            "accent_ink": colors.HexColor("#0B121A"),
            "rule": colors.HexColor("#1E293B"),
            "band": colors.HexColor("#131D2A"),
            "head_font": "Helvetica-Bold",
            "body_font": "Courier",
            "num_font": "Courier-Bold",
            "title_size": 22,
            "upper_titles": True,
        }
    if template == "classic_professional":
        return {
            "page_bg": colors.white,
            "ink": colors.HexColor("#1A1A1A"),
            "muted": colors.HexColor("#666666"),
            "accent": colors.HexColor("#1F3A5F"),
            "accent_ink": colors.white,
            "rule": colors.HexColor("#C9C9C9"),
            "band": colors.HexColor("#F2F4F7"),
            "head_font": "Times-Bold",
            "body_font": "Times-Roman",
            "num_font": "Times-Bold",
            "title_size": 21,
            "upper_titles": False,
        }
    return {  # contractor_clean — high contrast, big numbers, crew friendly
        "page_bg": colors.white,
        "ink": colors.HexColor("#0B0B0B"),
        "muted": colors.HexColor("#5A5A5A"),
        "accent": colors.HexColor("#111111"),
        "accent_ink": colors.white,
        "rule": colors.HexColor("#BFBFBF"),
        "band": colors.HexColor("#EDEDED"),
        "head_font": "Helvetica-Bold",
        "body_font": "Helvetica",
        "num_font": "Helvetica-Bold",
        "title_size": 24,
        "upper_titles": True,
    }


def _doc(buf: io.BytesIO, t: dict[str, Any], footer: str) -> BaseDocTemplate:
    doc = BaseDocTemplate(
        buf, pagesize=letter, leftMargin=0.6 * inch, rightMargin=0.6 * inch,
        topMargin=0.6 * inch, bottomMargin=0.7 * inch, title=footer,
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")

    def paint(canvas, _doc):
        canvas.saveState()
        if t["page_bg"] != colors.white:
            canvas.setFillColor(t["page_bg"])
            canvas.rect(0, 0, letter[0], letter[1], stroke=0, fill=1)
        canvas.setFillColor(t["muted"])
        canvas.setFont(t["body_font"], 8)
        canvas.drawString(doc.leftMargin, 0.45 * inch, footer)
        canvas.drawRightString(letter[0] - doc.rightMargin, 0.45 * inch, f"Page {canvas.getPageNumber()}")
        canvas.setStrokeColor(t["rule"])
        canvas.setLineWidth(0.5)
        canvas.line(doc.leftMargin, 0.62 * inch, letter[0] - doc.rightMargin, 0.62 * inch)
        canvas.restoreState()

    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=paint)])
    return doc


def _styles(t: dict[str, Any]) -> dict[str, ParagraphStyle]:
    return {
        "title": ParagraphStyle("title", fontName=t["head_font"], fontSize=t["title_size"],
                                textColor=t["ink"], leading=t["title_size"] + 3, spaceAfter=2),
        "sub": ParagraphStyle("sub", fontName=t["body_font"], fontSize=9.5, textColor=t["muted"], leading=13),
        "h2": ParagraphStyle("h2", fontName=t["head_font"], fontSize=11, textColor=t["ink"],
                             leading=14, spaceBefore=12, spaceAfter=5),
        "body": ParagraphStyle("body", fontName=t["body_font"], fontSize=9, textColor=t["ink"], leading=12),
        "small": ParagraphStyle("small", fontName=t["body_font"], fontSize=7.8, textColor=t["muted"], leading=10),
        "cell": ParagraphStyle("cell", fontName=t["body_font"], fontSize=8, textColor=t["ink"], leading=10),
        "cellb": ParagraphStyle("cellb", fontName=t["head_font"], fontSize=8, textColor=t["ink"], leading=10),
        "num": ParagraphStyle("num", fontName=t["num_font"], fontSize=8.5, textColor=t["ink"],
                              leading=11, alignment=TA_RIGHT),
    }


def _money(v: float) -> str:
    return f"${v:,.2f}"


def _logo(company: dict):
    """The account's uploaded logo (data URI) as a ~0.9in tall flowable, or None."""
    raw = company.get("logo_data") or ""
    if "base64," not in raw:
        return None
    try:
        data = base64.b64decode(raw.split("base64,", 1)[1])
        img = Image(io.BytesIO(data))
    except (binascii.Error, OSError, ValueError):
        return None
    scale = min(1.6 * inch / max(img.imageWidth, 1), 0.62 * inch / max(img.imageHeight, 1))
    img.drawWidth = img.imageWidth * scale
    img.drawHeight = img.imageHeight * scale
    return img


def _header(story: list, t: dict, s: dict, doc_kind: str, heading: str, meta: list[tuple[str, str]], company: dict):
    title = heading.upper() if t["upper_titles"] else heading
    left: list = []
    logo = _logo(company)
    if logo is not None:
        left += [logo, Spacer(1, 6)]
    left += [
        Paragraph(f"<b>{company.get('name') or 'Gridline'}</b>", s["h2"]),
        Paragraph(company.get("email") or "", s["small"]),
    ]
    if company.get("business_number"):
        left.append(Paragraph(f"Business no. {company['business_number']}", s["small"]))
    if company.get("tax_number"):
        left.append(Paragraph(f"Tax no. {company['tax_number']}", s["small"]))
    left += [
        Spacer(1, 6),
        Paragraph(title, s["title"]),
    ]
    right_rows = [[Paragraph(f"<b>{k}</b>", s["small"]), Paragraph(v, s["small"])] for k, v in meta]
    right = Table(right_rows, colWidths=[1.05 * inch, 1.55 * inch]) if right_rows else Spacer(1, 1)
    if right_rows:
        right.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ]))
    band = Table([[left, right]], colWidths=[4.1 * inch, 3.2 * inch])
    band.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, 0), (-1, -1), 1.1, t["accent"]),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(band)
    story.append(Spacer(1, 12))
    story.append(Paragraph(doc_kind, s["sub"]))
    story.append(Spacer(1, 6))


def _line_table(lines: list[dict], t: dict, s: dict, show_product: bool) -> Table:
    head = ["Room", "Scope", "Floor / item", "SF", "Waste", "Labor hr", "Cost"]
    widths = [1.5 * inch, 0.85 * inch, 2.15 * inch, 0.6 * inch, 0.55 * inch, 0.7 * inch, 0.95 * inch]
    rows: list[list] = [[Paragraph(f"<b>{h}</b>", s["cellb"]) for h in head]]
    for line in lines:
        # The branded product leads; the generic floor type and adhesive are the sub-line.
        category = line.get("floor_type") or line.get("room") or "—"
        product = (line.get("product") or "").strip() if show_product else ""
        if product:
            desc = f"<b>{product}</b>"
            sub = category
            if line.get("product_alt"):
                sub = f"{sub} · or approved equal: {line['product_alt']}"
            elif line.get("adhesive"):
                sub = f"{sub} · {line['adhesive']}"
            desc = f"{desc}<br/><font size=7>{sub}</font>"
        else:
            desc = category
            if line.get("adhesive"):
                desc = f"{desc}<br/><font size=7>{line['adhesive']}</font>"
        misc = line.get("scope") == "misc"
        acc = line.get("scope") == "accessory"
        scope_text = "Misc." if misc else scope_label(line.get("scope", "supply_install")).replace(" (labor)", "").replace(" (material)", "")
        if acc:
            # Counted trim work reads as "4 @ $18.00 ea" in the SF / waste columns.
            qty_text = f"{float(line.get('qty', 0)):,.0f} ea"
            waste_text = f"@ {_money(float(line.get('unit_price', 0)))}"
        else:
            qty_text = "—" if misc else f"{float(line.get('sqft', 0)):,.0f}"
            waste_text = "—" if misc else f"{float(line.get('waste_pct', 0)):,.0f}%"
        rows.append([
            Paragraph(str(line.get("room", "")), s["cell"]),
            Paragraph(scope_text, s["cell"]),
            Paragraph(desc, s["cell"]),
            Paragraph(qty_text, s["num"]),
            Paragraph(waste_text, s["num"]),
            Paragraph("—" if misc else f"{float(line.get('labor_hours', 0)):,.1f}", s["num"]),
            Paragraph(_money(float(line.get("cost", 0))), s["num"]),
        ])
    table = Table(rows, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), t["band"]),
        ("TEXTCOLOR", (0, 0), (-1, -1), t["ink"]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, t["accent"]),
        ("LINEBELOW", (0, 1), (-1, -1), 0.3, t["rule"]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def _totals_block(t: dict, s: dict, rows: list[tuple[str, str, bool]]) -> Table:
    data = []
    for label, value, strong in rows:
        style = s["cellb"] if strong else s["cell"]
        data.append([Paragraph(label, style), Paragraph(value, s["num"] if not strong else
                     ParagraphStyle("big", parent=s["num"], fontSize=11, fontName=t["num_font"]))])
    table = Table(data, colWidths=[2.3 * inch, 1.4 * inch])
    table.setStyle(TableStyle([
        ("LINEABOVE", (0, len(data) - 1), (-1, len(data) - 1), 1.0, t["accent"]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, len(data) - 1), (-1, len(data) - 1), t["band"]),
    ]))
    return table


def _grouped(lines: list[dict]) -> list[tuple[str, list[dict]]]:
    out: dict[str, list[dict]] = {}
    for line in lines:
        key = f"{line.get('building', '')} / {line.get('unit', '')}".strip(" /")
        out.setdefault(key or "Takeoff", []).append(line)
    return list(out.items())


def takeoff_pdf(job: dict, lines: list[dict], company: dict, template: str) -> bytes:
    t, buf = _theme(template), io.BytesIO()
    s = _styles(t)
    doc = _doc(buf, t, f"Gridline takeoff · {job.get('name', '')}")
    story: list = []
    _header(story, t, s, "FIELD TAKEOFF SHEET", job.get("name", "Takeoff"), [
        ("Client", job.get("client_name") or "—"),
        ("Site", job.get("address") or "—"),
        ("Drawing scale", job.get("scale") or "—"),
        ("Printed", datetime.now(timezone.utc).strftime("%d %b %Y")),
    ], company)

    if job.get("brief"):
        story.append(Paragraph(job["brief"], s["body"]))
        story.append(Spacer(1, 4))
    summary = (f"{job.get('buildings', 0)} building(s) · {job.get('units', 0)} unit(s) · "
               f"{job.get('bedrooms', 0)} bedrooms · {job.get('bathrooms', 0)} bathrooms")
    story.append(Paragraph(summary, s["small"]))

    total_sqft = sum(float(line.get("sqft", 0)) for line in lines)
    total_gal = sum(float(line.get("adhesive_gallons", 0)) for line in lines)
    total_hrs = sum(float(line.get("labor_hours", 0)) for line in lines)
    story.append(Spacer(1, 10))
    strip = Table([[
        Paragraph(f"<b>{total_sqft:,.0f}</b><br/><font size=7>TOTAL SQ FT</font>", s["cell"]),
        Paragraph(f"<b>{total_gal:,.1f}</b><br/><font size=7>ADHESIVE GAL</font>", s["cell"]),
        Paragraph(f"<b>{total_hrs:,.1f}</b><br/><font size=7>LABOR HOURS</font>", s["cell"]),
        Paragraph(f"<b>{len(lines)}</b><br/><font size=7>LINE ITEMS</font>", s["cell"]),
    ]], colWidths=[1.82 * inch] * 4)
    strip.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), t["band"]),
        ("BOX", (0, 0), (-1, -1), 0.4, t["rule"]),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, t["rule"]),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(strip)

    for group, items in _grouped(lines):
        story.append(Paragraph(group.upper() if t["upper_titles"] else group, s["h2"]))
        story.append(_line_table(items, t, s, show_product=True))

    flags = job.get("flags") or []
    if flags:
        story.append(Paragraph("FLAGGED FOR MANUAL REVIEW" if t["upper_titles"] else "Flagged for manual review", s["h2"]))
        for f in flags:
            story.append(Paragraph(f"• {f}", s["small"]))

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        "Field sheet only — quantities include waste factor and are subject to site verification.", s["small"]))
    doc.build(story)
    return buf.getvalue()


def quote_pdf(kind: str, record: dict, job: dict, company: dict, template: str) -> bytes:
    """kind is 'QUOTE' or 'INVOICE'; record is a quote or invoice doc."""
    t, buf = _theme(template), io.BytesIO()
    s = _styles(t)
    number = record.get("number", "")
    doc = _doc(buf, t, f"{kind.title()} {number} · {company.get('name') or 'Gridline'}")
    story: list = []

    meta = [("Number", number), ("Date", datetime.now(timezone.utc).strftime("%d %b %Y"))]
    if kind == "QUOTE":
        meta.append(("Revision", str(record.get("revision", 1))))
    meta.append(("Status", str(record.get("status", "")).upper()))
    _header(story, t, s, kind, job.get("name", ""), meta, company)

    bill_to = [
        Paragraph("<b>Bill to</b>", s["small"]),
        Paragraph(job.get("client_name") or "—", s["body"]),
        Paragraph(job.get("client_email") or "", s["small"]),
        Paragraph(job.get("address") or "", s["small"]),
    ]
    story.append(Table([[bill_to]], colWidths=[3.4 * inch], style=TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)])))

    lines = record.get("lines") or []
    for group, items in _grouped(lines):
        story.append(Paragraph(group.upper() if t["upper_titles"] else group, s["h2"]))
        story.append(_line_table(items, t, s, show_product=True))

    subtotal = float(record.get("subtotal", 0))
    disc = float(record.get("discount_amount", 0))
    tax = float(record.get("tax_amount", 0))
    total = float(record.get("total", 0))
    rows = [("Subtotal", _money(subtotal), False)]
    if disc:
        rows.append((f"Discount ({record.get('discount_pct', 0)}%)" if kind == "QUOTE" else "Discount", f"-{_money(disc)}", False))
    rows.append((f"{record.get('tax_label', 'Tax')}", _money(tax), False))
    rows.append(("TOTAL DUE" if kind == "INVOICE" else "QUOTED TOTAL", _money(total), True))

    story.append(Spacer(1, 10))
    holder = Table([[Spacer(1, 1), _totals_block(t, s, rows)]], colWidths=[3.6 * inch, 3.7 * inch])
    holder.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(holder)

    if record.get("notes"):
        story.append(Spacer(1, 12))
        story.append(Paragraph("Notes", s["h2"]))
        story.append(Paragraph(str(record["notes"]), s["body"]))

    story.append(Spacer(1, 16))
    tail = ("Payment due on receipt. Pay online using the link in the accompanying email."
            if kind == "INVOICE" else
            "Quotation valid for 30 days. Quantities include the waste factor shown per line. "
            "Accepting this quote authorises the scope of work listed above.")
    story.append(KeepTogether(Paragraph(tail, s["small"])))
    doc.build(story)
    return buf.getvalue()


def change_order_pdf(diff: dict, job: dict, company: dict, template: str) -> bytes:
    """One-page revision comparison the client can sign: what changed, by how much, and the
    new total — history intact, nothing rewritten."""
    t, buf = _theme(template), io.BytesIO()
    s = _styles(t)
    doc = _doc(buf, t, f"Change order · {diff.get('to_number', '')} · {company.get('name') or 'Gridline'}")
    story: list = []
    _header(story, t, s, "CHANGE ORDER", job.get("name", ""), [
        ("From", f"{diff.get('from_number', '')} (rev {diff.get('from_revision', '')})"),
        ("To", f"{diff.get('to_number', '')} (rev {diff.get('to_revision', '')})"),
        ("Date", datetime.now(timezone.utc).strftime("%d %b %Y")),
    ], company)

    story.append(Paragraph(
        f"Client: {job.get('client_name') or '—'} · Site: {job.get('address') or '—'}", s["small"]))
    story.append(Spacer(1, 10))

    delta = float(diff.get("delta", 0))
    strip = Table([[
        Paragraph(f"<b>{_money(float(diff.get('from_total', 0)))}</b><br/><font size=7>PREVIOUS TOTAL</font>", s["cell"]),
        Paragraph(f"<b>{_money(float(diff.get('to_total', 0)))}</b><br/><font size=7>REVISED TOTAL</font>", s["cell"]),
        Paragraph(f"<b>{'+' if delta >= 0 else '-'}{_money(abs(delta))}</b><br/><font size=7>CHANGE</font>", s["cell"]),
    ]], colWidths=[2.43 * inch] * 3)
    strip.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), t["band"]),
        ("BOX", (0, 0), (-1, -1), 0.4, t["rule"]),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, t["rule"]),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(strip)

    moved = [row for row in diff.get("lines", []) if row.get("change") != "unchanged"]
    story.append(Paragraph("WHAT CHANGED" if t["upper_titles"] else "What changed", s["h2"]))
    if not moved:
        story.append(Paragraph("No line changed between these revisions.", s["body"]))
    else:
        head = ["Line", "Change", "Detail", "Was", "Now", "Difference"]
        widths = [1.55 * inch, 0.7 * inch, 2.2 * inch, 0.85 * inch, 0.85 * inch, 0.95 * inch]
        rows: list[list] = [[Paragraph(f"<b>{h}</b>", s["cellb"]) for h in head]]
        for row in moved:
            detail = "; ".join(f"{c['field']}: {c['before']} → {c['after']}"
                               for c in row.get("changes", [])) or "—"
            d = float(row.get("delta", 0))
            rows.append([
                Paragraph(f"{row.get('room', '')}<br/><font size=7>{row.get('building', '')} / {row.get('unit', '')}</font>", s["cell"]),
                Paragraph(str(row.get("change", "")).title(), s["cell"]),
                Paragraph(detail, s["cell"]),
                Paragraph(_money(float(row.get("old_cost", 0))), s["num"]),
                Paragraph(_money(float(row.get("new_cost", 0))), s["num"]),
                Paragraph(f"{'+' if d >= 0 else '-'}{_money(abs(d))}", s["num"]),
            ])
        table = Table(rows, colWidths=widths, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), t["band"]),
            ("TEXTCOLOR", (0, 0), (-1, -1), t["ink"]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.8, t["accent"]),
            ("LINEBELOW", (0, 1), (-1, -1), 0.3, t["rule"]),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(table)

    story.append(Spacer(1, 18))
    sign = Table([
        [Paragraph("Client signature", s["small"]), Paragraph("Date", s["small"])],
        [Spacer(1, 26), Spacer(1, 26)],
    ], colWidths=[4.4 * inch, 2.9 * inch])
    sign.setStyle(TableStyle([
        ("LINEBELOW", (0, 1), (-1, 1), 0.6, t["rule"]),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(KeepTogether(sign))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Signing authorises the revised scope and total above. Earlier revisions remain on record.",
        s["small"]))
    doc.build(story)
    return buf.getvalue()
