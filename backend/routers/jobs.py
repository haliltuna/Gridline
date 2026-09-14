import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from routers.products import remember_product
from lib.ai import apply_specs_to_line, build_accessory_lines, build_line, index_variance, line_cost, read_blueprint
from lib.authz import account_id, require
from lib.db import db
from lib.flooring import adhesive_gallons, defaults_for
from lib.plan_gate import needs_cap
from lib.pricing import CAP_EDIT, plan_for
from lib.usage_alerts import maybe_alert_usage
from models.billing import PageEstimate
from models.schemas import Job, JobIn, LineCreate, LineUpdate, TakeoffLine

router = APIRouter(tags=["jobs"])


def _with_cost(doc: dict) -> TakeoffLine:
    doc = {k: v for k, v in doc.items() if k != "_id"}
    doc["cost"] = line_cost(doc)
    return TakeoffLine(**doc)


async def _job_or_404(job_id: str, user_id: str) -> dict:
    job = await db.jobs.find_one({"id": job_id, "user_id": user_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/jobs", response_model=list[Job])
async def list_jobs(user: dict = Depends(require("job:read"))):
    docs = await db.jobs.find({"user_id": account_id(user)}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Job(**d) for d in docs]


@router.post("/jobs", response_model=Job)
async def create_job(body: JobIn, user: dict = Depends(require("job:write"))):
    job = Job(user_id=account_id(user), **body.model_dump())
    await db.jobs.insert_one(job.model_dump())
    return job


@router.get("/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str, user: dict = Depends(require("job:read"))):
    return Job(**await _job_or_404(job_id, account_id(user)))


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, user: dict = Depends(require("job:delete"))):
    await _job_or_404(job_id, account_id(user))
    await db.jobs.delete_one({"id": job_id})
    await db.takeoff_lines.delete_many({"job_id": job_id})
    return {"ok": True}


@router.post("/jobs/estimate", response_model=PageEstimate)
async def estimate_blueprint(file: UploadFile = File(...), user: dict = Depends(require("job:write"))):
    """Count the set and show what it will consume BEFORE any AI money is spent."""
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        import pymupdf

        pages = pymupdf.open(stream=raw, filetype="pdf").page_count
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read that PDF: {exc}") from exc

    acct = account_id(user)
    doc = await db.users.find_one({"id": acct}, {"_id": 0}) or {}
    plan = plan_for(doc.get("plan"))
    credits = int(doc.get("page_credits", 0))
    size_mb = round(len(raw) / (1024 * 1024), 1)

    if plan["pages_included"] < 0:
        return PageEstimate(filename=file.filename or "blueprint.pdf", pages=pages, size_mb=size_mb,
                            plan_name=plan["name"], pages_included=-1, pages_remaining=-1,
                            pages_after=-1, fits=True,
                            reason=f"{pages} pages · pooled volume on {plan['name']}.")

    start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    window = {"$gte": start} if plan["kind"] in ("subscription", "trial") else {"$gte": datetime(2000, 1, 1, tzinfo=timezone.utc)}
    prior = await db.jobs.find({"user_id": acct, "created_at": window},
                               {"_id": 0, "pages": 1, "pages_read": 1}).to_list(2000)
    used = sum(int(j.get("pages_read") or j.get("pages") or 0) for j in prior)
    allowance = plan["pages_included"] + credits
    remaining = max(0, allowance - used)
    fits = pages <= remaining and size_mb <= plan["max_file_mb"]
    if size_mb > plan["max_file_mb"]:
        reason = f"{size_mb} MB exceeds the {plan['max_file_mb']} MB file limit on {plan['name']}."
    elif fits:
        reason = (f"{pages} pages will use {pages} of your {remaining} remaining "
                  f"{plan['name']} pages, leaving {remaining - pages}.")
    else:
        reason = (f"{pages} pages but only {remaining} left on {plan['name']} — buy a page "
                  f"top-up or upgrade before reading this set.")
    return PageEstimate(filename=file.filename or "blueprint.pdf", pages=pages, size_mb=size_mb,
                        plan_name=plan["name"], pages_included=allowance,
                        pages_remaining=remaining, pages_after=max(0, remaining - pages),
                        fits=fits, reason=reason)


@router.post("/jobs/{job_id}/upload", response_model=Job)
async def upload_blueprint(job_id: str, file: UploadFile = File(...), user: dict = Depends(require("job:write"))):
    job = await _job_or_404(job_id, account_id(user))
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Blueprint must be a PDF")

    # Plan caps: file size, monthly page volume and job count. Pages are what actually cost
    # us money (one Opus vision call each), so that is the meter.
    acct_doc = await db.users.find_one({"id": account_id(user)}, {"_id": 0}) or {}
    plan = plan_for(acct_doc.get("plan"))
    size_mb = len(raw) / (1024 * 1024)
    if size_mb > plan["max_file_mb"]:
        raise HTTPException(status_code=413, detail=(
            f"That PDF is {size_mb:.0f} MB — {plan['name']} allows {plan['max_file_mb']} MB per file. "
            f"Split the set or upgrade your plan."))
    if plan["jobs_included"] >= 0:
        start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        window = {"$gte": start} if plan["kind"] in ("subscription", "trial") else {"$gte": datetime(2000, 1, 1, tzinfo=timezone.utc)}
        used = await db.jobs.count_documents({
            "user_id": account_id(user), "created_at": window,
            "status": {"$ne": "draft"}, "id": {"$ne": job_id},
        })
        if used >= plan["jobs_included"]:
            raise HTTPException(status_code=402, detail=(
                f"{plan['name']} includes {plan['jobs_included']} job(s) — you have used {used}. "
                f"Upgrade on the Billing page to read another set."))
    if plan["pages_included"] >= 0:
        start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        window = {"$gte": start} if plan["kind"] in ("subscription", "trial") else {"$gte": datetime(2000, 1, 1, tzinfo=timezone.utc)}
        prior = await db.jobs.find({"user_id": account_id(user), "created_at": window},
                                   {"_id": 0, "pages": 1, "pages_read": 1, "id": 1}).to_list(2000)
        used_pages = sum(int(j.get("pages_read") or j.get("pages") or 0) for j in prior if j["id"] != job_id)
        credits = int(acct_doc.get("page_credits", 0))
        remaining = plan["pages_included"] + credits - used_pages
        # Count the incoming set BEFORE spending a single Opus call: there is no overage
        # billing, so a set that does not fit is refused rather than partly paid for by us.
        try:
            import pymupdf

            incoming = pymupdf.open(stream=raw, filetype="pdf").page_count
        except Exception:  # noqa: BLE001 — unreadable PDFs are handled by read_blueprint below
            incoming = 1
        if remaining <= 0:
            raise HTTPException(status_code=402, detail=(
                f"{plan['name']} includes {plan['pages_included']} blueprint pages per period and you "
                f"have used all {used_pages}. Buy a page top-up or upgrade on the Billing page."))
        if incoming > remaining:
            raise HTTPException(status_code=402, detail=(
                f"That set is {incoming} pages but only {remaining} of your "
                f"{plan['pages_included'] + credits} {plan['name']} pages are left this period. "
                f"Buy a 25-page top-up on the Billing page, upgrade, or upload part of the set."))

    # Spec-first: if a finish schedule was read before the drawings, its products ride along
    # into the measuring pass so every room lands with the specified product already on it.
    job_specs = [sp for sp in (job.get("specs") or []) if isinstance(sp, dict)]
    try:
        result = await read_blueprint(raw, file.filename or "blueprint.pdf", specs=job_specs)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read that PDF: {exc}") from exc

    settings = await db.settings.find_one({"user_id": account_id(user)}, {"_id": 0}) or {}
    labor_rate = float(settings.get("labor_rate", 58.0))

    await db.takeoff_lines.delete_many({"job_id": job_id})
    waste_overrides = {k: float(v) for k, v in (settings.get("waste_overrides") or {}).items()}
    lines = [build_line(r, job_id, labor_rate, waste_overrides) for r in result["lines"]]
    if job_specs:
        for line in lines:
            line.update(apply_specs_to_line(line, job_specs))
    # Doors become transition strips, stair treads become nosings — counted, then priced.
    lines += build_accessory_lines(result, job_id, labor_rate, {
        "transition": float(settings.get("acc_transition_price") or 0),
        "tile_profile": float(settings.get("acc_tile_profile_price") or 0),
        "nosing": float(settings.get("acc_nosing_price") or 0),
        "cove_base": float(settings.get("acc_cove_base_price") or 0),
    })
    if lines:
        await db.takeoff_lines.insert_many([dict(line) for line in lines])

    update = {
        "status": "takeoff",
        "filename": file.filename or "blueprint.pdf",
        "pages": int(result.get("pages") or 0),
        "pages_read": int(result.get("pages_read") or 0),
        "engine": result.get("engine", ""),
        "scale": result.get("scale"),
        "project_type": result.get("project_type") or "",
        "buildings": int(result.get("buildings") or 0),
        "units": int(result.get("units") or 0),
        "bedrooms": int(result.get("bedrooms") or 0),
        "bathrooms": int(result.get("bathrooms") or 0),
        "stated_total_sqft": result.get("stated_total_sqft"),
        "cross_check_note": result.get("cross_check_note"),
        "doors": int(result.get("doors") or sum(int(a.get("doors") or 0) for a in (result.get("accessories") or []) if isinstance(a, dict))),
        "steps": int(result.get("steps") or sum(int(a.get("steps") or 0) for a in (result.get("accessories") or []) if isinstance(a, dict))),
        "cove_base_lf": float(result.get("cove_base_lf") or sum(float(a.get("cove_base_lf") or 0) for a in (result.get("accessories") or []) if isinstance(a, dict))),
        "tile_profile_lf": float(result.get("tile_profile_lf") or sum(float(a.get("tile_profile_lf") or 0) for a in (result.get("accessories") or []) if isinstance(a, dict))),
        "index_stated": result.get("index_stated") or {},
        "index_variance": index_variance(
            result,
            round(sum(float(line.get("sqft") or 0) for line in lines), 2),
            int(result.get("units") or 0),
        ),
        "brief": result.get("brief") or "",
        "flags": [str(f) for f in (result.get("flags") or [])],
    }
    await db.jobs.update_one({"id": job_id}, {"$set": update})
    job.update(update)
    await maybe_alert_usage(account_id(user))
    return Job(**job)


@router.get("/jobs/{job_id}/lines", response_model=list[TakeoffLine])
async def list_lines(job_id: str, user: dict = Depends(require("takeoff:read"))):
    await _job_or_404(job_id, account_id(user))
    docs = await db.takeoff_lines.find({"job_id": job_id}, {"_id": 0}).to_list(2000)
    docs.sort(key=lambda d: (d["building"], d["unit"], d["room"]))
    return [_with_cost(d) for d in docs]


@router.post("/jobs/{job_id}/lines", response_model=TakeoffLine)
async def add_line(job_id: str, body: LineCreate, user: dict = Depends(require("takeoff:write"))):
    await needs_cap(user, CAP_EDIT)
    await _job_or_404(job_id, account_id(user))
    settings = await db.settings.find_one({"user_id": account_id(user)}, {"_id": 0}) or {}
    payload = body.model_dump()
    if payload.get("scope") == "accessory" and not payload.get("unit_price"):
        # Fall back to the account's accessory catalogue, picked from the room name.
        room = (payload.get("room") or "").lower()
        key = ("acc_nosing_price" if "nosing" in room or "step" in room
               else "acc_cove_base_price" if "base" in room
               else "acc_transition_price")
        payload["unit_price"] = float(settings.get(key) or 0)
    line = build_line(payload, job_id, float(settings.get("labor_rate", 58.0)),
                      {k: float(v) for k, v in (settings.get("waste_overrides") or {}).items()})
    await db.takeoff_lines.insert_one(dict(line))
    return _with_cost(line)


@router.patch("/lines/{line_id}", response_model=TakeoffLine)
async def update_line(line_id: str, body: LineUpdate, user: dict = Depends(require("takeoff:write"))):
    await needs_cap(user, CAP_EDIT)
    line = await db.takeoff_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    await _job_or_404(line["job_id"], account_id(user))
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    line.update(patch)

    if line.get("scope") == "misc":
        # Miscellaneous work is a flat price — no area, waste, adhesive or derived labor.
        line.update({"floor_type": "", "sqft": 0.0, "waste_pct": 0.0, "adhesive": "",
                     "adhesive_gallons": 0.0, "material_cost_per_sqft": 0.0, "labor_hours": 0.0})
        await db.takeoff_lines.update_one({"id": line_id}, {"$set": line})
        return _with_cost(line)

    if patch.get("product"):
        await remember_product(account_id(user), line)
    if line.get("scope") == "accessory":
        # Counted trim work: qty x unit price (+ its own install hours). No area or waste math.
        line.update({"floor_type": "", "sqft": 0.0, "waste_pct": 0.0, "adhesive": "",
                     "adhesive_gallons": 0.0, "material_cost_per_sqft": 0.0, "flat_cost": 0.0})
        await db.takeoff_lines.update_one({"id": line_id}, {"$set": line})
        return _with_cost(line)

    # Leaving misc for a real floor scope: restore sensible defaults for the chosen type.
    if not line.get("floor_type"):
        line["floor_type"] = "Luxury Vinyl Plank"
    if "floor_type" in patch or patch.get("scope") in ("supply_install", "install_only", "supply_only"):
        d = defaults_for(line["floor_type"])
        line["material_cost_per_sqft"] = line.get("material_cost_per_sqft") or float(d["material"])
        if "floor_type" in patch:
            line["adhesive"] = d["adhesive"]
            line["material_cost_per_sqft"] = float(d["material"])
            if "waste_pct" not in patch:
                line["waste_pct"] = float(d["waste"])
        if not line.get("waste_pct"):
            line["waste_pct"] = float(d["waste"])

    total_sqft = float(line["sqft"]) * (1 + float(line["waste_pct"]) / 100)
    d = defaults_for(line["floor_type"])
    # Install-only still needs glue; supply-only bills material with no labor.
    line["adhesive"] = "" if line["scope"] == "install_only" and not line.get("adhesive") else line.get("adhesive") or d["adhesive"]
    line["adhesive_gallons"] = adhesive_gallons(line["floor_type"], total_sqft)
    line["flat_cost"] = 0.0
    if "labor_hours" not in patch:
        line["labor_hours"] = round(total_sqft / 100 * float(d["labor_hr_per_100sqft"]), 2)
    await db.takeoff_lines.update_one({"id": line_id}, {"$set": line})
    return _with_cost(line)


@router.delete("/lines/{line_id}")
async def delete_line(line_id: str, user: dict = Depends(require("takeoff:write"))):
    await needs_cap(user, CAP_EDIT)
    line = await db.takeoff_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    await _job_or_404(line["job_id"], account_id(user))
    await db.takeoff_lines.delete_one({"id": line_id})
    return {"ok": True}


@router.post("/jobs/{job_id}/approve-all", response_model=list[TakeoffLine])
async def approve_all(job_id: str, user: dict = Depends(require("takeoff:write"))):
    await needs_cap(user, CAP_EDIT)
    await _job_or_404(job_id, account_id(user))
    await db.takeoff_lines.update_many({"job_id": job_id}, {"$set": {"approved": True}})
    docs = await db.takeoff_lines.find({"job_id": job_id}, {"_id": 0}).to_list(2000)
    docs.sort(key=lambda d: (d["building"], d["unit"], d["room"]))
    return [_with_cost(d) for d in docs]


# marker: uuid import kept for build_line ids created elsewhere
_ = uuid, datetime, timezone
