from typing import Any
from uuid import UUID

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession, ManagerUser, Pagination
from app.models import PurchaseOrder, PurchaseOrderStatus, Supplier
from app.schemas.common import Page, paginate
from app.schemas.procurement import (
    FromSuggestionsIn,
    POIn,
    POOut,
    POUpdate,
    ReceiveIn,
    SupplierIn,
    SupplierOut,
    SupplierUpdate,
)
from app.services import procurement as service

router = APIRouter(prefix="/purchasing", tags=["purchasing"])


@router.get("/suppliers", response_model=list[SupplierOut])
async def list_suppliers(
    user: CurrentUser, db: DbSession, include_inactive: bool = False
) -> list[Supplier]:
    return await service.list_suppliers(db, user.org_id, include_inactive)


@router.post("/suppliers", response_model=SupplierOut, status_code=201)
async def create_supplier(data: SupplierIn, user: ManagerUser, db: DbSession) -> Supplier:
    return await service.create_supplier(db, user.org_id, data)


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: UUID, data: SupplierUpdate, user: ManagerUser, db: DbSession
) -> Supplier:
    return await service.update_supplier(db, user.org_id, supplier_id, data)


@router.get("/orders", response_model=Page[POOut])
async def list_purchase_orders(
    user: CurrentUser,
    db: DbSession,
    params: Pagination,
    status: PurchaseOrderStatus | None = None,
    supplier_id: UUID | None = None,
) -> dict[str, Any]:
    items, total = await service.list_pos(
        db, user.org_id, params, status=status, supplier_id=supplier_id
    )
    return paginate(items, total, params)


@router.post("/orders", response_model=POOut, status_code=201)
async def create_purchase_order(data: POIn, user: ManagerUser, db: DbSession) -> PurchaseOrder:
    """Create a draft purchase order."""
    return await service.create_po(db, user, data)


@router.post("/orders/from-suggestions", response_model=POOut, status_code=201)
async def create_from_suggestions(
    data: FromSuggestionsIn, user: ManagerUser, db: DbSession
) -> PurchaseOrder:
    """Draft a purchase order using the forecast's suggested quantities."""
    return await service.create_po_from_suggestions(db, user, data)


@router.get("/orders/{po_id}", response_model=POOut)
async def get_purchase_order(po_id: UUID, user: CurrentUser, db: DbSession) -> PurchaseOrder:
    return await service.get_po(db, user.org_id, po_id)


@router.patch("/orders/{po_id}", response_model=POOut)
async def update_purchase_order(
    po_id: UUID, data: POUpdate, user: ManagerUser, db: DbSession
) -> PurchaseOrder:
    return await service.update_po(db, user.org_id, po_id, data)


@router.post("/orders/{po_id}/submit", response_model=POOut)
async def submit_purchase_order(po_id: UUID, user: ManagerUser, db: DbSession) -> PurchaseOrder:
    return await service.submit_po(db, user.org_id, po_id)


@router.post("/orders/{po_id}/cancel", response_model=POOut)
async def cancel_purchase_order(po_id: UUID, user: ManagerUser, db: DbSession) -> PurchaseOrder:
    return await service.cancel_po(db, user.org_id, po_id)


@router.post("/orders/{po_id}/receive", response_model=POOut)
async def receive_purchase_order(
    po_id: UUID, data: ReceiveIn, user: ManagerUser, db: DbSession
) -> PurchaseOrder:
    """Book a (partial) delivery into stock and update weighted average costs."""
    return await service.receive_po(db, user, po_id, data)
