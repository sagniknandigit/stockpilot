import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TenantScoped, Timestamped, UUIDPrimaryKey
from app.models.inventory import Location
from app.models.tenancy import str_enum


class Supplier(UUIDPrimaryKey, Timestamped, TenantScoped, Base):
    __tablename__ = "suppliers"
    __table_args__ = (
        UniqueConstraint("org_id", "name"),
        CheckConstraint("lead_time_days >= 0", name="lead_time_non_negative"),
    )

    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(40))
    lead_time_days: Mapped[int] = mapped_column(Integer, default=7, server_default="7")
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class PurchaseOrderStatus(StrEnum):
    DRAFT = "draft"
    ORDERED = "ordered"
    PARTIALLY_RECEIVED = "partially_received"
    RECEIVED = "received"
    CANCELLED = "cancelled"


OPEN_PO_STATUSES = (PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.PARTIALLY_RECEIVED)


class PurchaseOrder(UUIDPrimaryKey, Timestamped, TenantScoped, Base):
    __tablename__ = "purchase_orders"
    __table_args__ = (UniqueConstraint("org_id", "number"),)

    number: Mapped[int] = mapped_column(BigInteger)  # per-org: PO-1, PO-2, ...
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True
    )
    location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("locations.id", ondelete="RESTRICT"))
    status: Mapped[PurchaseOrderStatus] = mapped_column(
        str_enum(PurchaseOrderStatus), default=PurchaseOrderStatus.DRAFT, index=True
    )
    expected_at: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    ordered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    supplier: Mapped[Supplier] = relationship(lazy="joined", innerjoin=True)
    location: Mapped[Location] = relationship(lazy="joined", innerjoin=True)
    lines: Mapped[list["PurchaseOrderLine"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="PurchaseOrderLine.sku"
    )

    @property
    def supplier_name(self) -> str:
        return self.supplier.name

    @property
    def location_code(self) -> str:
        return self.location.code

    @property
    def total_cost(self) -> Decimal:
        return sum((line.line_total for line in self.lines), Decimal("0.00"))


class PurchaseOrderLine(UUIDPrimaryKey, Base):
    __tablename__ = "purchase_order_lines"
    __table_args__ = (
        UniqueConstraint("purchase_order_id", "variant_id"),
        CheckConstraint("quantity_ordered > 0", name="ordered_positive"),
        CheckConstraint(
            "quantity_received >= 0 AND quantity_received <= quantity_ordered",
            name="received_within_ordered",
        ),
        CheckConstraint("unit_cost >= 0", name="unit_cost_non_negative"),
    )

    purchase_order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), index=True
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_variants.id", ondelete="RESTRICT"), index=True
    )
    sku: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(330))
    quantity_ordered: Mapped[int] = mapped_column(Integer)
    quantity_received: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    @property
    def line_total(self) -> Decimal:
        return (self.unit_cost * self.quantity_ordered).quantize(Decimal("0.01"))

    @property
    def quantity_outstanding(self) -> int:
        return self.quantity_ordered - self.quantity_received
