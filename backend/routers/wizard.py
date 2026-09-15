"""Wizard profile + per-job overrides.

Two layers:
  * The account wizard — runs once, saved on the user's Settings document,
    editable any time from the Settings page.
  * Per-job overrides — saved on the Job document, cleared when the job is deleted,
    never touching the account defaults.

Every read endpoint returns a *merged* profile: the account defaults with any
per-job overrides applied on top. That single merged dict is what lib/ai.py reads
when building takeoff lines, so there is exactly one place that decides "what are
the settings for THIS job".
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.authz import account_id, require
from lib.db import db
from lib.limiter import limiter
from lib.wizard_config import default_profile, public_steps, visible_steps
from models.schemas import (
    JobOverridesIn,
    WizardProfile,
    WizardProfileIn,
)

router = APIRouter(tags=["wizard"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _merge_profile(profile: dict, overrides: dict | None) -> dict:
    """Layer per-job overrides on top of the account profile.

    Scalars (scope, install_method, adhesive_supplied_by, transition_rule) — override replaces.
    Dicts (rates_per_sqft, waste_pct, extra_work_billed) — merged key-by-key, so an override
    on one floor type doesn't wipe the other eleven.
    """
    merged = dict(default_profile())
    merged.update({k: v for k, v in (profile or {}).items() if v is not None})
    over = overrides or {}
    for scalar in ("scope", "install_method", "adhesive_supplied_by", "transition_rule"):
        if over.get(scalar):
            # Map JobOverrides.scope → profile.default_scope; install_method → default_install_method
            key = {"scope": "default_scope", "install_method": "default_install_method"}.get(scalar, scalar)
            merged[key] = over[scalar]
    for mapping in ("rates_per_sqft", "waste_pct", "extra_work_billed"):
        if over.get(mapping):
            base = dict(merged.get(mapping) or {})
            base.update(over[mapping])
            merged[mapping] = base
    return merged


async def _settings_doc(user: dict) -> dict:
    return await db.settings.find_one({"user_id": account_id(user)}, {"_id": 0}) or {}


async def _job_or_404(job_id: str, user_id: str) -> dict:
    job = await db.jobs.find_one({"id": job_id, "user_id": user_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ---------------------------------------------------------------------------
# Account wizard
# ---------------------------------------------------------------------------

@router.get("/wizard/steps")
async def wizard_steps():
    """The step definitions, minus Python-only keys, so the frontend can render them.

    Public — no auth. Knowing the shape of the wizard leaks nothing.
    """
    return {"steps": public_steps()}


@router.get("/wizard/profile", response_model=WizardProfile)
async def get_wizard_profile(user: dict = Depends(require("settings:read"))):
    """The account's wizard answers, or full defaults if the wizard hasn't been run."""
    doc = await _settings_doc(user)
    profile = doc.get("wizard_profile") or {}
    merged = _merge_profile(profile, None)
    return WizardProfile(**merged)


@router.put("/wizard/profile", response_model=WizardProfile)
async def save_wizard_profile(body: WizardProfileIn, user: dict = Depends(require("settings:write"))):
    """Save the account's wizard answers. Partial updates merge into what's already there."""
    acct = account_id(user)
    doc = await _settings_doc(user)
    existing = doc.get("wizard_profile") or {}

    updates = body.model_dump(exclude_unset=True)
    for mapping in ("rates_per_sqft", "waste_pct", "extra_work_billed"):
        if mapping in updates and updates[mapping]:
            base = dict(existing.get(mapping) or {})
            base.update(updates[mapping])
            updates[mapping] = base

    # Mark complete on any explicit save unless the frontend says otherwise
    if "completed" not in updates:
        updates["completed"] = True

    existing.update({k: v for k, v in updates.items() if v is not None})
    await db.settings.update_one(
        {"user_id": acct},
        {"$set": {"wizard_profile": existing}},
        upsert=True,
    )
    merged = _merge_profile(existing, None)
    return WizardProfile(**merged)


# ---------------------------------------------------------------------------
# Per-job overrides
# ---------------------------------------------------------------------------

@router.get("/jobs/{job_id}/profile", response_model=WizardProfile)
async def job_profile(job_id: str, user: dict = Depends(require("job:read"))):
    """The merged profile for a specific job — account wizard + this job's overrides."""
    job = await _job_or_404(job_id, account_id(user))
    doc = await _settings_doc(user)
    merged = _merge_profile(doc.get("wizard_profile") or {}, job.get("overrides") or {})
    return WizardProfile(**merged)


@router.put("/jobs/{job_id}/overrides", response_model=WizardProfile)
async def save_job_overrides(
    job_id: str,
    body: JobOverridesIn,
    user: dict = Depends(require("job:write")),
):
    """Save per-job overrides. Passing null/empty clears a field — falls back to the account default."""
    job = await _job_or_404(job_id, account_id(user))
    acct = account_id(user)

    existing = dict(job.get("overrides") or {})
    updates = body.model_dump(exclude_unset=True)

    for mapping in ("rates_per_sqft", "waste_pct", "extra_work_billed"):
        if mapping in updates and updates[mapping]:
            base = dict(existing.get(mapping) or {})
            base.update(updates[mapping])
            updates[mapping] = base

    for key, value in updates.items():
        if value is None:
            existing.pop(key, None)
        else:
            existing[key] = value

    await db.jobs.update_one(
        {"id": job_id, "user_id": acct},
        {"$set": {"overrides": existing}},
    )

    doc = await _settings_doc(user)
    merged = _merge_profile(doc.get("wizard_profile") or {}, existing)
    return WizardProfile(**merged)


@router.delete("/jobs/{job_id}/overrides")
async def clear_job_overrides(job_id: str, user: dict = Depends(require("job:write"))):
    """Wipe this job's overrides — the account defaults take over again."""
    await _job_or_404(job_id, account_id(user))
    await db.jobs.update_one(
        {"id": job_id, "user_id": account_id(user)},
        {"$set": {"overrides": {}}},
    )
    return {"ok": True}