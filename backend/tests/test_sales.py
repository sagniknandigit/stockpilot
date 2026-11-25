from httpx import AsyncClient

from tests.conftest import Tenant, create_product, on_hand, stock_in


async def _order(client: AsyncClient, tenant: Tenant, lines: list[dict], **kwargs) -> dict:
    headers = {**tenant.headers, **kwargs.pop("headers", {})}
    resp = await client.post(
        "/api/v1/sales/orders",
        headers=headers,
        json={"location_id": tenant.location_id, "lines": lines, **kwargs},
    )
    return {"status": resp.status_code, "body": resp.json(), "headers": resp.headers}


async def test_order_totals_and_stock_decrement(client: AsyncClient, owner: Tenant) -> None:
    shirt = (await create_product(client, owner, sku="SHIRT", price="499.00"))["variants"][0]
    cap = (await create_product(client, owner, sku="CAP", price="250.50", name="Cap"))["variants"][
        0
    ]
    await stock_in(client, owner, shirt["id"], 10)
    await stock_in(client, owner, cap["id"], 10)

    result = await _order(
        client,
        owner,
        [{"variant_id": shirt["id"], "quantity": 2}, {"variant_id": cap["id"], "quantity": 1}],
        discount="48.50",
        customer_name="Walk-in",
    )
    assert result["status"] == 201, result["body"]
    order = result["body"]
    assert order["subtotal"] == "1248.50"
    assert order["total"] == "1200.00"
    assert order["number"] >= 1
    assert {line["name"] for line in order["lines"]} == {"Cotton T-Shirt - M", "Cap - M"}
    assert await on_hand(client, owner, shirt["id"]) == 8
    assert await on_hand(client, owner, cap["id"]) == 9


async def test_insufficient_stock_rejects_whole_order(client: AsyncClient, owner: Tenant) -> None:
    a = (await create_product(client, owner, sku="A"))["variants"][0]
    b = (await create_product(client, owner, sku="B"))["variants"][0]
    await stock_in(client, owner, a["id"], 5)
    await stock_in(client, owner, b["id"], 1)

    result = await _order(
        client,
        owner,
        [{"variant_id": a["id"], "quantity": 2}, {"variant_id": b["id"], "quantity": 3}],
    )
    assert result["status"] == 409
    assert result["body"]["error"]["details"] == [
        {
            "variant_id": b["id"],
            "location_id": owner.location_id,
            "requested": 3,
            "available": 1,
        }
    ]
    # Line A was valid but must not have been applied.
    assert await on_hand(client, owner, a["id"]) == 5
    orders = await client.get("/api/v1/sales/orders", headers=owner.headers)
    assert orders.json()["total"] == 0


async def test_idempotent_retry_returns_original_order(client: AsyncClient, owner: Tenant) -> None:
    variant = (await create_product(client, owner))["variants"][0]
    await stock_in(client, owner, variant["id"], 10)
    lines = [{"variant_id": variant["id"], "quantity": 3}]
    key = {"Idempotency-Key": "checkout-7f3a9c1e"}

    first = await _order(client, owner, lines, headers=key)
    retry = await _order(client, owner, lines, headers=key)
    assert first["status"] == 201
    assert retry["status"] == 200
    assert retry["headers"]["Idempotent-Replayed"] == "true"
    assert retry["body"]["id"] == first["body"]["id"]
    assert await on_hand(client, owner, variant["id"]) == 7  # charged once

    reused = await _order(
        client, owner, [{"variant_id": variant["id"], "quantity": 1}], headers=key
    )
    assert reused["status"] == 409
    assert reused["body"]["error"]["code"] == "idempotency_key_reused"


async def test_refund_restocks_once(client: AsyncClient, owner: Tenant) -> None:
    variant = (await create_product(client, owner))["variants"][0]
    await stock_in(client, owner, variant["id"], 4)
    order = (await _order(client, owner, [{"variant_id": variant["id"], "quantity": 4}]))["body"]
    assert await on_hand(client, owner, variant["id"]) == 0

    refund = await client.post(f"/api/v1/sales/orders/{order['id']}/refund", headers=owner.headers)
    assert refund.status_code == 200
    assert refund.json()["status"] == "refunded"
    assert await on_hand(client, owner, variant["id"]) == 4

    again = await client.post(f"/api/v1/sales/orders/{order['id']}/refund", headers=owner.headers)
    assert again.status_code == 409
    assert await on_hand(client, owner, variant["id"]) == 4


async def test_dashboard_summary(client: AsyncClient, owner: Tenant) -> None:
    variant = (await create_product(client, owner, price="100.00", reorder_point=3))["variants"][0]
    await stock_in(client, owner, variant["id"], 5)
    await _order(client, owner, [{"variant_id": variant["id"], "quantity": 2}])

    summary = (await client.get("/api/v1/reports/summary", headers=owner.headers)).json()
    assert summary["units_on_hand"] == 3
    assert summary["inventory_value"] == "600.00"  # 3 units x 200.00 cost
    assert summary["low_stock_count"] == 1
    assert summary["today_orders"] == 1
    assert summary["today_revenue"] == "200.00"
    assert len(summary["last_7_days"]) == 7


async def test_order_numbers_are_per_tenant(client: AsyncClient, owner: Tenant) -> None:
    from tests.conftest import register

    variant = (await create_product(client, owner))["variants"][0]
    await stock_in(client, owner, variant["id"], 10)
    for _ in range(3):
        await _order(client, owner, [{"variant_id": variant["id"], "quantity": 1}])

    rival = await register(client, org="Rival Store")
    rival_variant = (await create_product(client, rival))["variants"][0]
    await stock_in(client, rival, rival_variant["id"], 1)
    first = await _order(client, rival, [{"variant_id": rival_variant["id"], "quantity": 1}])

    # A new tenant's first order is #1, revealing nothing about other tenants' volume.
    assert first["body"]["number"] == 1
    assert first["body"]["location_code"] == "MAIN"
    numbers = [
        o["number"]
        for o in (await client.get("/api/v1/sales/orders", headers=owner.headers)).json()["items"]
    ]
    assert sorted(numbers) == [1, 2, 3]
