"""Procurement: suppliers and the purchase-order lifecycle.

    draft ──submit──▶ ordered ──receive──▶ partially_received ──receive──▶ received
      │                  │
      └──cancel──────────┴──cancel (only if nothing received yet)──▶ cancelled

Receiving goes through the same locked ledger path as sales (`apply_movements`), and
updates each variant's cost using a weighted moving average, so inventory valuation and
gross margin stay accurate as purchase prices change.
"""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import PageParams
from app.core.events import queue_event
from app.core.exceptions import Conflict, NotFound, Unprocessable
from app.models import (
    Location,
    MovementReason,
    Organization,
    Product,
    ProductVariant,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatus,
    StockLevel,
    Supplier,
    User,
)
from app.schemas.procurement import (
    FromSuggestionsIn,
    POIn,
    POLineIn,
    POUpdate,
    ReceiveIn,
    SupplierIn,
    SupplierUpdate,
)
from app.services.inventory import MovementSpec, apply_movements
from app.services.utils import commit_or_conflict, count, ensure_owned

CENTS = Decimal("0.01")

# --- Suppliers ---------------------------------------------------------------------------


async def list_suppliers(
    db: AsyncSession, org_id: UUID, include_inactive: bool = False
) -> list[Supplier]:
    stmt = select(Supplier).where(Supplier.org_id == org_id)
    if not include_inactive:
        stmt = stmt.where(Supplier.is_active.is_(True))
    return list(await db.scalars(stmt.order_by(Supplier.name)))


async def _get_supplier(db: AsyncSession, org_id: UUID, supplier_id: UUID) -> Supplier:
    supplier = await db.scalar(
        select(Supplier).where(Supplier.id == supplier_id, Supplier.org_id == org_id)
    )
    if supplier is None:
        raise NotFound("Supplier not found")
    return supplier


async def create_supplier(db: AsyncSession, org_id: UUID, data: SupplierIn) -> Supplier:
    supplier = Supplier(org_id=org_id, **data.model_dump())
    db.add(supplier)
    await commit_or_conflict(db, "A supplier with this name already exists")
    return supplier


