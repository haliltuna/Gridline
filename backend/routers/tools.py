"""Spec sheets, unit templates, quote revision diffs and PDF export."""

import uuid
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile

from lib.ai import apply_specs_to_line, build_line, line_cost, read_spec_sheet
from lib.authz import account_id, require
from lib.db import db
from lib.flooring import FLOOR_TYPE_NAMES, MISC_PRESETS, SCOPES
from lib.pdf import DEFAULT_TEMPLATE, TEMPLATES, quote_pdf, takeoff_pdf
from models.schemas import (
    DiffLine, Job, QuoteDiff, SpecReadResult, TakeoffLine, UnitTemplate,
    UnitTemplateApplyIn, UnitTemplateLine, UnitTemplateSaveIn,
)

router = APIRouter(tags=["takeoff-tools"])


async def _job_or_404(job_id: str, user_id: str) -> dict:
    job = await db.jobs.find_one({"id": job_id, "user_id": user_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def _company(user: dict) -> dict:
    s = await db.settings.find_one({"user_id": account_id(user)}, {"_id": 0}) or {}
    return {"name": s.get("company_name") or user.get("company") or "Gridline",
            "email": s.get("company_email") or user.get("email", ""),
            "template": s.get("pdf_template") or DEFAULT_TEMPLATE}


# ---------- reference data for the advanced menu ----------
@router.get("/reference/options")
async def reference_options():
    return {
        "scopes": [{"id": k, "label": v} for k, v in SCOPES.items()],
        "floor_types": FLOOR_TYPE_NAMES,
        "misc_presets": MISC_PRESETS,
        "pdf_templates": [{"id": k, "label": v} for k, v in TEMPLATES.items()],
    }


# ---------- spec sheet ----------
@router.post("/jobs/{job_id}/spec-sheet", response_model=SpecReadResult)
async def upload_spec_sheet(job_id: str, file: UploadFile = File(...), user: dict = Depends(require("takeoff:write"))):
    await _job_or_404(job_id, account_id(user))
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Spec sheet must be a PDF")
    result = await read_spec_sheet(raw, file.filename or "spec.pdf")
    specs = [s for s in result.get("specs", []) if isinstance(s, dict)]

    applied = 0
    if specs:
        lines = await db.takeoff_lines.find({"job_id": job_id}, {"_id": 0}).to_list(2000)
        for line in lines:
            patch = apply_specs_to_line(line, specs)
            if patch:
                await db.takeoff_lines.update_one({"id": line["id"]}, {"$set": patch})
                applied += 1

    await db.jobs.update_one({"id": job_id}, {"$set": {
        "specs": specs,
        "spec_filename": file.filename or "spec.pdf",
        "spec_brief": result.get("brief") or "",
    }})
    return SpecReadResult(
        specs=specs, flags=[str(f) for f in result.get("flags", [])], brief=result.get("brief") or "",
        engine=result.get("engine", ""), pages=int(result.get("pages") or 0), applied_to_lines=applied,
    )


@router.post("/jobs/{job_id}/specs/reapply", response_model=SpecReadResult)
async def reapply_specs(job_id: str, user: dict = Depends(require("takeoff:write"))):
    job = await _job_or_404(job_id, account_id(user))
    specs = job.get("specs") or []
    if not specs:
        raise HTTPException(status_code=400, detail="This job has no spec sheet yet")
    lines = await db.takeoff_lines.find({"job_id": job_id}, {"_id": 0}).to_list(2000)
    applied = 0
    for line in lines:
        patch = apply_specs_to_line(line, specs)
        if patch:
            await db.takeoff_lines.update_one({"id": line["id"]}, {"$set": patch})
            applied += 1
    return SpecReadResult(specs=specs, brief=job.get("spec_brief", ""), applied_to_lines=applied)


# ---------- unit templates ----------
@router.get("/unit-templates", response_model=list[UnitTemplate])
async def list_unit_templates(user: dict = Depends(require("takeoff:read"))):
    docs = await db.unit_templates.find({"user_id": account_id(user)}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [UnitTemplate(**d) for d in docs]


@router.post("/unit-templates", response_model=UnitTemplate)
async def save_unit_template(body: UnitTemplateSaveIn, job_id: str = Query(...), user: dict = Depends(require("takeoff:write"))):
    await _job_or_404(job_id, account_id(user))
    lines = await db.takeoff_lines.find(
        {"job_id": job_id, "building": body.building, "unit": body.unit}, {"_id": 0}
    ).to_list(500)
    if not lines:
        raise HTTPException(status_code=400, detail="That unit has no lines to save")
    tpl = UnitTemplate(
        user_id=account_id(user), name=body.name, source_job_id=job_id,
        lines=[UnitTemplateLine(
            room=line["room"], scope=line.get("scope", "supply_install"),
            floor_type=line.get("floor_type", ""), product=line.get("product", ""),
            sqft=float(line.get("sqft", 0)), waste_pct=float(line.get("waste_pct", 0)),
            flat_cost=float(line.get("flat_cost", 0)),
        ) for line in lines],
    )
    await db.unit_templates.insert_one(tpl.model_dump())
    return tpl


@router.delete("/unit-templates/{template_id}")
async def delete_unit_template(template_id: str, user: dict = Depends(require("takeoff:write"))):
    res = await db.unit_templates.delete_one({"id": template_id, "user_id": account_id(user)})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"ok": True}


@router.post("/unit-templates/{template_id}/apply", response_model=list[TakeoffLine])
async def apply_unit_template(template_id: str, body: UnitTemplateApplyIn, user: dict = Depends(require("takeoff:write"))):
    tpl = await db.unit_templates.find_one({"id": template_id, "user_id": account_id(user)}, {"_id": 0})
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await _job_or_404(body.job_id, account_id(user))
    units = [u.strip() for u in body.units if u.strip()]
    if not units:
        raise HTTPException(status_code=400, detail="Name at least one unit to apply the template to")

    settings = await db.settings.find_one({"user_id": account_id(user)}, {"_id": 0}) or {}
    labor_rate = float(settings.get("labor_rate", 58.0))
    specs = (await db.jobs.find_one({"id": body.job_id}, {"_id": 0, "specs": 1}) or {}).get("specs") or []

    new_docs = []
    for unit in units:
        if body.replace_existing:
            await db.takeoff_lines.delete_many({"job_id": body.job_id, "building": body.building, "unit": unit})
        for tl in tpl["lines"]:
            line = build_line({**tl, "building": body.building, "unit": unit}, body.job_id, labor_rate)
            if specs:
                line.update(apply_specs_to_line(line, specs))
            new_docs.append(line)
    if new_docs:
        await db.takeoff_lines.insert_many([dict(d) for d in new_docs])
    docs = await db.takeoff_lines.find({"job_id": body.job_id}, {"_id": 0}).to_list(4000)
    docs.sort(key=lambda d: (d["building"], d["unit"], d["room"]))
    return [TakeoffLine(**{**d, "cost": line_cost(d)}) for d in docs]


# ---------- revision diff ----------
def _diff_key(line: dict) -> str:
    return f"{line.get('building', '')}|{line.get('unit', '')}|{line.get('room', '')}".lower()


WATCHED = ["scope", "floor_type", "product", "sqft", "waste_pct", "labor_hours", "material_cost_per_sqft", "flat_cost"]


@router.get("/quotes/{quote_id}/diff", response_model=QuoteDiff)
async def quote_diff(quote_id: str, against: str = Query(..., description="quote id to compare against"),
                     user: dict = Depends(require("quote:read"))):
    new_q = await db.quotes.find_one({"id": quote_id, "user_id": account_id(user)}, {"_id": 0})
    old_q = await db.quotes.find_one({"id": against, "user_id": account_id(user)}, {"_id": 0})
    if not new_q or not old_q:
        raise HTTPException(status_code=404, detail="Quote not found")

    old_map = {_diff_key(line): line for line in old_q.get("lines", [])}
    new_map = {_diff_key(line): line for line in new_q.get("lines", [])}
    rows: list[DiffLine] = []

    for key, line in new_map.items():
        prev = old_map.get(key)
        if not prev:
            rows.append(DiffLine(key=key, room=line.get("room", ""), building=line.get("building", ""),
                                 unit=line.get("unit", ""), change="added",
                                 new_cost=float(line.get("cost", 0))))
            continue
        changed = [f for f in WATCHED if str(prev.get(f, "")) != str(line.get(f, ""))]
        rows.append(DiffLine(
            key=key, room=line.get("room", ""), building=line.get("building", ""), unit=line.get("unit", ""),
            change="changed" if changed else "unchanged",
            old_cost=float(prev.get("cost", 0)), new_cost=float(line.get("cost", 0)), fields=changed,
        ))
    for key, prev in old_map.items():
        if key not in new_map:
            rows.append(DiffLine(key=key, room=prev.get("room", ""), building=prev.get("building", ""),
                                 unit=prev.get("unit", ""), change="removed",
                                 old_cost=float(prev.get("cost", 0))))

    order = {"added": 0, "changed": 1, "removed": 2, "unchanged": 3}
    rows.sort(key=lambda r: (order[r.change], r.building, r.unit, r.room))
    return QuoteDiff(
        from_number=old_q["number"], to_number=new_q["number"],
        from_revision=int(old_q.get("revision", 1)), to_revision=int(new_q.get("revision", 1)),
        from_total=float(old_q.get("total", 0)), to_total=float(new_q.get("total", 0)),
        delta=round(float(new_q.get("total", 0)) - float(old_q.get("total", 0)), 2), lines=rows,
    )


# ---------- PDF export ----------
def _pdf_response(data: bytes, filename: str) -> Response:
    # HTTP headers are latin-1: an em dash in a job name (very common) would 500 the
    # download. Send an ASCII-safe fallback name plus the RFC 5987 UTF-8 form.
    ascii_name = filename.encode("ascii", "replace").decode("ascii").replace("?", "-")
    quoted = quote(filename)
    return Response(
        content=data, media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{ascii_name}"; filename*=UTF-8\'\'{quoted}',
        },
    )


def _template(requested: str | None, fallback: str) -> str:
    return requested if requested in TEMPLATES else fallback


@router.get("/jobs/{job_id}/takeoff.pdf")
async def download_takeoff_pdf(job_id: str, template: str | None = None, user: dict = Depends(require("export:read"))):
    job = await _job_or_404(job_id, account_id(user))
    company = await _company(user)
    docs = await db.takeoff_lines.find({"job_id": job_id}, {"_id": 0}).to_list(4000)
    docs.sort(key=lambda d: (d["building"], d["unit"], d["room"]))
    lines = [{**d, "cost": line_cost(d)} for d in docs]
    data = takeoff_pdf(job, lines, company, _template(template, company["template"]))
    safe = "".join(c for c in job.get("name", "takeoff") if c.isalnum() or c in " -_").strip() or "takeoff"
    return _pdf_response(data, f"{safe} — takeoff.pdf")


@router.get("/quotes/{quote_id}/pdf")
async def download_quote_pdf(quote_id: str, template: str | None = None, user: dict = Depends(require("export:read"))):
    q = await db.quotes.find_one({"id": quote_id, "user_id": account_id(user)}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    job = await db.jobs.find_one({"id": q["job_id"]}, {"_id": 0}) or {}
    company = await _company(user)
    data = quote_pdf("QUOTE", q, job, company, _template(template, company["template"]))
    return _pdf_response(data, f"{q['number']}.pdf")


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(invoice_id: str, template: str | None = None, user: dict = Depends(require("export:read"))):
    inv = await db.invoices.find_one({"id": invoice_id, "user_id": account_id(user)}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    job = await db.jobs.find_one({"id": inv["job_id"]}, {"_id": 0}) or {}
    company = await _company(user)
    if not inv.get("lines"):
        q = await db.quotes.find_one({"id": inv.get("quote_id")}, {"_id": 0}) or {}
        inv = {**inv, "lines": q.get("lines", [])}
    data = quote_pdf("INVOICE", inv, job, company, _template(template, company["template"]))
    return _pdf_response(data, f"{inv['number']}.pdf")


_ = uuid, datetime, timezone, Job
