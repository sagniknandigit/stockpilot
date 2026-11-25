from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession, ManagerUser, Pagination
from app.models import Location
from app.schemas.common import Page, paginate
from app.schemas.inventory import (
    AdjustmentIn,
    LocationIn,
    LocationOut,
    MovementOut,
    ReconcileOut,
    StockLevelOut,
    StockRow,
    TransferIn,
)
from app.services import inventory as service

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/locations", response_model=list[LocationOut])
async def list_locations(user: CurrentUser, db: DbSession) -> list[Location]:
    return await service.list_locations(db, user.org_id)


@router.post("/locations", response_model=LocationOut, status_code=201)
async def create_location(data: LocationIn, user: ManagerUser, db: DbSession) -> Location:
    return await service.create_location(db, user.org_id, data)


@router.get("/stock", response_model=Page[StockRow])
async def list_stock(
    user: CurrentUser,
    db: DbSession,
    params: Pagination,
    location_id: UUID | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    low_stock: bool = False,
) -> dict[str, Any]:
    items, total = await service.list_stock(
        db, user.org_id, params, location_id=location_id, q=q, low_stock=low_stock
    )
    return paginate(items, total, params)


@router.post("/adjustments", response_model=StockLevelOut, status_code=201)
async def adjust(data: AdjustmentIn, user: ManagerUser, db: DbSession) -> StockLevelOut:
    """Record a stock count correction, initial stock, or damage write-off."""
    return await service.adjust(db, user, data)


@router.post("/transfers", response_model=list[StockLevelOut], status_code=201)
async def transfer(data: TransferIn, user: ManagerUser, db: DbSession) -> list[StockLevelOut]:
    """Move stock between locations atomically (both sides or neither)."""
    return await service.transfer(db, user, data)


@router.get("/movements", response_model=Page[MovementOut])
async def list_movements(
    user: CurrentUser,
    db: DbSession,
    params: Pagination,
    variant_id: UUID | None = None,
    location_id: UUID | None = None,
) -> dict[str, Any]:
    items, total = await service.list_movements(
        db, user.org_id, params, variant_id=variant_id, location_id=location_id
    )
    return paginate(items, total, params)


@router.get("/reconcile", response_model=ReconcileOut)
async def reconcile(user: ManagerUser, db: DbSession) -> ReconcileOut:
    """Verify every stock level equals the sum of its ledger movements."""
    return await service.reconcile(db, user.org_id)
