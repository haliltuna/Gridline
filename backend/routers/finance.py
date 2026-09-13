import os
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response

from lib import mailer
from lib.ai import line_cost
from lib.auth import current_user
from lib.authz import account_id, require
from lib.db import db
from lib.flooring import TAX_TABLE, detect_tax
from lib.pdf import quote_pdf
from lib.pricing import (
    CAP_CHANGE_ORDER, CAP_COSTING, CAP_EXPORT, CAP_INVOICE, CAP_QUOTE, COMPETITORS,
    COST_BREAKDOWN, OVERAGE_PER_PAGE, PAGE_COST, PLANS as PLAN_DICTS, TARGET_MARGIN,
    has_cap, plan_for, upgrade_message,
)
from models.billing import (
    CompetitorRow, CostLine, CostModel, CostingOverview, CostingRow, PlanTier, Usage,
)
from models.schemas import (
    CheckoutIn, CheckoutOut, DashboardStats, Expense, ExpenseIn, Invoice, JobCosting,
    Lead, LeadIn, MonthSummary, PayIntent, ProfitSummary, PublicInvoice,
    Quote, QuoteIn, SendOut, Settings, SettingsIn, TaxDetect,
)

router = APIRouter(tags=["finance"])


async def _account_doc(user: dict) -> dict:
    return await db.users.find_one({"id": account_id(user)}, {"_id": 0}) or {}


async def _plan_of(user: dict) -> dict:
    return plan_for((await _account_doc(user)).get("plan"))


async def _needs(user: dict, cap: str) -> None:
    """Plan gating. Roles decide WHO may act; the plan decides WHAT the account can do."""
    plan_id = (await _account_doc(user)).get("plan")
    if not has_cap(plan_id, cap):
        raise HTTPException(status_code=402, detail=upgrade_message(plan_id, cap))


async def _company(user: dict) -> dict:
    s = await db.settings.find_one({"user_id": account_id(user)}, {"_id": 0}) or {}
    return {
        "name": s.get("company_name") or user.get("company") or "Gridline",
        "email": s.get("company_email") or user.get("email", ""),
        "currency": s.get("currency", "USD"),
        "template": s.get("pdf_template", "contractor_clean"),
    }

# ---------- settings ----------
@router.get("/settings", response_model=Settings)
async def get_settings(user: dict = Depends(require("settings:read"))):
    doc = await db.settings.find_one({"user_id": account_id(user)}, {"_id": 0})
    if not doc:
        doc = Settings(user_id=account_id(user)).model_dump()
        await db.settings.insert_one(dict(doc))
    return Settings(**doc)


@router.put("/settings", response_model=Settings)
async def put_settings(body: SettingsIn, user: dict = Depends(require("settings:write"))):
    doc = Settings(user_id=account_id(user), **body.model_dump())
    await db.settings.update_one({"user_id": account_id(user)}, {"$set": doc.model_dump()}, upsert=True)
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
async def job_quotes(job_id: str, user: dict = Depends(require("quote:read"))):
    docs = await db.quotes.find({"job_id": job_id, "user_id": account_id(user)}, {"_id": 0}).sort("revision", -1).to_list(100)
    return [Quote(**d) for d in docs]


