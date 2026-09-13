"""Team seats: owner invites estimators and viewers into the account."""

import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user, hash_password
from lib.authz import OWNER, ROLE_LABELS, ROLES, account_id, require, role_of
from lib.db import db
from models.schemas import MemberInviteIn, MemberRoleIn, TeamMember

router = APIRouter(prefix="/team", tags=["team"])


@router.get("/roles")
async def team_roles():
    return [{"id": r, "label": ROLE_LABELS[r]} for r in ROLES]


@router.get("/members", response_model=list[TeamMember])
async def list_members(user: dict = Depends(require("team:read"))):
    acct = account_id(user)
    docs = await db.users.find(
        {"$or": [{"id": acct}, {"account_id": acct}]},
        {"_id": 0, "password_hash": 0},
    ).sort("created_at", 1).to_list(200)
    return [
        TeamMember(
            id=d["id"], email=d["email"], name=d.get("name", ""),
            role=role_of(d), is_you=d["id"] == user["id"],
            created_at=d.get("created_at") or datetime.now(timezone.utc),
        )
        for d in docs
    ]


@router.post("/members", response_model=TeamMember)
async def invite_member(body: MemberInviteIn, user: dict = Depends(require("team:write"))):
    # A principal may only grant a role at or below its own: only owners reach this route,
    # and an owner may not mint a second owner from here.
    if body.role not in ROLES or body.role == OWNER:
        raise HTTPException(status_code=400, detail="Pick either Estimator or Viewer")
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Someone already uses that email")

    acct = account_id(user)
    # Seats are created ready-to-use with a temporary password the owner passes on; the
    # account_id is stamped SERVER-side from the inviter, never taken from the request.
    temp_password = body.temp_password or secrets.token_urlsafe(6)
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "company": user.get("company", ""),
        "plan": user.get("plan", "trial"),
        "account_id": acct,
        "role": body.role,
        "password_hash": hash_password(temp_password),
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(dict(doc))
    return TeamMember(
        id=doc["id"], email=email, name=body.name, role=body.role, is_you=False,
        created_at=doc["created_at"], temp_password=temp_password,
    )


@router.patch("/members/{member_id}", response_model=TeamMember)
async def set_member_role(member_id: str, body: MemberRoleIn, user: dict = Depends(require("team:write"))):
    if body.role not in ROLES or body.role == OWNER:
        raise HTTPException(status_code=400, detail="Pick either Estimator or Viewer")
    acct = account_id(user)
    if member_id == acct:
        raise HTTPException(status_code=400, detail="The account owner's role cannot be changed")
    member = await db.users.find_one({"id": member_id, "account_id": acct}, {"_id": 0, "password_hash": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    await db.users.update_one({"id": member_id}, {"$set": {"role": body.role}})
    return TeamMember(id=member["id"], email=member["email"], name=member.get("name", ""),
                      role=body.role, is_you=False,
                      created_at=member.get("created_at") or datetime.now(timezone.utc))


@router.delete("/members/{member_id}")
async def remove_member(member_id: str, user: dict = Depends(require("team:write"))):
    acct = account_id(user)
    if member_id == acct:
        raise HTTPException(status_code=400, detail="The account owner cannot be removed")
    res = await db.users.delete_one({"id": member_id, "account_id": acct})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Team member not found")
    await db.sessions.delete_many({"user_id": member_id})  # revoke immediately
    return {"ok": True}


_ = current_user
