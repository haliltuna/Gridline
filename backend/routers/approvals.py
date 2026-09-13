"""Public change-order approval — the client e-signs a revision without logging in.

The opaque `approve_token` in the emailed link is the credential (same pattern as the
invoice pay token). Signing accepts the revision and stamps who signed and when; earlier
revisions stay untouched.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from lib.db import db
from models.schemas import ApprovalView, ApproveIn

router = APIRouter(tags=["approvals"])


async def _quote_by_token(token: str) -> dict:
    q = await db.quotes.find_one({"approve_token": token}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="That approval link is not valid")
    return q


def _view(q: dict, job: dict, settings: dict) -> ApprovalView:
    sig = q.get("signature") or {}
    return ApprovalView(
        number=q["number"], revision=q.get("revision", 1), job_name=job.get("name", ""),
        client_name=job.get("client_name", ""), company_name=settings.get("company_name", "Gridline"),
        status=q.get("status", "sent"), total=float(q.get("total", 0)),
        previous_total=float(q.get("change_order_from_total", 0)),
        delta=round(float(q.get("total", 0)) - float(q.get("change_order_from_total", 0)), 2)
        if q.get("change_order_from_total") is not None else 0.0,
        currency=settings.get("currency", "USD"),
        lines=q.get("change_order_lines") or [],
        signed_by=sig.get("name", ""), signed_at=str(sig.get("at", "")),
    )


@router.get("/approve/{token}", response_model=ApprovalView)
async def view_approval(token: str):
    q = await _quote_by_token(token)
    job = await db.jobs.find_one({"id": q["job_id"]}, {"_id": 0}) or {}
    settings = await db.settings.find_one({"user_id": q["user_id"]}, {"_id": 0}) or {}
    return _view(q, job, settings)


@router.post("/approve/{token}", response_model=ApprovalView)
async def sign_approval(token: str, body: ApproveIn, request: Request):
    q = await _quote_by_token(token)
    if not body.signed_by.strip():
        raise HTTPException(status_code=400, detail="Type your name to sign")
    if q.get("status") == "superseded":
        raise HTTPException(status_code=400, detail="A newer revision has replaced this one")
    signature = {
        "name": body.signed_by.strip(),
        "at": datetime.now(timezone.utc).isoformat(),
        "ip": request.client.host if request.client else "",
    }
    await db.quotes.update_one({"id": q["id"]}, {"$set": {"status": "accepted", "signature": signature}})
    await db.jobs.update_one({"id": q["job_id"]}, {"$set": {"status": "accepted"}})
    q.update({"status": "accepted", "signature": signature})
    job = await db.jobs.find_one({"id": q["job_id"]}, {"_id": 0}) or {}
    settings = await db.settings.find_one({"user_id": q["user_id"]}, {"_id": 0}) or {}
    return _view(q, job, settings)