@router.post("/jobs/{job_id}/quotes", response_model=Quote)
async def create_quote(job_id: str, body: QuoteIn, user: dict = Depends(require("quote:write"))):
    await _needs(user, CAP_QUOTE)
    job = await db.jobs.find_one({"id": job_id, "user_id": account_id(user)}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    lines = await db.takeoff_lines.find({"job_id": job_id}, {"_id": 0}).to_list(2000)
    approved = [line for line in lines if line.get("approved")] or lines
    if not approved:
        raise HTTPException(status_code=400, detail="No takeoff lines to quote yet")
    settings = await db.settings.find_one({"user_id": account_id(user)}, {"_id": 0}) or {}
    tax_rate = body.tax_rate if body.tax_rate is not None else float(settings.get("tax_rate", 0))
    tax_label = body.tax_label or settings.get("tax_label", "Sales Tax")

    prior = await db.quotes.find({"job_id": job_id}, {"_id": 0}).sort("revision", -1).to_list(1)
    if prior:
        await _needs(user, CAP_CHANGE_ORDER)
    revision = (prior[0]["revision"] + 1) if prior else 1
    if prior:
        await db.quotes.update_many({"job_id": job_id}, {"$set": {"status": "superseded"}})

    # Mongo injects `_id` into the dicts it inserts, including nested ones — strip it or the
    # snapshot cannot be serialised back out.
    snapshot = [{k: v for k, v in line.items() if k != "_id"} | {"cost": line_cost(line)}
                for line in approved]
    quote = Quote(
        job_id=job_id, user_id=account_id(user), number=f"Q-{job_id[:6].upper()}-R{revision}",
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
async def send_quote(quote_id: str, user: dict = Depends(require("quote:write"))):
    q = await _quote_or_404(quote_id, account_id(user))
    job = await db.jobs.find_one({"id": q["job_id"]}, {"_id": 0}) or {}
    to = job.get("client_email") or user["email"]
    company = await _company(user)
    pdf = quote_pdf("QUOTE", q, job, company, company["template"])
    html = mailer.shell(
        title=f"Quote {q['number']}",
        intro=(f"{company['name']} has prepared a flooring quote for "
               f"<strong>{job.get('name', 'your project')}</strong>. The full line-item takeoff "
               f"is attached as a PDF."),
        rows=[("Subtotal", f"${q['subtotal']:,.2f}"),
              ("Discount", f"-${q['discount_amount']:,.2f}"),
              (q["tax_label"], f"${q['tax_amount']:,.2f}"),
              ("Quote total", f"${q['total']:,.2f}")],
        cta=None,
        footer=f"Questions? Reply to this email or contact {company['email']}.",
    )
    sent = await mailer.send(to, f"Quote {q['number']} — {job.get('name', '')}", html,
                             attachment=(f"{q['number']}.pdf", pdf))
    await db.quotes.update_one({"id": quote_id}, {"$set": {"status": "sent"}})
    note = ("emailed with the quote PDF attached" if sent["delivered"]
            else f"NOT delivered — {sent['error']}")
    return SendOut(ok=True, to=to, subject=f"Quote {q['number']} — {job.get('name', '')}",
                   mocked=not sent["delivered"],
                   message=f"Quote {q['number']} {note} ({to}).")


@router.post("/quotes/{quote_id}/accept", response_model=Quote)
async def accept_quote(quote_id: str, user: dict = Depends(require("quote:write"))):
    q = await _quote_or_404(quote_id, account_id(user))
    await db.quotes.update_one({"id": quote_id}, {"$set": {"status": "accepted"}})
    await db.jobs.update_one({"id": q["job_id"]}, {"$set": {"status": "accepted"}})
    q["status"] = "accepted"
    return Quote(**q)


# ---------- invoices ----------
@router.get("/invoices", response_model=list[Invoice])
async def list_invoices(user: dict = Depends(require("invoice:read"))):
    docs = await db.invoices.find({"user_id": account_id(user)}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Invoice(**d) for d in docs]


@router.post("/quotes/{quote_id}/invoice", response_model=Invoice)
async def invoice_from_quote(quote_id: str, user: dict = Depends(require("invoice:write"))):
    await _needs(user, CAP_INVOICE)
    q = await _quote_or_404(quote_id, account_id(user))
    if q["status"] != "accepted":
        raise HTTPException(status_code=400, detail="Quote must be accepted before invoicing")
    job = await db.jobs.find_one({"id": q["job_id"]}, {"_id": 0}) or {}
    inv = Invoice(
        user_id=account_id(user), job_id=q["job_id"], job_name=job.get("name", ""), quote_id=quote_id,
        number=f"INV-{q['number'][2:]}", client_name=job.get("client_name", ""),
        client_email=job.get("client_email", ""), subtotal=q["subtotal"],
        discount_amount=q["discount_amount"], tax_label=q["tax_label"],
        tax_amount=q["tax_amount"], total=q["total"],
        lines=q.get("lines", []), pay_token=uuid.uuid4().hex,
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
async def send_invoice(invoice_id: str, user: dict = Depends(require("invoice:write"))):
    inv = await _invoice_or_404(invoice_id, account_id(user))
    to = inv.get("client_email") or user["email"]
    company = await _company(user)
    job = await db.jobs.find_one({"id": inv["job_id"]}, {"_id": 0}) or {}
    token = inv.get("pay_token") or uuid.uuid4().hex
    if not inv.get("pay_token"):
        await db.invoices.update_one({"id": invoice_id}, {"$set": {"pay_token": token}})
    if not inv.get("lines"):
        q = await db.quotes.find_one({"id": inv.get("quote_id")}, {"_id": 0}) or {}
        inv = {**inv, "lines": q.get("lines", [])}
    pdf = quote_pdf("INVOICE", inv, job, company, company["template"])
    pay_url = f"{os.environ.get('APP_URL', '').rstrip('/')}/pay/{token}"
    html = mailer.shell(
        title=f"Invoice {inv['number']}",
        intro=(f"{company['name']} has issued an invoice for "
               f"<strong>{inv.get('job_name', 'your project')}</strong>. The itemised invoice is "
               f"attached; you can pay securely by card using the button below."),
        rows=[("Subtotal", f"${inv['subtotal']:,.2f}"),
              ("Discount", f"-${inv['discount_amount']:,.2f}"),
              (inv["tax_label"], f"${inv['tax_amount']:,.2f}"),
              ("Amount due", f"${inv['total']:,.2f}")],
        cta=("Pay now by card", pay_url),
        footer=f"Payments are processed by Stripe. Questions? Contact {company['email']}.",
    )
    sent = await mailer.send(to, f"Invoice {inv['number']} — {inv.get('job_name', '')}", html,
                             attachment=(f"{inv['number']}.pdf", pdf))
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc)}})
    note = ("emailed with the PDF and a Stripe Pay Now button" if sent["delivered"]
            else f"NOT delivered — {sent['error']}")
    return SendOut(ok=True, to=to, subject=f"Invoice {inv['number']}",
                   mocked=not sent["delivered"],
                   message=f"Invoice {inv['number']} {note} ({to}).")


