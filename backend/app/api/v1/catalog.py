from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession, ManagerUser, Pagination
from app.models import Category, Product, ProductVariant
from app.schemas.catalog import (
    CategoryIn,
    CategoryOut,
    ProductIn,
    ProductOut,
    ProductUpdate,
    VariantIn,
    VariantOut,
    VariantSearchOut,
    VariantUpdate,
)
from app.schemas.common import Page, paginate
from app.services import catalog as service

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(user: CurrentUser, db: DbSession) -> list[Category]:
    return await service.list_categories(db, user.org_id)


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(data: CategoryIn, user: ManagerUser, db: DbSession) -> Category:
    return await service.create_category(db, user.org_id, data)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: UUID, user: ManagerUser, db: DbSession) -> None:
    await service.delete_category(db, user.org_id, category_id)


@router.get("/products", response_model=Page[ProductOut])
async def list_products(
    user: CurrentUser,
    db: DbSession,
    params: Pagination,
    q: Annotated[str | None, Query(max_length=100, description="Name, SKU or barcode")] = None,
    category_id: UUID | None = None,
    include_inactive: bool = False,
) -> dict[str, Any]:
    items, total = await service.list_products(
        db, user.org_id, params, q=q, category_id=category_id, include_inactive=include_inactive
    )
    return paginate(items, total, params)


@router.post("/products", response_model=ProductOut, status_code=201)
async def create_product(data: ProductIn, user: ManagerUser, db: DbSession) -> Product:
    return await service.create_product(db, user.org_id, data)


@router.get("/products/{product_id}", response_model=ProductOut)
async def get_product(product_id: UUID, user: CurrentUser, db: DbSession) -> Product:
    return await service.get_product(db, user.org_id, product_id)


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: UUID, data: ProductUpdate, user: ManagerUser, db: DbSession
) -> Product:
    return await service.update_product(db, user.org_id, product_id, data)


@router.post("/products/{product_id}/variants", response_model=VariantOut, status_code=201)
async def add_variant(
    product_id: UUID, data: VariantIn, user: ManagerUser, db: DbSession
) -> ProductVariant:
    return await service.add_variant(db, user.org_id, product_id, data)


@router.patch("/variants/{variant_id}", response_model=VariantOut)
async def update_variant(
    variant_id: UUID, data: VariantUpdate, user: ManagerUser, db: DbSession
) -> ProductVariant:
    return await service.update_variant(db, user.org_id, variant_id, data)


@router.get("/variants/search", response_model=list[VariantSearchOut])
async def search_variants(
    user: CurrentUser,
    db: DbSession,
    location_id: UUID,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[VariantSearchOut]:
    """POS lookup by barcode, SKU or name, with sellable quantity at the given location."""
    return await service.search_variants(db, user.org_id, location_id, q, limit)
