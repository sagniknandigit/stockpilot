import csv
import io

from httpx import AsyncClient

from tests.conftest import Tenant, create_product, stock_in

URL = "/api/v1/catalog/products/import"


def _csv(rows: list[dict[str, str]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return ("﻿" + buffer.getvalue()).encode()  # with an Excel-style BOM


async def _upload(client: AsyncClient, tenant: Tenant, content: bytes, dry_run: bool) -> dict:
    resp = await client.post(
        URL,
        headers=tenant.headers,
        params={"dry_run": dry_run},
        files={"file": ("products.csv", content, "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_import_upserts_by_sku(client: AsyncClient, owner: Tenant) -> None:
    await create_product(client, owner, sku="TEA-1", name="Green Tea")
    content = _csv(
        [
            {
                "sku": "TEA-1",
                "product_name": "Green Tea",
                "variant_name": "",
                "category": "Drinks",
                "price": "150.00",
                "cost": "90",
                "reorder_point": "5",
            },
            {
                "sku": "COF-S",
                "product_name": "Coffee Beans",
                "variant_name": "250g",
                "category": "Drinks",
                "price": "400",
                "cost": "250",
                "reorder_point": "3",
            },
            {
                "sku": "COF-L",
                "product_name": "Coffee Beans",
                "variant_name": "1kg",
                "category": "Drinks",
                "price": "1400",
                "cost": "900",
                "reorder_point": "",
            },
        ]
    )
    preview = await _upload(client, owner, content, dry_run=True)
    assert (preview["created"], preview["updated"], preview["applied"]) == (2, 1, False)
    assert (await client.get("/api/v1/catalog/products", headers=owner.headers)).json()[
        "total"
    ] == 1  # dry run wrote nothing

    report = await _upload(client, owner, content, dry_run=False)
    assert report["applied"] and report["categories_created"] == 1
    products = (await client.get("/api/v1/catalog/products", headers=owner.headers)).json()
    by_name = {p["name"]: p for p in products["items"]}
    assert sorted(v["sku"] for v in by_name["Coffee Beans"]["variants"]) == ["COF-L", "COF-S"]
    assert by_name["Coffee Beans"]["category"]["name"] == "Drinks"
    assert by_name["Green Tea"]["variants"][0]["price"] == "150.00"


async def test_import_is_all_or_nothing(client: AsyncClient, owner: Tenant) -> None:
    content = _csv(
        [
            {"sku": "OK-1", "product_name": "Fine", "price": "10"},
            {"sku": "BAD 2", "product_name": "Spaces in SKU", "price": "10"},
            {"sku": "NEG", "product_name": "Negative", "price": "-1"},
            {"sku": "ok-1", "product_name": "Duplicate", "price": "10"},
        ]
    )
    report = await _upload(client, owner, content, dry_run=False)
    assert report["applied"] is False
    assert [e["row"] for e in report["errors"]] == [3, 4, 5]
    assert "duplicate of row 2" in report["errors"][2]["errors"][0]
    listing = await client.get("/api/v1/catalog/products", headers=owner.headers)
    assert listing.json()["total"] == 0

    missing = await client.post(
        URL, headers=owner.headers, files={"file": ("x.csv", b"sku,price\nA,1\n", "text/csv")}
    )
    assert missing.status_code == 422
    assert missing.json()["error"]["details"]["missing"] == ["product_name"]


async def test_export_round_trips(client: AsyncClient, owner: Tenant) -> None:
    variant = (await create_product(client, owner, sku="EXP-1", name="Exported"))["variants"][0]
    await stock_in(client, owner, variant["id"], 7)
    resp = await client.get("/api/v1/catalog/products/export.csv", headers=owner.headers)
    assert resp.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(resp.text)))
    assert rows[0]["sku"] == "EXP-1" and rows[0]["on_hand"] == "7"
    # The exported file is a valid import (an update of the same SKU).
    report = await _upload(client, owner, resp.content, dry_run=True)
    assert report["errors"] == [] and report["updated"] == 1