@router.post("/invoices/{invoice_id}/pay", response_model=Invoice)
async def pay_invoice(invoice_id: str, user: dict = Depends(require("invoice:write"))):
    inv = await _invoice_or_404(invoice_id, account_id(user))
    now = datetime.now(timezone.utc)
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"status": "paid", "paid_at": now}})
    await db.jobs.update_one({"id": inv["job_id"]}, {"$set": {"status": "paid"}})
    inv.update({"status": "paid", "paid_at": now})
    return Invoice(**inv)


@router.post("/invoices/{invoice_id}/checkout", response_model=PayIntent)
async def invoice_checkout(invoice_id: str, user: dict = Depends(require("invoice:write"))):
    """Creates the hosted-payment link the client follows. Stripe is DUMMY in this build:
    the link points at Gridline's own /pay/{token} page instead of checkout.stripe.com."""
    inv = await _invoice_or_404(invoice_id, account_id(user))
    token = inv.get("pay_token") or uuid.uuid4().hex
    if not inv.get("pay_token"):
        await db.invoices.update_one({"id": invoice_id}, {"$set": {"pay_token": token}})
    base = os.environ.get("APP_URL", "").rstrip("/")
    return PayIntent(checkout_url=f"{base}/pay/{token}", invoice_number=inv["number"],
                     amount=float(inv["total"]), mocked=True)


# The two routes below are intentionally UNAUTHENTICATED: the client paying the invoice
# is not a Gridline user. The opaque pay_token is the only thing that grants access, and
# it exposes just the amounts needed to pay.
@router.get("/pay/{pay_token}", response_model=PublicInvoice)
async def public_invoice(pay_token: str):
    inv = await db.invoices.find_one({"pay_token": pay_token}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="That payment link is not valid")
    settings = await db.settings.find_one({"user_id": inv["user_id"]}, {"_id": 0}) or {}
    return PublicInvoice(
        number=inv["number"], job_name=inv.get("job_name", ""),
        company_name=settings.get("company_name") or "Gridline",
        client_name=inv.get("client_name", ""), status=inv["status"], subtotal=inv["subtotal"],
        discount_amount=inv["discount_amount"], tax_label=inv["tax_label"],
        tax_amount=inv["tax_amount"], total=inv["total"],
    )


