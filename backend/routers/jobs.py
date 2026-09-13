import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from lib.ai import build_line, line_cost, read_blueprint
from lib.authz import account_id, require
from lib.db import db
from lib.flooring import adhesive_gallons, defaults_for
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


@router.post("/jobs/{job_id}/upload", response_model=Job)
async def upload_blueprint(job_id: str, file: UploadFile = File(...), user: dict = Depends(require("job:write"))):
    job = await _job_or_404(job_id, account_id(user))
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Blueprint must be a PDF")
    try:
        result = await read_blueprint(raw, file.filename or "blueprint.pdf")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read that PDF: {exc}") from exc

    settings = await db.settings.find_one({"user_id": account_id(user)}, {"_id": 0}) or {}
    labor_rate = float(settings.get("labor_rate", 58.0))

    await db.takeoff_lines.delete_many({"job_id": job_id})
    lines = [build_line(r, job_id, labor_rate) for r in result["lines"]]
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
        "brief": result.get("brief") or "",
        "flags": [str(f) for f in (result.get("flags") or [])],
    }
    await db.jobs.update_one({"id": job_id}, {"$set": update})
    job.update(update)
    return Job(**job)


@router.get("/jobs/{job_id}/lines", response_model=list[TakeoffLine])
async def list_lines(job_id: str, user: dict = Depends(require("takeoff:read"))):
    await _job_or_404(job_id, account_id(user))
    docs = await db.takeoff_lines.find({"job_id": job_id}, {"_id": 0}).to_list(2000)
    docs.sort(key=lambda d: (d["building"], d["unit"], d["room"]))
    return [_with_cost(d) for d in docs]


@router.post("/jobs/{job_id}/lines", response_model=TakeoffLine)
async def add_line(job_id: str, body: LineCreate, user: dict = Depends(require("takeoff:write"))):
    await _job_or_404(job_id, account_id(user))
    settings = await db.settings.find_one({"user_id": account_id(user)}, {"_id": 0}) or {}
    line = build_line(body.model_dump(), job_id, float(settings.get("labor_rate", 58.0)))
    await db.takeoff_lines.insert_one(dict(line))
    return _with_cost(line)


@router.patch("/lines/{line_id}", response_model=TakeoffLine)
async def update_line(line_id: str, body: LineUpdate, user: dict = Depends(require("takeoff:write"))):
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
    line = await db.takeoff_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    await _job_or_404(line["job_id"], account_id(user))
    await db.takeoff_lines.delete_one({"id": line_id})
    return {"ok": True}


@router.post("/jobs/{job_id}/approve-all", response_model=list[TakeoffLine])
async def approve_all(job_id: str, user: dict = Depends(require("takeoff:write"))):
    await _job_or_404(job_id, account_id(user))
    await db.takeoff_lines.update_many({"job_id": job_id}, {"$set": {"approved": True}})
    docs = await db.takeoff_lines.find({"job_id": job_id}, {"_id": 0}).to_list(2000)
    docs.sort(key=lambda d: (d["building"], d["unit"], d["room"]))
    return [_with_cost(d) for d in docs]


# marker: uuid import kept for build_line ids created elsewhere
_ = uuid, datetime, timezone
