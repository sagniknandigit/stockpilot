"""Inventory: locations, the stock ledger, and concurrency-safe stock changes.

Every stock change goes through `apply_movements`, which:
  1. verifies all variants/locations belong to the caller's org,
  2. locks the affected stock_levels rows in a deterministic order (no deadlocks),
  3. rejects the whole batch if any line would go below available stock,
  4. updates the stock_levels projection and appends to the stock_movements ledger.
The caller commits, so a sale + its stock changes are one atomic transaction.
"""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID, uuid4

from sqlalchemy import and_, func, select, tuple_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import PageParams
from app.core.events import queue_event
from app.core.exceptions import InsufficientStock
from app.models import (
    Location,
    MovementReason,
    Product,
    ProductVariant,
    StockLevel,
    StockMovement,
    User,
)
from app.schemas.inventory import (
    AdjustmentIn,
    LocationIn,
    MovementOut,
    ReconcileMismatch,
    ReconcileOut,
    StockLevelOut,
    StockRow,
    TransferIn,
)
from app.services.utils import commit_or_conflict, count, ensure_owned, like_pattern

StockKey = tuple[UUID, UUID]  # (variant_id, location_id)


@dataclass(frozen=True)
class MovementSpec:
    variant_id: UUID
    location_id: UUID
    quantity: int
    reason: MovementReason
    reference_type: str | None = None
    reference_id: UUID | None = None
    note: str | None = None


