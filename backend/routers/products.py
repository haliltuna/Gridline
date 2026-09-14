"""Product library — the brands this account quotes most, with their own cost per sq ft.

The library learns: every time a product name is typed onto a takeoff line the entry is
upserted and its use counter bumped, so the list you search is ordered by what you actually
quote. Nothing here is global — every document is scoped to the account.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.authz import account_id, require
from lib.db import db
from lib.flooring import ACCESSORIES, ACCESSORY_SOURCES
from models.schemas import AccessoryCounts, AddAccessoryIn, Product, ProductIn, TakeoffLine

router = APIRouter(tags=["products"])


async def remember_product(acct: str, line: dict) -> None:
    """Called whenever a line gains or changes a product name."""
    name = (line.get("product") or "").strip()
    if not name:
        return
    now = datetime.now(timezone.utc)
    await db.products.update_one(
        {"account_id": acct, "name": name},
        {
            "$set": {
                "floor_type": line.get("floor_type") or "",
                "alternative": line.get("product_alt") or "",
                "cost_per_sqft": float(line.get("material_cost_per_sqft") or 0),
                "last_used_at": now,
            },
            "$setOnInsert": {"id": Product(account_id=acct, name=name).id, "account_id": acct,
                             "name": name, "brand": name.split(" ")[0], "created_at": now},
            "$inc": {"times_used": 1},
        },
        upsert=True,
    )


@router.get("/products", response_model=list[Product])
async def list_products(q: str = Query("", description="search brand, product or floor type"),
                        floor_type: str = "", kind: str = "",
                        user: dict = Depends(require("takeoff:read"))):
    query: dict = {"account_id": account_id(user)}
    if kind == "accessory":
        query["kind"] = "accessory"
    elif kind == "floor":
        query["kind"] = {"$ne": "accessory"}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}},
                        {"brand": {"$regex": q, "$options": "i"}},
                        {"floor_type": {"$regex": q, "$options": "i"}}]
    if floor_type:
        query["floor_type"] = floor_type
    docs = await db.products.find(query, {"_id": 0}).sort(
        [("times_used", -1), ("last_used_at", -1)]).to_list(500)
    return [Product(**d) for d in docs]


@router.post("/products", response_model=Product)
async def create_product(body: ProductIn, user: dict = Depends(require("takeoff:write"))):
    acct = account_id(user)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="A product name is required")
    if body.kind == "accessory" and body.accessory_kind and body.accessory_kind not in ACCESSORIES:
        raise HTTPException(status_code=400, detail=f"Unknown accessory kind '{body.accessory_kind}'")
    if await db.products.find_one({"account_id": acct, "name": body.name.strip()}):
        raise HTTPException(status_code=400, detail="That product is already in your library")
    doc = Product(account_id=acct, **{**body.model_dump(), "name": body.name.strip()})
    await db.products.insert_one(doc.model_dump())
    return doc


@router.patch("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, body: ProductIn, user: dict = Depends(require("takeoff:write"))):
    acct = account_id(user)
    doc = await db.products.find_one({"id": product_id, "account_id": acct}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not in your library")
    doc.update({k: v for k, v in body.model_dump().items() if v is not None})
    await db.products.update_one({"id": product_id}, {"$set": doc})
    return Product(**doc)


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require("takeoff:write"))):
    res = await db.products.delete_one({"id": product_id, "account_id": account_id(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not in your library")
    return {"deleted": product_id}


@router.get("/accessory-catalogue")
async def accessory_catalogue(user: dict = Depends(require("takeoff:read"))):
    """The built-in accessory kinds plus this account's own price for each, from Settings."""
    settings = await db.settings.find_one({"user_id": account_id(user)}, {"_id": 0}) or {}
    return [{
        "kind": kind,
        "label": spec["label"],
        "unit": spec["unit"],
        "default_price": spec["unit_price"],
        "your_price": float(settings.get(ACCESSORY_SOURCES[kind]["price_key"]) or spec["unit_price"]),
        "labor_hr_each": spec["labor_hr_each"],
        "counted_from": ACCESSORY_SOURCES[kind]["count_field"],
    } for kind, spec in ACCESSORIES.items()]


