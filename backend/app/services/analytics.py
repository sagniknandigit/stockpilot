"""Sales and inventory analytics for a date range (in the store's local timezone)."""

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from sqlalchemy import Date, cast, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Unprocessable
from app.models import (
    Category,
    Product,
    ProductVariant,
    SalesOrder,
    SalesOrderLine,
    StockLevel,
)
from app.schemas.insights import (
    AbcBucket,
    AnalyticsOut,
    AnalyticsTotals,
    CategorySales,
    DailyPoint,
    InventoryHealth,
    ProductPerformance,
    SlowMover,
)
from app.services.forecasting import local_day_bounds, money, org_timezone
from app.services.metrics import COUNTED_ORDER, NET_COGS, NET_LINE_TOTAL, NET_QUANTITY, NET_REVENUE

MAX_RANGE_DAYS = 366
ABC_A, ABC_B = 0.80, 0.95  # cumulative revenue share cut-offs
SLOW_COVER_DAYS = 45  # stock lasting longer than this at the current sales rate is 'slow'


def abc_classes(revenues: list[Decimal]) -> list[Literal["A", "B", "C"]]:
    """Pareto classification. `revenues` must be sorted descending.

    A = items making up the first 80% of revenue, B = the next 15%, C = the rest.
    An item belongs to the class in which its revenue *starts*.
    """
    total = sum(revenues, Decimal("0"))
    out: list[Literal["A", "B", "C"]] = []
    running = Decimal("0")
    for revenue in revenues:
        share_before = float(running / total) if total else 1.0
        out.append("A" if share_before < ABC_A else "B" if share_before < ABC_B else "C")
        running += revenue
    return out


def _pct_change(current: Decimal, previous: Decimal) -> float | None:
    return round(float((current - previous) / previous * 100), 1) if previous else None