async def apply_movements(
    db: AsyncSession, *, org_id: UUID, user_id: UUID | None, specs: Sequence[MovementSpec]
) -> dict[StockKey, StockLevel]:
    if not specs:
        return {}
    keys = sorted({(s.variant_id, s.location_id) for s in specs})
    await ensure_owned(db, ProductVariant, org_id, {k[0] for k in keys}, "Variant")
    await ensure_owned(db, Location, org_id, {k[1] for k in keys}, "Location")

    # Make sure a row exists for each key so there is something to lock.
    await db.execute(
        pg_insert(StockLevel)
        .values(
            [
                {"id": uuid4(), "org_id": org_id, "variant_id": v, "location_id": loc}
                for v, loc in keys
            ]
        )
        .on_conflict_do_nothing(index_elements=["variant_id", "location_id"])
    )

    # Lock rows in sorted order: two transactions touching the same SKUs always queue
    # instead of deadlocking. populate_existing refreshes any stale copy in the session.
    rows = await db.scalars(
        select(StockLevel)
        .where(
            StockLevel.org_id == org_id,
            tuple_(StockLevel.variant_id, StockLevel.location_id).in_(keys),
        )
        .order_by(StockLevel.variant_id, StockLevel.location_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    levels = {(r.variant_id, r.location_id): r for r in rows}

    net: dict[StockKey, int] = defaultdict(int)
    for s in specs:
        net[(s.variant_id, s.location_id)] += s.quantity

    shortages = []
    for key, delta in net.items():
        level = levels[key]
        available = level.on_hand - level.reserved
        if delta < 0 and available + delta < 0:
            shortages.append(
                {
                    "variant_id": str(key[0]),
                    "location_id": str(key[1]),
                    "requested": -delta,
                    "available": available,
                }
            )
    if shortages:
        raise InsufficientStock("Not enough stock to complete this operation", details=shortages)

    for key, delta in net.items():
        level = levels[key]
        level.on_hand += delta
        queue_event(
            db,
            org_id,
            {
                "type": "stock.changed",
                "variant_id": str(key[0]),
                "location_id": str(key[1]),
                "on_hand": level.on_hand,
                "available": level.on_hand - level.reserved,
                "delta": delta,
            },
        )
    db.add_all(
        StockMovement(
            org_id=org_id,
            variant_id=s.variant_id,
            location_id=s.location_id,
            quantity=s.quantity,
            reason=s.reason,
            reference_type=s.reference_type,
            reference_id=s.reference_id,
            note=s.note,
            created_by=user_id,
        )
        for s in specs
    )
    await db.flush()
    await _detect_low_stock(db, org_id, net)
    return levels


async def _detect_low_stock(db: AsyncSession, org_id: UUID, net: dict[StockKey, int]) -> None:
    """Emit `stock.low` when a variant's total available stock *crosses* its reorder point.

    Runs inside the same transaction (rows are locked), so "before" and "after" are exact,
    and the event fires once per crossing instead of on every sale below the threshold.
    """
    decreases: dict[UUID, int] = defaultdict(int)
    for (variant_id, _), delta in net.items():
        decreases[variant_id] += delta
    candidates = [v for v, d in decreases.items() if d < 0]
    if not candidates:
        return
    rows = await db.execute(
        select(
            ProductVariant.id,
            ProductVariant.sku,
            ProductVariant.name,
            Product.name,
            ProductVariant.reorder_point,
            func.coalesce(func.sum(StockLevel.on_hand - StockLevel.reserved), 0),
        )
        .join(Product, Product.id == ProductVariant.product_id)
        .outerjoin(StockLevel, StockLevel.variant_id == ProductVariant.id)
        .where(ProductVariant.id.in_(candidates))
        .group_by(ProductVariant.id, Product.name)
    )
    for variant_id, sku, variant_name, product_name, reorder_point, after in rows:
        before = int(after) - decreases[variant_id]
        if before > reorder_point >= int(after):
            queue_event(
                db,
                org_id,
                {
                    "type": "stock.low",
                    "variant_id": str(variant_id),
                    "sku": sku,
                    "name": product_name
                    if variant_name == "Default"
                    else f"{product_name} - {variant_name}",
                    "available": int(after),
                    "reorder_point": reorder_point,
                },
            )


def _level_out(level: StockLevel) -> StockLevelOut:
    return StockLevelOut(
        variant_id=level.variant_id,
        location_id=level.location_id,
        on_hand=level.on_hand,
        reserved=level.reserved,
        available=level.on_hand - level.reserved,
    )


# --- Locations ---------------------------------------------------------------------------


async def list_locations(db: AsyncSession, org_id: UUID) -> list[Location]:
    rows = await db.scalars(
        select(Location).where(Location.org_id == org_id).order_by(Location.code)
    )
    return list(rows)


async def create_location(db: AsyncSession, org_id: UUID, data: LocationIn) -> Location:
    location = Location(org_id=org_id, **data.model_dump())
    db.add(location)
    await commit_or_conflict(db, f"Location code {data.code} already exists")
    return location


# --- Stock changes -----------------------------------------------------------------------


async def adjust(db: AsyncSession, user: User, data: AdjustmentIn) -> StockLevelOut:
    levels = await apply_movements(
        db,
        org_id=user.org_id,
        user_id=user.id,
        specs=[
            MovementSpec(
                variant_id=data.variant_id,
                location_id=data.location_id,
                quantity=data.quantity,
                reason=MovementReason(data.reason),
                reference_type="adjustment",
                note=data.note,
            )
        ],
    )
    await db.commit()
    return _level_out(levels[(data.variant_id, data.location_id)])


async def transfer(db: AsyncSession, user: User, data: TransferIn) -> list[StockLevelOut]:
    ref = uuid4()
    levels = await apply_movements(
        db,
        org_id=user.org_id,
        user_id=user.id,
        specs=[
            MovementSpec(
                variant_id=data.variant_id,
                location_id=data.from_location_id,
                quantity=-data.quantity,
                reason=MovementReason.TRANSFER_OUT,
                reference_type="transfer",
                reference_id=ref,
                note=data.note,
            ),
            MovementSpec(
                variant_id=data.variant_id,
                location_id=data.to_location_id,
                quantity=data.quantity,
                reason=MovementReason.TRANSFER_IN,
                reference_type="transfer",
                reference_id=ref,
                note=data.note,
            ),
        ],
    )
    await db.commit()
    return [
        _level_out(levels[(data.variant_id, data.from_location_id)]),
        _level_out(levels[(data.variant_id, data.to_location_id)]),
    ]


# --- Queries -----------------------------------------------------------------------------


async def list_stock(
    db: AsyncSession,
    org_id: UUID,
    params: PageParams,
    *,
    location_id: UUID | None = None,
    q: str | None = None,
    low_stock: bool = False,
) -> tuple[list[StockRow], int]:
    """Every active variant x every active location, including ones never stocked (0).

    A variant is "low" when its total available stock across all locations is at or below
    its reorder point (the same rule the dashboard uses), so the window sum is computed
    before any location filter is applied.
    """
    on_hand = func.coalesce(StockLevel.on_hand, 0)
    reserved = func.coalesce(StockLevel.reserved, 0)
    available = on_hand - reserved
    variant_available = func.sum(available).over(partition_by=ProductVariant.id)
    rows = (
        select(
            ProductVariant.id.label("variant_id"),
            ProductVariant.sku,
            ProductVariant.name.label("variant_name"),
            Product.id.label("product_id"),
            Product.name.label("product_name"),
            Location.id.label("location_id"),
            Location.code.label("location_code"),
            on_hand.label("on_hand"),
            reserved.label("reserved"),
            available.label("available"),
            variant_available.label("variant_available"),
            ProductVariant.reorder_point,
            (variant_available <= ProductVariant.reorder_point).label("is_low"),
        )
        .select_from(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .join(
            Location,
            and_(Location.org_id == ProductVariant.org_id, Location.is_active.is_(True)),
        )
        .outerjoin(
            StockLevel,
            and_(
                StockLevel.variant_id == ProductVariant.id,
                StockLevel.location_id == Location.id,
            ),
        )
        .where(
            ProductVariant.org_id == org_id,
            ProductVariant.is_active.is_(True),
            Product.is_active.is_(True),
        )
        .subquery()
    )
    stmt = select(rows)
    if location_id:
        stmt = stmt.where(rows.c.location_id == location_id)
    if q:
        pattern = like_pattern(q)
        stmt = stmt.where(
            rows.c.product_name.ilike(pattern, escape="\\") | rows.c.sku.ilike(pattern, escape="\\")
        )
    if low_stock:
        stmt = stmt.where(rows.c.is_low.is_(True))

    total = await count(db, stmt)
    result = await db.execute(
        stmt.order_by(rows.c.product_name, rows.c.sku, rows.c.location_code)
        .offset(params.offset)
        .limit(params.size)
    )
    return [StockRow.model_validate(dict(row._mapping)) for row in result], total


async def list_movements(
    db: AsyncSession,
    org_id: UUID,
    params: PageParams,
    *,
    variant_id: UUID | None = None,
    location_id: UUID | None = None,
) -> tuple[list[MovementOut], int]:
    stmt = (
        select(StockMovement, ProductVariant.sku, Product.name, ProductVariant.name, Location.code)
        .join(ProductVariant, ProductVariant.id == StockMovement.variant_id)
        .join(Product, Product.id == ProductVariant.product_id)
        .join(Location, Location.id == StockMovement.location_id)
        .where(StockMovement.org_id == org_id)
    )
    if variant_id:
        stmt = stmt.where(StockMovement.variant_id == variant_id)
    if location_id:
        stmt = stmt.where(StockMovement.location_id == location_id)
    total = await count(db, stmt)
    result = await db.execute(
        stmt.order_by(StockMovement.created_at.desc(), StockMovement.id)
        .offset(params.offset)
        .limit(params.size)
    )
    items = [
        MovementOut.model_validate(
            {
                **{f: getattr(m, f) for f in _MOVEMENT_COLUMNS},
                "sku": sku,
                "product_name": product_name,
                "variant_name": variant_name,
                "location_code": location_code,
            }
        )
        for m, sku, product_name, variant_name, location_code in result
    ]
    return items, total


_MOVEMENT_COLUMNS = (
    "id",
    "variant_id",
    "location_id",
    "quantity",
    "reason",
    "reference_type",
    "reference_id",
    "note",
    "created_by",
    "created_at",
)


async def reconcile(db: AsyncSession, org_id: UUID) -> ReconcileOut:
    """Prove the projection matches the ledger: on_hand must equal SUM(movements)."""
    ledger = (
        select(
            StockMovement.variant_id,
            StockMovement.location_id,
            func.sum(StockMovement.quantity).label("total"),
        )
        .where(StockMovement.org_id == org_id)
        .group_by(StockMovement.variant_id, StockMovement.location_id)
        .subquery()
    )
    ledger_total = func.coalesce(ledger.c.total, 0)
    stmt = (
        select(StockLevel.variant_id, StockLevel.location_id, StockLevel.on_hand, ledger_total)
        .outerjoin(
            ledger,
            and_(
                ledger.c.variant_id == StockLevel.variant_id,
                ledger.c.location_id == StockLevel.location_id,
            ),
        )
        .where(StockLevel.org_id == org_id)
    )
    rows = (await db.execute(stmt)).all()
    mismatches = [
        ReconcileMismatch(variant_id=v, location_id=loc, on_hand=oh, ledger_total=int(lt))
        for v, loc, oh, lt in rows
        if oh != lt
    ]
    return ReconcileOut(checked=len(rows), mismatches=mismatches)
