import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from app.core.deps import CurrentUser
from app.core.exceptions import AppError
from app.models import User


class RateLimited(AppError):
    status_code = 429
    code = "rate_limited"


class SlidingWindowLimiter:
    """Per-key sliding-window limiter.

    In-process, so limits apply per API worker. With several workers this should move to
    Redis (a sorted set per key); the interface stays the same.
    """

    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            retry_after = int(self.window - (now - hits[0])) + 1
            raise RateLimited(
                f"Too many requests. Try again in {retry_after}s.",
                details={"retry_after": retry_after},
            )
        hits.append(now)


def rate_limit(limiter: SlidingWindowLimiter) -> Callable[[User], Awaitable[User]]:
    async def dependency(user: CurrentUser) -> User:
        limiter.check(str(user.id))
        return user

    return dependency
