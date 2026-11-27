"""Shared async Redis client (None when REDIS_URL is not configured)."""

from redis.asyncio import Redis

from app.core.config import settings

_client: Redis | None = None


def get_redis() -> Redis | None:
    global _client
    if not settings.redis_url:
        return None
    if _client is None:
        _client = Redis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    """Close the client. Needed when an event loop ends (e.g. after each Celery task)."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
