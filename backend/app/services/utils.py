from collections.abc import Iterable
from typing import Any
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Conflict, NotFound


def like_pattern(term: str) -> str:
    """Build an ILIKE pattern that treats user input literally (use with escape='\\')."""
    escaped = term.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def count(db: AsyncSession, stmt: Select[Any] | Any) -> int:
    total = await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    return int(total or 0)


async def commit_or_conflict(db: AsyncSession, message: str) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise Conflict(message) from exc


async def ensure_owned(
    db: AsyncSession, model: Any, org_id: UUID, ids: Iterable[UUID], label: str
) -> None:
    """Tenant isolation guard: every referenced id must belong to the caller's org."""
    wanted = set(ids)
    found = set(
        await db.scalars(select(model.id).where(model.org_id == org_id, model.id.in_(wanted)))
    )
    missing = wanted - found
    if missing:
        raise NotFound(f"{label} not found", details={"ids": sorted(str(i) for i in missing)})
