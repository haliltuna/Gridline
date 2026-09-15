"""Password hashing + httpOnly cookie sessions."""

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, HTTPException

from lib.db import db

COOKIE_NAME = "gl_session"
SESSION_DAYS = 30


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, _ = stored.split("$", 1)
    except ValueError:
        return False
    return secrets.compare_digest(hash_password(password, salt), stored)


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one({
        "token": token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
    })
    return token


async def destroy_session(token: str | None) -> None:
    if token:
        await db.sessions.delete_one({"token": token})


async def current_user(gl_session: str | None = Cookie(default=None)) -> dict:
    if not gl_session:
        raise HTTPException(status_code=401, detail="not authenticated")
    sess = await db.sessions.find_one({"token": gl_session})
    if not sess:
        raise HTTPException(status_code=401, detail="session expired")
    user = await db.users.find_one({"id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="user not found")
    return user


def cookie_kwargs() -> dict:
    # The preview is rendered inside a CROSS-SITE IFRAME, and production runs the
    # frontend on app.gridreader.com and the backend on api.gridreader.com. A
    # SameSite=Lax cookie is not sent on cross-site requests, so login "succeeds"
    # and the very next /auth/me comes back 401 — the user is stuck on the sign-in
    # page. SameSite=None fixes that, and the spec requires Secure alongside it.
    # Fall back to Lax only for plain-http local access.
    #
    # COOKIE_DOMAIN scopes the cookie to the ROOT domain (.gridreader.com) so both
    # subdomains share it. Without this, the cookie is scoped to api.gridreader.com
    # only, and Chrome's third-party cookie blocking drops it on requests from
    # app.gridreader.com even when SameSite=None is set.
    https = os.environ.get("APP_URL", "").startswith("https")
    kwargs = {
        "httponly": True,
        "samesite": "none" if https else "lax",
        "secure": https,
        "max_age": SESSION_DAYS * 24 * 3600,
        "path": "/",
    }
    cookie_domain = os.environ.get("COOKIE_DOMAIN", "").strip()
    if cookie_domain:
        kwargs["domain"] = cookie_domain
    return kwargs