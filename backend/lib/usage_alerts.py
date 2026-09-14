"""Page-usage alerting: one email the moment an account crosses 80% of its included pages.

Fired straight after a successful blueprint read (no scheduler), and de-duplicated per billing
period with `page_alert_period` on the user document, so an estimator gets exactly one warning
per month instead of one per upload.
"""

import logging
import os
from datetime import datetime, timezone

from lib import mailer
from lib.db import db
from lib.pricing import plan_for

logger = logging.getLogger(__name__)
THRESHOLD = 0.8


def _period_key(now: datetime) -> str:
    return now.strftime("%Y-%m")


async def usage_snapshot(account_id: str) -> dict:
    """Pages used vs included for the current period — the same window billing/usage uses."""
    doc = await db.users.find_one({"id": account_id}, {"_id": 0}) or {}
    plan = plan_for(doc.get("plan"))
    included = int(plan["pages_included"])
    credits = int(doc.get("page_credits", 0))
    allowance = included + credits
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    window = {"$gte": start} if plan["kind"] in ("subscription", "trial") else {"$gte": datetime(2000, 1, 1, tzinfo=timezone.utc)}
    jobs = await db.jobs.find({"user_id": account_id, "created_at": window},
                              {"_id": 0, "pages": 1, "pages_read": 1}).to_list(2000)
    used = sum(int(j.get("pages_read") or j.get("pages") or 0) for j in jobs)
    return {"user": doc, "plan": plan, "included": included, "allowance": allowance,
            "used": used, "remaining": max(0, allowance - used),
            "pct": 0.0 if allowance <= 0 else used / allowance, "period": _period_key(now)}


async def maybe_alert_usage(account_id: str) -> dict:
    """Email the estimator once when usage crosses 80%. Never raises — email is not the job."""
    snap = await usage_snapshot(account_id)
    plan, doc = snap["plan"], snap["user"]
    if plan["pages_included"] < 0 or snap["allowance"] <= 0:
        return {"sent": False, "reason": "unlimited plan"}
    if snap["pct"] < THRESHOLD:
        return {"sent": False, "reason": "under threshold", "pct": round(snap["pct"], 3)}
    if doc.get("page_alert_period") == snap["period"]:
        return {"sent": False, "reason": "already alerted this period"}

    await db.users.update_one({"id": account_id}, {"$set": {
        "page_alert_period": snap["period"],
        "page_alert_at": datetime.now(timezone.utc),
    }})
    pct = int(snap["pct"] * 100)
    app_url = (os.environ.get("APP_URL") or "").rstrip("/")
    html = mailer.shell(
        title=f"You are at {pct}% of this month's blueprint pages",
        intro=(f"{snap['used']} of your {snap['allowance']} {plan['name']} pages are used, with "
               f"{snap['remaining']} left. Top up or upgrade before your next big set so a read "
               f"never stalls mid-bid — there is no overage billing, so an upload that does not "
               f"fit is refused rather than charged."),
        rows=[("Plan", plan["name"]), ("Pages used", f"{snap['used']} / {snap['allowance']}"),
              ("Pages left", str(snap["remaining"]))],
        cta=("Top up or upgrade", f"{app_url}/billing") if app_url else None,
        footer="You get this warning once per billing period. Gridline.",
    )
    res = await mailer.send(doc.get("email", ""), f"Gridline — {pct}% of your pages used", html)
    logger.info("usage alert for %s: %s", account_id, res)
    return {"sent": True, "delivered": bool(res.get("delivered")), "pct": pct,
            "used": snap["used"], "remaining": snap["remaining"]}
