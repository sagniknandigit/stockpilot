import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    true,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TenantScoped, Timestamped, UUIDPrimaryKey


class Category(UUIDPrimaryKey, Timestamped, TenantScoped, Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("org_id", "name"),)

    name: Mapped[str] = mapped_column(String(80))


class Product(UUIDPrimaryKey, Timestamped, TenantScoped, Base):
    __tablename__ = "products"

    name: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())

    category: Mapped[Category | None] = relationship(lazy="joined")
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="ProductVariant.sku",
    )


class ProductVariant(UUIDPrimaryKey, Timestamped, TenantScoped, Base):
    """The sellable unit (one SKU). Stock is tracked per variant per location."""

    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint("org_id", "sku"),
        UniqueConstraint("org_id", "barcode"),
        CheckConstraint("price >= 0", name="price_non_negative"),
        CheckConstraint("cost >= 0", name="cost_non_negative"),
        CheckConstraint("reorder_point >= 0", name="reorder_point_non_negative"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120), default="Default")
    sku: Mapped[str] = mapped_column(String(64))
    barcode: Mapped[str | None] = mapped_column(String(64))
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    reorder_point: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())

    product: Mapped[Product] = relationship(back_populates="variants", lazy="raise")
