"""Outbox, low-stock alerts, notifications, webhooks and API keys."""

import json
from typing import Any
from uuid import UUID

import httpx
from httpx import AsyncClient
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import DeliveryStatus, OutboxEvent, WebhookDelivery
from app.services import outbox, webhooks
from tests.conftest import Tenant, create_product, register, stock_in

INTEGRATIONS = "/api/v1/integrations"


async def _outbox_types(org_id: str) -> list[str]:
    async with SessionLocal() as db:
        rows = await db.scalars(
            select(OutboxEvent.type)
            .where(OutboxEvent.org_id == UUID(org_id))
            .order_by(OutboxEvent.created_at)
        )
        return list(rows)


async def _process() -> outbox.OutboxResult:
    async with SessionLocal() as db:
        return await outbox.process_batch(db)


async def _sell(client: AsyncClient, tenant: Tenant, variant_id: str, qty: int) -> int:
    resp = await client.post(
        "/api/v1/sales/orders",
        headers=tenant.headers,
        json={
            "location_id": tenant.location_id,
            "lines": [{"variant_id": variant_id, "quantity": qty}],
        },
    )
    return resp.status_code


async def test_outbox_is_transactional(client: AsyncClient, owner: Tenant) -> None:
    variant_id = (await create_product(client, owner))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 3)
    assert await _sell(client, owner, variant_id, 50) == 409  # rolled back
    assert await _outbox_types(owner.org["id"]) == ["stock.changed"]  # only the stock-in
    assert await _sell(client, owner, variant_id, 1) == 201
    assert sorted(await _outbox_types(owner.org["id"])) == [
        "order.created",
        "stock.changed",
        "stock.changed",
    ]


async def test_low_stock_crossing_alerts_once(client: AsyncClient, owner: Tenant) -> None:
    variant_id = (await create_product(client, owner, reorder_point=5))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 8)
    assert await _sell(client, owner, variant_id, 2) == 201  # 6 left: above the threshold
    assert await _sell(client, owner, variant_id, 2) == 201  # 4 left: crosses → alert
    assert await _sell(client, owner, variant_id, 1) == 201  # 3 left: already low, no event
    assert (await _outbox_types(owner.org["id"])).count("stock.low") == 1

    result = await _process()
    assert result.emails and result.emails[0][0] == [owner.user["email"]]
    assert "Low stock" in result.emails[0][1]

    notes = (await client.get("/api/v1/notifications", headers=owner.headers)).json()
    assert notes["unread"] == 1
    assert notes["items"][0]["title"] == "Low stock: Cotton T-Shirt - M"
    assert notes["items"][0]["link"] == "/insights"
    await client.post("/api/v1/notifications/read-all", headers=owner.headers)
    notes = (await client.get("/api/v1/notifications", headers=owner.headers)).json()
    assert notes["unread"] == 0

    # Restock above the threshold and cross again: de-duplicated within 12 hours.
    await stock_in(client, owner, variant_id, 10)
    assert await _sell(client, owner, variant_id, 10) == 201
    result = await _process()
    assert result.emails == []


async def test_webhook_endpoints_and_url_safety(client: AsyncClient, owner: Tenant) -> None:
    for bad in ("http://example.com/hook", "https://localhost/hook", "https://10.0.0.5/hook"):
        resp = await client.post(
            f"{INTEGRATIONS}/webhooks",
            headers=owner.headers,
            json={"url": bad, "events": ["order.created"]},
        )
        assert resp.status_code == 422, bad
    bad_event = await client.post(
        f"{INTEGRATIONS}/webhooks",
        headers=owner.headers,
        json={"url": "https://example.com/hook", "events": ["secrets.dump"]},
    )
    assert bad_event.status_code == 422

    created = await client.post(
        f"{INTEGRATIONS}/webhooks",
        headers=owner.headers,
        json={"url": "https://example.com/hook", "events": ["order.created", "stock.low"]},
    )
    assert created.status_code == 201
    hook = created.json()
    assert hook["secret"].startswith("whsec_")
    rotated = await client.post(
        f"{INTEGRATIONS}/webhooks/{hook['id']}/rotate-secret", headers=owner.headers
    )
    assert rotated.json()["secret"] != hook["secret"]

    rival = await register(client, org="Rival")
    hidden = await client.get(f"{INTEGRATIONS}/webhooks", headers=rival.headers)
    assert hidden.json() == []


