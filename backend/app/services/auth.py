import re
import secrets
from functools import cache
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import Conflict, Forbidden, NotFound, Unauthorized
from app.core.security import (
    create_token,
    decode_token,
    hash_password,
    subject_id,
    verify_password,
)
from app.models import Location, Organization, Role, User
from app.schemas.auth import RegisterIn, TokenPair, UserCreate, UserUpdate
from app.services.utils import commit_or_conflict

_EMAIL_TAKEN = "An account with this email already exists"


@cache
def _dummy_hash() -> str:
    return hash_password("timing-attack-mitigation")


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:100] or "org"


async def _unique_slug(db: AsyncSession, name: str) -> str:
    base = slug = _slugify(name)
    while await db.scalar(select(Organization.id).where(Organization.slug == slug)):
        slug = f"{base}-{secrets.token_hex(3)}"
    return slug


async def register(db: AsyncSession, data: RegisterIn) -> tuple[Organization, User]:
    """Create an organization, its owner, and a default location in one transaction."""
    email = data.email.lower()
    if await db.scalar(select(User.id).where(User.email == email)):
        raise Conflict(_EMAIL_TAKEN)
    org = Organization(
        name=data.organization_name.strip(),
        slug=await _unique_slug(db, data.organization_name),
    )
    db.add(org)
    await db.flush()
    user = User(
        org_id=org.id,
        email=email,
        full_name=data.full_name.strip(),
        hashed_password=hash_password(data.password),
        role=Role.OWNER,
    )
    db.add_all([user, Location(org_id=org.id, name="Main Store", code="MAIN")])
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise Conflict(_EMAIL_TAKEN) from exc
    return org, user


def issue_tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_token(user.id, user.org_id, "access"),
        refresh_token=create_token(user.id, user.org_id, "refresh"),
        expires_in=settings.access_token_minutes * 60,
    )


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    user = await db.scalar(select(User).where(User.email == email.lower()))
    if user is None:
        verify_password(password, _dummy_hash())  # equalize timing for unknown emails
        raise Unauthorized("Invalid email or password")
    if not verify_password(password, user.hashed_password) or not user.is_active:
        raise Unauthorized("Invalid email or password")
    return user


async def refresh(db: AsyncSession, refresh_token: str) -> TokenPair:
    payload = decode_token(refresh_token, "refresh")
    user = await db.get(User, subject_id(payload))
    if user is None or not user.is_active:
        raise Unauthorized("User not found or inactive")
    return issue_tokens(user)


async def get_organization(db: AsyncSession, org_id: UUID) -> Organization:
    org = await db.get(Organization, org_id)
    if org is None:
        raise NotFound("Organization not found")
    return org


# --- Team management ---------------------------------------------------------------------


async def list_users(db: AsyncSession, org_id: UUID) -> list[User]:
    rows = await db.scalars(select(User).where(User.org_id == org_id).order_by(User.created_at))
    return list(rows)


async def create_user(db: AsyncSession, actor: User, data: UserCreate) -> User:
    if data.role == Role.OWNER:
        raise Forbidden("An organization has exactly one owner")
    if data.role == Role.MANAGER and actor.role != Role.OWNER:
        raise Forbidden("Only the owner can add managers")
    user = User(
        org_id=actor.org_id,
        email=data.email.lower(),
        full_name=data.full_name.strip(),
        hashed_password=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    await commit_or_conflict(db, _EMAIL_TAKEN)
    return user


async def update_user(db: AsyncSession, actor: User, user_id: UUID, data: UserUpdate) -> User:
    user = await db.scalar(select(User).where(User.id == user_id, User.org_id == actor.org_id))
    if user is None:
        raise NotFound("User not found")
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if user.id == actor.id and ("role" in changes or changes.get("is_active") is False):
        raise Forbidden("You cannot change your own role or deactivate yourself")
    if changes.get("role") == Role.OWNER:
        raise Forbidden("An organization has exactly one owner")
    for field, value in changes.items():
        setattr(user, field, value)
    await db.commit()
    return user
