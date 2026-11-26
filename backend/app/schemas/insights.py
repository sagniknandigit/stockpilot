from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

Urgency = Literal["critical", "warning", "ok"]


class ForecastAccuracy(BaseModel):
    """Backtest on the most recent days, across all SKUs (lower WAPE is better)."""

    holdout_days: int
    model_wape: float | None
    baseline_wape: float | None
    improvement_pct: float | None  # how much lower the model's error is than the baseline


class ReorderSuggestion(BaseModel):
    variant_id: UUID
    product_id: UUID
    sku: str
    product_name: str
    variant_name: str
    available: int
    on_order: int
    avg_daily_demand: float  # forecast average over the next 14 days
    days_of_cover: float | None  # (available + on order) / avg daily demand
    stockout_date: date | None
    lead_time_days: int
    safety_stock: int
    suggested_qty: int
    unit_cost: Decimal
    urgency: Urgency
    last_supplier_id: UUID | None
    last_supplier_name: str | None


class ReorderOut(BaseModel):
    generated_at: datetime
    history_days: int
    service_level: float
    accuracy: ForecastAccuracy
    items: list[ReorderSuggestion]


class ForecastPoint(BaseModel):
    day: date
    actual: int | None
    forecast: float | None


class VariantForecastOut(BaseModel):
    variant_id: UUID
    sku: str
    product_name: str
    variant_name: str
    avg_daily_demand: float
    model_wape: float | None
    baseline_wape: float | None
    points: list[ForecastPoint]


# --- Analytics ---------------------------------------------------------------------------


class AnalyticsTotals(BaseModel):
    revenue: Decimal
    orders: int
    units: int
    gross_profit: Decimal
    gross_margin_pct: float | None
    avg_order_value: Decimal
    revenue_change_pct: float | None  # vs the previous period of equal length


class DailyPoint(BaseModel):
    day: date
    revenue: Decimal
    orders: int
    gross_profit: Decimal


class ProductPerformance(BaseModel):
    variant_id: UUID
    sku: str
    name: str
    units: int
    revenue: Decimal
    gross_profit: Decimal
    abc_class: Literal["A", "B", "C"]


class SlowMover(BaseModel):
    variant_id: UUID
    sku: str
    name: str
    on_hand: int
    stock_value: Decimal
    units_sold: int
    last_sold_at: datetime | None


class AbcBucket(BaseModel):
    abc_class: Literal["A", "B", "C"]
    variants: int
    revenue: Decimal
    revenue_share: float


class CategorySales(BaseModel):
    category: str
    revenue: Decimal
    units: int


class InventoryHealth(BaseModel):
    stock_value: Decimal
    cogs: Decimal
    turnover: float | None  # annualised COGS / stock value
    days_of_inventory: float | None


class AnalyticsOut(BaseModel):
    date_from: date
    date_to: date
    totals: AnalyticsTotals
    daily: list[DailyPoint]
    products: list[ProductPerformance]  # every variant that sold, best first
    slow_movers: list[SlowMover]
    abc: list[AbcBucket]
    categories: list[CategorySales]
    inventory: InventoryHealth
