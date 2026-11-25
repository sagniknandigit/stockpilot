import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TenantScoped, Timestamped, UUIDPrimaryKey
from app.models.inventory import Location
from app.models.tenancy import str_enum


class OrderStatus(StrEnum):
    COMPLETED = "completed"
    REFUNDED = "refunded"


class SalesOrder(UUIDPrimaryKey, Timestamped, TenantScoped, Base):
    __tablename__ = "sales_orders"
    __table_args__ = (
        # Same key + same org = same order. Makes retried checkouts safe.
        UniqueConstraint("org_id", "idempotency_key"),
        UniqueConstraint("org_id", "number"),
        Index("ix_sales_orders_org_created", "org_id", "created_at"),
    )

    number: Mapped[int] = mapped_column(BigInteger)  # per-org: SO-1, SO-2, ...
    location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("locations.id", ondelete="RESTRICT"))
    status: Mapped[OrderStatus] = mapped_column(
        str_enum(OrderStatus), default=OrderStatus.COMPLETED
    )
    customer_name: Mapped[str | None] = mapped_column(String(120))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    request_hash: Mapped[str | None] = mapped_column(String(64))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    location: Mapped[Location] = relationship(lazy="joined", innerjoin=True)
    lines: Mapped[list["SalesOrderLine"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="SalesOrderLine.sku"
    )

    @property
    def location_code(self) -> str:
        return self.location.code


class SalesOrderLine(UUIDPrimaryKey, Base):
    __tablename__ = "sales_order_lines"
    __table_args__ = (CheckConstraint("quantity > 0", name="quantity_positive"),)

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sales_orders.id", ondelete="CASCADE"), index=True
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_variants.id", ondelete="RESTRICT"), index=True
    )
    # Snapshot of the product at sale time, so renaming a product never rewrites history.
    sku: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(330))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
