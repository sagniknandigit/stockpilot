from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import queue_event
from app.core.exceptions import NotFound
from app.models import Notification, Role, User


async def recipients(db: AsyncSession, org_id: UUID) -> list[User]:
    """Owners and managers receive operational alerts."""
    rows = await db.scalars(
        select(User).where(
            User.org_id == org_id,
            User.is_active.is_(True),
            User.role.in_([Role.OWNER, Role.MANAGER]),
        )
    )
    return list(rows)


async def notify(
    db: AsyncSession,
    org_id: UUID,
    users: list[User],
    *,
    type: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    """Create one notification per user and push a live event (caller commits)."""
    for user in users:
        db.add(
            Notification(
                org_id=org_id,
                user_id=user.id,
                type=type,
                title=title,
                body=body,
                link=link,
                data=data or {},
            )
        )
    queue_event(db, org_id, {"type": "notification.created", "title": title, "kind": type})


async def recently_notified(
    db: AsyncSession, org_id: UUID, type: str, key: str, within: timedelta
) -> bool:
    """De-duplicate alerts: was this (type, key) already announced recently?"""
    found = await db.scalar(
        select(Notification.id)
        .where(
            Notification.org_id == org_id,
            Notification.type == type,
            Notification.data["key"].astext == key,
            Notification.created_at >= datetime.now(UTC) - within,
        )
        .limit(1)
    )
    return found is not None


async def list_for_user(
    db: AsyncSession, user: User, limit: int = 30
) -> tuple[list[Notification], int]:
    items = await db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    unread = await db.scalar(
        select(func.count()).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return list(items), int(unread or 0)


async def mark_read(db: AsyncSession, user: User, notification_id: UUID) -> None:
    result = await db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user.id)
        .values(read_at=func.coalesce(Notification.read_at, func.now()))
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise NotFound("Notification not found")
    await db.commit()


async def mark_all_read(db: AsyncSession, user: User) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=func.now())
    )
    await db.commit()
