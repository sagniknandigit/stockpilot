"""Multi-worker behaviour against a real Redis (opt in: TEST_REDIS_URL=redis://...)."""

import asyncio
import os
from collections.abc import AsyncIterator
from uuid import uuid4

import pytest

from app.core import redis as redis_module
from app.core.config import settings
from app.core.events import EventHub
from app.core.limiter import RateLimited, SlidingWindowLimiter

REDIS_URL = os.environ.get("TEST_REDIS_URL")
pytestmark = pytest.mark.skipif(not REDIS_URL, reason="set TEST_REDIS_URL to run Redis tests")


@pytest.fixture
async def with_redis() -> AsyncIterator[None]:
    previous = settings.redis_url
    settings.redis_url = REDIS_URL
    try:
        yield
    finally:
        await redis_module.close_redis()
        settings.redis_url = previous


async def test_rate_limit_is_shared_across_workers(with_redis: None) -> None:
    # Two limiter objects = two API worker processes sharing one Redis.
    name = f"test-{uuid4().hex[:6]}"
    worker_a = SlidingWindowLimiter(name, limit=3, window_seconds=60)
    worker_b = SlidingWindowLimiter(name, limit=3, window_seconds=60)
    await worker_a.check("user-1")
    await worker_b.check("user-1")
    await worker_a.check("user-1")
    with pytest.raises(RateLimited) as exc:
        await worker_b.check("user-1")
    assert exc.value.details["retry_after"] > 0
    await worker_b.check("user-2")  # other users are unaffected


async def test_events_reach_subscribers_on_other_workers(with_redis: None) -> None:
    worker_a, worker_b = EventHub(), EventHub()  # e.g. two uvicorn processes
    await worker_b.start()
    try:
        org_id = uuid4()
        queue = worker_b.subscribe(org_id)
        other_org = worker_b.subscribe(uuid4())
        await asyncio.sleep(0.2)  # let the pattern subscription become active
        worker_a.publish(org_id, {"type": "stock.changed", "on_hand": 4})
        await worker_a.flush()
        event = await asyncio.wait_for(queue.get(), timeout=3)
        assert event == {"type": "stock.changed", "on_hand": 4}
        assert other_org.empty()  # tenant isolation holds across processes too
    finally:
        await worker_b.stop()
