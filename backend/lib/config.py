"""Boot-time configuration check.

Every secret lives in backend/.env (see backend/.env.example). Rather than letting a missing
key surface as a confusing 500 on the first upload or checkout, this reports the whole picture
once at startup: what is missing, and exactly which feature stops working because of it.
"""

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Setting:
    key: str
    what_breaks: str
    required: bool = False


SETTINGS: tuple[Setting, ...] = (
    # --- Database ---
    Setting("MONGO_URL", "the database connection — the server cannot start", required=True),
    Setting("DB_NAME", "the database name — the server cannot start", required=True),

    # --- App identity ---
    Setting("APP_URL", "client pay links, change-order e-sign links and links inside every email"),
    Setting("CORS_ORIGINS", "browser access control (defaults to '*', fine for local dev)"),
    Setting("FRONTEND_URL", "where Google sign-in redirects after the callback (defaults to APP_URL)"),
    Setting("JWT_SECRET", "signing the OAuth state token and login sessions"),

    # --- AI ---
    Setting("ANTHROPIC_API_KEY", "AI blueprint and spec-sheet reading — takeoffs fall back to sample data"),

    # --- Payments ---
    Setting("STRIPE_SECRET_KEY", "plan checkout, client invoice payment and cancellation invoices (503 without it)"),
    Setting("STRIPE_WEBHOOK_SECRET", "Stripe webhook signature verification"),

    # --- Email ---
    Setting("RESEND_API_KEY", "sending quotes, invoices, e-sign requests and usage alerts — emails log to the console instead"),
    Setting("SENDER_EMAIL", "the from-address on outgoing email (defaults to onboarding@resend.dev)"),

    # --- Google sign-in ---
    Setting("GOOGLE_CLIENT_ID", "Google sign-in — the Continue with Google button will 503"),
    Setting("GOOGLE_CLIENT_SECRET", "Google sign-in — the callback exchange will fail"),
    Setting("GOOGLE_REDIRECT_URI", "Google sign-in — defaults to {APP_URL}/api/auth/google/callback if unset"),
)


def check_config() -> dict[str, list[str]]:
    """Log a readable report of missing configuration. Returns {"missing", "degraded"}."""
    missing = [s for s in SETTINGS if not (os.environ.get(s.key) or "").strip()]
    hard = [s for s in missing if s.required]
    soft = [s for s in missing if not s.required]

    if hard:
        for s in hard:
            logger.error("CONFIG MISSING (required): %s — %s", s.key, s.what_breaks)
        logger.error(
            "Set the keys above in backend/.env (copy backend/.env.example), then restart the "
            "backend service.")
    if soft:
        for s in soft:
            logger.warning("CONFIG MISSING (optional): %s — %s", s.key, s.what_breaks)
        logger.warning(
            "%d optional key(s) unset — the app runs, but the features above are off. "
            "See backend/.env.example for what each one does.", len(soft))
    if not missing:
        logger.info("Config check: all %d known settings present.", len(SETTINGS))
    return {"missing": [s.key for s in hard], "degraded": [s.key for s in soft]}