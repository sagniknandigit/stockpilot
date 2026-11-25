from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import Forbidden, Unauthorized
from app.core.security import decode_token, subject_id
from app.models import Role, User

DbSession = Annotated[AsyncSession, Depends(get_db)]

bearer_scheme = HTTPBearer(auto_error=False, description="Paste the access token from /auth/login")


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None:
        raise Unauthorized("Not authenticated")
    payload = decode_token(credentials.credentials, "access")
    user = await db.get(User, subject_id(payload))
    if user is None or not user.is_active:
        raise Unauthorized("User not found or inactive")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(minimum: Role) -> Callable[[User], Awaitable[User]]:
    async def checker(user: CurrentUser) -> User:
        if user.role.rank < minimum.rank:
            raise Forbidden(f"Requires the {minimum.value} role or higher")
        return user

    return checker


ManagerUser = Annotated[User, Depends(require_role(Role.MANAGER))]
OwnerUser = Annotated[User, Depends(require_role(Role.OWNER))]


@dataclass(frozen=True)
class PageParams:
    page: int
    size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


def page_params(
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PageParams:
    return PageParams(page=page, size=size)


Pagination = Annotated[PageParams, Depends(page_params)]
