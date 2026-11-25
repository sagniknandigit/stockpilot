from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class DailySales(BaseModel):
    day: date
    orders: int
    revenue: Decimal


class SummaryOut(BaseModel):
    active_products: int
    active_variants: int
    units_on_hand: int
    inventory_value: Decimal
    low_stock_count: int
    today_orders: int
    today_revenue: Decimal
    last_7_days: list[DailySales]
