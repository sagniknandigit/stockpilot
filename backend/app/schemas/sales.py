from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models import OrderStatus
from app.schemas.catalog import Money
from app.schemas.common import ORMModel


class OrderLineIn(BaseModel):
    variant_id: UUID
    quantity: Annotated[int, Field(gt=0, le=10_000)]
    unit_price: Money | None = None  # override; requires manager role


class OrderIn(BaseModel):
    location_id: UUID
    lines: Annotated[list[OrderLineIn], Field(min_length=1, max_length=200)]
    customer_name: Annotated[str | None, Field(max_length=120)] = None
    discount: Money = Decimal("0")

    @field_validator("lines")
    @classmethod
    def _unique_variants(cls, lines: list[OrderLineIn]) -> list[OrderLineIn]:
        ids = [line.variant_id for line in lines]
        if len(ids) != len(set(ids)):
            raise ValueError("Each variant may appear only once per order")
        return lines


class OrderLineOut(ORMModel):
    id: UUID
    variant_id: UUID
    sku: str
    name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    refunded_quantity: int


class OrderOut(ORMModel):
    id: UUID
    number: int
    status: OrderStatus
    location_id: UUID
    location_code: str
    customer_name: str | None
    subtotal: Decimal
    discount: Decimal
    total: Decimal
    created_by: UUID | None
    created_at: datetime
    refunded_at: datetime | None
    refunded_amount: Decimal
    lines: list[OrderLineOut]


class RefundLineIn(BaseModel):
    line_id: UUID
    quantity: Annotated[int, Field(gt=0, le=10_000)]


class RefundIn(BaseModel):
    """Omit `lines` to refund everything that hasn't been refunded yet."""

    lines: Annotated[list[RefundLineIn] | None, Field(min_length=1, max_length=200)] = None
    reason: Annotated[str | None, Field(max_length=200)] = None
