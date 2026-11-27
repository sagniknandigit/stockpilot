from collections.abc import Awaitable, Callable

from app.core.deps import CurrentUser
from app.core.limiter import RateLimited, SlidingWindowLimiter
from app.models import User

__all__ = ["RateLimited", "SlidingWindowLimiter", "rate_limit"]


def rate_limit(limiter: SlidingWindowLimiter) -> Callable[[User], Awaitable[User]]:
    """Per-user limit for expensive endpoints (applied on top of authentication)."""

    async def dependency(user: CurrentUser) -> User:
        await limiter.check(str(user.id))
        return user

    return dependency
