from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models import MovementReason
from app.schemas.common import ORMModel


class LocationIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    code: Annotated[str, Field(pattern=r"^[A-Z0-9_\-]{1,20}$")]
    address: str | None = None


class LocationOut(ORMModel):
    id: UUID
    name: str
    code: str
    address: str | None
    is_active: bool


class StockRow(BaseModel):
    variant_id: UUID
    sku: str
    variant_name: str
    product_id: UUID
    product_name: str
    location_id: UUID
    location_code: str
    on_hand: int
    reserved: int
    available: int
    variant_available: int  # across all locations
    reorder_point: int
    is_low: bool


class StockLevelOut(BaseModel):
    variant_id: UUID
    location_id: UUID
    on_hand: int
    reserved: int
    available: int


class AdjustmentIn(BaseModel):
    variant_id: UUID
    location_id: UUID
    quantity: Annotated[int, Field(ge=-1_000_000, le=1_000_000)]
    reason: Literal["initial", "adjustment", "damage"] = "adjustment"
    note: Annotated[str | None, Field(max_length=500)] = None

    @model_validator(mode="after")
    def _check(self) -> "AdjustmentIn":
        if self.quantity == 0:
            raise ValueError("quantity must not be zero")
        if self.reason == "damage" and self.quantity > 0:
            raise ValueError("damage adjustments must be negative")
        return self


class TransferIn(BaseModel):
    variant_id: UUID
    from_location_id: UUID
    to_location_id: UUID
    quantity: Annotated[int, Field(gt=0, le=1_000_000)]
    note: Annotated[str | None, Field(max_length=500)] = None

    @model_validator(mode="after")
    def _different_locations(self) -> "TransferIn":
        if self.from_location_id == self.to_location_id:
            raise ValueError("from and to locations must differ")
        return self


class MovementOut(ORMModel):
    id: UUID
    variant_id: UUID
    sku: str
    product_name: str
    variant_name: str
    location_id: UUID
    location_code: str
    quantity: int
    reason: MovementReason
    reference_type: str | None
    reference_id: UUID | None
    note: str | None
    created_by: UUID | None
    created_at: datetime


class ReconcileMismatch(BaseModel):
    variant_id: UUID
    location_id: UUID
    on_hand: int
    ledger_total: int


class ReconcileOut(BaseModel):
    checked: int
    mismatches: list[ReconcileMismatch]
