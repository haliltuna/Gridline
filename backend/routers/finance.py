import uuid
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.ai import line_cost
from lib.auth import current_user
from lib.db import db
from lib.flooring import TAX_TABLE, detect_tax
from models.schemas import (
    CheckoutIn, CheckoutOut, DashboardStats, Expense, ExpenseIn, Invoice,
    MonthSummary, Plan, ProfitSummary, Quote, QuoteIn, SendOut, Settings, SettingsIn, TaxDetect,
)

router = APIRouter(tags=["finance"])

PLANS = [
    Plan(id="single", name="Single Job", price=39, cadence="per takeoff", highlight=False,
         blurb="For the contractor bidding the occasional job.",
         features=["One blueprint set", "Full flooring logic", "One invoice", "No subscription"]),
    Plan(id="five", name="Five Pack", price=99, cadence="one-time", highlight=True,
         blurb="Five jobs, one price. Best for a busy bid season.",
         features=["Up to 5 blueprint takeoffs", "Quotes + invoicing", "Change orders", "Expense log"]),
    Plan(id="pro", name="Unlimited Pro", price=999, cadence="per month", highlight=False,
         blurb="Ongoing commercial and multi-family work. 14-day free trial.",
         features=["Unlimited uploads", "Unlimited buildings & units", "Invoicing + change orders",
                   "Expense tracking & profit summary", "14-day free trial"]),
]


# ---------- settings ----------
@router.get("/settings", response_model=Settings)
async def get_settings(user: dict = Depends(current_user)):
    doc = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = Settings(user_id=user["id"]).model_dump()
        await db.settings.insert_one(dict(doc))
    return Settings(**doc)


@router.put("/settings", response_model=Settings)
async def put_settings(body: SettingsIn, user: dict = Depends(current_user)):
    doc = Settings(user_id=user["id"], **body.model_dump())
    await db.settings.update_one({"user_id": user["id"]}, {"$set": doc.model_dump()}, upsert=True)
    return doc


@router.get("/tax/regions")
async def tax_regions():
    return {c: {"label": v["label"], "rate": v["rate"], "regions": sorted(v["regions"])} for c, v in TAX_TABLE.items()}


@router.get("/tax/detect", response_model=TaxDetect)
async def tax_detect(country: str, region: str = ""):
    label, rate = detect_tax(country, region or None)
    return TaxDetect(tax_label=label, tax_rate=rate)


# ---------- quotes ----------
def _totals(lines: list[dict], discount_pct: float, tax_rate: float) -> dict:
    subtotal = round(sum(line_cost(line) for line in lines), 2)
    discount_amount = round(subtotal * discount_pct / 100, 2)
    taxable = subtotal - discount_amount
    tax_amount = round(taxable * tax_rate / 100, 2)
    return {
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "tax_amount": tax_amount,
        "total": round(taxable + tax_amount, 2),
    }


@router.get("/jobs/{job_id}/quotes", response_model=list[Quote])
async def job_quotes(job_id: str, user: dict = Depends(current_user)):
    docs = await db.quotes.find({"job_id": job_id, "user_id": user["id"]}, {"_id": 0}).sort("revision", -1).to_list(100)
    return [Quote(**d) for d in docs]


