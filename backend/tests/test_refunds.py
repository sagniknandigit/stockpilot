from typing import Any

from httpx import AsyncClient

from tests.conftest import Tenant, add_member, create_product, on_hand, stock_in


async def _sale(client: AsyncClient, owner: Tenant, **kwargs: Any) -> dict[str, Any]:
    a = (await create_product(client, owner, sku="A", price="100.00"))["variants"][0]
    b = (await create_product(client, owner, sku="B", price="50.00", name="Mug"))["variants"][0]
    await stock_in(client, owner, a["id"], 10)
    await stock_in(client, owner, b["id"], 10)
    resp = await client.post(
        "/api/v1/sales/orders",
        headers=owner.headers,
        json={
            "location_id": owner.location_id,
            "lines": [
                {"variant_id": a["id"], "quantity": 4},  # 400.00
                {"variant_id": b["id"], "quantity": 2},  # 100.00
            ],
            **kwargs,
        },
    )
    assert resp.status_code == 201, resp.text
    order = resp.json()
    order["_a"], order["_b"] = a, b
    return order


def _line(order: dict[str, Any], sku: str) -> str:
    return next(line["id"] for line in order["lines"] if line["sku"] == sku)


async def test_partial_refunds_with_discount(client: AsyncClient, owner: Tenant) -> None:
    order = await _sale(client, owner, discount="50.00")  # subtotal 500, total 450 (90%)
    url = f"/api/v1/sales/orders/{order['id']}/refund"

    first = await client.post(
        url,
        headers=owner.headers,
        json={"lines": [{"line_id": _line(order, "A"), "quantity": 1}], "reason": "Damaged"},
    )
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["status"] == "partially_refunded"
    assert body["refunded_amount"] == "90.00"  # 100.00 x the 90% discount ratio
    assert await on_hand(client, owner, order["_a"]["id"]) == 7  # 10 - 4 sold + 1 back

    too_many = await client.post(
        url, headers=owner.headers, json={"lines": [{"line_id": _line(order, "B"), "quantity": 3}]}
    )
    assert too_many.status_code == 422
    assert too_many.json()["error"]["details"][0]["refundable"] == 2

    # Refund the rest: exactly what's left of the total, no rounding drift.
    rest = await client.post(url, headers=owner.headers)
    assert rest.json()["status"] == "refunded"
    assert rest.json()["refunded_amount"] == "450.00"
    assert await on_hand(client, owner, order["_a"]["id"]) == 10
    assert await on_hand(client, owner, order["_b"]["id"]) == 10

    again = await client.post(url, headers=owner.headers)
    assert again.status_code == 409
    reconcile = await client.get("/api/v1/inventory/reconcile", headers=owner.headers)
    assert reconcile.json()["mismatches"] == []


async def test_reports_use_net_sales(client: AsyncClient, owner: Tenant) -> None:
    order = await _sale(client, owner)  # 500.00, 6 units
    await client.post(
        f"/api/v1/sales/orders/{order['id']}/refund",
        headers=owner.headers,
        json={"lines": [{"line_id": _line(order, "B"), "quantity": 2}]},
    )
    analytics = (await client.get("/api/v1/insights/analytics", headers=owner.headers)).json()
    assert analytics["totals"]["revenue"] == "400.00"
    assert analytics["totals"]["units"] == 4
    assert analytics["totals"]["gross_profit"] == "-400.00"  # 4 x (100 - 200 cost)
    assert [(p["sku"], p["units"]) for p in analytics["products"]] == [("A", 4)]
    summary = (await client.get("/api/v1/reports/summary", headers=owner.headers)).json()
    assert summary["today_revenue"] == "400.00"
    assert summary["today_orders"] == 1


async def test_staff_cannot_refund(client: AsyncClient, owner: Tenant) -> None:
    order = await _sale(client, owner)
    staff = await add_member(client, owner, "staff")
    resp = await client.post(f"/api/v1/sales/orders/{order['id']}/refund", headers=staff)
    assert resp.status_code == 403


async def test_invoice_pdf(client: AsyncClient, owner: Tenant) -> None:
    order = await _sale(client, owner, customer_name="Asha")
    resp = await client.get(
        f"/api/v1/sales/orders/{order['id']}/invoice.pdf", headers=owner.headers
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")
    assert f"SO-{order['number']}.pdf" in resp.headers["content-disposition"]
