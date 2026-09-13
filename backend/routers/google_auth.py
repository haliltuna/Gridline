"""Emergent-managed Google sign-in.

The browser sends us the one-time `session_id` from the auth redirect fragment; we exchange
it server-side for the Google profile + a 7-day session_token (the exchange must NEVER happen
in the browser), then store that token in our own `sessions` collection so the rest of the app
keeps using the same httpOnly `gl_session` cookie and `current_user` dependency as
password login.
"""

import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException, Response

from lib.auth import COOKIE_NAME, cookie_kwargs
from lib.db import db
from models.schemas import GoogleSessionIn, Settings, User

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_DAYS = 7
# The account that owns this build gets the full plan; everyone else starts on the trial.
OWNER_EMAIL = "halilkocabiyikci@gmail.com"


@router.post("/google/session", response_model=User)
async def google_session(body: GoogleSessionIn, response: Response):
    if not body.session_id:
        raise HTTPException(status_code=400, detail="Missing session id")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.get(SESSION_DATA_URL, headers={"X-Session-ID": body.session_id})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Google sign-in is unreachable: {exc}") from exc
    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="That Google sign-in link is no longer valid")
    data = res.json()
    email = str(data.get("email", "")).lower()
    token = str(data.get("session_token", ""))
    if not email or not token:
        raise HTTPException(status_code=502, detail="Google sign-in returned an incomplete profile")

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"name": user.get("name") or data.get("name") or email,
                      "picture": data.get("picture") or user.get("picture", ""),
                      "auth_provider": "google"}},
        )
        user = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    else:
        doc = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "company": "",
            "plan": "pro" if email == OWNER_EMAIL else "trial",
            "role": "owner",
            "theme": "readout",
            "page_credits": 0,
            "picture": data.get("picture") or "",
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(dict(doc))
        await db.settings.insert_one(Settings(user_id=doc["id"]).model_dump())
        doc.pop("_id", None)
        user = doc

    assert user is not None
    await db.sessions.insert_one({
        "token": token,
        "user_id": user["id"],
        "provider": "google",
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
    })
    kw = cookie_kwargs()
    kw["max_age"] = SESSION_DAYS * 24 * 3600
    response.set_cookie(COOKIE_NAME, token, **kw)
    user.pop("password_hash", None)
    return User(**user)
