import os

# Configure before any app import: tests run against a dedicated database.
os.environ["ENVIRONMENT"] = "test"
os.environ["BCRYPT_ROUNDS"] = "4"
os.environ["ANTHROPIC_API_KEY"] = ""  # never call the real API from tests
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/stockpilot_test"
)

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.database import engine
from app.main import app
from app.models import Base


@pytest.fixture(scope="session", autouse=True)
async def _schema() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.execute(text("DROP FUNCTION IF EXISTS forbid_ledger_mutation() CASCADE"))
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_tables() -> AsyncIterator[None]:
    yield
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@dataclass
class Tenant:
    headers: dict[str, str]
    user: dict[str, Any]
    org: dict[str, Any]
    location_id: str  # the default MAIN location


async def register(client: AsyncClient, org: str = "Acme Retail") -> Tenant:
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": org,
            "full_name": "Olivia Owner",
            "email": f"owner-{uuid4().hex[:8]}@example.com",
            "password": "s3cure-password",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    headers = {"Authorization": f"Bearer {body['tokens']['access_token']}"}
    locations = (await client.get("/api/v1/inventory/locations", headers=headers)).json()
    return Tenant(headers, body["user"], body["organization"], locations[0]["id"])


async def add_member(client: AsyncClient, owner: Tenant, role: str) -> dict[str, str]:
    email = f"{role}-{uuid4().hex[:8]}@example.com"
    resp = await client.post(
        "/api/v1/users",
        headers=owner.headers,
        json={
            "email": email,
            "full_name": f"Test {role}",
            "password": "s3cure-password",
            "role": role,
        },
    )
    assert resp.status_code == 201, resp.text
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "s3cure-password"}
    )
    return {"Authorization": f"Bearer {login.json()['tokens']['access_token']}"}


async def create_product(
    client: AsyncClient, tenant: Tenant, sku: str = "TSHIRT-M", price: str = "499.00", **extra: Any
) -> dict[str, Any]:
    resp = await client.post(
        "/api/v1/catalog/products",
        headers=tenant.headers,
        json={
            "name": extra.pop("name", "Cotton T-Shirt"),
            "variants": [{"name": "M", "sku": sku, "price": price, "cost": "200.00", **extra}],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def stock_in(client: AsyncClient, tenant: Tenant, variant_id: str, qty: int) -> None:
    resp = await client.post(
        "/api/v1/inventory/adjustments",
        headers=tenant.headers,
        json={
            "variant_id": variant_id,
            "location_id": tenant.location_id,
            "quantity": qty,
            "reason": "initial",
        },
    )
    assert resp.status_code == 201, resp.text


async def on_hand(client: AsyncClient, tenant: Tenant, variant_id: str) -> int:
    resp = await client.get(
        "/api/v1/inventory/stock",
        headers=tenant.headers,
        params={"location_id": tenant.location_id, "size": 100},
    )
    rows = [r for r in resp.json()["items"] if r["variant_id"] == variant_id]
    return int(rows[0]["on_hand"])


@pytest.fixture
async def owner(client: AsyncClient) -> Tenant:
    return await register(client)
