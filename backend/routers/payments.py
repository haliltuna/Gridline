"""Stripe Checkout — subscription plans for the contractor, card payments for their client.

Two flows, one session table:
  * plan checkout   — /payments/checkout, price looked up by lookup_key, fulfils by
                      switching the account's plan.
  * invoice payment — /pay/{token}/checkout, an ad-hoc amount for the contractor's own
                      invoice, fulfils by marking that invoice paid.

Status is never trusted from the browser: /payments/status re-reads the session from Stripe
and flips the DB with the same idempotent guard the webhook uses.
"""

import logging
import os
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request

from lib.authz import account_id, require
from lib.db import db
from lib.pricing import BY_ID, TOP_UP_BY_ID
from models.billing import CheckoutIn, CheckoutSession, ExitFeeCheckoutIn, PaymentStatus

logger = logging.getLogger(__name__)
router = APIRouter(tags=["payments"])

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or os.environ.get("STRIPE_API_KEY") or "sk_test_emergent"
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# The sandbox account is in an SMP-supported country and the catalog is SaaS (digital), so
# Stripe manages tax end to end. Client invoice payments are the contractor's own services
# with their own tax line already in the total, so those sessions carry no tax handling.
TAX_MODE = "full"


async def _record(session_id: str) -> dict | None:
    return await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})


async def _fulfil(record: dict) -> None:
    """Idempotent: only ever runs once per session thanks to the payment_status guard."""
    kind = record.get("kind")
    if kind == "topup":
        # Page credits sit outside the plan allowance and never expire.
        await db.users.update_one(
            {"id": record["account_id"]},
            {"$inc": {"page_credits": int(record.get("pages", 0))}},
        )
    elif kind == "plan":
        await db.users.update_one(
            {"id": record["account_id"]},
            {"$set": {"plan": record["plan_id"], "plan_period": record.get("period", "annual"),
                      "plan_started_at": datetime.now(timezone.utc),
                      "plan_pages_used": 0, "plan_jobs_used": 0}},
        )
    elif kind == "exit_fee":
        # Closing invoice for leaving an annual commitment early — paid once, then done.
        await db.exit_invoices.update_one(
            {"id": record.get("exit_invoice_id"), "status": {"$ne": "paid"}},
            {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc),
                      "payment_ref": record.get("stripe_payment_intent_id") or record["session_id"]}},
        )
        await db.users.update_one({"id": record["account_id"]}, {"$set": {
            "plan_exit_fee": 0.0,
            "plan_payment_note": "Closing invoice paid — billing is fully stopped.",
        }})
    elif kind == "invoice":
        now = datetime.now(timezone.utc)
        inv = await db.invoices.find_one({"id": record["invoice_id"]}, {"_id": 0})
        if inv and inv.get("status") != "paid":
            await db.invoices.update_one(
                {"id": record["invoice_id"]},
                {"$set": {"status": "paid", "paid_at": now,
                          "payment_ref": record.get("stripe_payment_intent_id") or record["session_id"]}},
            )
            await db.jobs.update_one({"id": inv["job_id"]}, {"$set": {"status": "paid"}})


async def _mark_state(query: dict, status: str) -> None:
    """Move a pending transaction to a terminal, non-paid state so billing never sticks
    on 'pending'. A paid record is never overwritten."""
    await db.payment_transactions.update_one(
        {**query, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": status, "payment_status": status,
                  "updated_at": datetime.now(timezone.utc)}},
    )


async def _mark_paid(session_id: str, payment_intent: str | None, subscription: str | None) -> None:
    res = await db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid",
                  "stripe_payment_intent_id": payment_intent,
                  "stripe_subscription_id": subscription,
                  "updated_at": datetime.now(timezone.utc)}},
    )
    if res.modified_count:
        record = await _record(session_id)
        if record:
            await _fulfil(record)


def _price_for(lookup_key: str):
    prices = stripe.Price.list(lookup_keys=[lookup_key], active=True, limit=1).data
    if not prices:
        raise HTTPException(status_code=500,
                            detail=f"Stripe price {lookup_key} is not set up yet — run setup_stripe.py")
    return prices[0]


