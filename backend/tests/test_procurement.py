from typing import Any

from httpx import AsyncClient

from tests.conftest import Tenant, add_member, create_product, on_hand, stock_in

API = "/api/v1/purchasing"


async def _supplier(client: AsyncClient, tenant: Tenant, **extra: Any) -> dict[str, Any]:
    resp = await client.post(
        f"{API}/suppliers",
        headers=tenant.headers,
        json={"name": extra.pop("name", "Fresh Foods Co"), "lead_time_days": 5, **extra},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _draft(
    client: AsyncClient, tenant: Tenant, lines: list[dict[str, Any]]
) -> dict[str, Any]:
    supplier = await _supplier(client, tenant)
    resp = await client.post(
        f"{API}/orders",
        headers=tenant.headers,
        json={"supplier_id": supplier["id"], "location_id": tenant.location_id, "lines": lines},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_full_purchase_order_lifecycle(client: AsyncClient, owner: Tenant) -> None:
    a = (await create_product(client, owner, sku="A"))["variants"][0]
    b = (await create_product(client, owner, sku="B", name="Mug"))["variants"][0]
    po = await _draft(
        client,
        owner,
        [
            {"variant_id": a["id"], "quantity": 10, "unit_cost": "150.00"},
            {"variant_id": b["id"], "quantity": 4, "unit_cost": "80.50"},
        ],
    )
    assert po["number"] == 1
    assert po["status"] == "draft"
    assert po["total_cost"] == "1822.00"
    assert po["supplier_name"] == "Fresh Foods Co"

    # Drafts can't be received; they must be submitted first.
    line_a = next(line for line in po["lines"] if line["sku"] == "A")
    line_b = next(line for line in po["lines"] if line["sku"] == "B")
    early = await client.post(
        f"{API}/orders/{po['id']}/receive",
        headers=owner.headers,
        json={"lines": [{"line_id": line_a["id"], "quantity": 1}]},
    )
    assert early.status_code == 409

    submitted = await client.post(f"{API}/orders/{po['id']}/submit", headers=owner.headers)
    assert submitted.json()["status"] == "ordered"
    edit = await client.patch(
        f"{API}/orders/{po['id']}", headers=owner.headers, json={"notes": "x"}
    )
    assert edit.status_code == 409  # no edits after submission

    partial = await client.post(
        f"{API}/orders/{po['id']}/receive",
        headers=owner.headers,
        json={"lines": [{"line_id": line_a["id"], "quantity": 6}]},
    )
    assert partial.status_code == 200, partial.text
    assert partial.json()["status"] == "partially_received"
    assert await on_hand(client, owner, a["id"]) == 6

    too_many = await client.post(
        f"{API}/orders/{po['id']}/receive",
        headers=owner.headers,
        json={"lines": [{"line_id": line_a["id"], "quantity": 5}]},
    )
    assert too_many.status_code == 422
    assert too_many.json()["error"]["details"][0]["outstanding"] == 4

    rest = await client.post(
        f"{API}/orders/{po['id']}/receive",
        headers=owner.headers,
        json={
            "lines": [
                {"line_id": line_a["id"], "quantity": 4},
                {"line_id": line_b["id"], "quantity": 4},
            ]
        },
    )
    body = rest.json()
    assert body["status"] == "received"
    assert body["received_at"] is not None
    assert all(line["quantity_outstanding"] == 0 for line in body["lines"])

    cancel = await client.post(f"{API}/orders/{po['id']}/cancel", headers=owner.headers)
    assert cancel.status_code == 409  # can't cancel goods already received

    movements = await client.get(
        "/api/v1/inventory/movements", headers=owner.headers, params={"variant_id": a["id"]}
    )
    assert {m["reason"] for m in movements.json()["items"]} == {"purchase_receipt"}
    reconcile = await client.get("/api/v1/inventory/reconcile", headers=owner.headers)
    assert reconcile.json()["mismatches"] == []


async def test_receiving_updates_weighted_average_cost(client: AsyncClient, owner: Tenant) -> None:
    # 10 units on hand at cost 200.00 (create_product default cost).
    variant = (await create_product(client, owner))["variants"][0]
    await stock_in(client, owner, variant["id"], 10)
    po = await _draft(
        client, owner, [{"variant_id": variant["id"], "quantity": 30, "unit_cost": "100.00"}]
    )
    await client.post(f"{API}/orders/{po['id']}/submit", headers=owner.headers)
    await client.post(
        f"{API}/orders/{po['id']}/receive",
        headers=owner.headers,
        json={"lines": [{"line_id": po["lines"][0]["id"], "quantity": 30}]},
    )
    product = await client.get(
        f"/api/v1/catalog/products/{variant['product_id']}", headers=owner.headers
    )
    # (10 x 200 + 30 x 100) / 40 = 125.00
    assert product.json()["variants"][0]["cost"] == "125.00"


async def test_draft_editing_and_cancel(client: AsyncClient, owner: Tenant) -> None:
    a = (await create_product(client, owner, sku="A"))["variants"][0]
    b = (await create_product(client, owner, sku="B"))["variants"][0]
    po = await _draft(client, owner, [{"variant_id": a["id"], "quantity": 1, "unit_cost": "1.00"}])
    edited = await client.patch(
        f"{API}/orders/{po['id']}",
        headers=owner.headers,
        json={"lines": [{"variant_id": b["id"], "quantity": 7, "unit_cost": "2.00"}]},
    )
    assert [(line["sku"], line["quantity_ordered"]) for line in edited.json()["lines"]] == [
        ("B", 7)
    ]
    cancelled = await client.post(f"{API}/orders/{po['id']}/cancel", headers=owner.headers)
    assert cancelled.json()["status"] == "cancelled"


async def test_purchasing_is_tenant_scoped_and_manager_only(
    client: AsyncClient, owner: Tenant
) -> None:
    from tests.conftest import register

    supplier = await _supplier(client, owner)
    rival = await register(client, org="Rival")
    rival_variant = (await create_product(client, rival))["variants"][0]
    resp = await client.post(
        f"{API}/orders",
        headers=rival.headers,
        json={
            "supplier_id": supplier["id"],
            "location_id": rival.location_id,
            "lines": [{"variant_id": rival_variant["id"], "quantity": 1, "unit_cost": "1"}],
        },
    )
    assert resp.status_code == 404
    assert (await client.get(f"{API}/suppliers", headers=rival.headers)).json() == []

    staff = await add_member(client, owner, "staff")
    forbidden = await client.post(f"{API}/suppliers", headers=staff, json={"name": "Nope"})
    assert forbidden.status_code == 403
    assert (await client.get(f"{API}/suppliers", headers=staff)).status_code == 200

    duplicate = await client.post(
        f"{API}/suppliers", headers=owner.headers, json={"name": "Fresh Foods Co"}
    )
    assert duplicate.status_code == 409
