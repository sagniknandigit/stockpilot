from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import Forbidden, Unauthorized
from app.core.limiter import SlidingWindowLimiter
from app.core.security import decode_token, subject_id
from app.models import Role, User

DbSession = Annotated[AsyncSession, Depends(get_db)]

bearer_scheme = HTTPBearer(auto_error=False, description="Paste the access token from /auth/login")
api_key_scheme = APIKeyHeader(
    name="X-API-Key", auto_error=False, description="An API key from Settings → API keys"
)
api_key_limiter = SlidingWindowLimiter("api-key", limit=120, window_seconds=60)


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    api_key: Annotated[str | None, Depends(api_key_scheme)],
) -> User:
    if api_key:
        from app.services.api_keys import authenticate  # avoid an import cycle

        key_user, key = await authenticate(db, api_key)
        await api_key_limiter.check(str(key.id))
        return key_user
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
