from enum import StrEnum

from sqlalchemy import BigInteger, Boolean, Enum, String, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantScoped, Timestamped, UUIDPrimaryKey


class Role(StrEnum):
    OWNER = "owner"
    MANAGER = "manager"
    STAFF = "staff"

    @property
    def rank(self) -> int:
        return {"staff": 0, "manager": 1, "owner": 2}[self.value]


def str_enum(enum_cls: type[StrEnum]) -> Enum:
    """Store enums as plain VARCHAR so adding a value never needs an ALTER TYPE migration."""
    return Enum(
        enum_cls,
        native_enum=False,
        length=32,
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )


class Organization(UUIDPrimaryKey, Timestamped, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(140), unique=True)
    currency: Mapped[str] = mapped_column(String(3), default="INR", server_default="INR")
    timezone: Mapped[str] = mapped_column(
        String(64), default="Asia/Kolkata", server_default="Asia/Kolkata"
    )
    # Per-tenant order counter. Incremented under a row lock inside the checkout
    # transaction, so numbers are gapless and never reveal other tenants' volume.
    order_seq: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    po_seq: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")


class User(UUIDPrimaryKey, Timestamped, TenantScoped, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(str_enum(Role), default=Role.STAFF)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