@router.get("/jobs/{job_id}/accessory-counts", response_model=AccessoryCounts)
async def job_accessory_counts(job_id: str, user: dict = Depends(require("takeoff:read"))):
    """What the AI counted on this job's drawings (and read off its spec sheet) per accessory."""
    acct = account_id(user)
    job = await db.jobs.find_one({"id": job_id, "user_id": acct}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    settings = await db.settings.find_one({"user_id": acct}, {"_id": 0}) or {}
    spec_rows = {str(a.get("kind")): a for a in (job.get("spec_accessories") or []) if isinstance(a, dict)}
    rows = []
    for kind, src in ACCESSORY_SOURCES.items():
        spec = ACCESSORIES[kind]
        counted = float(job.get(src["count_field"]) or 0)
        from_spec = float((spec_rows.get(kind) or {}).get("qty") or 0)
        rows.append({
            "kind": kind, "label": spec["label"], "unit": spec["unit"],
            "counted": counted, "from_spec": from_spec,
            "qty": counted or from_spec,
            "unit_price": float(settings.get(src["price_key"]) or spec["unit_price"]),
            "spec_product": str((spec_rows.get(kind) or {}).get("product") or ""),
            "source": ("counted on the drawings" if counted else
                       "read from the spec sheet" if from_spec else "nothing counted yet"),
        })
    return AccessoryCounts(job_id=job_id, job_name=job.get("name", ""), rows=rows)


@router.post("/products/{product_id}/add-line", response_model=TakeoffLine)
async def add_product_line(product_id: str, body: AddAccessoryIn,
                           user: dict = Depends(require("takeoff:write"))):
    """Put a catalogue item straight onto a takeoff as its own line item.

    Accessory products become a counted line (qty x your unit price + install hours); floor
    products become a measured supply & install line at the product's cost per sq ft.
    """
    acct = account_id(user)
    product = await db.products.find_one({"id": product_id, "account_id": acct}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not in your library")
    job = await db.jobs.find_one({"id": body.job_id, "user_id": acct}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    settings = await db.settings.find_one({"user_id": acct}, {"_id": 0}) or {}

    from lib.ai import build_line, line_cost  # local import avoids the AI import cycle

    is_acc = product.get("kind") == "accessory"
    kind = product.get("accessory_kind") or ""
    spec = ACCESSORIES.get(kind)
    unit_price = float(product.get("unit_price") or 0)
    if is_acc and not unit_price and spec:
        unit_price = float(settings.get(ACCESSORY_SOURCES[kind]["price_key"]) or spec["unit_price"])
    labor_each = float(product.get("labor_hr_each") or (spec or {}).get("labor_hr_each") or 0)
    qty = max(0.0, float(body.qty))
    room = body.room or (spec["label"] if spec else product["name"])

    payload: dict = {
        "building": body.building or "Building A",
        "unit": body.unit or "Whole job",
        "room": room,
        "product": product["name"],
        "product_alt": product.get("alternative") or "",
        "spec_note": f"From your {'accessory catalogue' if is_acc else 'product library'}",
    }
    if is_acc:
        payload.update({"scope": "accessory", "qty": qty, "unit_price": unit_price,
                        "labor_hours": round(qty * labor_each, 2)})
    else:
        payload.update({"scope": "supply_install", "sqft": qty,
                        "floor_type": product.get("floor_type") or "Luxury Vinyl Plank",
                        "material_cost_per_sqft": float(product.get("cost_per_sqft") or 0)})
    line = build_line(payload, body.job_id, float(settings.get("labor_rate", 58.0)),
                      {k: float(v) for k, v in (settings.get("waste_overrides") or {}).items()})
    await db.takeoff_lines.insert_one(dict(line))
    await db.products.update_one({"id": product_id}, {"$inc": {"times_used": 1},
                                                      "$set": {"last_used_at": datetime.now(timezone.utc)}})
    line["cost"] = line_cost(line)
    return TakeoffLine(**line)


@router.post("/products/{product_id}/apply/{line_id}", response_model=TakeoffLine)
async def apply_product(product_id: str, line_id: str, user: dict = Depends(require("takeoff:write"))):
    """Drop a library product (name, alternative and your own cost per sq ft) onto a line."""
    acct = account_id(user)
    product = await db.products.find_one({"id": product_id, "account_id": acct}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not in your library")
    line = await db.takeoff_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    job = await db.jobs.find_one({"id": line["job_id"], "user_id": acct}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Line not found")

    from lib.ai import line_cost  # local import keeps the AI module out of the import cycle

    patch = {"product": product["name"], "product_alt": product.get("alternative", ""),
             "spec_note": f"From your product library ({product.get('times_used', 0)} use(s))"}
    if product.get("cost_per_sqft") and line.get("scope") != "accessory":
        patch["material_cost_per_sqft"] = float(product["cost_per_sqft"])
    line.update(patch)
    await db.takeoff_lines.update_one({"id": line_id}, {"$set": patch})
    await db.products.update_one({"id": product_id}, {"$inc": {"times_used": 1},
                                                      "$set": {"last_used_at": datetime.now(timezone.utc)}})
    line["cost"] = line_cost(line)
    return TakeoffLine(**line)
