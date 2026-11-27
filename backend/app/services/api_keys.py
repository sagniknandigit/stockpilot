"""API keys for integrations (e.g. syncing stock with an online store).

Format: `sp_<8-char public prefix>_<43-char secret>`. Only SHA-256 of the full key is
stored. A slow hash like bcrypt isn't needed for 256-bit random secrets, and a fast
lookup matters on every request. A key acts as its creator, capped at the key's role
(staff or manager), so a key can never do more than the person who created it.
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound, Unauthorized
from app.models import ApiKey, Role, User
from app.schemas.platform import ApiKeyIn

KEY_PREFIX = "sp_"
TOUCH_INTERVAL = timedelta(minutes=1)


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def generate() -> tuple[str, str]:
    public = secrets.token_hex(4)
    return f"{KEY_PREFIX}{public}_{secrets.token_urlsafe(32)}", f"{KEY_PREFIX}{public}"


async def list_keys(db: AsyncSession, org_id: UUID) -> list[ApiKey]:
    rows = await db.scalars(
        select(ApiKey).where(ApiKey.org_id == org_id).order_by(ApiKey.created_at.desc())
    )
    return list(rows)


async def create_key(db: AsyncSession, user: User, data: ApiKeyIn) -> tuple[ApiKey, str]:
    raw, prefix = generate()
    key = ApiKey(
        org_id=user.org_id,
        name=data.name.strip(),
        prefix=prefix,
        key_hash=hash_key(raw),
        role=data.role,
        created_by=user.id,
    )
    db.add(key)
    await db.commit()
    return key, raw


async def revoke_key(db: AsyncSession, org_id: UUID, key_id: UUID) -> ApiKey:
    key = await db.scalar(select(ApiKey).where(ApiKey.id == key_id, ApiKey.org_id == org_id))
    if key is None:
        raise NotFound("API key not found")
    if key.revoked_at is None:
        key.revoked_at = datetime.now(UTC)
        await db.commit()
    return key


async def authenticate(db: AsyncSession, raw: str) -> tuple[User, ApiKey]:
    """Resolve an API key to the user it acts as (role-capped). Raises Unauthorized."""
    if not raw.startswith(KEY_PREFIX):
        raise Unauthorized("Invalid API key")
    key = await db.scalar(select(ApiKey).where(ApiKey.key_hash == hash_key(raw)))
    if key is None or key.revoked_at is not None:
        raise Unauthorized("Invalid or revoked API key")
    user = await db.get(User, key.created_by)
    if user is None or not user.is_active:
        raise Unauthorized("The user who created this API key is no longer active")

    now = datetime.now(UTC)
    if key.last_used_at is None or now - key.last_used_at > TOUCH_INTERVAL:
        await db.execute(update(ApiKey).where(ApiKey.id == key.id).values(last_used_at=now))
        await db.commit()

    # Act as the creator, but never with more power than the key was granted. The user
    # object is detached first so this role change can never be flushed to the database.
    db.expunge(user)
    if key.role.rank < user.role.rank:
        user.role = Role(key.role)
    return user, key
