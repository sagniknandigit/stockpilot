from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import PurchaseOrderStatus
from app.schemas.catalog import Money
from app.schemas.common import ORMModel


class SupplierIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=160)]
    email: EmailStr | None = None
    phone: Annotated[str | None, Field(max_length=40)] = None
    lead_time_days: Annotated[int, Field(ge=0, le=365)] = 7
    notes: str | None = None


class SupplierUpdate(BaseModel):
    name: Annotated[str | None, Field(min_length=1, max_length=160)] = None
    email: EmailStr | None = None
    phone: Annotated[str | None, Field(max_length=40)] = None
    lead_time_days: Annotated[int | None, Field(ge=0, le=365)] = None
    notes: str | None = None
    is_active: bool | None = None


class SupplierOut(ORMModel):
    id: UUID
    name: str
    email: str | None
    phone: str | None
    lead_time_days: int
    notes: str | None
    is_active: bool


class POLineIn(BaseModel):
    variant_id: UUID
    quantity: Annotated[int, Field(gt=0, le=1_000_000)]
    unit_cost: Money


def _unique_variant_lines(lines: list[POLineIn]) -> list[POLineIn]:
    ids = [line.variant_id for line in lines]
    if len(ids) != len(set(ids)):
        raise ValueError("Each variant may appear only once per purchase order")
    return lines


class POIn(BaseModel):
    supplier_id: UUID
    location_id: UUID
    expected_at: date | None = None
    notes: str | None = None
    lines: Annotated[list[POLineIn], Field(min_length=1, max_length=500)]

    _unique = field_validator("lines")(_unique_variant_lines)


class POUpdate(BaseModel):
    """Only draft purchase orders can be edited. `lines`, if given, replaces all lines."""

    supplier_id: UUID | None = None
    location_id: UUID | None = None
    expected_at: date | None = None
    notes: str | None = None
    lines: Annotated[list[POLineIn] | None, Field(min_length=1, max_length=500)] = None

    @field_validator("lines")
    @classmethod
    def _unique(cls, lines: list[POLineIn] | None) -> list[POLineIn] | None:
        return _unique_variant_lines(lines) if lines is not None else None


class POLineOut(ORMModel):
    id: UUID
    variant_id: UUID
    sku: str
    name: str
    quantity_ordered: int
    quantity_received: int
    quantity_outstanding: int
    unit_cost: Decimal
    line_total: Decimal


class POOut(ORMModel):
    id: UUID
    number: int
    status: PurchaseOrderStatus
    supplier_id: UUID
    supplier_name: str
    location_id: UUID
    location_code: str
    expected_at: date | None
    notes: str | None
    total_cost: Decimal
    created_by: UUID | None
    created_at: datetime
    ordered_at: datetime | None
    received_at: datetime | None
    lines: list[POLineOut]


class ReceiveLineIn(BaseModel):
    line_id: UUID
    quantity: Annotated[int, Field(gt=0, le=1_000_000)]


class ReceiveIn(BaseModel):
    lines: Annotated[list[ReceiveLineIn], Field(min_length=1, max_length=500)]
    note: Annotated[str | None, Field(max_length=500)] = None


class FromSuggestionsIn(BaseModel):
    """Turn reorder suggestions into a draft purchase order in one click."""

    supplier_id: UUID
    location_id: UUID
    variant_ids: Annotated[list[UUID], Field(min_length=1, max_length=500)]
