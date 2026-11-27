from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Header, Response

from app.core.deps import CurrentUser, DbSession, ManagerUser, Pagination
from app.models import OrderStatus, SalesOrder
from app.schemas.common import Page, paginate
from app.schemas.sales import OrderIn, OrderOut, RefundIn
from app.services import sales as service
from app.services.invoice import render_invoice

router = APIRouter(prefix="/sales", tags=["sales"])


@router.post("/orders", response_model=OrderOut, status_code=201)
async def create_order(
    data: OrderIn,
    user: CurrentUser,
    db: DbSession,
    response: Response,
    idempotency_key: Annotated[
        str | None, Header(alias="Idempotency-Key", min_length=8, max_length=100)
    ] = None,
) -> SalesOrder:
    """Checkout. Send an Idempotency-Key so a retried request never double-charges stock.

    201 = new order; 200 + `Idempotent-Replayed: true` = the original order for this key.
    409 `insufficient_stock` = nothing was changed.
    """
    order, created = await service.create_order(db, user, data, idempotency_key)
    if not created:
        response.status_code = 200
        response.headers["Idempotent-Replayed"] = "true"
    return order


@router.get("/orders", response_model=Page[OrderOut])
async def list_orders(
    user: CurrentUser,
    db: DbSession,
    params: Pagination,
    status: OrderStatus | None = None,
    location_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    items, total = await service.list_orders(
        db,
        user.org_id,
        params,
        status=status,
        location_id=location_id,
        date_from=date_from,
        date_to=date_to,
    )
    return paginate(items, total, params)


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: UUID, user: CurrentUser, db: DbSession) -> SalesOrder:
    return await service.get_order(db, user.org_id, order_id)


@router.post("/orders/{order_id}/refund", response_model=OrderOut)
async def refund_order(
    order_id: UUID, user: ManagerUser, db: DbSession, data: RefundIn | None = None
) -> SalesOrder:
    """Refund all remaining items (no body) or specific quantities per line."""
    return await service.refund_order(db, user, order_id, data)


@router.get("/orders/{order_id}/invoice.pdf", response_class=Response)
async def invoice_pdf(order_id: UUID, user: CurrentUser, db: DbSession) -> Response:
    """Printable PDF invoice (shows refunds and the net amount paid)."""
    filename, content = await render_invoice(db, user.org_id, order_id)
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