# ---------- plan checkout (authenticated, owner only) ----------
@router.post("/payments/checkout", response_model=CheckoutSession)
async def create_plan_checkout(body: CheckoutIn, user: dict = Depends(require("billing:write"))):
    pack = TOP_UP_BY_ID.get(body.plan_id)
    if pack:
        price = _price_for(pack["lookup_key"])
        origin = body.origin_url.rstrip("/")
        session = stripe.checkout.Session.create(
            line_items=[{"price": price.id, "quantity": 1}], mode="payment",
            success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/payment/cancel",
            metadata={"kind": "topup", "pack_id": pack["id"], "account_id": account_id(user)},
        )
        await db.payment_transactions.insert_one({
            "session_id": session.id, "kind": "topup", "plan_id": pack["id"], "period": "",
            "account_id": account_id(user), "invoice_id": None, "pages": pack["pages"],
            "amount": pack["price"], "currency": "usd",
            "status": "initiated", "payment_status": "pending",
            "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
        })
        return CheckoutSession(checkout_url=session.url or "", session_id=session.id,
                               amount=pack["price"], mocked=False)

    plan = BY_ID.get(body.plan_id)
    if not plan or plan["kind"] not in ("subscription", "one_time"):
        raise HTTPException(status_code=400, detail="That plan cannot be bought online")
    lookup = plan["lookup_key_monthly"] if (body.period == "monthly" and plan["lookup_key_monthly"]) else plan["lookup_key"]
    price = _price_for(lookup)
    origin = body.origin_url.rstrip("/")
    kwargs = dict(
        line_items=[{"price": price.id, "quantity": 1}],
        mode="subscription" if price.recurring else "payment",
        success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/payment/cancel",
        metadata={"kind": "plan", "plan_id": plan["id"], "account_id": account_id(user),
                  "period": body.period},
    )
    try:
        session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
    except stripe.error.InvalidRequestError as exc:
        msg = (exc.user_message or str(exc)).lower()
        if "managed payments" in msg or "ineligible" in msg:
            session = stripe.checkout.Session.create(
                **kwargs, automatic_tax={"enabled": True}, billing_address_collection="required")
        else:
            raise HTTPException(status_code=502, detail=f"Stripe rejected the checkout: {exc}") from exc

    await db.payment_transactions.insert_one({
        "session_id": session.id, "kind": "plan", "plan_id": plan["id"], "period": body.period,
        "account_id": account_id(user), "invoice_id": None,
        "amount": float(price.unit_amount or 0) / 100.0, "currency": price.currency,
        "status": "initiated", "payment_status": "pending",
        "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
    })
    return CheckoutSession(checkout_url=session.url or "", session_id=session.id,
                           amount=float(price.unit_amount or 0) / 100.0, mocked=False)


# ---------- closing invoice for an early annual cancellation ----------
@router.post("/payments/exit-fee/checkout", response_model=CheckoutSession)
async def create_exit_fee_checkout(body: ExitFeeCheckoutIn, user: dict = Depends(require("billing:write"))):
    """A one-off Stripe Checkout for the single cancellation invoice. No subscription, no renewal."""
    acct = account_id(user)
    fee = await db.exit_invoices.find_one({"user_id": acct, "status": "unpaid"}, {"_id": 0},
                                          sort=[("created_at", -1)])
    if not fee:
        raise HTTPException(status_code=404, detail="You have no outstanding closing invoice")
    amount_cents = int(round(float(fee["amount"]) * 100))
    if amount_cents <= 0:
        raise HTTPException(status_code=400, detail="That closing invoice has nothing to pay")
    origin = body.origin_url.rstrip("/")
    session = stripe.checkout.Session.create(
        mode="payment",
        managed_payments={"enabled": False},
        line_items=[{
            "quantity": 1,
            "price_data": {
                "currency": "usd", "unit_amount": amount_cents,
                "product_data": {
                    "name": f"Gridline closing invoice — {fee.get('plan_name') or fee.get('plan_id')}",
                    "description": (f"Annual/monthly difference for {fee.get('months_billed', 0)} month(s) "
                                    f"already billed. Billing is stopped; nothing further is charged."),
                },
            },
        }],
        success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/payment/cancel",
        metadata={"kind": "exit_fee", "exit_invoice_id": fee["id"], "account_id": acct},
    )
    await db.payment_transactions.insert_one({
        "session_id": session.id, "kind": "exit_fee", "plan_id": fee.get("plan_id"), "period": "",
        "account_id": acct, "invoice_id": None, "exit_invoice_id": fee["id"],
        "amount": float(fee["amount"]), "currency": "usd",
        "status": "initiated", "payment_status": "pending",
        "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
    })
    return CheckoutSession(checkout_url=session.url or "", session_id=session.id,
                           amount=float(fee["amount"]), mocked=False)


