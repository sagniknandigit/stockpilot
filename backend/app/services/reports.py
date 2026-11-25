from datetime import datetime, time, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import Date, and_, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OrderStatus, Organization, Product, ProductVariant, SalesOrder, StockLevel
from app.schemas.reports import DailySales, SummaryOut

CENTS = Decimal("0.01")


async def summary(db: AsyncSession, org_id: UUID) -> SummaryOut:
    active_products = await db.scalar(
        select(func.count()).where(Product.org_id == org_id, Product.is_active.is_(True))
    )
    active_variants = await db.scalar(
        select(func.count()).where(
            ProductVariant.org_id == org_id, ProductVariant.is_active.is_(True)
        )
    )
    units, value = (
        await db.execute(
            select(
                func.coalesce(func.sum(StockLevel.on_hand), 0),
                func.coalesce(func.sum(StockLevel.on_hand * ProductVariant.cost), 0),
            )
            .join(ProductVariant, ProductVariant.id == StockLevel.variant_id)
            .where(StockLevel.org_id == org_id)
        )
    ).one()

    # Low stock: a variant's total available across all locations is at or below its
    # reorder point. /inventory/stock?low_stock=true uses the same definition.
    per_variant = (
        select(
            ProductVariant.id,
            func.coalesce(func.sum(StockLevel.on_hand - StockLevel.reserved), 0).label("avail"),
            ProductVariant.reorder_point,
        )
        .outerjoin(StockLevel, StockLevel.variant_id == ProductVariant.id)
        .where(ProductVariant.org_id == org_id, ProductVariant.is_active.is_(True))
        .group_by(ProductVariant.id)
        .subquery()
    )
    low_stock = await db.scalar(
        select(func.count()).where(per_variant.c.avail <= per_variant.c.reorder_point)
    )

    # Bucket sales by the store's local day, not UTC.
    tz_name = await db.scalar(select(Organization.timezone).where(Organization.id == org_id))
    tz = ZoneInfo(tz_name or "UTC")
    today = datetime.now(tz).date()
    start = datetime.combine(today - timedelta(days=6), time.min, tzinfo=tz)
    day = cast(func.timezone(tz.key, SalesOrder.created_at), Date)
    rows = await db.execute(
        select(day, func.count(), func.coalesce(func.sum(SalesOrder.total), 0))
        .where(
            and_(
                SalesOrder.org_id == org_id,
                SalesOrder.status == OrderStatus.COMPLETED,
                SalesOrder.created_at >= start,
            )
        )
        .group_by(day)
    )
    by_day = {d: (n, rev) for d, n, rev in rows}
    last_7 = [
        DailySales(
            day=d,
            orders=by_day.get(d, (0, 0))[0],
            revenue=Decimal(by_day.get(d, (0, 0))[1]).quantize(CENTS),
        )
        for d in (today - timedelta(days=i) for i in range(6, -1, -1))
    ]
    return SummaryOut(
        active_products=active_products or 0,
        active_variants=active_variants or 0,
        units_on_hand=int(units),
        inventory_value=Decimal(value).quantize(CENTS),
        low_stock_count=low_stock or 0,
        today_orders=last_7[-1].orders,
        today_revenue=last_7[-1].revenue,
        last_7_days=last_7,
    )