async def update_supplier(
    db: AsyncSession, org_id: UUID, supplier_id: UUID, data: SupplierUpdate
) -> Supplier:
    supplier = await _get_supplier(db, org_id, supplier_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is None and field in ("name", "lead_time_days", "is_active"):
            continue
        setattr(supplier, field, value)
    await commit_or_conflict(db, "A supplier with this name already exists")
    return supplier


# --- Purchase orders ---------------------------------------------------------------------


async def get_po(
    db: AsyncSession, org_id: UUID, po_id: UUID, *, for_update: bool = False
) -> PurchaseOrder:
    stmt = (
        select(PurchaseOrder)
        .where(PurchaseOrder.id == po_id, PurchaseOrder.org_id == org_id)
        .execution_options(populate_existing=True)
    )
    if for_update:
        stmt = stmt.with_for_update(of=PurchaseOrder)
    po = await db.scalar(stmt)
    if po is None:
        raise NotFound("Purchase order not found")
    return po


async def list_pos(
    db: AsyncSession,
    org_id: UUID,
    params: PageParams,
    *,
    status: PurchaseOrderStatus | None = None,
    supplier_id: UUID | None = None,
) -> tuple[list[PurchaseOrder], int]:
    stmt = select(PurchaseOrder).where(PurchaseOrder.org_id == org_id)
    if status:
        stmt = stmt.where(PurchaseOrder.status == status)
    if supplier_id:
        stmt = stmt.where(PurchaseOrder.supplier_id == supplier_id)
    total = await count(db, stmt)
    rows = await db.scalars(
        stmt.order_by(PurchaseOrder.created_at.desc()).offset(params.offset).limit(params.size)
    )
    return list(rows), total


async def _build_lines(
    db: AsyncSession, org_id: UUID, lines: list[POLineIn]
) -> list[PurchaseOrderLine]:
    rows = await db.execute(
        select(ProductVariant, Product.name)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(
            ProductVariant.org_id == org_id,
            ProductVariant.id.in_([line.variant_id for line in lines]),
        )
    )
    variants = {v.id: (v, product_name) for v, product_name in rows}
    missing = [str(line.variant_id) for line in lines if line.variant_id not in variants]
    if missing:
        raise NotFound("Variant not found", details={"ids": missing})
    out = []
    for line in lines:
        variant, product_name = variants[line.variant_id]
        label = product_name if variant.name == "Default" else f"{product_name} - {variant.name}"
        out.append(
            PurchaseOrderLine(
                variant_id=variant.id,
                sku=variant.sku,
                name=label,
                quantity_ordered=line.quantity,
                unit_cost=line.unit_cost,
            )
        )
    return out


async def _check_refs(
    db: AsyncSession, org_id: UUID, supplier_id: UUID | None, location_id: UUID | None
) -> None:
    if supplier_id:
        supplier = await _get_supplier(db, org_id, supplier_id)
        if not supplier.is_active:
            raise Unprocessable("Supplier is inactive")
    if location_id:
        await ensure_owned(db, Location, org_id, [location_id], "Location")


async def _next_po_number(db: AsyncSession, org_id: UUID) -> int:
    number = await db.scalar(
        update(Organization)
        .where(Organization.id == org_id)
        .values(po_seq=Organization.po_seq + 1)
        .returning(Organization.po_seq)
    )
    assert number is not None
    return number


async def create_po(db: AsyncSession, user: User, data: POIn) -> PurchaseOrder:
    org_id = user.org_id
    await _check_refs(db, org_id, data.supplier_id, data.location_id)
    lines = await _build_lines(db, org_id, data.lines)
    po = PurchaseOrder(
        org_id=org_id,
        number=await _next_po_number(db, org_id),
        supplier_id=data.supplier_id,
        location_id=data.location_id,
        expected_at=data.expected_at,
        notes=data.notes,
        created_by=user.id,
        lines=lines,
    )
    db.add(po)
    await db.commit()
    return await get_po(db, org_id, po.id)


async def update_po(db: AsyncSession, org_id: UUID, po_id: UUID, data: POUpdate) -> PurchaseOrder:
    po = await get_po(db, org_id, po_id, for_update=True)
    if po.status != PurchaseOrderStatus.DRAFT:
        raise Conflict("Only draft purchase orders can be edited")
    changes = data.model_dump(exclude_unset=True)
    await _check_refs(db, org_id, changes.get("supplier_id"), changes.get("location_id"))
    if data.lines is not None:
        po.lines = await _build_lines(db, org_id, data.lines)
    for field in ("supplier_id", "location_id"):
        if changes.get(field):
            setattr(po, field, changes[field])
    for field in ("expected_at", "notes"):
        if field in changes:
            setattr(po, field, changes[field])
    await db.commit()
    return await get_po(db, org_id, po_id)


async def submit_po(db: AsyncSession, org_id: UUID, po_id: UUID) -> PurchaseOrder:
    po = await get_po(db, org_id, po_id, for_update=True)
    if po.status != PurchaseOrderStatus.DRAFT:
        raise Conflict(f"Cannot submit a purchase order that is {po.status.value}")
    po.status = PurchaseOrderStatus.ORDERED
    po.ordered_at = datetime.now(UTC)
    await db.commit()
    return await get_po(db, org_id, po_id)


async def cancel_po(db: AsyncSession, org_id: UUID, po_id: UUID) -> PurchaseOrder:
    po = await get_po(db, org_id, po_id, for_update=True)
    if po.status not in (PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.ORDERED):
        raise Conflict("Only draft or ordered purchase orders with no receipts can be cancelled")
    po.status = PurchaseOrderStatus.CANCELLED
    await db.commit()
    return await get_po(db, org_id, po_id)


async def receive_po(db: AsyncSession, user: User, po_id: UUID, data: ReceiveIn) -> PurchaseOrder:
    """Book delivered goods into stock. Supports partial deliveries."""
    org_id, user_id = user.org_id, user.id
    # Lock the PO: two people receiving the same delivery can't double-count it.
    po = await get_po(db, org_id, po_id, for_update=True)
    if po.status not in (PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.PARTIALLY_RECEIVED):
        raise Conflict(f"Cannot receive a purchase order that is {po.status.value}")

    by_id = {line.id: line for line in po.lines}
    seen: set[UUID] = set()
    problems: list[dict[str, object]] = []
    for item in data.lines:
        line = by_id.get(item.line_id)
        if line is None or item.line_id in seen:
            problems.append({"line_id": str(item.line_id), "error": "unknown or duplicate line"})
        elif item.quantity > line.quantity_outstanding:
            problems.append(
                {
                    "line_id": str(line.id),
                    "sku": line.sku,
                    "requested": item.quantity,
                    "outstanding": line.quantity_outstanding,
                }
            )
        seen.add(item.line_id)
    if problems:
        raise Unprocessable("Cannot receive more than is outstanding", details=problems)

    received = [(by_id[item.line_id], item.quantity) for item in data.lines]

    # Lock the variants too: concurrent receipts must not race on the average cost.
    variant_ids = sorted(line.variant_id for line, _ in received)
    variants = {
        v.id: v
        for v in await db.scalars(
            select(ProductVariant)
            .where(ProductVariant.id.in_(variant_ids))
            .order_by(ProductVariant.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    }
    totals_before: dict[UUID, int] = {
        v: int(q)
        for v, q in await db.execute(
            select(StockLevel.variant_id, func.coalesce(func.sum(StockLevel.on_hand), 0))
            .where(StockLevel.variant_id.in_(variant_ids))
            .group_by(StockLevel.variant_id)
        )
    }

    await apply_movements(
        db,
        org_id=org_id,
        user_id=user_id,
        specs=[
            MovementSpec(
                variant_id=line.variant_id,
                location_id=po.location_id,
                quantity=qty,
                reason=MovementReason.PURCHASE_RECEIPT,
                reference_type="purchase_order",
                reference_id=po.id,
                note=data.note,
            )
            for line, qty in received
        ],
    )

    for line, qty in received:
        line.quantity_received += qty
        variant = variants[line.variant_id]
        before = max(int(totals_before.get(line.variant_id, 0)), 0)
        # Weighted moving average cost: blend existing stock value with the new delivery.
        variant.cost = ((variant.cost * before + line.unit_cost * qty) / (before + qty)).quantize(
            CENTS
        )

    fully = all(line.quantity_outstanding == 0 for line in po.lines)
    po.status = PurchaseOrderStatus.RECEIVED if fully else PurchaseOrderStatus.PARTIALLY_RECEIVED
    if fully:
        po.received_at = datetime.now(UTC)
    queue_event(
        db,
        org_id,
        {
            "type": "po.received",
            "po_id": str(po.id),
            "number": po.number,
            "status": po.status.value,
        },
    )
    await db.commit()
    return await get_po(db, org_id, po_id)


async def create_po_from_suggestions(
    db: AsyncSession, user: User, data: FromSuggestionsIn
) -> PurchaseOrder:
    """Draft a PO for the chosen variants with the forecast's suggested quantities."""
    from app.services.forecasting import reorder_suggestions  # avoid import cycle

    suggestions = await reorder_suggestions(db, user.org_id, only_needed=False)
    by_variant = {s.variant_id: s for s in suggestions.items}
    wanted = [by_variant[v] for v in data.variant_ids if v in by_variant]
    lines = [
        POLineIn(variant_id=s.variant_id, quantity=s.suggested_qty, unit_cost=s.unit_cost)
        for s in wanted
        if s.suggested_qty > 0
    ]
    if not lines:
        raise Unprocessable("None of the selected variants currently needs reordering")
    return await create_po(
        db,
        user,
        POIn(
            supplier_id=data.supplier_id,
            location_id=data.location_id,
            notes="Created from reorder suggestions",
            lines=lines,
        ),
    )
