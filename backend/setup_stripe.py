"""Idempotent Stripe catalog setup: one product per Gridline plan, prices keyed by lookup_key.

    cd /app/backend && python setup_stripe.py
"""

import os

import stripe
from dotenv import load_dotenv

load_dotenv()
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

from lib.pricing import PLANS, TOP_UPS  # noqa: E402  (after api_key so a bad key fails fast)

SAAS_TAX_CODE = "txcd_10103001"


def catalog() -> list[dict]:
    entries = []
    for plan in PLANS:
        prices = []
        if plan["kind"] == "subscription":
            # Annual plan is billed yearly at 12x the discounted monthly rate.
            prices.append({"lookup_key": plan["lookup_key"],
                           "amount": int(round(plan["price"] * 12 * 100)),
                           "currency": "usd", "interval": "year"})
            prices.append({"lookup_key": plan["lookup_key_monthly"],
                           "amount": int(round(plan["monthly_price"] * 100)),
                           "currency": "usd", "interval": "month"})
        elif plan["kind"] == "one_time":
            prices.append({"lookup_key": plan["lookup_key"],
                           "amount": int(round(plan["price"] * 100)), "currency": "usd"})
        else:
            continue
        entries.append({"emergent_product_id": f"gridline_{plan['id']}",
                        "name": f"Gridline {plan['name']}", "tax_code": SAAS_TAX_CODE,
                        "prices": prices})
    for pack in TOP_UPS:
        entries.append({"emergent_product_id": f"gridline_{pack['id']}",
                        "name": f"Gridline {pack['name']}", "tax_code": SAAS_TAX_CODE,
                        "prices": [{"lookup_key": pack["lookup_key"],
                                    "amount": int(round(pack["price"] * 100)),
                                    "currency": "usd"}]})
    return entries


def ensure_tax_settings() -> None:
    s = stripe.tax.Settings.retrieve()
    if s.head_office and getattr(s.head_office, "address", None):
        return
    stripe.tax.Settings.modify(
        head_office={"address": {"country": "RO", "line1": "Strada Lipscani 12",
                                 "city": "Bucharest", "postal_code": "030031"}},
        defaults={"tax_behavior": "exclusive"},
    )


def get_or_create_product(entry: dict):
    for p in stripe.Product.list(active=True).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(
        name=entry["name"], tax_code=entry.get("tax_code"),
        metadata={"managed_by": "emergent", "emergent_product_id": entry["emergent_product_id"]},
    )


def main() -> None:
    try:
        ensure_tax_settings()
    except Exception as exc:  # noqa: BLE001 — tax settings are best-effort in a sandbox
        print(f"tax settings skipped: {exc}")
    for entry in catalog():
        product = get_or_create_product(entry)
        for price in entry["prices"]:
            existing = stripe.Price.list(lookup_keys=[price["lookup_key"]], active=True, limit=1).data
            if existing and (existing[0].unit_amount != price["amount"]
                             or existing[0].currency != price["currency"]):
                stripe.Price.modify(existing[0].id, active=False)
                existing = []
            if existing:
                print(f"= {price['lookup_key']}")
                continue
            kwargs = dict(product=product.id, unit_amount=price["amount"],
                          currency=price["currency"], lookup_key=price["lookup_key"],
                          transfer_lookup_key=True)
            if price.get("interval"):
                kwargs["recurring"] = {"interval": price["interval"]}
            stripe.Price.create(**kwargs)
            print(f"+ {price['lookup_key']} {price['amount'] / 100:.2f}")
    print("catalog ready")


if __name__ == "__main__":
    main()
