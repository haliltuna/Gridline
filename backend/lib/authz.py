"""Authorization: one decision function, deny-by-default.

Scope per the backend-authorization skill's Step 0: a Gridline "account" is one flooring
company (the tenant). Every domain document is stamped with `user_id` = the ACCOUNT id, so
tenant scoping is the existing filter — members of an account see the account's data, never
another account's. On top of that sits a 3-role RBAC:

  owner     — everything, including settings, billing, team and deleting jobs
  estimator — reads everything and edits jobs/takeoffs/quotes/invoices/expenses
  viewer    — read-only (a superintendent or client-side reviewer)

No ABAC, no ReBAC, no policy engine: the requirement is three flat privilege levels.
"""

from fastapi import Depends, HTTPException

from lib.auth import current_user

OWNER, ESTIMATOR, VIEWER = "owner", "estimator", "viewer"
ROLES = (OWNER, ESTIMATOR, VIEWER)
ROLE_LABELS = {OWNER: "Owner", ESTIMATOR: "Estimator", VIEWER: "Viewer (read-only)"}

READS = {
    "job:read", "takeoff:read", "quote:read", "invoice:read",
    "expense:read", "settings:read", "team:read", "export:read",
}
WRITES = {
    "job:write", "job:delete", "takeoff:write", "quote:write",
    "invoice:write", "expense:write",
}
ADMIN = {"settings:write", "billing:write", "team:write"}

PERMS: dict[str, set[str]] = {
    OWNER: READS | WRITES | ADMIN,
    ESTIMATOR: READS | WRITES,
    VIEWER: READS,
}


def account_id(user: dict) -> str:
    """The tenant key. Owners are their own account; invited members inherit the owner's."""
    return user.get("account_id") or user["id"]


def role_of(user: dict) -> str:
    role = user.get("role") or OWNER
    return role if role in ROLES else VIEWER


def can(user: dict, action: str) -> bool:
    return action in PERMS.get(role_of(user), set())


def require(action: str):
    """Route dependency. An un-annotated write route simply never gets the permission,
    so the default is denial rather than accidental access."""

    async def dep(user: dict = Depends(current_user)) -> dict:
        if not can(user, action):
            raise HTTPException(
                status_code=403,
                detail=f"Your role ({ROLE_LABELS.get(role_of(user), 'viewer')}) cannot do this",
            )
        return user

    return dep
