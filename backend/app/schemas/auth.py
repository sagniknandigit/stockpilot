from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import AfterValidator, BaseModel, EmailStr, Field

from app.models import Role
from app.schemas.common import ORMModel


def _bcrypt_safe(value: str) -> str:
    # bcrypt only uses the first 72 bytes; reject longer input instead of silently truncating.
    if len(value.encode()) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return value


Password = Annotated[str, Field(min_length=8), AfterValidator(_bcrypt_safe)]
Name = Annotated[str, Field(min_length=2, max_length=120)]


class RegisterIn(BaseModel):
    organization_name: Name
    full_name: Name
    email: EmailStr
    password: Password


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(ORMModel):
    id: UUID
    email: str
    full_name: str
    role: Role
    is_active: bool
    created_at: datetime


class OrganizationOut(ORMModel):
    id: UUID
    name: str
    slug: str
    currency: str
    timezone: str


class MeOut(BaseModel):
    user: UserOut
    organization: OrganizationOut


class AuthOut(MeOut):
    tokens: TokenPair


class UserCreate(BaseModel):
    email: EmailStr
    full_name: Name
    password: Password
    role: Role = Role.STAFF


class UserUpdate(BaseModel):
    full_name: Name | None = None
    role: Role | None = None
    is_active: bool | None = None
