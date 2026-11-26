from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from httpx import AsyncClient

from app.core.database import SessionLocal
from app.models import SalesOrder, SalesOrderLine
from tests.conftest import Tenant, create_product, stock_in


async def _backfill_sales(
    tenant: Tenant, variant: dict, per_day: int, days: int = 56, start_number: int = 1000
) -> None:
    """Insert historical orders directly (the API can only create orders 'now')."""
    # Anchor to the store's local day (Asia/Kolkata by default), not UTC: between 00:00
    # and 05:30 IST the two calendars disagree, and the forecaster works in local days.
    tz = ZoneInfo(tenant.org["timezone"])
    now = datetime.now(tz).replace(hour=12, minute=0, second=0, microsecond=0)
    price = Decimal(variant["price"])
    async with SessionLocal() as db:
        for i in range(days):
            at = now - timedelta(days=days - i)
            db.add(
                SalesOrder(
                    id=uuid4(),
                    org_id=UUID(tenant.org["id"]),
                    number=start_number + i,
                    location_id=UUID(tenant.location_id),
                    subtotal=price * per_day,
                    discount=Decimal("0"),
                    total=price * per_day,
                    created_at=at,
                    updated_at=at,
                    lines=[
                        SalesOrderLine(
                            variant_id=UUID(variant["id"]),
                            sku=variant["sku"],
                            name="Backfilled",
                            quantity=per_day,
                            unit_price=price,
                            unit_cost=Decimal(variant["cost"]),
                            line_total=price * per_day,
                        )
                    ],
                )
            )
        await db.commit()


async def test_reorder_suggestion_for_fast_seller(client: AsyncClient, owner: Tenant) -> None:
    fast = (await create_product(client, owner, sku="FAST", name="Milk"))["variants"][0]
    slow = (await create_product(client, owner, sku="SLOW", name="Vase"))["variants"][0]
    await stock_in(client, owner, fast["id"], 5)
    await stock_in(client, owner, slow["id"], 50)
    await _backfill_sales(owner, fast, per_day=3)

    resp = await client.get("/api/v1/insights/reorder-suggestions", headers=owner.headers)
    assert resp.status_code == 200
    body = resp.json()
    assert [s["sku"] for s in body["items"]] == ["FAST"]  # SLOW has stock and no demand
    s = body["items"][0]
    assert s["avg_daily_demand"] == 3.0
    assert s["urgency"] == "critical"  # 5 units vs ~21 needed over a 7-day lead time
    # demand over lead time + review period (14 x 3) - available, no safety stock (no variance)
    assert s["suggested_qty"] == 42 - 5
    assert s["days_of_cover"] == round(5 / 3, 1)
    assert body["accuracy"]["model_wape"] == 0.0  # perfectly regular history

    supplier = await client.post(
        "/api/v1/purchasing/suppliers", headers=owner.headers, json={"name": "Dairy Ltd"}
    )
    draft = await client.post(
        "/api/v1/purchasing/orders/from-suggestions",
        headers=owner.headers,
        json={
            "supplier_id": supplier.json()["id"],
            "location_id": owner.location_id,
            "variant_ids": [fast["id"], slow["id"]],
        },
    )
    assert draft.status_code == 201, draft.text
    assert [(line["sku"], line["quantity_ordered"]) for line in draft.json()["lines"]] == [
        ("FAST", 37)
    ]

    # Once ordered, the incoming quantity counts toward cover and the suggestion drops.
    await client.post(
        f"/api/v1/purchasing/orders/{draft.json()['id']}/submit", headers=owner.headers
    )
    after = await client.get(
        "/api/v1/insights/reorder-suggestions",
        headers=owner.headers,
        params={"only_needed": False},
    )
    item = next(i for i in after.json()["items"] if i["sku"] == "FAST")
    assert item["on_order"] == 37
    assert item["suggested_qty"] == 0
    assert item["last_supplier_name"] == "Dairy Ltd"


async def test_variant_forecast_series(client: AsyncClient, owner: Tenant) -> None:
    variant = (await create_product(client, owner))["variants"][0]
    await _backfill_sales(owner, variant, per_day=2)
    resp = await client.get(f"/api/v1/insights/forecast/{variant['id']}", headers=owner.headers)
    body = resp.json()
    history = [p for p in body["points"] if p["actual"] is not None]
    future = [p for p in body["points"] if p["forecast"] is not None]
    assert len(history) == 56 and len(future) == 14
    assert all(p["actual"] == 2 for p in history)
    assert all(abs(p["forecast"] - 2) < 0.01 for p in future)


async def test_analytics(client: AsyncClient, owner: Tenant) -> None:
    big = (await create_product(client, owner, sku="BIG", price="1000.00"))["variants"][0]
    small = (await create_product(client, owner, sku="SMALL", price="50.00"))["variants"][0]
    idle = (await create_product(client, owner, sku="IDLE", price="10.00"))["variants"][0]
    for v in (big, small, idle):
        await stock_in(client, owner, v["id"], 20)
    for v, qty in ((big, 2), (small, 3)):
        resp = await client.post(
            "/api/v1/sales/orders",
            headers=owner.headers,
            json={
                "location_id": owner.location_id,
                "lines": [{"variant_id": v["id"], "quantity": qty}],
            },
        )
        assert resp.status_code == 201

    resp = await client.get("/api/v1/insights/analytics", headers=owner.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    totals = body["totals"]
    assert totals["revenue"] == "2150.00"
    assert totals["orders"] == 2
    assert totals["units"] == 5
    assert totals["gross_profit"] == "1150.00"  # cost is 200.00 per unit
    assert totals["avg_order_value"] == "1075.00"
    assert len(body["daily"]) == 30
    assert [(p["sku"], p["abc_class"]) for p in body["products"]] == [("BIG", "A"), ("SMALL", "B")]
    assert body["slow_movers"][0]["sku"] == "IDLE"
    assert body["inventory"]["turnover"] is not None

    bad = await client.get(
        "/api/v1/insights/analytics",
        headers=owner.headers,
        params={"date_from": "2026-02-01", "date_to": "2026-01-01"},
    )
    assert bad.status_code == 422
