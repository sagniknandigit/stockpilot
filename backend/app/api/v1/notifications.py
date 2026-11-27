from uuid import UUID

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.schemas.platform import NotificationOut, NotificationsOut
from app.services import notifications as service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationsOut)
async def list_notifications(user: CurrentUser, db: DbSession) -> NotificationsOut:
    """The 30 most recent notifications for the current user, plus the unread count."""
    items, unread = await service.list_for_user(db, user)
    return NotificationsOut(items=[NotificationOut.model_validate(n) for n in items], unread=unread)


@router.post("/{notification_id}/read", status_code=204)
async def mark_read(notification_id: UUID, user: CurrentUser, db: DbSession) -> None:
    await service.mark_read(db, user, notification_id)


@router.post("/read-all", status_code=204)
async def mark_all_read(user: CurrentUser, db: DbSession) -> None:
    await service.mark_all_read(db, user)
