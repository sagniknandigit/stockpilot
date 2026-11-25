from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel

Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
Sku = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._\-/]+$")]


class CategoryIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=80)]


class CategoryOut(ORMModel):
    id: UUID
    name: str


class VariantIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=120)] = "Default"
    sku: Sku
    barcode: Annotated[str | None, Field(max_length=64)] = None
    attributes: dict[str, str] = Field(default_factory=dict)
    price: Money
    cost: Money = Decimal("0")
    reorder_point: Annotated[int, Field(ge=0)] = 0


class VariantUpdate(BaseModel):
    name: Annotated[str | None, Field(min_length=1, max_length=120)] = None
    barcode: Annotated[str | None, Field(max_length=64)] = None
    attributes: dict[str, str] | None = None
    price: Money | None = None
    cost: Money | None = None
    reorder_point: Annotated[int | None, Field(ge=0)] = None
    is_active: bool | None = None


class VariantOut(ORMModel):
    id: UUID
    product_id: UUID
    name: str
    sku: str
    barcode: str | None
    attributes: dict[str, Any]
    price: Decimal
    cost: Decimal
    reorder_point: int
    is_active: bool


class ProductIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    description: str | None = None
    category_id: UUID | None = None
    variants: Annotated[list[VariantIn], Field(min_length=1, max_length=100)]

    @field_validator("variants")
    @classmethod
    def _unique_skus(cls, variants: list[VariantIn]) -> list[VariantIn]:
        skus = [v.sku.lower() for v in variants]
        if len(skus) != len(set(skus)):
            raise ValueError("Variant SKUs must be unique")
        return variants


class ProductUpdate(BaseModel):
    name: Annotated[str | None, Field(min_length=1, max_length=200)] = None
    description: str | None = None
    category_id: UUID | None = None
    is_active: bool | None = None


class ProductOut(ORMModel):
    id: UUID
    name: str
    description: str | None
    category: CategoryOut | None
    is_active: bool
    created_at: datetime
    variants: list[VariantOut]


class VariantSearchOut(BaseModel):
    """A variant as the POS sees it: what it is, what it costs, how many can be sold here."""

    id: UUID
    product_id: UUID
    product_name: str
    name: str
    sku: str
    barcode: str | None
    price: Decimal
    available: int