# ---------- client invoice payment (public: the pay token is the credential) ----------
@router.post("/pay/{pay_token}/checkout", response_model=CheckoutSession)
async def create_invoice_checkout(pay_token: str, request: Request):
    inv = await db.invoices.find_one({"pay_token": pay_token}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="That payment link is not valid")
    if inv.get("status") == "paid":
        raise HTTPException(status_code=400, detail="This invoice is already paid")
    origin = (request.headers.get("origin") or os.environ.get("APP_URL", "")).rstrip("/")
    settings = await db.settings.find_one({"user_id": inv["user_id"]}, {"_id": 0}) or {}
    amount_cents = int(round(float(inv["total"]) * 100))
    session = stripe.checkout.Session.create(
        mode="payment",
        # The contractor's own tax line (GST/HST/PST/VAT/sales tax) is already inside the
        # invoice total, so Stripe must not add or manage tax on this session.
        managed_payments={"enabled": False},
        line_items=[{
            "quantity": 1,
            "price_data": {
                "currency": (settings.get("currency") or "usd").lower(),
                "unit_amount": amount_cents,
                "product_data": {
                    "name": f"{inv['number']} — {inv.get('job_name', 'Flooring works')}",
                    "description": f"Invoice from {settings.get('company_name') or 'Gridline contractor'}",
                },
            },
        }],
        success_url=f"{origin}/pay/{pay_token}?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/pay/{pay_token}?cancelled=1",
        metadata={"kind": "invoice", "invoice_id": inv["id"]},
    )
    await db.payment_transactions.insert_one({
        "session_id": session.id, "kind": "invoice", "plan_id": None, "period": "",
        "account_id": inv["user_id"], "invoice_id": inv["id"],
        "amount": float(inv["total"]), "currency": settings.get("currency", "USD"),
        "status": "initiated", "payment_status": "pending",
        "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
    })
    return CheckoutSession(checkout_url=session.url or "", session_id=session.id,
                           amount=float(inv["total"]), mocked=False)


# ---------- status (public by design: only the session's own state comes back) ----------
@router.get("/payments/status/{session_id}", response_model=PaymentStatus)
async def payment_status(session_id: str):
    record = await _record(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _mark_paid(session_id, s.payment_intent, s.subscription)
            elif s.status == "expired":
                # The customer walked away and the session timed out.
                await _mark_state({"session_id": session_id}, "expired")
            elif s.payment_status == "unpaid" and s.status == "open" and s.get("expires_at") \
                    and s["expires_at"] < datetime.now(timezone.utc).timestamp():
                await _mark_state({"session_id": session_id}, "expired")
            record = await _record(session_id) or record
        except stripe.error.StripeError as exc:  # transient — report what the DB knows
            logger.warning("stripe status fetch failed: %s", exc)
    return PaymentStatus(session_id=session_id, status=record["status"],
                         payment_status=record["payment_status"], kind=record.get("kind", ""),
                         amount=float(record.get("amount", 0)))


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError as exc:
        raise HTTPException(status_code=400, detail="Invalid signature") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Bad webhook payload: {exc}") from exc

    obj, kind = event["data"]["object"], event["type"]
    if kind in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        await _mark_paid(obj["id"], obj.get("payment_intent"), obj.get("subscription"))
    elif kind == "checkout.session.async_payment_failed":
        await _mark_state({"session_id": obj["id"]}, "failed")
    elif kind == "checkout.session.expired":
        await _mark_state({"session_id": obj["id"]}, "expired")
    elif kind == "payment_intent.payment_failed":
        # Card declined on the payment page itself — no session event fires for this.
        await _mark_state({"stripe_payment_intent_id": obj.get("id")}, "failed")
        await _mark_state({"session_id": (obj.get("metadata") or {}).get("session_id", "")}, "failed")
    elif kind == "payment_intent.canceled":
        await _mark_state({"stripe_payment_intent_id": obj.get("id")}, "cancelled")
    elif kind == "invoice.payment_failed":
        # A renewal failed: flag the account so Billing shows it instead of silently lapsing.
        sub = obj.get("subscription")
        rec = await db.payment_transactions.find_one({"stripe_subscription_id": sub}, {"_id": 0}) if sub else None
        if rec:
            await db.users.update_one({"id": rec["account_id"]},
                {"$set": {"plan_payment_state": "past_due",
                          "plan_payment_note": "Your last subscription payment failed — update the card on the Billing page."}})
    elif kind in ("invoice.paid", "invoice.payment_succeeded"):
        sub = obj.get("subscription")
        rec = await db.payment_transactions.find_one({"stripe_subscription_id": sub}, {"_id": 0}) if sub else None
        if rec:
            await db.users.update_one({"id": rec["account_id"]},
                {"$set": {"plan_payment_state": "active", "plan_payment_note": ""}})
    elif kind == "customer.subscription.deleted":
        rec = await db.payment_transactions.find_one({"stripe_subscription_id": obj.get("id")}, {"_id": 0})
        if rec:
            # Cancelled or lapsed: fall back to the trial tier rather than leaving paid caps open.
            await db.users.update_one({"id": rec["account_id"]},
                {"$set": {"plan": "trial", "plan_payment_state": "cancelled",
                          "plan_payment_note": "Your subscription ended — pick a plan to keep quoting."}})
    elif kind == "charge.refunded":
        await _mark_state({"stripe_payment_intent_id": obj.get("payment_intent")}, "refunded")
    return {"status": "ok"}