# The old dummy "mark it paid" endpoint is gone: client payments now go through real
# Stripe Checkout at POST /api/pay/{token}/checkout (routers/payments.py).


@router.post("/leads", response_model=Lead)
async def create_lead(body: LeadIn):
    lead = Lead(**{**body.model_dump(), "email": str(body.email)})
    await db.leads.insert_one(lead.model_dump())
    return lead


# ---------- bid vs actual job costing ----------
@router.get("/jobs/{job_id}/costing", response_model=JobCosting)
async def job_costing(job_id: str, user: dict = Depends(require("job:read"))):
    acct = account_id(user)
    job = await db.jobs.find_one({"id": job_id, "user_id": acct}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    quote = await db.quotes.find({"job_id": job_id}, {"_id": 0}).sort("revision", -1).to_list(1)
    quoted_total = float(quote[0]["total"]) if quote else 0.0
    quoted_material = quoted_labor = 0.0
    for line in (quote[0]["lines"] if quote else []):
        scope = line.get("scope", "supply_install")
        if scope == "misc":
            continue
        sqft = float(line.get("sqft", 0)) * (1 + float(line.get("waste_pct", 0)) / 100)
        if scope in ("supply_install", "supply_only"):
            quoted_material += sqft * float(line.get("material_cost_per_sqft", 0))
        if scope in ("supply_install", "install_only"):
            quoted_labor += float(line.get("labor_hours", 0)) * float(line.get("labor_rate", 0))

    expenses = await db.expenses.find({"user_id": acct, "job_id": job_id}, {"_id": 0}).to_list(1000)
    actual = sum(float(e.get("amount", 0)) for e in expenses)
    invoices = await db.invoices.find({"user_id": acct, "job_id": job_id}, {"_id": 0}).to_list(200)
    invoiced = sum(float(i.get("total", 0)) for i in invoices)
    collected = sum(float(i.get("total", 0)) for i in invoices if i.get("status") == "paid")
    revenue = invoiced or quoted_total
    return JobCosting(
        job_id=job_id, job_name=job.get("name", ""), quoted_total=round(quoted_total, 2),
        quoted_material=round(quoted_material, 2), quoted_labor=round(quoted_labor, 2),
        actual_expenses=round(actual, 2), invoiced_total=round(invoiced, 2),
        collected=round(collected, 2), variance=round(revenue - actual, 2),
        margin_pct=round((revenue - actual) / revenue * 100, 1) if revenue else 0.0,
        expense_count=len(expenses),
    )


# ---------- bid vs actual across every job, worst variance first ----------
@router.get("/costing/overview", response_model=CostingOverview)
async def costing_overview(user: dict = Depends(require("job:read"))):
    await _needs(user, CAP_COSTING)
    acct = account_id(user)
    jobs = await db.jobs.find({"user_id": acct}, {"_id": 0}).sort("created_at", -1).to_list(500)
    quotes = await db.quotes.find({"user_id": acct}, {"_id": 0, "job_id": 1, "revision": 1, "total": 1}).to_list(2000)
    latest: dict[str, dict] = {}
    for q in quotes:
        cur = latest.get(q["job_id"])
        if not cur or q["revision"] > cur["revision"]:
            latest[q["job_id"]] = q
    expenses = await db.expenses.find({"user_id": acct}, {"_id": 0, "job_id": 1, "amount": 1}).to_list(5000)
    invoices = await db.invoices.find({"user_id": acct}, {"_id": 0, "job_id": 1, "total": 1, "status": 1}).to_list(2000)

    spend: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    for e in expenses:
        spend[e.get("job_id") or ""] += float(e.get("amount", 0))
        counts[e.get("job_id") or ""] += 1
    invoiced: dict[str, float] = defaultdict(float)
    collected: dict[str, float] = defaultdict(float)
    for i in invoices:
        invoiced[i["job_id"]] += float(i.get("total", 0))
        if i.get("status") == "paid":
            collected[i["job_id"]] += float(i.get("total", 0))

    rows: list[CostingRow] = []
    for job in jobs:
        jid = job["id"]
        quoted = float(latest.get(jid, {}).get("total", 0.0))
        actual = spend[jid]
        revenue = invoiced[jid] or quoted
        rows.append(CostingRow(
            job_id=jid, job_name=job.get("name", ""), client_name=job.get("client_name", ""),
            status=job.get("status", ""), quoted_total=round(quoted, 2),
            actual_expenses=round(actual, 2), invoiced_total=round(invoiced[jid], 2),
            collected=round(collected[jid], 2), variance=round(revenue - actual, 2),
            margin_pct=round((revenue - actual) / revenue * 100, 1) if revenue else 0.0,
            expense_count=counts[jid],
        ))
    rows.sort(key=lambda r: r.margin_pct if r.quoted_total or r.actual_expenses else 999)
    quoted_total = sum(r.quoted_total for r in rows)
    actual_total = sum(r.actual_expenses for r in rows)
    revenue_total = sum(r.invoiced_total or r.quoted_total for r in rows)
    return CostingOverview(
        rows=rows, quoted_total=round(quoted_total, 2), actual_total=round(actual_total, 2),
        collected_total=round(sum(r.collected for r in rows), 2),
        variance_total=round(revenue_total - actual_total, 2),
        margin_pct=round((revenue_total - actual_total) / revenue_total * 100, 1) if revenue_total else 0.0,
    )


# ---------- CSV export for the bookkeeper ----------
def _csv(rows: list[list[str]]) -> Response:
    body = "\n".join(",".join('"' + str(c).replace('"', '""') + '"' for c in r) for r in rows)
    return Response(content=body, media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="gridline-export.csv"'})


@router.get("/export/invoices.csv")
async def export_invoices(user: dict = Depends(require("export:read"))):
    await _needs(user, CAP_EXPORT)
    docs = await db.invoices.find({"user_id": account_id(user)}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    rows: list[list[str]] = [["Invoice", "Job", "Client", "Client email", "Status", "Subtotal",
                              "Discount", "Tax label", "Tax", "Total", "Created", "Paid"]]
    for d in docs:
        rows.append([d.get("number", ""), d.get("job_name", ""), d.get("client_name", ""),
                     d.get("client_email", ""), d.get("status", ""), f"{d.get('subtotal', 0):.2f}",
                     f"{d.get('discount_amount', 0):.2f}", d.get("tax_label", ""),
                     f"{d.get('tax_amount', 0):.2f}", f"{d.get('total', 0):.2f}",
                     str(d.get("created_at", ""))[:10], str(d.get("paid_at") or "")[:10]])
    return _csv(rows)


@router.get("/export/expenses.csv")
async def export_expenses(user: dict = Depends(require("export:read"))):
    await _needs(user, CAP_EXPORT)
    acct = account_id(user)
    docs = await db.expenses.find({"user_id": acct}, {"_id": 0}).sort("date", -1).to_list(5000)
    jobs = {j["id"]: j.get("name", "") for j in
            await db.jobs.find({"user_id": acct}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    rows: list[list[str]] = [["Date", "Category", "Vendor", "Amount", "Job", "Note"]]
    for d in docs:
        rows.append([d.get("date", ""), d.get("category", ""), d.get("vendor", ""),
                     f"{d.get('amount', 0):.2f}", jobs.get(d.get("job_id") or "", ""), d.get("note", "")])
    return _csv(rows)


# ---------- expenses & profit ----------
@router.get("/expenses", response_model=list[Expense])
async def list_expenses(user: dict = Depends(require("expense:read"))):
    docs = await db.expenses.find({"user_id": account_id(user)}, {"_id": 0}).sort("date", -1).to_list(1000)
    return [Expense(**d) for d in docs]


@router.post("/expenses", response_model=Expense)
async def add_expense(body: ExpenseIn, user: dict = Depends(require("expense:write"))):
    exp = Expense(user_id=account_id(user), **body.model_dump())
    await db.expenses.insert_one(exp.model_dump())
    return exp


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(require("expense:write"))):
    res = await db.expenses.delete_one({"id": expense_id, "user_id": account_id(user)})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"ok": True}


@router.get("/profit/summary", response_model=ProfitSummary)
async def profit_summary(user: dict = Depends(require("expense:read"))):
    rev: dict[str, float] = defaultdict(float)
    exp: dict[str, float] = defaultdict(float)
    for inv in await db.invoices.find({"user_id": account_id(user), "status": "paid"}, {"_id": 0}).to_list(1000):
        paid = inv.get("paid_at") or inv.get("created_at")
        if isinstance(paid, datetime):
            rev[paid.strftime("%Y-%m")] += float(inv.get("total", 0))
    for e in await db.expenses.find({"user_id": account_id(user)}, {"_id": 0}).to_list(2000):
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
async def dashboard_stats(user: dict = Depends(require("job:read"))):
    uid = account_id(user)
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


# ---------- billing: plans, real usage against the plan's caps, unit-cost transparency ----------
@router.get("/billing/plans", response_model=list[PlanTier])
async def billing_plans():
    return [PlanTier(**p) for p in PLAN_DICTS]


@router.get("/billing/cost-model", response_model=CostModel)
async def billing_cost_model():
    """What a page actually costs us, published so the pricing is defensible."""
    return CostModel(
        page_cost=PAGE_COST, target_margin=TARGET_MARGIN, overage_per_page=OVERAGE_PER_PAGE,
        breakdown=[CostLine(**c) for c in COST_BREAKDOWN],
        competitors=[CompetitorRow(**c) for c in COMPETITORS],
    )


@router.get("/billing/usage", response_model=Usage)
async def billing_usage(user: dict = Depends(require("settings:read"))):
    acct = account_id(user)
    doc = await _account_doc(user)
    plan = plan_for(doc.get("plan"))
    start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # One-off plans count for the life of the purchase; subscriptions reset each month.
    since = {"$gte": start} if plan["kind"] in ("subscription", "trial") else {"$gte": datetime(2000, 1, 1)}
    jobs = await db.jobs.find({"user_id": acct, "created_at": since},
                              {"_id": 0, "pages": 1, "pages_read": 1}).to_list(2000)
    pages = sum(int(j.get("pages_read") or j.get("pages") or 0) for j in jobs)
    seats = await db.users.count_documents({"$or": [{"id": acct}, {"account_id": acct}]})
    included = plan["pages_included"]
    over = max(0, pages - included) if included >= 0 else 0
    return Usage(
        plan_id=plan["id"], plan_name=plan["name"], period=doc.get("plan_period", "annual"),
        pages_included=included, pages_used=pages, jobs_included=plan["jobs_included"],
        jobs_used=len(jobs), max_file_mb=plan["max_file_mb"], overage_pages=over,
        overage_cost=round(over * plan["overage_per_page"], 2),
        capabilities=plan["capabilities"], seat_count=plan["seat_count"], seats_used=seats,
    )


@router.post("/billing/checkout", response_model=CheckoutOut)
async def billing_checkout(body: CheckoutIn, user: dict = Depends(require("billing:write"))):
    """Kept for the free trial only — a real card goes through POST /api/payments/checkout."""
    plan = next((p for p in PLAN_DICTS if p["id"] == body.plan_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="Unknown plan")
    if plan["kind"] not in ("trial", "contact"):
        raise HTTPException(status_code=400, detail="Paid plans go through Stripe checkout")
    await db.users.update_one({"id": account_id(user)}, {"$set": {"plan": plan["id"]}})
    return CheckoutOut(ok=True, plan=plan["name"], mocked=False,
                       message=f"{plan['name']} activated.")


# ---------- lead inbox (owner only) ----------
@router.get("/leads", response_model=list[Lead])
async def list_leads(user: dict = Depends(require("team:write"))):
    docs = await db.leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Lead(**d) for d in docs]


_ = uuid, current_user
