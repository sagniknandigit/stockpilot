"""Demand forecasts and reorder suggestions, built on `forecast_model`.

For every active SKU:
    forecast         next 60 days of demand from the last 56 days of sales
    safety stock     z * sigma(daily demand) * sqrt(lead time)       (z = 1.65 ~ 95%)
    target           demand over (lead time + 7-day review period) + safety stock
    suggested qty    target - available - already on order          (never below 0)
    urgency          critical: stock runs out before a new order could arrive
                     warning:  below target, reorder this cycle
"""

import math
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound
from app.models import (
    OPEN_PO_STATUSES,
    OrderStatus,
    Organization,
    Product,
    ProductVariant,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatus,
    SalesOrder,
    SalesOrderLine,
    StockLevel,
    Supplier,
)
from app.schemas.insights import (
    ForecastAccuracy,
    ForecastPoint,
    ReorderOut,
    ReorderSuggestion,
    Urgency,
    VariantForecastOut,
)
from app.services import forecast_model as fm

HISTORY_DAYS = 56
HOLDOUT_DAYS = 14
HORIZON_DAYS = 60
REVIEW_PERIOD_DAYS = 7
SERVICE_LEVEL = 0.95
Z_SCORE = 1.65  # for a 95% service level
DEFAULT_LEAD_TIME = 7

_URGENCY_RANK = {"critical": 0, "warning": 1, "ok": 2}


async def org_timezone(db: AsyncSession, org_id: UUID) -> ZoneInfo:
    name = await db.scalar(select(Organization.timezone).where(Organization.id == org_id))
    return ZoneInfo(name or "UTC")


def local_day_bounds(start: date, end: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """[start 00:00, end+1 00:00) in the store's timezone."""
    return (
        datetime.combine(start, time.min, tzinfo=tz),
        datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz),
    )


async def daily_demand(
    db: AsyncSession,
    org_id: UUID,
    tz: ZoneInfo,
    start: date,
    end: date,
    variant_ids: list[UUID] | None = None,
) -> dict[UUID, list[float]]:
    """Units sold per variant per local day, zero-filled, for [start, end]."""
    day = cast(func.timezone(tz.key, SalesOrder.created_at), Date)
    lo, hi = local_day_bounds(start, end, tz)
    stmt = (
        select(SalesOrderLine.variant_id, day, func.sum(SalesOrderLine.quantity))
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.order_id)
        .where(
            SalesOrder.org_id == org_id,
            SalesOrder.status == OrderStatus.COMPLETED,
            SalesOrder.created_at >= lo,
            SalesOrder.created_at < hi,
        )
        .group_by(SalesOrderLine.variant_id, day)
    )
    if variant_ids is not None:
        stmt = stmt.where(SalesOrderLine.variant_id.in_(variant_ids))
    n = (end - start).days + 1
    series: dict[UUID, list[float]] = defaultdict(lambda: [0.0] * n)
    for variant_id, d, qty in await db.execute(stmt):
        series[variant_id][(d - start).days] += float(qty)
    return series


def _accuracy(model_err: float, base_err: float, actual: float) -> ForecastAccuracy:
    model_wape = fm.wape(model_err, actual)
    baseline_wape = fm.wape(base_err, actual)
    improvement = (
        round((baseline_wape - model_wape) / baseline_wape * 100, 1)
        if model_wape is not None and baseline_wape
        else None
    )
    return ForecastAccuracy(
        holdout_days=HOLDOUT_DAYS,
        model_wape=round(model_wape, 4) if model_wape is not None else None,
        baseline_wape=round(baseline_wape, 4) if baseline_wape is not None else None,
        improvement_pct=improvement,
    )