@router.post("/jobs/{job_id}/quotes", response_model=Quote)
async def create_quote(job_id: str, body: QuoteIn, user: dict = Depends(current_user)):
    job = await db.jobs.find_one({"id": job_id, "user_id": user["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    lines = await db.takeoff_lines.find({"job_id": job_id}, {"_id": 0}).to_list(2000)
    approved = [line for line in lines if line.get("approved")] or lines
    if not approved:
        raise HTTPException(status_code=400, detail="No takeoff lines to quote yet")
    settings = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    tax_rate = body.tax_rate if body.tax_rate is not None else float(settings.get("tax_rate", 0))
    tax_label = body.tax_label or settings.get("tax_label", "Sales Tax")

    prior = await db.quotes.find({"job_id": job_id}, {"_id": 0}).sort("revision", -1).to_list(1)
    revision = (prior[0]["revision"] + 1) if prior else 1
    if prior:
        await db.quotes.update_many({"job_id": job_id}, {"$set": {"status": "superseded"}})

    snapshot = [{**line, "cost": line_cost(line)} for line in approved]
    quote = Quote(
        job_id=job_id, user_id=user["id"], number=f"Q-{job_id[:6].upper()}-R{revision}",
        revision=revision, parent_id=prior[0]["id"] if prior else None,
        discount_pct=body.discount_pct, tax_label=tax_label, tax_rate=tax_rate,
        notes=body.notes, lines=snapshot, **_totals(approved, body.discount_pct, tax_rate),
    )
    await db.quotes.insert_one(quote.model_dump())
    await db.jobs.update_one({"id": job_id}, {"$set": {"status": "quoted"}})
    return quote


async def _quote_or_404(quote_id: str, user_id: str) -> dict:
    q = await db.quotes.find_one({"id": quote_id, "user_id": user_id}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    return q


@router.post("/quotes/{quote_id}/send", response_model=SendOut)
async def send_quote(quote_id: str, user: dict = Depends(current_user)):
    q = await _quote_or_404(quote_id, user["id"])
    job = await db.jobs.find_one({"id": q["job_id"]}, {"_id": 0}) or {}
    to = job.get("client_email") or user["email"]
    await db.quotes.update_one({"id": quote_id}, {"$set": {"status": "sent"}})
    return SendOut(ok=True, to=to, subject=f"Quote {q['number']} — {job.get('name', '')}",
                   message=f"Quote {q['number']} emailed to {to} with a Pay Now link.")


@router.post("/quotes/{quote_id}/accept", response_model=Quote)
async def accept_quote(quote_id: str, user: dict = Depends(current_user)):
    q = await _quote_or_404(quote_id, user["id"])
    await db.quotes.update_one({"id": quote_id}, {"$set": {"status": "accepted"}})
    await db.jobs.update_one({"id": q["job_id"]}, {"$set": {"status": "accepted"}})
    q["status"] = "accepted"
    return Quote(**q)


# ---------- invoices ----------
@router.get("/invoices", response_model=list[Invoice])
async def list_invoices(user: dict = Depends(current_user)):
    docs = await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Invoice(**d) for d in docs]


@router.post("/quotes/{quote_id}/invoice", response_model=Invoice)
async def invoice_from_quote(quote_id: str, user: dict = Depends(current_user)):
    q = await _quote_or_404(quote_id, user["id"])
    if q["status"] != "accepted":
        raise HTTPException(status_code=400, detail="Quote must be accepted before invoicing")
    job = await db.jobs.find_one({"id": q["job_id"]}, {"_id": 0}) or {}
    inv = Invoice(
        user_id=user["id"], job_id=q["job_id"], job_name=job.get("name", ""), quote_id=quote_id,
        number=f"INV-{q['number'][2:]}", client_name=job.get("client_name", ""),
        client_email=job.get("client_email", ""), subtotal=q["subtotal"],
        discount_amount=q["discount_amount"], tax_label=q["tax_label"],
        tax_amount=q["tax_amount"], total=q["total"],
    )
    await db.invoices.insert_one(inv.model_dump())
    await db.jobs.update_one({"id": q["job_id"]}, {"$set": {"status": "invoiced"}})
    return inv


async def _invoice_or_404(invoice_id: str, user_id: str) -> dict:
    inv = await db.invoices.find_one({"id": invoice_id, "user_id": user_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


@router.post("/invoices/{invoice_id}/send", response_model=SendOut)
async def send_invoice(invoice_id: str, user: dict = Depends(current_user)):
    inv = await _invoice_or_404(invoice_id, user["id"])
    to = inv.get("client_email") or user["email"]
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc)}})
    return SendOut(ok=True, to=to, subject=f"Invoice {inv['number']}",
                   message=f"Invoice {inv['number']} emailed to {to} with a Stripe Pay Now button.")


@router.post("/invoices/{invoice_id}/pay", response_model=Invoice)
async def pay_invoice(invoice_id: str, user: dict = Depends(current_user)):
    inv = await _invoice_or_404(invoice_id, user["id"])
    now = datetime.now(timezone.utc)
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"status": "paid", "paid_at": now}})
    await db.jobs.update_one({"id": inv["job_id"]}, {"$set": {"status": "paid"}})
    inv.update({"status": "paid", "paid_at": now})
    return Invoice(**inv)


