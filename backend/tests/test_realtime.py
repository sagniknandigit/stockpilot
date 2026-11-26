from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient
from starlette.websockets import WebSocketDisconnect

from app.core.events import hub
from app.main import app
from tests.conftest import Tenant, create_product, register, stock_in


async def test_events_publish_only_after_commit(client: AsyncClient, owner: Tenant) -> None:
    org_id = UUID(owner.org["id"])
    variant_id = (await create_product(client, owner))["variants"][0]["id"]
    queue = hub.subscribe(org_id)
    rival = await register(client, org="Rival")
    rival_queue = hub.subscribe(UUID(rival.org["id"]))
    try:
        await stock_in(client, owner, variant_id, 5)
        event = queue.get_nowait()
        assert event["type"] == "stock.changed"
        assert (event["variant_id"], event["on_hand"], event["delta"]) == (variant_id, 5, 5)

        # A rejected sale rolls back: nothing may be broadcast.
        failed = await client.post(
            "/api/v1/sales/orders",
            headers=owner.headers,
            json={
                "location_id": owner.location_id,
                "lines": [{"variant_id": variant_id, "quantity": 50}],
            },
        )
        assert failed.status_code == 409
        assert queue.empty()

        sale = await client.post(
            "/api/v1/sales/orders",
            headers=owner.headers,
            json={
                "location_id": owner.location_id,
                "lines": [{"variant_id": variant_id, "quantity": 2}],
            },
        )
        assert sale.status_code == 201
        types = [queue.get_nowait()["type"] for _ in range(queue.qsize())]
        assert sorted(types) == ["order.created", "stock.changed"]

        assert rival_queue.empty()  # other tenants hear nothing
    finally:
        hub.unsubscribe(org_id, queue)
        hub.unsubscribe(UUID(rival.org["id"]), rival_queue)


def test_websocket_auth_and_live_stock_updates() -> None:
    with TestClient(app) as tc:
        reg = tc.post(
            "/api/v1/auth/register",
            json={
                "organization_name": "Live Shop",
                "full_name": "Live Owner",
                "email": "live-owner@example.com",
                "password": "s3cure-password",
            },
        ).json()
        token = reg["tokens"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        location_id = tc.get("/api/v1/inventory/locations", headers=headers).json()[0]["id"]
        product = tc.post(
            "/api/v1/catalog/products",
            headers=headers,
            json={"name": "Tea", "variants": [{"sku": "TEA-1", "price": "10"}]},
        ).json()
        variant_id = product["variants"][0]["id"]

        # Wrong first message: rejected with an auth close code.
        with tc.websocket_connect("/api/v1/ws") as ws:
            ws.send_json({"type": "auth", "token": "not-a-jwt"})
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_json()
            assert exc.value.code == 4401

        with tc.websocket_connect("/api/v1/ws") as ws:
            ws.send_json({"type": "auth", "token": token})
            assert ws.receive_json() == {"type": "ready"}
            tc.post(
                "/api/v1/inventory/adjustments",
                headers=headers,
                json={"variant_id": variant_id, "location_id": location_id, "quantity": 7},
            )
            event = ws.receive_json()
            assert event["type"] == "stock.changed"
            assert event["on_hand"] == 7
