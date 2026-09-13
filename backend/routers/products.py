"""Product library — the brands this account quotes most, with their own cost per sq ft.

The library learns: every time a product name is typed onto a takeoff line the entry is
upserted and its use counter bumped, so the list you search is ordered by what you actually
quote. Nothing here is global — every document is scoped to the account.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.authz import account_id, require
from lib.db import db
from models.schemas import Product, ProductIn, TakeoffLine

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
                        floor_type: str = "", user: dict = Depends(require("takeoff:read"))):
    query: dict = {"account_id": account_id(user)}
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
