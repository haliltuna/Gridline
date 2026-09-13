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
ESTIMATOR_EMAIL = "estimator@gridline.app"
ESTIMATOR_ID = "22222222-2222-4222-8222-222222222222"
VIEWER_EMAIL = "viewer@gridline.app"
VIEWER_ID = "33333333-3333-4333-8333-333333333333"


# The branded products the demo sets are "specified" with, plus the approved alternative —
# a supply line must read as a product name, never a bare category.
SPEC_PRODUCTS: dict[str, tuple[str, str]] = {
    "Luxury Vinyl Plank": ("Shaw Fifth Avenue Oak 5mm SPC 0847V-00734 Ravine", "Mohawk Batavia II 6mm SPC — Sandbar"),
    "Luxury Vinyl Tile": ("Armstrong Natural Creations Mystix LVT ST880 Grey Ash", "Patcraft Modern Mix LVT — Ashen"),
    "Carpet Tile": ("Interface Open Air 403 24x24 Charcoal 104655", "Shaw Contract Hexagon 24x24 — Graphite"),
    "Broadloom Carpet": ("Mohawk Group Bordering Broadloom BT254 Fog", "Shaw Contract Basis Broadloom — Mist"),
    "Porcelain Tile": ("Daltile Emerson Wood EP01 12x48 Ashen", "MSI Praia Grey 12x48 porcelain"),
    "Ceramic Tile": ("Daltile Rittenhouse Square 3x6 Arctic White RS01", "Emser Cotto 3x6 — Blanco"),
    "Sheet Vinyl": ("Armstrong Medintech Homogeneous Sheet 85140 Pearl", "Forbo Eternal Sheet — Pearl"),
    "Engineered Hardwood": ("Mirage Admiration Red Oak 5in Natural", "Mercier Nature Red Oak 5in — Natural"),
    "Rubber Flooring": ("Nora Norament 926 Grano 5104", "Mannington BioSpec Rubber — Slate"),
    "VCT": ("Armstrong Standard Excelon Imperial Texture 51858 Sandrift White", "Congoleum VCT — Sand"),
    "Epoxy / Resinous": ("Sika Sikafloor 264 broadcast system, Light Grey", "Dur-A-Flex Poly-Crete MD — Grey"),
    "Polished Concrete": ("Prosoco Consolideck LS Guard polished system, 800 grit", "Ameripolish SureLock dye + guard"),
    "Natural Stone": ("MSI Crema Marfil 12x24 honed marble", "Emser Marfil select — honed"),
}


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
        "plan": "agency", "role": "owner", "account_id": USER_ID,
        "password_hash": hash_password(PASSWORD), "created_at": now - timedelta(days=90),
    })
    # Two extra seats so the roles are visible immediately.
    for mid, email, name, role, days in [
        (ESTIMATOR_ID, ESTIMATOR_EMAIL, "Marisol Vega", "estimator", 40),
        (VIEWER_ID, VIEWER_EMAIL, "Dale Pruitt", "viewer", 20),
    ]:
        await db.users.delete_many({"email": email})
        await db.users.insert_one({
            "id": mid, "email": email, "name": name, "company": "Delgado Flooring LLC",
            "plan": "agency", "role": role, "account_id": USER_ID,
            "password_hash": hash_password(PASSWORD), "created_at": now - timedelta(days=days),
        })
    await db.settings.insert_one({
        "user_id": USER_ID, "country": "United States", "region": "Texas", "tax_label": "Sales Tax",
        "tax_rate": 6.25, "currency": "USD", "labor_rate": 58.0,
        "company_name": "Delgado Flooring LLC", "company_email": EMAIL,
        "pdf_template": "contractor_clean", "default_scope": "supply_install",
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
            prod, alt = SPEC_PRODUCTS.get(ft, ("", ""))
            line = build_line({"building": b, "unit": u, "room": r, "floor_type": ft, "sqft": sqft,
                               "product": prod, "product_alt": alt,
                               "spec_note": f"Specified for '{r}' on the finish schedule"}, jid, 58.0)
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
                # insert_many stamped `_id` onto each line dict — strip it, or the quote
                # snapshot cannot be serialised by Pydantic on read.
                "notes": "", "lines": [{k: v for k, v in d.items() if k != "_id"}
                                       | {"cost": line_cost(d)} for d in docs],
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

    for d, cat, vendor, amt, jid in [
        (0, "Materials", "Shaw Contract", 4820.00, "seed-job-oakridge"),
        (5, "Adhesive", "Mapei Supply", 1140.50, "seed-job-oakridge"),
        (11, "Subcontract Labor", "Cruz Install Crew", 6200.00, "seed-job-linden"),
        (19, "Equipment", "United Rentals", 385.75, "seed-job-linden"),
        (26, "Fuel", "Shell Fleet", 268.40, None),
    ]:
        await db.expenses.insert_one({
            "id": str(uuid.uuid4()), "user_id": USER_ID, "date": (now - timedelta(days=d)).strftime("%Y-%m-%d"),
            "category": cat, "vendor": vendor, "amount": amt, "job_id": jid, "note": "",
        })

    # One saved unit template so "apply to matching units" is usable out of the box.
    await db.unit_templates.delete_many({"user_id": USER_ID})
    await db.unit_templates.insert_one({
        "id": "seed-tpl-1br", "user_id": USER_ID, "name": "Type A — 1 bed / 1 bath",
        "source_job_id": "seed-job-oakridge", "created_at": now - timedelta(days=6),
        "lines": [
            {"room": "Living / Dining", "scope": "supply_install", "floor_type": "Luxury Vinyl Plank",
             "product": "Shaw Fifth Avenue Oak 5mm SPC 0847V-00734 Ravine", "product_alt": "Mohawk Batavia II 6mm SPC — Sandbar", "sqft": 310.0, "waste_pct": 10.0, "flat_cost": 0.0},
            {"room": "Bedroom 1", "scope": "supply_install", "floor_type": "Carpet Tile",
             "product": "Interface Open Air 403 24x24 Charcoal 104655", "product_alt": "Shaw Contract Hexagon 24x24 — Graphite", "sqft": 140.0, "waste_pct": 5.0, "flat_cost": 0.0},
            {"room": "Bathroom 1", "scope": "supply_install", "floor_type": "Porcelain Tile",
             "product": "Daltile Emerson Wood EP01 12x48 Ashen", "product_alt": "MSI Praia Grey 12x48 porcelain", "sqft": 50.0, "waste_pct": 10.0, "flat_cost": 0.0},
            {"room": "Kitchen Backsplash", "scope": "supply_install", "floor_type": "Ceramic Tile",
             "product": "Daltile Rittenhouse Square 3x6 Arctic White RS01", "product_alt": "Emser Cotto 3x6 — Blanco", "sqft": 22.0, "waste_pct": 10.0, "flat_cost": 0.0},
            {"room": "Floor prep / grinding", "scope": "misc", "floor_type": "",
             "product": "", "sqft": 0.0, "waste_pct": 0.0, "flat_cost": 225.0},
        ],
    })

    # a couple of demo requests so the lead inbox is not an empty screen
    for lead in [
        {"id": "seed-lead-1", "name": "Priya Raman", "email": "priya@ramansurfaces.com",
         "company": "Raman Surfaces", "phone": "+1 602 555 0144", "crew_size": "4",
         "interest": "enterprise", "message": "Bidding 3 garden-style communities a month in AZ and NV. Need pooled page volume and SSO.",
         "created_at": datetime.now(timezone.utc)},
        {"id": "seed-lead-2", "name": "Gus Whitfield", "email": "gus@whitfieldfloors.ca",
         "company": "Whitfield Floors", "phone": "", "crew_size": "1",
         "interest": "demo", "message": "One-man shop, mostly tenant improvement. Want to see it read a 90-page set.",
         "created_at": datetime.now(timezone.utc)},
    ]:
        await db.leads.update_one({"id": lead["id"]}, {"$set": lead}, upsert=True)

    print(f"seeded {EMAIL} / {PASSWORD} (+ estimator@ and viewer@, same password)")


if __name__ == "__main__":
    asyncio.run(main())