async def test_webhook_fanout_signing_and_retries(client: AsyncClient, owner: Tenant) -> None:
    hook = (
        await client.post(
            f"{INTEGRATIONS}/webhooks",
            headers=owner.headers,
            json={"url": "https://example.com/hook", "events": ["order.created"]},
        )
    ).json()
    variant_id = (await create_product(client, owner))["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 5)
    assert await _sell(client, owner, variant_id, 1) == 201

    result = await _process()
    assert len(result.deliveries) == 1  # only order.created is subscribed

    received: list[httpx.Request] = []
    replies = iter([500, 200])

    def handler(request: httpx.Request) -> httpx.Response:
        received.append(request)
        return httpx.Response(next(replies), text="ok")

    mock = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    delivery_id = result.deliveries[0]

    async with SessionLocal() as db:
        retry_in = await webhooks.deliver(db, delivery_id, client=mock)
    assert retry_in is not None and retry_in.total_seconds() == 10  # first backoff step

    async with SessionLocal() as db:
        assert await webhooks.deliver(db, delivery_id, client=mock) is None
        delivery = await db.get(WebhookDelivery, delivery_id)
        assert delivery is not None
        assert delivery.status == DeliveryStatus.SUCCEEDED and delivery.attempts == 2

    request = received[-1]
    body = json.loads(request.content)
    assert body["type"] == "order.created" and body["data"]["number"] >= 1
    assert request.headers["X-StockPilot-Delivery"] == str(delivery_id)
    signature = request.headers["X-StockPilot-Signature"]
    assert webhooks.verify(hook["secret"], signature, request.content)
    assert not webhooks.verify(hook["secret"], signature, request.content + b" ")
    assert not webhooks.verify("whsec_wrong", signature, request.content)

    log = await client.get(
        f"{INTEGRATIONS}/webhooks/{hook['id']}/deliveries", headers=owner.headers
    )
    assert log.json()["items"][0]["status"] == "succeeded"


async def test_webhook_gives_up_after_max_attempts(client: AsyncClient, owner: Tenant) -> None:
    hook = (
        await client.post(
            f"{INTEGRATIONS}/webhooks",
            headers=owner.headers,
            json={"url": "https://example.com/hook", "events": ["order.created"]},
        )
    ).json()
    test = await client.post(f"{INTEGRATIONS}/webhooks/{hook['id']}/test", headers=owner.headers)
    assert test.status_code == 202
    delivery_id = UUID(test.json()["id"])
    failing = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(503)))
    for _ in range(webhooks.MAX_ATTEMPTS):
        async with SessionLocal() as db:
            await webhooks.deliver(db, delivery_id, client=failing)
    async with SessionLocal() as db:
        delivery = await db.get(WebhookDelivery, delivery_id)
        assert delivery is not None
        assert delivery.status == DeliveryStatus.FAILED
        assert delivery.attempts == webhooks.MAX_ATTEMPTS


async def test_api_keys(client: AsyncClient, owner: Tenant) -> None:
    created = await client.post(
        f"{INTEGRATIONS}/api-keys", headers=owner.headers, json={"name": "Shopify sync"}
    )
    assert created.status_code == 201
    key: dict[str, Any] = created.json()
    assert key["key"].startswith(key["prefix"] + "_") and key["role"] == "staff"
    listed = (await client.get(f"{INTEGRATIONS}/api-keys", headers=owner.headers)).json()
    assert "key" not in listed[0]  # the secret is never shown again

    api = {"X-API-Key": key["key"]}
    assert (await client.get("/api/v1/catalog/products", headers=api)).status_code == 200
    # Capped at the key's role (staff), even though the owner created it.
    write = await client.post(
        "/api/v1/catalog/products",
        headers=api,
        json={"name": "X", "variants": [{"sku": "X1", "price": "1"}]},
    )
    assert write.status_code == 403
    assert (await client.get(f"{INTEGRATIONS}/api-keys", headers=api)).status_code == 403

    bogus = await client.get("/api/v1/catalog/products", headers={"X-API-Key": "sp_nope_x"})
    assert bogus.status_code == 401
    await client.delete(f"{INTEGRATIONS}/api-keys/{key['id']}", headers=owner.headers)
    assert (await client.get("/api/v1/catalog/products", headers=api)).status_code == 401


async def test_request_id_and_metrics(client: AsyncClient, owner: Tenant) -> None:
    resp = await client.get(
        "/api/v1/catalog/products", headers={**owner.headers, "X-Request-ID": "trace-123"}
    )
    assert resp.headers["X-Request-ID"] == "trace-123"
    metrics = (await client.get("/metrics")).text
    assert 'route="/api/v1/catalog/products"' in metrics
    assert "stockpilot_http_request_duration_seconds_bucket" in metrics
