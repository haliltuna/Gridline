"""Server-side plan gating.

Roles decide WHO may act (lib/authz); the plan decides WHAT the account may do. Every gated
capability is checked here on the request path, so a lower tier cannot reach a feature by
calling the API directly even if the UI hides the button.
"""

from fastapi import HTTPException

from lib.authz import account_id
from lib.db import db
from lib.pricing import has_cap, upgrade_message


async def account_plan(user: dict) -> str:
    doc = await db.users.find_one({"id": account_id(user)}, {"_id": 0, "plan": 1}) or {}
    return doc.get("plan") or "trial"


async def needs_cap(user: dict, cap: str) -> None:
    plan_id = await account_plan(user)
    if not has_cap(plan_id, cap):
        raise HTTPException(status_code=402, detail=upgrade_message(plan_id, cap))