# ---------- expenses & profit ----------
@router.get("/expenses", response_model=list[Expense])
async def list_expenses(user: dict = Depends(current_user)):
    docs = await db.expenses.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(1000)
    return [Expense(**d) for d in docs]


@router.post("/expenses", response_model=Expense)
async def add_expense(body: ExpenseIn, user: dict = Depends(current_user)):
    exp = Expense(user_id=user["id"], **body.model_dump())
    await db.expenses.insert_one(exp.model_dump())
    return exp


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(current_user)):
    res = await db.expenses.delete_one({"id": expense_id, "user_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"ok": True}


@router.get("/profit/summary", response_model=ProfitSummary)
async def profit_summary(user: dict = Depends(current_user)):
    rev: dict[str, float] = defaultdict(float)
    exp: dict[str, float] = defaultdict(float)
    for inv in await db.invoices.find({"user_id": user["id"], "status": "paid"}, {"_id": 0}).to_list(1000):
        paid = inv.get("paid_at") or inv.get("created_at")
        if isinstance(paid, datetime):
            rev[paid.strftime("%Y-%m")] += float(inv.get("total", 0))
    for e in await db.expenses.find({"user_id": user["id"]}, {"_id": 0}).to_list(2000):
        exp[str(e.get("date", ""))[:7]] += float(e.get("amount", 0))
    months = sorted(set(rev) | set(exp))
    rows = [MonthSummary(month=m, revenue=round(rev[m], 2), expenses=round(exp[m], 2),
                         profit=round(rev[m] - exp[m], 2)) for m in months]
    return ProfitSummary(
        months=rows,
        total_revenue=round(sum(r.revenue for r in rows), 2),
        total_expenses=round(sum(r.expenses for r in rows), 2),
        total_profit=round(sum(r.profit for r in rows), 2),
    )


@router.get("/dashboard/stats", response_model=DashboardStats)
async def dashboard_stats(user: dict = Depends(current_user)):
    uid = user["id"]
    jobs = await db.jobs.find({"user_id": uid}, {"_id": 0, "id": 1}).to_list(1000)
    job_ids = [j["id"] for j in jobs]
    open_quotes = await db.quotes.count_documents({"user_id": uid, "status": {"$in": ["draft", "sent"]}})
    invoices = await db.invoices.find({"user_id": uid}, {"_id": 0}).to_list(1000)
    unpaid = sum(float(i["total"]) for i in invoices if i["status"] != "paid")
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    paid_month = sum(
        float(i["total"]) for i in invoices
        if i["status"] == "paid" and isinstance(i.get("paid_at"), datetime) and i["paid_at"].strftime("%Y-%m") == month
    )
    sqft = 0.0
    if job_ids:
        for line in await db.takeoff_lines.find({"job_id": {"$in": job_ids}}, {"_id": 0, "sqft": 1}).to_list(5000):
            sqft += float(line.get("sqft", 0))
    return DashboardStats(jobs=len(job_ids), open_quotes=open_quotes, unpaid_total=round(unpaid, 2),
                          paid_this_month=round(paid_month, 2), sqft_measured=round(sqft, 1))


# ---------- billing (Stripe MOCKED) ----------
@router.get("/billing/plans", response_model=list[Plan])
async def billing_plans():
    return PLANS


@router.post("/billing/checkout", response_model=CheckoutOut)
async def billing_checkout(body: CheckoutIn, user: dict = Depends(current_user)):
    plan = next((p for p in PLANS if p.id == body.plan_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="Unknown plan")
    await db.users.update_one({"id": user["id"]}, {"$set": {"plan": plan.id}})
    return CheckoutOut(ok=True, plan=plan.name,
                       message=f"{plan.name} activated (Stripe checkout is mocked in this build).")


_ = uuid
