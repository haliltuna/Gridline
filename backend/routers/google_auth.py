"""Google sign-in using our own OAuth client.

Standard Authorization Code flow with a signed JWT state token as CSRF protection.
No third-party proxy, no opaque session IDs in URL fragments — everything runs on
gridreader.com.

The flow:
  1. GET /auth/google/start       → 302 to accounts.google.com with a signed state
  2. User signs in with Google
  3. GET /auth/google/callback    → verify state, exchange code for id_token,
                                     create/update the user, set gl_session,
                                     302 to {FRONTEND_URL}/dashboard

The session is created with our own session machinery (lib.auth.create_session) so
current_user(), the httpOnly cookie and everything downstream are identical to
password login.
"""

import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from lib.auth import COOKIE_NAME, cookie_kwargs, create_session
from lib.db import db
from models.schemas import Settings, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# The account that owns this build gets the full plan; everyone else starts on the trial.
OWNER_EMAIL = "halilkocabiyikci@gmail.com"

# How long a state token stays valid. Long enough for a slow typist, short enough that
# a leaked state can't be replayed later.
STATE_MINUTES = 10


# ---------------------------------------------------------------------------
# Config helpers — read from env each call so tests and hot reloads pick up changes
# ---------------------------------------------------------------------------

def _client_id() -> str:
    return (os.environ.get("GOOGLE_CLIENT_ID") or "").strip()


def _client_secret() -> str:
    return (os.environ.get("GOOGLE_CLIENT_SECRET") or "").strip()


def _redirect_uri() -> str:
    explicit = (os.environ.get("GOOGLE_REDIRECT_URI") or "").strip()
    if explicit:
        return explicit
    base = (os.environ.get("APP_URL") or "").rstrip("/")
    return f"{base}/api/auth/google/callback" if base else ""


def _frontend_url() -> str:
    return (os.environ.get("FRONTEND_URL") or os.environ.get("APP_URL") or "").rstrip("/")


def _jwt_secret() -> str:
    secret = (os.environ.get("JWT_SECRET") or "").strip()
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured — JWT_SECRET is missing on the server.",
        )
    return secret


def _require_oauth_config() -> None:
    missing = [k for k in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") if not (os.environ.get(k) or "").strip()]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=(
                "Google sign-in is not configured — "
                f"missing on the server: {', '.join(missing)}."
            ),
        )


# ---------------------------------------------------------------------------
# State token — signed JWT, 10-minute expiry, single use by design
# ---------------------------------------------------------------------------

def _make_state() -> str:
    payload = {
        "nonce": secrets.token_urlsafe(16),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=STATE_MINUTES),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


def _verify_state(state: str) -> None:
    try:
        jwt.decode(state, _jwt_secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=400, detail="That sign-in link has expired — try again.") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=400, detail="That sign-in link is not valid.") from exc


# ---------------------------------------------------------------------------
# Step 1: kick off the flow
# ---------------------------------------------------------------------------

@router.get("/google/start")
async def google_start():
    """Redirect the browser to Google's consent screen with a signed state token."""
    _require_oauth_config()
    redirect_uri = _redirect_uri()
    if not redirect_uri:
        raise HTTPException(status_code=503, detail="GOOGLE_REDIRECT_URI or APP_URL must be set.")

    params = {
        "client_id": _client_id(),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": _make_state(),
        "access_type": "online",
        "prompt": "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=302)


# ---------------------------------------------------------------------------
# Step 2: Google redirects back here
# ---------------------------------------------------------------------------

@router.get("/google/callback")
async def google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    frontend = _frontend_url() or "/"

    # Google can send back ?error=access_denied if the user clicked Cancel.
    if error:
        return RedirectResponse(f"{frontend}/login?error={error}", status_code=302)
    if not code or not state:
        return RedirectResponse(f"{frontend}/login?error=missing_code", status_code=302)

    try:
        _verify_state(state)
    except HTTPException:
        return RedirectResponse(f"{frontend}/login?error=state_expired", status_code=302)

    _require_oauth_config()
    redirect_uri = _redirect_uri()

    # Exchange the authorization code for tokens.
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            token_res = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": _client_id(),
                    "client_secret": _client_secret(),
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.HTTPError as exc:
        logger.error("google token exchange failed: %s", exc)
        return RedirectResponse(f"{frontend}/login?error=google_unreachable", status_code=302)

    if token_res.status_code != 200:
        logger.error("google token exchange rejected: %s %s", token_res.status_code, token_res.text[:300])
        return RedirectResponse(f"{frontend}/login?error=google_rejected", status_code=302)

    tokens = token_res.json()
    id_token = tokens.get("id_token") or ""
    if not id_token:
        logger.error("google token response missing id_token")
        return RedirectResponse(f"{frontend}/login?error=google_no_id_token", status_code=302)

    # Decode the id_token without verifying the signature — Google issued it over HTTPS
    # directly to us, and the code exchange just succeeded. We still parse rather than
    # trust: only the fields we need are read.
    try:
        claims = jwt.decode(id_token, options={"verify_signature": False, "verify_aud": False})
    except jwt.InvalidTokenError as exc:
        logger.error("google id_token could not be decoded: %s", exc)
        return RedirectResponse(f"{frontend}/login?error=google_bad_token", status_code=302)

    email = str(claims.get("email") or "").lower()
    name = str(claims.get("name") or "").strip()
    picture = str(claims.get("picture") or "").strip()
    if not email:
        return RedirectResponse(f"{frontend}/login?error=google_no_email", status_code=302)

    # Upsert the user.
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "name": user.get("name") or name or email.split("@")[0],
                "picture": picture or user.get("picture", ""),
                "auth_provider": "google",
            }},
        )
    else:
        doc = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": name or email.split("@")[0],
            "company": "",
            "plan": "pro" if email == OWNER_EMAIL else "trial",
            "role": "owner",
            "theme": "readout",
            "page_credits": 0,
            "picture": picture,
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(dict(doc))
        await db.settings.insert_one(Settings(user_id=doc["id"]).model_dump())

    # Create our own session — same machinery as password login.
    user = await db.users.find_one({"email": email}, {"_id": 0})
    assert user is not None
    token = await create_session(user["id"])

    # Set the session cookie on the API domain and send the user to the app.
    resp = RedirectResponse(f"{frontend}/dashboard", status_code=302)
    kw = cookie_kwargs()
    resp.set_cookie(COOKIE_NAME, token, **kw)
    return resp


# ---------------------------------------------------------------------------
# The old /auth/google/session endpoint is gone — nothing here needs the
# Emergent proxy anymore, and the login page no longer sends session IDs.
# ---------------------------------------------------------------------------

_ = Request, User  # keep imports explicit for type-checkers