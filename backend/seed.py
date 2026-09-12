"""Idempotent demo seed: demo contractor account, 3 jobs, takeoff lines, quote, invoices, expenses."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from lib.ai import build_line, line_cost
from lib.auth import hash_password
from lib.db import db, ensure_indexes

EMAIL = "demo@gridline.app"
PASSWORD = "gridline123"
USER_ID = "11111111-1111-4111-8111-111111111111"


async def main() -> None:
    await db.users.delete_many({"email": EMAIL})
    await db.sessions.delete_many({"user_id": USER_ID})
    for coll in ("settings", "jobs", "quotes", "invoices", "expenses"):
        await db[coll].delete_many({"user_id": USER_ID})
    await db.takeoff_lines.delete_many({"job_id": {"$regex": "^seed-"}})
    await ensure_indexes()

    now = datetime.now(timezone.utc)
    await db.users.insert_one({
        "id": USER_ID, "email": EMAIL, "name": "Ray Delgado", "company": "Delgado Flooring LLC",
        "plan": "pro", "password_hash": hash_password(PASSWORD), "created_at": now - timedelta(days=90),
    })
    await db.settings.insert_one({
        "user_id": USER_ID, "country": "United States", "region": "Texas", "tax_label": "Sales Tax",
        "tax_rate": 6.25, "currency": "USD", "labor_rate": 58.0,
        "company_name": "Delgado Flooring LLC", "company_email": EMAIL,
    })

    jobs = [
        ("seed-job-oakridge", "Oakridge Commons — Phase 2", "Meridian Construction", "pm@meridianbuild.com",
         "4120 Oakridge Pkwy, Austin TX", "takeoff", 3, 24, 48, 36, 8),
        ("seed-job-harborview", "Harborview Medical Fit-Out", "Harborview Health", "facilities@harborview.org",
         "88 Marine Dr, Corpus Christi TX", "quoted", 1, 1, 0, 6, 2),
        ("seed-job-linden", "Linden Row Townhomes", "Linden Row LP", "billing@lindenrow.com",
         "915 Linden Row, San Antonio TX", "paid", 2, 12, 24, 18, 4),
    ]
    line_specs = {
        "seed-job-oakridge": [
            ("Building A", "Unit 101", "Living / Dining", "Luxury Vinyl Plank", 318.0),
            ("Building A", "Unit 101", "Bedroom 1", "Carpet Tile", 142.0),
            ("Building A", "Unit 101", "Bedroom 2", "Carpet Tile", 128.0),
            ("Building A", "Unit 101", "Bathroom 1", "Porcelain Tile", 48.0),
            ("Building A", "Unit 101", "Kitchen Backsplash", "Ceramic Tile", 22.0),
            ("Building A", "Unit 102", "Living / Dining", "Luxury Vinyl Plank", 305.0),
            ("Building A", "Unit 102", "Bedroom 1", "Carpet Tile", 138.0),
            ("Building B", "Unit 201", "Living / Dining", "Luxury Vinyl Plank", 322.0),
            ("Building B", "Unit 201", "Bathroom 1", "Porcelain Tile", 52.0),
            ("Building B", "Corridor", "Main Corridor", "Broadloom Carpet", 640.0),
        ],
        "seed-job-harborview": [
            ("Main Building", "Level 1", "Reception", "Luxury Vinyl Tile", 410.0),
            ("Main Building", "Level 1", "Exam Rooms (6)", "Sheet Vinyl", 780.0),
            ("Main Building", "Level 1", "Corridor", "Sheet Vinyl", 520.0),
            ("Main Building", "Level 1", "Lab Floor", "Epoxy / Resinous", 260.0),
        ],
        "seed-job-linden": [
            ("Building 1", "Townhome A", "Main Floor", "Engineered Hardwood", 620.0),
            ("Building 1", "Townhome A", "Stairs / Upper Hall", "Broadloom Carpet", 210.0),
            ("Building 1", "Townhome A", "Bathrooms (2)", "Porcelain Tile", 96.0),
            ("Building 2", "Townhome B", "Main Floor", "Engineered Hardwood", 615.0),
        ],
    }

    for i, (jid, name, client, email, addr, status, blds, units, beds, baths, days_ago) in enumerate(jobs):
        await db.jobs.insert_one({
            "id": jid, "user_id": USER_ID, "name": name, "client_name": client, "client_email": email,
            "address": addr, "status": status, "filename": f"{jid.replace('seed-job-', '')}-set.pdf",
            "pages": 42 + i * 30, "pages_read": 12, "engine": "claude-opus", "scale": '1/4" = 1\'-0"',
            "project_type": "multi-family" if i != 1 else "commercial",
            "buildings": blds, "units": units, "bedrooms": beds, "bathrooms": baths,
            "stated_total_sqft": None, "cross_check_note": "Room sum within 1.4% of stated building total.",
            "brief": f"{blds} building(s), {units} unit(s), {beds} bedrooms and {baths} bathrooms measured, including backsplash tile.",
            "flags": ["Page 18 dimension string partially obscured — flagged for manual review."] if i == 0 else [],
            "created_at": now - timedelta(days=days_ago),
        })
        docs = []
        for (b, u, r, ft, sqft) in line_specs[jid]:
            line = build_line({"building": b, "unit": u, "room": r, "floor_type": ft, "sqft": sqft}, jid, 58.0)
            line["approved"] = status != "takeoff"
            docs.append(line)
        await db.takeoff_lines.insert_many(docs)

        if status in ("quoted", "paid"):
            subtotal = round(sum(line_cost(d) for d in docs), 2)
            disc = round(subtotal * 0.03, 2)
            tax = round((subtotal - disc) * 0.0625, 2)
            qid = str(uuid.uuid4())
            await db.quotes.insert_one({
                "id": qid, "job_id": jid, "user_id": USER_ID, "number": f"Q-{jid[-6:].upper()}-R1",
                "revision": 1, "parent_id": None, "status": "sent" if status == "quoted" else "accepted",
                "discount_pct": 3.0, "tax_label": "Sales Tax", "tax_rate": 6.25, "subtotal": subtotal,
                "discount_amount": disc, "tax_amount": tax, "total": round(subtotal - disc + tax, 2),
                "notes": "", "lines": [{**d, "cost": line_cost(d)} for d in docs],
                "created_at": now - timedelta(days=days_ago - 1),
            })
            if status == "paid":
                await db.invoices.insert_one({
                    "id": str(uuid.uuid4()), "user_id": USER_ID, "job_id": jid, "job_name": name,
                    "quote_id": qid, "number": f"INV-{jid[-6:].upper()}-R1", "client_name": client,
                    "client_email": email, "status": "paid", "subtotal": subtotal, "discount_amount": disc,
                    "tax_label": "Sales Tax", "tax_amount": tax, "total": round(subtotal - disc + tax, 2),
                    "sent_at": now - timedelta(days=3), "paid_at": now - timedelta(days=1),
                    "created_at": now - timedelta(days=3),
                })

    for d, cat, vendor, amt in [
        (0, "Materials", "Shaw Contract", 4820.00),
        (5, "Adhesive", "Mapei Supply", 1140.50),
        (11, "Subcontract Labor", "Cruz Install Crew", 6200.00),
        (19, "Equipment", "United Rentals", 385.75),
        (26, "Fuel", "Shell Fleet", 268.40),
    ]:
        await db.expenses.insert_one({
            "id": str(uuid.uuid4()), "user_id": USER_ID, "date": (now - timedelta(days=d)).strftime("%Y-%m-%d"),
            "category": cat, "vendor": vendor, "amount": amt, "job_id": None, "note": "",
        })

    print(f"seeded {EMAIL} / {PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
