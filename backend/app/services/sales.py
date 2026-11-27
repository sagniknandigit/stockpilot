"""Sales orders: atomic checkout with idempotency and stock locking."""

import hashlib
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import PageParams
from app.core.events import queue_event
from app.core.exceptions import Conflict, Forbidden, NotFound, Unprocessable
from app.models import (
    Location,
    MovementReason,
    OrderStatus,
    Organization,
    Product,
    ProductVariant,
    Role,
    SalesOrder,
    SalesOrderLine,
    User,
)
from app.schemas.sales import OrderIn, RefundIn
from app.services.inventory import MovementSpec, apply_movements
from app.services.utils import count

CENTS = Decimal("0.01")


def _request_hash(data: OrderIn) -> str:
    return hashlib.sha256(data.model_dump_json().encode()).hexdigest()


async def _find_by_key(db: AsyncSession, org_id: UUID, key: str) -> SalesOrder | None:
    return await db.scalar(
        select(SalesOrder)
        .where(SalesOrder.org_id == org_id, SalesOrder.idempotency_key == key)
        .execution_options(populate_existing=True)
    )


def _replay(existing: SalesOrder, request_hash: str) -> SalesOrder:
    if existing.request_hash != request_hash:
        raise Conflict(
            "This Idempotency-Key was already used with a different request",
            code="idempotency_key_reused",
        )
    return existing