async def analytics(
    db: AsyncSession, org_id: UUID, date_from: date | None, date_to: date | None
) -> AnalyticsOut:
    tz = await org_timezone(db, org_id)
    today = datetime.now(tz).date()
    date_to = date_to or today
    date_from = date_from or date_to - timedelta(days=29)
    if date_from > date_to:
        raise Unprocessable("date_from must be on or before date_to")
    days = (date_to - date_from).days + 1
    if days > MAX_RANGE_DAYS:
        raise Unprocessable(f"Date range cannot exceed {MAX_RANGE_DAYS} days")
    lo, hi = local_day_bounds(date_from, date_to, tz)
    prev_lo, prev_hi = local_day_bounds(
        date_from - timedelta(days=days), date_from - timedelta(days=1), tz
    )

    in_range = (
        SalesOrder.org_id == org_id,
        COUNTED_ORDER,
        SalesOrder.created_at >= lo,
        SalesOrder.created_at < hi,
    )
    day = cast(func.timezone(tz.key, SalesOrder.created_at), Date)
    line_cogs = NET_COGS

    # Revenue (after order discounts) and order counts per day, from the order header.
    revenue_by_day: dict[date, tuple[Decimal, int]] = {
        d: (money(rev), int(n))
        for d, rev, n in await db.execute(
            select(day, func.sum(NET_REVENUE), func.count()).where(*in_range).group_by(day)
        )
    }
    # Units and cost of goods sold per day, from the lines.
    cogs_by_day: dict[date, tuple[Decimal, int]] = {
        d: (money(cogs), int(units))
        for d, cogs, units in await db.execute(
            select(day, func.sum(line_cogs), func.sum(NET_QUANTITY))
            .join(SalesOrder, SalesOrder.id == SalesOrderLine.order_id)
            .where(*in_range)
            .group_by(day)
        )
    }
    daily = []
    for i in range(days):
        d = date_from + timedelta(days=i)
        rev, n = revenue_by_day.get(d, (Decimal("0.00"), 0))
        cogs, _ = cogs_by_day.get(d, (Decimal("0.00"), 0))
        daily.append(DailyPoint(day=d, revenue=rev, orders=n, gross_profit=rev - cogs))

    revenue = sum((p.revenue for p in daily), Decimal("0.00"))
    orders = sum(p.orders for p in daily)
    cogs_total = sum((c for c, _ in cogs_by_day.values()), Decimal("0.00"))
    units = sum(u for _, u in cogs_by_day.values())
    previous_revenue = money(
        await db.scalar(
            select(func.sum(NET_REVENUE)).where(
                SalesOrder.org_id == org_id,
                COUNTED_ORDER,
                SalesOrder.created_at >= prev_lo,
                SalesOrder.created_at < prev_hi,
            )
        )
    )
    totals = AnalyticsTotals(
        revenue=revenue,
        orders=orders,
        units=units,
        gross_profit=revenue - cogs_total,
        gross_margin_pct=round(float((revenue - cogs_total) / revenue * 100), 1)
        if revenue
        else None,
        avg_order_value=money(revenue / orders) if orders else Decimal("0.00"),
        revenue_change_pct=_pct_change(revenue, previous_revenue),
    )

    # Per-variant performance + ABC classification.
    perf_rows = (
        await db.execute(
            select(
                SalesOrderLine.variant_id,
                func.max(SalesOrderLine.sku),
                func.max(SalesOrderLine.name),
                func.sum(NET_QUANTITY),
                func.sum(NET_LINE_TOTAL),
                func.sum(line_cogs),
            )
            .join(SalesOrder, SalesOrder.id == SalesOrderLine.order_id)
            .where(*in_range)
            .group_by(SalesOrderLine.variant_id)
            .having(func.sum(NET_QUANTITY) > 0)  # fully refunded lines aren't sales
            .order_by(func.sum(NET_LINE_TOTAL).desc())
        )
    ).all()
    classes = abc_classes([money(r[4]) for r in perf_rows])
    products = [
        ProductPerformance(
            variant_id=vid,
            sku=sku,
            name=name,
            units=int(qty),
            revenue=money(rev),
            gross_profit=money(rev) - money(cogs),
            abc_class=cls,
        )
        for (vid, sku, name, qty, rev, cogs), cls in zip(perf_rows, classes, strict=True)
    ]
    buckets: dict[str, list[ProductPerformance]] = defaultdict(list)
    for p in products:
        buckets[p.abc_class].append(p)
    line_revenue = sum((p.revenue for p in products), Decimal("0"))
    abc = [
        AbcBucket(
            abc_class=cls,
            variants=len(buckets[cls]),
            revenue=sum((p.revenue for p in buckets[cls]), Decimal("0.00")),
            revenue_share=round(
                float(sum((p.revenue for p in buckets[cls]), Decimal("0")) / line_revenue), 4
            )
            if line_revenue
            else 0.0,
        )
        for cls in ("A", "B", "C")
    ]

    # Slow movers: stock that will take a long time to sell, ranked by money tied up.
    stock = (
        select(
            StockLevel.variant_id.label("variant_id"),
            func.sum(StockLevel.on_hand).label("on_hand"),
        )
        .where(StockLevel.org_id == org_id)
        .group_by(StockLevel.variant_id)
        .subquery()
    )
    sold = (
        select(
            SalesOrderLine.variant_id.label("variant_id"),
            func.sum(NET_QUANTITY).label("units"),
        )
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.order_id)
        .where(*in_range)
        .group_by(SalesOrderLine.variant_id)
        .subquery()
    )
    last_sold = (
        select(
            SalesOrderLine.variant_id.label("variant_id"),
            func.max(SalesOrder.created_at).label("at"),
        )
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.order_id)
        .where(SalesOrder.org_id == org_id, COUNTED_ORDER)
        .group_by(SalesOrderLine.variant_id)
        .subquery()
    )
    units_sold = func.coalesce(sold.c.units, 0)
    stock_value = stock.c.on_hand * ProductVariant.cost
    slow_rows = await db.execute(
        select(
            ProductVariant.id,
            ProductVariant.sku,
            Product.name,
            ProductVariant.name,
            stock.c.on_hand,
            stock_value,
            units_sold,
            last_sold.c.at,
        )
        .join(Product, Product.id == ProductVariant.product_id)
        .join(stock, stock.c.variant_id == ProductVariant.id)
        .outerjoin(sold, sold.c.variant_id == ProductVariant.id)
        .outerjoin(last_sold, last_sold.c.variant_id == ProductVariant.id)
        .where(
            ProductVariant.org_id == org_id,
            ProductVariant.is_active.is_(True),
            stock.c.on_hand > 0,
            # Slow = current stock would take more than SLOW_COVER_DAYS to sell at this
            # period's rate (on_hand * days > units_sold * threshold), or it isn't selling.
            stock.c.on_hand * days > units_sold * SLOW_COVER_DAYS,
        )
        .order_by(stock_value.desc())
        .limit(10)
    )
    slow_movers = [
        SlowMover(
            variant_id=vid,
            sku=sku,
            name=pname if vname == "Default" else f"{pname} - {vname}",
            on_hand=int(on_hand),
            stock_value=money(value),
            units_sold=int(n),
            days_of_cover=round(int(on_hand) * days / int(n), 1) if n else None,
            last_sold_at=at,
        )
        for vid, sku, pname, vname, on_hand, value, n, at in slow_rows
    ]

    # A literal (not a bound parameter) so SELECT and GROUP BY are the same expression.
    category_name = func.coalesce(Category.name, literal_column("'Uncategorized'"))
    categories = [
        CategorySales(category=name, revenue=money(rev), units=int(qty))
        for name, rev, qty in await db.execute(
            select(
                category_name,
                func.sum(NET_LINE_TOTAL),
                func.sum(NET_QUANTITY),
            )
            .join(SalesOrder, SalesOrder.id == SalesOrderLine.order_id)
            .join(ProductVariant, ProductVariant.id == SalesOrderLine.variant_id)
            .join(Product, Product.id == ProductVariant.product_id)
            .outerjoin(Category, Category.id == Product.category_id)
            .where(*in_range)
            .group_by(category_name)
            .order_by(func.sum(NET_LINE_TOTAL).desc())
        )
    ]

    current_stock_value = money(
        await db.scalar(
            select(func.sum(StockLevel.on_hand * ProductVariant.cost))
            .join(ProductVariant, ProductVariant.id == StockLevel.variant_id)
            .where(StockLevel.org_id == org_id)
        )
    )
    turnover = (
        round(float(cogs_total) * (365 / days) / float(current_stock_value), 2)
        if current_stock_value
        else None
    )
    return AnalyticsOut(
        date_from=date_from,
        date_to=date_to,
        totals=totals,
        daily=daily,
        products=products,
        slow_movers=slow_movers,
        abc=abc,
        categories=categories,
        inventory=InventoryHealth(
            stock_value=current_stock_value,
            cogs=cogs_total,
            turnover=turnover,
            days_of_inventory=round(365 / turnover, 1) if turnover else None,
        ),
    )
