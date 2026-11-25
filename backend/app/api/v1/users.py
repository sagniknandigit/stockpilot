from uuid import UUID

from fastapi import APIRouter

from app.core.deps import DbSession, ManagerUser, OwnerUser
from app.models import User
from app.schemas.auth import UserCreate, UserOut, UserUpdate
from app.services import auth as service

router = APIRouter(prefix="/users", tags=["team"])


@router.get("", response_model=list[UserOut])
async def list_users(user: ManagerUser, db: DbSession) -> list[User]:
    return await service.list_users(db, user.org_id)


@router.post("", response_model=UserOut, status_code=201)
async def create_user(data: UserCreate, user: ManagerUser, db: DbSession) -> User:
    """Managers can add staff; only the owner can add managers."""
    return await service.create_user(db, user, data)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(user_id: UUID, data: UserUpdate, user: OwnerUser, db: DbSession) -> User:
    return await service.update_user(db, user, user_id, data)
