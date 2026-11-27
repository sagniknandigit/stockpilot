import time
import uuid
from collections import defaultdict, deque

from redis.exceptions import RedisError

from app.core.exceptions import AppError
from app.core.redis import get_redis


class RateLimited(AppError):
    status_code = 429
    code = "rate_limited"


class SlidingWindowLimiter:
    """Sliding-window rate limiter.

    With Redis: one sorted set per key (member = request, score = timestamp), so the limit
    is shared by every API worker. Without Redis: an in-process deque per key.
    """

    def __init__(self, name: str, limit: int, window_seconds: float) -> None:
        self.name = name
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _reject(self, oldest: float, now: float) -> None:
        retry_after = int(self.window - (now - oldest)) + 1
        raise RateLimited(
            f"Too many requests. Try again in {retry_after}s.",
            details={"retry_after": retry_after},
        )

    async def check(self, key: str) -> None:
        redis = get_redis()
        if redis is not None:
            try:
                await self._check_redis(key)
                return
            except RedisError:
                pass  # fail open to the local limiter rather than taking the API down
        self._check_local(key)

    async def _check_redis(self, key: str) -> None:
        redis = get_redis()
        assert redis is not None
        now = time.time()
        bucket = f"ratelimit:{self.name}:{key}"
        member = f"{now}:{uuid.uuid4().hex[:8]}"
        async with redis.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(bucket, 0, now - self.window)
            pipe.zadd(bucket, {member: now})
            pipe.zcard(bucket)
            pipe.zrange(bucket, 0, 0, withscores=True)
            pipe.expire(bucket, int(self.window) + 1)
            _, _, count, oldest, _ = await pipe.execute()
        if count > self.limit:
            await redis.zrem(bucket, member)  # rejected requests don't consume quota
            self._reject(float(oldest[0][1]) if oldest else now, now)

    def _check_local(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            self._reject(hits[0], now)
        hits.append(now)
