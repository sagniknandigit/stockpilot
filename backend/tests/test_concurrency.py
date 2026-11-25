"""The headline guarantee: concurrent checkouts never oversell.

These tests fire real concurrent requests; each gets its own DB connection and
transaction, so they genuinely race on the same stock row in PostgreSQL.
"""

import asyncio

from httpx import AsyncClient

from tests.conftest import Tenant, create_product, on_hand, stock_in


async def test_concurrent_checkouts_never_oversell(client: AsyncClient, owner: Tenant) -> None:
    variant_id = (await create_product(client, owner))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 10)

    async def buy_one() -> int:
        resp = await client.post(
            "/api/v1/sales/orders",
            headers=owner.headers,
            json={
                "location_id": owner.location_id,
                "lines": [{"variant_id": variant_id, "quantity": 1}],
            },
        )
        return resp.status_code

    statuses = await asyncio.gather(*(buy_one() for _ in range(30)))

    assert statuses.count(201) == 10
    assert statuses.count(409) == 20
    assert await on_hand(client, owner, variant_id) == 0
    reconcile = await client.get("/api/v1/inventory/reconcile", headers=owner.headers)
    assert reconcile.json()["mismatches"] == []


async def test_concurrent_multi_sku_orders_do_not_deadlock(
    client: AsyncClient, owner: Tenant
) -> None:
    """Orders listing the same SKUs in opposite order would deadlock without ordered locking."""
    a = (await create_product(client, owner, sku="A"))["variants"][0]["id"]
    b = (await create_product(client, owner, sku="B"))["variants"][0]["id"]
    await stock_in(client, owner, a, 100)
    await stock_in(client, owner, b, 100)

    async def buy(first: str, second: str) -> int:
        resp = await client.post(
            "/api/v1/sales/orders",
            headers=owner.headers,
            json={
                "location_id": owner.location_id,
                "lines": [
                    {"variant_id": first, "quantity": 1},
                    {"variant_id": second, "quantity": 1},
                ],
            },
        )
        return resp.status_code

    statuses = await asyncio.gather(*(buy(a, b) if i % 2 else buy(b, a) for i in range(20)))
    assert statuses == [201] * 20
    assert await on_hand(client, owner, a) == 80
    assert await on_hand(client, owner, b) == 80


async def test_concurrent_duplicate_requests_create_one_order(
    client: AsyncClient, owner: Tenant
) -> None:
    """A double-clicked checkout button / client retry storm with one Idempotency-Key."""
    variant_id = (await create_product(client, owner))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 10)

    async def submit() -> tuple[int, str]:
        resp = await client.post(
            "/api/v1/sales/orders",
            headers={**owner.headers, "Idempotency-Key": "double-click-0001"},
            json={
                "location_id": owner.location_id,
                "lines": [{"variant_id": variant_id, "quantity": 2}],
            },
        )
        return resp.status_code, resp.json()["id"]

    results = await asyncio.gather(*(submit() for _ in range(10)))

    assert sorted(code for code, _ in results) == [200] * 9 + [201]
    assert len({order_id for _, order_id in results}) == 1
    assert await on_hand(client, owner, variant_id) == 8