async def create_order(
    db: AsyncSession, user: User, data: OrderIn, idempotency_key: str | None
) -> tuple[SalesOrder, bool]:
    """Returns (order, created). A retried request with the same key returns the original."""
    # Capture ids up front: a rollback expires ORM objects (including `user`), and async
    # sessions cannot lazily reload them.
    org_id, user_id = user.org_id, user.id
    request_hash = _request_hash(data)
    if idempotency_key and (existing := await _find_by_key(db, org_id, idempotency_key)):
        return _replay(existing, request_hash), False

    location = await db.scalar(
        select(Location).where(
            Location.id == data.location_id,
            Location.org_id == user.org_id,
            Location.is_active.is_(True),
        )
    )
    if location is None:
        raise NotFound("Location not found")

    rows = await db.execute(
        select(ProductVariant, Product.name)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(
            ProductVariant.org_id == user.org_id,
            ProductVariant.id.in_([line.variant_id for line in data.lines]),
        )
    )
    variants = {v.id: (v, product_name) for v, product_name in rows}
    missing = [str(line.variant_id) for line in data.lines if line.variant_id not in variants]
    if missing:
        raise NotFound("Variant not found", details={"ids": missing})
    inactive = [v.sku for v, _ in variants.values() if not v.is_active]
    if inactive:
        raise Unprocessable("Some variants are inactive", details={"skus": inactive})

    overrides = data.discount > 0 or any(
        line.unit_price is not None and line.unit_price != variants[line.variant_id][0].price
        for line in data.lines
    )
    if overrides and user.role.rank < Role.MANAGER.rank:
        raise Forbidden("Price overrides and discounts require a manager")

    lines: list[SalesOrderLine] = []
    subtotal = Decimal("0")
    for line in data.lines:
        variant, product_name = variants[line.variant_id]
        unit_price = line.unit_price if line.unit_price is not None else variant.price
        line_total = (unit_price * line.quantity).quantize(CENTS)
        subtotal += line_total
        label = product_name if variant.name == "Default" else f"{product_name} - {variant.name}"
        lines.append(
            SalesOrderLine(
                variant_id=variant.id,
                sku=variant.sku,
                name=label,
                quantity=line.quantity,
                unit_price=unit_price,
                unit_cost=variant.cost,
                line_total=line_total,
            )
        )
    if data.discount > subtotal:
        raise Unprocessable("Discount cannot exceed the order subtotal")

    # Next per-org order number. The UPDATE row-locks the org until commit; if this
    # transaction rolls back, so does the increment, so numbers stay gapless.
    number = await db.scalar(
        update(Organization)
        .where(Organization.id == org_id)
        .values(order_seq=Organization.order_seq + 1)
        .returning(Organization.order_seq)
    )
    order = SalesOrder(
        org_id=org_id,
        number=number,
        location=location,
        status=OrderStatus.COMPLETED,
        customer_name=data.customer_name,
        subtotal=subtotal,
        discount=data.discount,
        total=subtotal - data.discount,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        created_by=user.id,
        lines=lines,
    )
    db.add(order)
    try:
        # Inserting the order first claims the idempotency key: a concurrent duplicate
        # blocks on the unique index here until we commit, then fails and replays ours.
        await db.flush()
        await apply_movements(
            db,
            org_id=org_id,
            user_id=user_id,
            specs=[
                MovementSpec(
                    variant_id=line.variant_id,
                    location_id=location.id,
                    quantity=-line.quantity,
                    reason=MovementReason.SALE,
                    reference_type="sales_order",
                    reference_id=order.id,
                )
                for line in data.lines
            ],
        )
        queue_event(
            db,
            org_id,
            {
                "type": "order.created",
                "order_id": str(order.id),
                "number": order.number,
                "total": str(order.total),
                "location_id": str(location.id),
            },
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        if idempotency_key and (existing := await _find_by_key(db, org_id, idempotency_key)):
            return _replay(existing, request_hash), False
        raise
    return order, True


async def get_order(db: AsyncSession, org_id: UUID, order_id: UUID) -> SalesOrder:
    order = await db.scalar(
        select(SalesOrder).where(SalesOrder.id == order_id, SalesOrder.org_id == org_id)
    )
    if order is None:
        raise NotFound("Order not found")
    return order


async def list_orders(
    db: AsyncSession,
    org_id: UUID,
    params: PageParams,
    *,
    status: OrderStatus | None = None,
    location_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[list[SalesOrder], int]:
    stmt = select(SalesOrder).where(SalesOrder.org_id == org_id)
    if status:
        stmt = stmt.where(SalesOrder.status == status)
    if location_id:
        stmt = stmt.where(SalesOrder.location_id == location_id)
    if date_from:
        stmt = stmt.where(SalesOrder.created_at >= date_from)
    if date_to:
        stmt = stmt.where(SalesOrder.created_at < date_to)
    total = await count(db, stmt)
    rows = await db.scalars(
        stmt.order_by(SalesOrder.created_at.desc()).offset(params.offset).limit(params.size)
    )
    return list(rows), total


async def refund_order(
    db: AsyncSession, user: User, order_id: UUID, data: RefundIn | None = None
) -> SalesOrder:
    """Refund some or all of an order's remaining items, restocking them.

    No body (or no lines) refunds everything not yet refunded. The money returned for a
    partial refund is the lines' value scaled by the order's discount ratio. The final
    refund returns exactly what's left, so rounding never drifts over several refunds.
    """
    org_id, user_id = user.org_id, user.id
    # Lock the order row (only it, not the joined location) so concurrent refunds queue.
    order = await db.scalar(
        select(SalesOrder)
        .where(SalesOrder.id == order_id, SalesOrder.org_id == org_id)
        .with_for_update(of=SalesOrder)
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise NotFound("Order not found")
    if order.status == OrderStatus.REFUNDED:
        raise Conflict("Order has already been fully refunded")

    remaining = {line.id: line.quantity - line.refunded_quantity for line in order.lines}
    requested: dict[UUID, int] = {}
    if data is None or not data.lines:
        requested = {line_id: qty for line_id, qty in remaining.items() if qty > 0}
    else:
        problems: list[dict[str, object]] = []
        for item in data.lines:
            if item.line_id not in remaining or item.line_id in requested:
                problems.append({"line_id": str(item.line_id), "error": "unknown or duplicate"})
            elif item.quantity > remaining[item.line_id]:
                problems.append(
                    {
                        "line_id": str(item.line_id),
                        "requested": item.quantity,
                        "refundable": remaining[item.line_id],
                    }
                )
            else:
                requested[item.line_id] = item.quantity
        if problems:
            raise Unprocessable("Cannot refund more than was sold", details=problems)
    if not requested:
        raise Conflict("Nothing left to refund on this order")

    lines = {line.id: line for line in order.lines}
    for line_id, qty in requested.items():
        lines[line_id].refunded_quantity += qty
    fully_refunded = all(line.refunded_quantity == line.quantity for line in order.lines)
    outstanding = order.total - order.refunded_amount
    if fully_refunded:
        amount = outstanding
    else:
        gross = sum((lines[i].unit_price * q for i, q in requested.items()), Decimal("0"))
        ratio = order.total / order.subtotal if order.subtotal else Decimal("0")
        amount = min((gross * ratio).quantize(CENTS), outstanding)
    order.refunded_amount += amount
    order.status = OrderStatus.REFUNDED if fully_refunded else OrderStatus.PARTIALLY_REFUNDED
    order.refunded_at = datetime.now(UTC)

    await apply_movements(
        db,
        org_id=org_id,
        user_id=user_id,
        specs=[
            MovementSpec(
                variant_id=lines[line_id].variant_id,
                location_id=order.location_id,
                quantity=qty,
                reason=MovementReason.RETURN,
                reference_type="sales_order_refund",
                reference_id=order.id,
                note=data.reason if data else None,
            )
            for line_id, qty in requested.items()
        ],
    )
    queue_event(
        db,
        org_id,
        {
            "type": "order.refunded",
            "order_id": str(order.id),
            "number": order.number,
            "amount": str(amount),
            "refunded_amount": str(order.refunded_amount),
            "status": order.status.value,
        },
    )
    await db.commit()
    return order
