from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response

from lib.auth import (
    COOKIE_NAME, cookie_kwargs, create_session, current_user, destroy_session,
    hash_password, verify_password,
)
from lib.db import db
from models.schemas import LoginIn, Settings, SignupIn, User
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])


async def _bootstrap_settings(user_id: str) -> None:
    if not await db.settings.find_one({"user_id": user_id}):
        await db.settings.insert_one(Settings(user_id=user_id).model_dump())


@router.post("/signup", response_model=User)
async def signup(body: SignupIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "company": body.company,
        "plan": "trial",
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(dict(doc))
    await _bootstrap_settings(doc["id"])
    token = await create_session(doc["id"])
    response.set_cookie(COOKIE_NAME, token, **cookie_kwargs())
    doc.pop("password_hash")
    doc.pop("_id", None)
    return User(**doc)


@router.post("/login", response_model=User)
async def login(body: LoginIn, response: Response):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Wrong email or password")
    await _bootstrap_settings(user["id"])
    token = await create_session(user["id"])
    response.set_cookie(COOKIE_NAME, token, **cookie_kwargs())
    user.pop("_id", None)
    user.pop("password_hash", None)
    return User(**user)


@router.post("/logout")
async def logout(response: Response, gl_session: str | None = Cookie(default=None)):
    await destroy_session(gl_session)
    # Delete with the SAME samesite/secure attributes it was set with, or the browser
    # keeps the original cookie and the user never actually signs out.
    kw = cookie_kwargs()
    response.delete_cookie(COOKIE_NAME, path="/", samesite=kw["samesite"], secure=kw["secure"])
    return {"ok": True}


@router.get("/me", response_model=User)
async def me(user: dict = Depends(current_user)):
    return User(**user)
