from httpx import AsyncClient

from tests.conftest import Tenant, create_product, stock_in


async def test_create_product_with_variants_and_category(
    client: AsyncClient, owner: Tenant
) -> None:
    category = await client.post(
        "/api/v1/catalog/categories", headers=owner.headers, json={"name": "Apparel"}
    )
    assert category.status_code == 201
    resp = await client.post(
        "/api/v1/catalog/products",
        headers=owner.headers,
        json={
            "name": "Hoodie",
            "category_id": category.json()["id"],
            "variants": [
                {"name": "S", "sku": "HOOD-S", "barcode": "890100000001", "price": "999.00"},
                {"name": "L", "sku": "HOOD-L", "price": "1049.50", "reorder_point": 5},
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["category"]["name"] == "Apparel"
    assert [v["sku"] for v in body["variants"]] == ["HOOD-L", "HOOD-S"]
    assert body["variants"][0]["price"] == "1049.50"


async def test_duplicate_sku_conflicts(client: AsyncClient, owner: Tenant) -> None:
    await create_product(client, owner, sku="DUP-1")
    resp = await client.post(
        "/api/v1/catalog/products",
        headers=owner.headers,
        json={"name": "Again", "variants": [{"sku": "DUP-1", "price": "1"}]},
    )
    assert resp.status_code == 409

    same_request = await client.post(
        "/api/v1/catalog/products",
        headers=owner.headers,
        json={
            "name": "Twice",
            "variants": [{"sku": "A", "price": "1"}, {"sku": "a", "price": "1"}],
        },
    )
    assert same_request.status_code == 422


async def test_search_and_pagination(client: AsyncClient, owner: Tenant) -> None:
    for i in range(5):
        await create_product(client, owner, sku=f"MUG-{i}", name=f"Coffee Mug {i}")
    await create_product(client, owner, sku="PEN-1", name="Gel Pen")

    page = await client.get(
        "/api/v1/catalog/products", headers=owner.headers, params={"q": "mug", "size": 2}
    )
    body = page.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2

    by_sku = await client.get(
        "/api/v1/catalog/products", headers=owner.headers, params={"q": "PEN-1"}
    )
    assert by_sku.json()["total"] == 1

    # LIKE wildcards in user input are treated literally.
    wildcard = await client.get(
        "/api/v1/catalog/products", headers=owner.headers, params={"q": "%"}
    )
    assert wildcard.json()["total"] == 0


async def test_pos_variant_search_puts_exact_barcode_first(
    client: AsyncClient, owner: Tenant
) -> None:
    await create_product(client, owner, sku="SOAP-1", name="Soap Bar", barcode="111")
    exact = await create_product(client, owner, sku="SOAP-2", name="Soap Bar Large", barcode="222")
    await stock_in(client, owner, exact["variants"][0]["id"], 7)

    resp = await client.get(
        "/api/v1/catalog/variants/search",
        headers=owner.headers,
        params={"location_id": owner.location_id, "q": "222"},
    )
    results = resp.json()
    assert results[0]["sku"] == "SOAP-2"
    assert results[0]["available"] == 7
