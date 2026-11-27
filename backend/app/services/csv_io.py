"""Catalog CSV import/export.

Import is an all-or-nothing upsert keyed on SKU: every row is validated first, and if any
row is invalid nothing is written and every error is reported with its row number.
`dry_run=True` runs the same validation and reports what *would* change.
"""

import csv
import io
from collections.abc import Iterator
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Conflict, Unprocessable
from app.models import Category, Product, ProductVariant, StockLevel
from app.schemas.catalog import Money, Sku

COLUMNS = [
    "sku",
    "product_name",
    "variant_name",
    "category",
    "barcode",
    "price",
    "cost",
    "reorder_point",
    "on_hand",
]
REQUIRED = {"sku", "product_name", "price"}
MAX_ROWS = 5000
MAX_BYTES = 2 * 1024 * 1024


class CsvRow(BaseModel):
    sku: Sku
    product_name: Annotated[str, Field(min_length=1, max_length=200)]
    variant_name: Annotated[str, Field(min_length=1, max_length=120)] = "Default"
    category: Annotated[str | None, Field(max_length=80)] = None
    barcode: Annotated[str | None, Field(max_length=64)] = None
    price: Money
    cost: Money = Decimal("0")
    reorder_point: Annotated[int, Field(ge=0)] = 0

    @field_validator("variant_name", "category", "barcode", mode="before")
    @classmethod
    def _blank_to_default(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("variant_name", mode="after")
    @classmethod
    def _default_name(cls, value: str | None) -> str:
        return value or "Default"


class ImportReport(BaseModel):
    dry_run: bool
    applied: bool
    rows: int
    created: int
    updated: int
    categories_created: int
    errors: list[dict[str, object]]


def _parse(content: bytes) -> tuple[list[tuple[int, CsvRow]], list[dict[str, object]]]:
    if len(content) > MAX_BYTES:
        raise Unprocessable("CSV file is larger than 2 MB")
    try:
        text = content.decode("utf-8-sig")  # tolerate Excel's BOM
    except UnicodeDecodeError as exc:
        raise Unprocessable("CSV must be UTF-8 encoded") from exc
    reader = csv.DictReader(io.StringIO(text))
    headers = {h.strip().lower() for h in reader.fieldnames or []}
    missing = REQUIRED - headers
    if missing:
        raise Unprocessable("CSV is missing required columns", details={"missing": sorted(missing)})

    rows: list[tuple[int, CsvRow]] = []
    errors: list[dict[str, object]] = []
    seen: dict[str, int] = {}
    for number, raw in enumerate(reader, start=2):  # row 1 is the header
        if number - 1 > MAX_ROWS:
            raise Unprocessable(f"CSV has more than {MAX_ROWS} rows")
        record = {k.strip().lower(): (v or "").strip() for k, v in raw.items() if k}
        if not any(record.values()):
            continue  # skip blank lines
        record = {k: v for k, v in record.items() if v != "" or k in REQUIRED}
        try:
            row = CsvRow.model_validate(record)
        except ValidationError as exc:
            errors.append(
                {
                    "row": number,
                    "errors": [
                        f"{'.'.join(map(str, e['loc']))}: {e['msg']}"
                        for e in exc.errors(include_url=False)
                    ],
                }
            )
            continue
        key = row.sku.lower()
        if key in seen:
            errors.append({"row": number, "errors": [f"sku: duplicate of row {seen[key]}"]})
            continue
        seen[key] = number
        rows.append((number, row))
    return rows, errors


async def import_products(
    db: AsyncSession, org_id: UUID, content: bytes, *, dry_run: bool
) -> ImportReport:
    rows, errors = _parse(content)
    report = ImportReport(
        dry_run=dry_run,
        applied=False,
        rows=len(rows) + len(errors),
        created=0,
        updated=0,
        categories_created=0,
        errors=errors,
    )

    existing = {
        v.sku.lower(): v
        for v in await db.scalars(
            select(ProductVariant).where(
                ProductVariant.org_id == org_id,
                func.lower(ProductVariant.sku).in_([r.sku.lower() for _, r in rows]),
            )
        )
    }
    products = {
        p.name.lower(): p for p in await db.scalars(select(Product).where(Product.org_id == org_id))
    }
    categories = {
        c.name.lower(): c
        for c in await db.scalars(select(Category).where(Category.org_id == org_id))
    }

    for _, row in rows:
        category = None
        if row.category:
            category = categories.get(row.category.lower())
            if category is None:
                category = Category(org_id=org_id, name=row.category)
                categories[row.category.lower()] = category
                db.add(category)
                report.categories_created += 1
        variant = existing.get(row.sku.lower())
        if variant is not None:
            variant.name = row.variant_name
            variant.barcode = row.barcode
            variant.price = row.price
            variant.cost = row.cost
            variant.reorder_point = row.reorder_point
            report.updated += 1
            continue
        product = products.get(row.product_name.lower())
        if product is None:
            product = Product(org_id=org_id, name=row.product_name, category=category)
            products[row.product_name.lower()] = product
            db.add(product)
        elif category is not None and product.category_id is None:
            product.category = category
        product.variants.append(
            ProductVariant(
                org_id=org_id,
                name=row.variant_name,
                sku=row.sku,
                barcode=row.barcode,
                price=row.price,
                cost=row.cost,
                reorder_point=row.reorder_point,
            )
        )
        report.created += 1

    if errors or dry_run:
        await db.rollback()
        return report
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise Conflict(
            "Import conflicts with existing data (likely a barcode already used by another "
            "SKU). Nothing was imported."
        ) from exc
    report.applied = True
    return report


async def export_rows(db: AsyncSession, org_id: UUID) -> Iterator[str]:
    on_hand = (
        select(StockLevel.variant_id, func.sum(StockLevel.on_hand).label("on_hand"))
        .where(StockLevel.org_id == org_id)
        .group_by(StockLevel.variant_id)
        .subquery()
    )
    result = await db.execute(
        select(
            ProductVariant.sku,
            Product.name,
            ProductVariant.name,
            Category.name,
            ProductVariant.barcode,
            ProductVariant.price,
            ProductVariant.cost,
            ProductVariant.reorder_point,
            func.coalesce(on_hand.c.on_hand, 0),
        )
        .join(Product, Product.id == ProductVariant.product_id)
        .outerjoin(Category, Category.id == Product.category_id)
        .outerjoin(on_hand, on_hand.c.variant_id == ProductVariant.id)
        .where(ProductVariant.org_id == org_id)
        .order_by(Product.name, ProductVariant.sku)
    )
    rows = result.all()

    def generate() -> Iterator[str]:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(COLUMNS)
        for row in rows:
            writer.writerow(["" if v is None else v for v in row])
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate()
        yield buffer.getvalue()

    return generate()