async def reorder_suggestions(
    db: AsyncSession, org_id: UUID, *, only_needed: bool = True
) -> ReorderOut:
    tz = await org_timezone(db, org_id)
    today = datetime.now(tz).date()
    start = today - timedelta(days=HISTORY_DAYS)
    end = today - timedelta(days=1)  # today is incomplete; don't learn from it

    variants = (
        await db.execute(
            select(
                ProductVariant.id,
                ProductVariant.product_id,
                ProductVariant.sku,
                Product.name,
                ProductVariant.name,
                ProductVariant.cost,
                ProductVariant.reorder_point,
            )
            .join(Product, Product.id == ProductVariant.product_id)
            .where(
                ProductVariant.org_id == org_id,
                ProductVariant.is_active.is_(True),
                Product.is_active.is_(True),
            )
        )
    ).all()

    available = {
        v: int(q)
        for v, q in await db.execute(
            select(StockLevel.variant_id, func.sum(StockLevel.on_hand - StockLevel.reserved))
            .where(StockLevel.org_id == org_id)
            .group_by(StockLevel.variant_id)
        )
    }
    on_order = {
        v: int(q)
        for v, q in await db.execute(
            select(
                PurchaseOrderLine.variant_id,
                func.sum(PurchaseOrderLine.quantity_ordered - PurchaseOrderLine.quantity_received),
            )
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
            .where(PurchaseOrder.org_id == org_id, PurchaseOrder.status.in_(OPEN_PO_STATUSES))
            .group_by(PurchaseOrderLine.variant_id)
        )
    }
    # The most recent supplier per variant gives us a realistic lead time.
    last_supplier = {
        v: (sid, sname, lead)
        for v, sid, sname, lead in await db.execute(
            select(
                PurchaseOrderLine.variant_id,
                Supplier.id,
                Supplier.name,
                Supplier.lead_time_days,
            )
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
            .join(Supplier, Supplier.id == PurchaseOrder.supplier_id)
            .where(
                PurchaseOrder.org_id == org_id,
                PurchaseOrder.status != PurchaseOrderStatus.CANCELLED,
            )
            .order_by(PurchaseOrderLine.variant_id, PurchaseOrder.created_at.desc())
            .ext(distinct_on(PurchaseOrderLine.variant_id))
        )
    }
    history = await daily_demand(db, org_id, tz, start, end)

    start_weekday = start.weekday()
    model_err = base_err = actual_total = 0.0
    items: list[ReorderSuggestion] = []
    for vid, pid, sku, product_name, variant_name, cost, reorder_point in variants:
        series = history.get(vid, [0.0] * HISTORY_DAYS)
        bt = fm.backtest(series, start_weekday, HOLDOUT_DAYS)
        if bt and bt.actual_total > 0:
            model_err += bt.abs_error_model
            base_err += bt.abs_error_baseline
            actual_total += bt.actual_total

        fc = fm.forecast(series, start_weekday, HORIZON_DAYS)
        avg_daily = sum(fc[:14]) / 14
        supplier = last_supplier.get(vid)
        lead = supplier[2] if supplier else DEFAULT_LEAD_TIME
        avail = available.get(vid, 0)
        incoming = on_order.get(vid, 0)
        position = avail + incoming

        safety = math.ceil(Z_SCORE * fm.std_dev(series[-28:]) * math.sqrt(max(lead, 1)))
        lead_demand = sum(fc[:lead])
        # Never plan below the manually configured reorder point.
        target = max(sum(fc[: lead + REVIEW_PERIOD_DAYS]) + safety, float(reorder_point))
        suggested = max(0, math.ceil(target - position))

        stockout: date | None = None
        cumulative = 0.0
        for i, demand in enumerate(fc):
            cumulative += demand
            if cumulative > avail:
                stockout = today + timedelta(days=i)
                break
        if avail <= 0 and avg_daily > 0:
            stockout = today

        urgency: Urgency
        if (avg_daily > 0 and position < lead_demand) or (avail <= 0 and suggested > 0):
            urgency = "critical"
        elif suggested > 0:
            urgency = "warning"
        else:
            urgency = "ok"
        if only_needed and suggested == 0:
            continue
        items.append(
            ReorderSuggestion(
                variant_id=vid,
                product_id=pid,
                sku=sku,
                product_name=product_name,
                variant_name=variant_name,
                available=avail,
                on_order=incoming,
                avg_daily_demand=round(avg_daily, 2),
                days_of_cover=round(position / avg_daily, 1) if avg_daily > 0 else None,
                stockout_date=stockout,
                lead_time_days=lead,
                safety_stock=safety,
                suggested_qty=suggested,
                unit_cost=cost,
                urgency=urgency,
                last_supplier_id=supplier[0] if supplier else None,
                last_supplier_name=supplier[1] if supplier else None,
            )
        )

    items.sort(
        key=lambda s: (
            _URGENCY_RANK[s.urgency],
            s.days_of_cover if s.days_of_cover is not None else math.inf,
            -s.suggested_qty,
        )
    )
    return ReorderOut(
        generated_at=datetime.now(UTC),
        history_days=HISTORY_DAYS,
        service_level=SERVICE_LEVEL,
        accuracy=_accuracy(model_err, base_err, actual_total),
        items=items,
    )


async def variant_forecast(
    db: AsyncSession, org_id: UUID, variant_id: UUID, horizon: int = 14
) -> VariantForecastOut:
    row = (
        await db.execute(
            select(ProductVariant.sku, Product.name, ProductVariant.name)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(ProductVariant.id == variant_id, ProductVariant.org_id == org_id)
        )
    ).first()
    if row is None:
        raise NotFound("Variant not found")
    sku, product_name, variant_name = row

    tz = await org_timezone(db, org_id)
    today = datetime.now(tz).date()
    start = today - timedelta(days=HISTORY_DAYS)
    end = today - timedelta(days=1)
    series = (await daily_demand(db, org_id, tz, start, end, [variant_id])).get(
        variant_id, [0.0] * HISTORY_DAYS
    )
    fc = fm.forecast(series, start.weekday(), horizon)
    bt = fm.backtest(series, start.weekday(), HOLDOUT_DAYS)

    points = [
        ForecastPoint(day=start + timedelta(days=i), actual=int(v), forecast=None)
        for i, v in enumerate(series)
    ]
    points += [
        ForecastPoint(day=today + timedelta(days=i), actual=None, forecast=round(v, 2))
        for i, v in enumerate(fc)
    ]
    return VariantForecastOut(
        variant_id=variant_id,
        sku=sku,
        product_name=product_name,
        variant_name=variant_name,
        avg_daily_demand=round(sum(fc) / len(fc), 2) if fc else 0.0,
        model_wape=round(w, 4)
        if bt and (w := fm.wape(bt.abs_error_model, bt.actual_total)) is not None
        else None,
        baseline_wape=round(w, 4)
        if bt and (w := fm.wape(bt.abs_error_baseline, bt.actual_total)) is not None
        else None,
        points=points,
    )


def money(value: object) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))
