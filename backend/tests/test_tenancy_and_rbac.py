from httpx import AsyncClient

from tests.conftest import Tenant, add_member, create_product, register, stock_in


async def test_tenants_cannot_see_or_touch_each_others_data(
    client: AsyncClient, owner: Tenant
) -> None:
    product = await create_product(client, owner)
    variant_id = product["variants"][0]["id"]
    rival = await register(client, org="Rival Store")

    # Reads are scoped.
    listing = await client.get("/api/v1/catalog/products", headers=rival.headers)
    assert listing.json()["total"] == 0
    direct = await client.get(f"/api/v1/catalog/products/{product['id']}", headers=rival.headers)
    assert direct.status_code == 404

    # Writes referencing another tenant's ids are rejected as not found.
    adjust = await client.post(
        "/api/v1/inventory/adjustments",
        headers=rival.headers,
        json={"variant_id": variant_id, "location_id": rival.location_id, "quantity": 5},
    )
    assert adjust.status_code == 404

    sale = await client.post(
        "/api/v1/sales/orders",
        headers=rival.headers,
        json={
            "location_id": rival.location_id,
            "lines": [{"variant_id": variant_id, "quantity": 1}],
        },
    )
    assert sale.status_code == 404

    # SKUs are unique per tenant, not globally.
    await create_product(client, rival, sku="TSHIRT-M")


async def test_staff_permissions(client: AsyncClient, owner: Tenant) -> None:
    staff = await add_member(client, owner, "staff")
    product = await create_product(client, owner)
    variant_id = product["variants"][0]["id"]
    await stock_in(client, owner, variant_id, 10)

    forbidden = [
        (
            "POST",
            "/api/v1/catalog/products",
            {"name": "X", "variants": [{"sku": "X", "price": "1"}]},
        ),
        (
            "POST",
            "/api/v1/inventory/adjustments",
            {"variant_id": variant_id, "location_id": owner.location_id, "quantity": 1},
        ),
        ("GET", "/api/v1/users", None),
    ]
    for method, url, body in forbidden:
        resp = await client.request(method, url, headers=staff, json=body)
        assert resp.status_code == 403, url
        assert resp.json()["error"]["code"] == "forbidden"

    # Staff can sell at list price...
    sale = await client.post(
        "/api/v1/sales/orders",
        headers=staff,
        json={
            "location_id": owner.location_id,
            "lines": [{"variant_id": variant_id, "quantity": 1}],
        },
    )
    assert sale.status_code == 201

    # ...but not override prices or give discounts.
    discounted = await client.post(
        "/api/v1/sales/orders",
        headers=staff,
        json={
            "location_id": owner.location_id,
            "lines": [{"variant_id": variant_id, "quantity": 1}],
            "discount": "50.00",
        },
    )
    assert discounted.status_code == 403


async def test_only_owner_can_add_managers(client: AsyncClient, owner: Tenant) -> None:
    manager = await add_member(client, owner, "manager")
    resp = await client.post(
        "/api/v1/users",
        headers=manager,
        json={
            "email": "another-manager@example.com",
            "full_name": "Another Manager",
            "password": "s3cure-password",
            "role": "manager",
        },
    )
    assert resp.status_code == 403


async def test_owner_cannot_demote_self(client: AsyncClient, owner: Tenant) -> None:
    resp = await client.patch(
        f"/api/v1/users/{owner.user['id']}", headers=owner.headers, json={"role": "staff"}
    )
    assert resp.status_code == 403
