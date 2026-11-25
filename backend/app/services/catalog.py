from typing import Any
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import PageParams
from app.core.exceptions import NotFound
from app.models import Category, Product, ProductVariant, StockLevel
from app.schemas.catalog import (
    CategoryIn,
    ProductIn,
    ProductUpdate,
    VariantIn,
    VariantSearchOut,
    VariantUpdate,
)
from app.services.utils import commit_or_conflict, count, like_pattern

_SKU_TAKEN = "A variant with this SKU or barcode already exists"


# --- Categories --------------------------------------------------------------------------


async def _get_category(db: AsyncSession, org_id: UUID, category_id: UUID) -> Category:
    category = await db.scalar(
        select(Category).where(Category.id == category_id, Category.org_id == org_id)
    )
    if category is None:
        raise NotFound("Category not found")
    return category


async def list_categories(db: AsyncSession, org_id: UUID) -> list[Category]:
    rows = await db.scalars(
        select(Category).where(Category.org_id == org_id).order_by(Category.name)
    )
    return list(rows)


async def create_category(db: AsyncSession, org_id: UUID, data: CategoryIn) -> Category:
    category = Category(org_id=org_id, name=data.name.strip())
    db.add(category)
    await commit_or_conflict(db, "Category already exists")
    return category


async def delete_category(db: AsyncSession, org_id: UUID, category_id: UUID) -> None:
    await db.delete(await _get_category(db, org_id, category_id))
    await db.commit()


# --- Products ----------------------------------------------------------------------------


async def get_product(db: AsyncSession, org_id: UUID, product_id: UUID) -> Product:
    product = await db.scalar(
        select(Product)
        .where(Product.id == product_id, Product.org_id == org_id)
        .execution_options(populate_existing=True)
    )
    if product is None:
        raise NotFound("Product not found")
    return product


async def list_products(
    db: AsyncSession,
    org_id: UUID,
    params: PageParams,
    *,
    q: str | None = None,
    category_id: UUID | None = None,
    include_inactive: bool = False,
) -> tuple[list[Product], int]:
    stmt = select(Product).where(Product.org_id == org_id)
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    if q:
        pattern = like_pattern(q)
        stmt = stmt.where(
            or_(
                Product.name.ilike(pattern, escape="\\"),
                Product.variants.any(
                    or_(
                        ProductVariant.sku.ilike(pattern, escape="\\"),
                        ProductVariant.barcode.ilike(pattern, escape="\\"),
                    )
                ),
            )
        )
    total = await count(db, stmt)
    rows = await db.scalars(
        stmt.order_by(Product.name, Product.id).offset(params.offset).limit(params.size)
    )
    return list(rows.unique()), total


async def create_product(db: AsyncSession, org_id: UUID, data: ProductIn) -> Product:
    if data.category_id:
        await _get_category(db, org_id, data.category_id)
    product = Product(
        org_id=org_id,
        name=data.name.strip(),
        description=data.description,
        category_id=data.category_id,
        variants=[ProductVariant(org_id=org_id, **v.model_dump()) for v in data.variants],
    )
    db.add(product)
    await commit_or_conflict(db, _SKU_TAKEN)
    return await get_product(db, org_id, product.id)


async def update_product(
    db: AsyncSession, org_id: UUID, product_id: UUID, data: ProductUpdate
) -> Product:
    product = await get_product(db, org_id, product_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("category_id"):
        await _get_category(db, org_id, changes["category_id"])
    for field, value in changes.items():
        if field in ("name", "is_active") and value is None:
            continue
        setattr(product, field, value)
    await db.commit()
    return await get_product(db, org_id, product_id)


async def add_variant(
    db: AsyncSession, org_id: UUID, product_id: UUID, data: VariantIn
) -> ProductVariant:
    await get_product(db, org_id, product_id)
    variant = ProductVariant(org_id=org_id, product_id=product_id, **data.model_dump())
    db.add(variant)
    await commit_or_conflict(db, _SKU_TAKEN)
    return variant


async def update_variant(
    db: AsyncSession, org_id: UUID, variant_id: UUID, data: VariantUpdate
) -> ProductVariant:
    variant = await db.scalar(
        select(ProductVariant).where(
            ProductVariant.id == variant_id, ProductVariant.org_id == org_id
        )
    )
    if variant is None:
        raise NotFound("Variant not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is None and field != "barcode":
            continue
        setattr(variant, field, value)
    await commit_or_conflict(db, _SKU_TAKEN)
    return variant


async def search_variants(
    db: AsyncSession, org_id: UUID, location_id: UUID, q: str | None, limit: int = 20
) -> list[VariantSearchOut]:
    """POS lookup: exact barcode/SKU matches first (scanner), then name/SKU search."""
    available = func.coalesce(StockLevel.on_hand - StockLevel.reserved, 0)
    stmt = (
        select(
            ProductVariant.id,
            ProductVariant.product_id,
            Product.name.label("product_name"),
            ProductVariant.name,
            ProductVariant.sku,
            ProductVariant.barcode,
            ProductVariant.price,
            available.label("available"),
        )
        .join(Product, Product.id == ProductVariant.product_id)
        .outerjoin(
            StockLevel,
            and_(
                StockLevel.variant_id == ProductVariant.id,
                StockLevel.location_id == location_id,
            ),
        )
        .where(
            ProductVariant.org_id == org_id,
            ProductVariant.is_active.is_(True),
            Product.is_active.is_(True),
        )
    )
    order: list[Any] = [Product.name, ProductVariant.sku]
    if q:
        term = q.strip()
        pattern = like_pattern(term)
        exact = or_(ProductVariant.barcode == term, func.lower(ProductVariant.sku) == term.lower())
        stmt = stmt.where(
            or_(
                exact,
                ProductVariant.sku.ilike(pattern, escape="\\"),
                Product.name.ilike(pattern, escape="\\"),
            )
        )
        order.insert(0, case((exact, 0), else_=1))
    result = await db.execute(stmt.order_by(*order).limit(limit))
    return [VariantSearchOut.model_validate(dict(row._mapping)) for row in result]
