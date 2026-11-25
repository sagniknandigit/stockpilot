import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.database import engine
from tests.conftest import Tenant, create_product, on_hand, stock_in


async def test_adjustments_update_stock_and_ledger(client: AsyncClient, owner: Tenant) -> None:
    variant_id = (await create_product(client, owner))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 20)

    damage = await client.post(
        "/api/v1/inventory/adjustments",
        headers=owner.headers,
        json={
            "variant_id": variant_id,
            "location_id": owner.location_id,
            "quantity": -3,
            "reason": "damage",
            "note": "Water damage",
        },
    )
    assert damage.status_code == 201
    assert damage.json()["on_hand"] == 17

    ledger = await client.get(
        "/api/v1/inventory/movements", headers=owner.headers, params={"variant_id": variant_id}
    )
    reasons = [m["reason"] for m in ledger.json()["items"]]
    assert sorted(reasons) == ["damage", "initial"]


async def test_cannot_remove_more_than_available(client: AsyncClient, owner: Tenant) -> None:
    variant_id = (await create_product(client, owner))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 2)
    resp = await client.post(
        "/api/v1/inventory/adjustments",
        headers=owner.headers,
        json={"variant_id": variant_id, "location_id": owner.location_id, "quantity": -5},
    )
    assert resp.status_code == 409
    error = resp.json()["error"]
    assert error["code"] == "insufficient_stock"
    assert error["details"][0]["available"] == 2
    assert await on_hand(client, owner, variant_id) == 2


async def test_transfer_moves_stock_atomically(client: AsyncClient, owner: Tenant) -> None:
    variant_id = (await create_product(client, owner))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 10)
    warehouse = await client.post(
        "/api/v1/inventory/locations",
        headers=owner.headers,
        json={"name": "Warehouse", "code": "WH1"},
    )
    assert warehouse.status_code == 201
    wh_id = warehouse.json()["id"]

    ok = await client.post(
        "/api/v1/inventory/transfers",
        headers=owner.headers,
        json={
            "variant_id": variant_id,
            "from_location_id": owner.location_id,
            "to_location_id": wh_id,
            "quantity": 4,
        },
    )
    assert ok.status_code == 201
    assert [lvl["on_hand"] for lvl in ok.json()] == [6, 4]

    too_much = await client.post(
        "/api/v1/inventory/transfers",
        headers=owner.headers,
        json={
            "variant_id": variant_id,
            "from_location_id": wh_id,
            "to_location_id": owner.location_id,
            "quantity": 5,
        },
    )
    assert too_much.status_code == 409
    assert await on_hand(client, owner, variant_id) == 6  # nothing half-applied


async def test_stock_view_includes_unstocked_variants_and_low_stock_filter(
    client: AsyncClient, owner: Tenant
) -> None:
    low = await create_product(client, owner, sku="LOW-1", name="Batteries", reorder_point=5)
    ok = await create_product(client, owner, sku="OK-1", name="Cables", reorder_point=1)
    await stock_in(client, owner, ok["variants"][0]["id"], 50)

    all_rows = await client.get("/api/v1/inventory/stock", headers=owner.headers)
    assert all_rows.json()["total"] == 2  # LOW-1 was never stocked but still appears

    low_rows = await client.get(
        "/api/v1/inventory/stock", headers=owner.headers, params={"low_stock": True}
    )
    items = low_rows.json()["items"]
    assert [r["variant_id"] for r in items] == [low["variants"][0]["id"]]
    assert items[0]["is_low"] is True and items[0]["on_hand"] == 0


async def test_reconcile_reports_clean_ledger(client: AsyncClient, owner: Tenant) -> None:
    variant_id = (await create_product(client, owner))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 9)
    resp = await client.get("/api/v1/inventory/reconcile", headers=owner.headers)
    assert resp.json() == {"checked": 1, "mismatches": []}


async def test_ledger_is_append_only_at_database_level(client: AsyncClient, owner: Tenant) -> None:
    variant_id = (await create_product(client, owner))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 1)
    with pytest.raises(DBAPIError, match="append-only"):
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE stock_movements SET quantity = 100"))


async def test_low_stock_is_judged_across_all_locations(client: AsyncClient, owner: Tenant) -> None:
    """Stock view and dashboard agree: low = total available <= reorder point."""
    variant_id = (await create_product(client, owner, reorder_point=10))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 6)
    wh = await client.post(
        "/api/v1/inventory/locations", headers=owner.headers, json={"name": "WH", "code": "WH"}
    )
    adjust = await client.post(
        "/api/v1/inventory/adjustments",
        headers=owner.headers,
        json={"variant_id": variant_id, "location_id": wh.json()["id"], "quantity": 6},
    )
    assert adjust.status_code == 201

    # 6 + 6 = 12 > 10: not low anywhere, even though each location alone is below 10.
    low = await client.get(
        "/api/v1/inventory/stock", headers=owner.headers, params={"low_stock": True}
    )
    assert low.json()["total"] == 0
    summary = (await client.get("/api/v1/reports/summary", headers=owner.headers)).json()
    assert summary["low_stock_count"] == 0

    sold = await client.post(
        "/api/v1/sales/orders",
        headers=owner.headers,
        json={
            "location_id": owner.location_id,
            "lines": [{"variant_id": variant_id, "quantity": 3}],
        },
    )
    assert sold.status_code == 201
    low = await client.get(
        "/api/v1/inventory/stock", headers=owner.headers, params={"low_stock": True}
    )
    assert low.json()["total"] == 2  # both location rows flagged; variant total is 9
    assert {r["variant_available"] for r in low.json()["items"]} == {9}
    summary = (await client.get("/api/v1/reports/summary", headers=owner.headers)).json()
    assert summary["low_stock_count"] == 1


async def test_movements_include_names(client: AsyncClient, owner: Tenant) -> None:
    variant_id = (await create_product(client, owner, sku="NAMED-1"))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 2)
    item = (await client.get("/api/v1/inventory/movements", headers=owner.headers)).json()["items"][
        0
    ]
    assert (item["sku"], item["product_name"], item["location_code"]) == (
        "NAMED-1",
        "Cotton T-Shirt",
        "MAIN",
    )
