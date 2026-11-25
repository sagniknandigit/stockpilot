from httpx import AsyncClient

from tests.conftest import Tenant


async def test_register_creates_owner_org_and_default_location(
    client: AsyncClient, owner: Tenant
) -> None:
    assert owner.user["role"] == "owner"
    assert owner.org["slug"] == "acme-retail"
    me = await client.get("/api/v1/auth/me", headers=owner.headers)
    assert me.status_code == 200
    assert me.json()["user"]["id"] == owner.user["id"]


async def test_duplicate_email_is_rejected(client: AsyncClient, owner: Tenant) -> None:
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Other",
            "full_name": "Someone",
            "email": owner.user["email"].upper(),
            "password": "s3cure-password",
        },
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "conflict"


async def test_login_and_refresh(client: AsyncClient, owner: Tenant) -> None:
    bad = await client.post(
        "/api/v1/auth/login", json={"email": owner.user["email"], "password": "wrong-password"}
    )
    assert bad.status_code == 401

    good = await client.post(
        "/api/v1/auth/login", json={"email": owner.user["email"], "password": "s3cure-password"}
    )
    assert good.status_code == 200
    refresh_token = good.json()["tokens"]["refresh_token"]

    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]

    # A refresh token must not work as an access token.
    misuse = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {refresh_token}"}
    )
    assert misuse.status_code == 401


async def test_requests_without_token_are_rejected(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/catalog/products")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthorized"


async def test_validation_errors_use_the_error_envelope(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register", json={"email": "not-an-email"})
    assert resp.status_code == 422
    body = resp.json()["error"]
    assert body["code"] == "validation_error"
    assert isinstance(body["details"], list)
