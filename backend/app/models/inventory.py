import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    DDL,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
    func,
    true,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantScoped, Timestamped, UUIDPrimaryKey, utcnow
from app.models.tenancy import str_enum


class Location(UUIDPrimaryKey, Timestamped, TenantScoped, Base):
    __tablename__ = "locations"
    __table_args__ = (UniqueConstraint("org_id", "code"),)

    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class MovementReason(StrEnum):
    INITIAL = "initial"
    ADJUSTMENT = "adjustment"
    DAMAGE = "damage"
    PURCHASE_RECEIPT = "purchase_receipt"
    SALE = "sale"
    RETURN = "return"
    TRANSFER_IN = "transfer_in"
    TRANSFER_OUT = "transfer_out"


class StockLevel(UUIDPrimaryKey, TenantScoped, Base):
    """Current stock for one variant at one location.

    A projection of the stock_movements ledger, updated in the same transaction as each
    movement while the row is locked (SELECT ... FOR UPDATE). The CHECK constraint is the
    last line of defence against overselling.
    """

    __tablename__ = "stock_levels"
    __table_args__ = (
        UniqueConstraint("variant_id", "location_id"),
        CheckConstraint("on_hand >= 0", name="on_hand_non_negative"),
        CheckConstraint("reserved >= 0", name="reserved_non_negative"),
    )

    variant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE")
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), index=True
    )
    on_hand: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reserved: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, server_default=func.now()
    )


class StockMovement(UUIDPrimaryKey, TenantScoped, Base):
    """Append-only ledger: every stock change is recorded here and never edited."""

    __tablename__ = "stock_movements"
    __table_args__ = (
        Index("ix_stock_movements_variant_location", "variant_id", "location_id", "created_at"),
        CheckConstraint("quantity <> 0", name="quantity_non_zero"),
    )

    variant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE")
    )
    location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"))
    quantity: Mapped[int] = mapped_column(Integer)
    reason: Mapped[MovementReason] = mapped_column(str_enum(MovementReason))
    reference_type: Mapped[str | None] = mapped_column(String(40))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), index=True
    )


# Enforce ledger immutability in the database itself, not just in application code.
# The same SQL is applied by the Alembic migration; these hooks cover metadata.create_all().
LEDGER_GUARD_FUNCTION = """
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'stock_movements is append-only';
END;
$$ LANGUAGE plpgsql
"""
LEDGER_GUARD_TRIGGER = """
CREATE TRIGGER stock_movements_append_only
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation()
"""
event.listen(StockMovement.__table__, "after_create", DDL(LEDGER_GUARD_FUNCTION))
event.listen(StockMovement.__table__, "after_create", DDL(LEDGER_GUARD_TRIGGER))
