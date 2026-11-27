"""Domain events: published only after the database commits.

Services call `queue_event(db, org_id, {"type": ..., ...})` inside a transaction. Two
things happen to each event:

1. **Transactional outbox.** Events of durable types are also inserted into
   `outbox_events` *in the same transaction*. A background worker later fans them out to
   webhooks, notifications and emails. Because the row commits atomically with the change
   that caused it, an event can never be lost (crash after commit) or invented (rollback).
2. **Live push.** After commit, events go to every connected browser of that tenant via
   WebSocket. With Redis configured, they are published on a Redis channel so that every
   API worker process can deliver to its own connections. Without Redis, they are
   delivered in-process (single worker / tests).

On rollback, pending events are discarded.
"""

import asyncio
import contextlib
import json
import logging
from typing import Any
from uuid import UUID

from redis.exceptions import RedisError
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

QUEUE_SIZE = 256
CHANNEL_PREFIX = "stockpilot:events:"
_PENDING = "pending_events"
_OUTBOX_ADDED = "outbox_added"

# Types that external systems can subscribe to (webhooks) and that drive alerts.
DURABLE_EVENT_TYPES = frozenset(
    {
        "order.created",
        "order.refunded",
        "stock.changed",
        "stock.low",
        "po.received",
    }
)


class EventHub:
    def __init__(self) -> None:
        self._subscribers: dict[UUID, set[asyncio.Queue[dict[str, Any]]]] = {}
        self._listener: asyncio.Task[None] | None = None
        self._in_flight: set[asyncio.Task[Any]] = set()

    # -- local subscribers (this process's WebSocket connections) --------------------------

    def subscribe(self, org_id: UUID) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=QUEUE_SIZE)
        self._subscribers.setdefault(org_id, set()).add(queue)
        return queue

    def unsubscribe(self, org_id: UUID, queue: asyncio.Queue[dict[str, Any]]) -> None:
        subscribers = self._subscribers.get(org_id)
        if subscribers:
            subscribers.discard(queue)
            if not subscribers:
                del self._subscribers[org_id]

    def subscriber_count(self, org_id: UUID) -> int:
        return len(self._subscribers.get(org_id, ()))

    def deliver_local(self, org_id: UUID, payload: dict[str, Any]) -> None:
        for queue in list(self._subscribers.get(org_id, ())):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                # A client that can't keep up gets told to refetch instead of blocking others.
                while not queue.empty():
                    queue.get_nowait()
                queue.put_nowait({"type": "resync"})

    # -- publishing ------------------------------------------------------------------------

    def publish(self, org_id: UUID, payload: dict[str, Any]) -> None:
        redis = get_redis()
        if redis is None:
            self.deliver_local(org_id, payload)
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:  # no loop (sync context): nothing can be listening here
            return
        task = loop.create_task(self._publish_redis(org_id, payload))
        self._in_flight.add(task)
        task.add_done_callback(self._in_flight.discard)

    async def _publish_redis(self, org_id: UUID, payload: dict[str, Any]) -> None:
        redis = get_redis()
        if redis is None:
            return
        try:
            await redis.publish(f"{CHANNEL_PREFIX}{org_id}", json.dumps(payload))
        except RedisError:
            logger.warning("redis publish failed; delivering locally only", exc_info=True)
            self.deliver_local(org_id, payload)

    async def flush(self) -> None:
        """Wait for in-flight publishes (call before an event loop shuts down)."""
        if self._in_flight:
            await asyncio.gather(*self._in_flight, return_exceptions=True)

    # -- cross-process fan-in (API workers) ------------------------------------------------

    async def start(self) -> None:
        if get_redis() is not None and self._listener is None:
            self._listener = asyncio.create_task(self._listen())

    async def stop(self) -> None:
        if self._listener is not None:
            self._listener.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._listener
            self._listener = None

    async def _listen(self) -> None:
        while True:
            redis = get_redis()
            if redis is None:
                return
            try:
                async with redis.pubsub() as pubsub:
                    await pubsub.psubscribe(f"{CHANNEL_PREFIX}*")
                    async for message in pubsub.listen():
                        if message.get("type") != "pmessage":
                            continue
                        org_id = UUID(str(message["channel"]).removeprefix(CHANNEL_PREFIX))
                        self.deliver_local(org_id, json.loads(message["data"]))
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("event listener lost Redis; retrying in 2s", exc_info=True)
                await asyncio.sleep(2)


hub = EventHub()


def queue_event(db: AsyncSession, org_id: UUID, payload: dict[str, Any]) -> None:
    from app.models.platform import OutboxEvent  # avoid an import cycle with models

    session = db.sync_session
    session.info.setdefault(_PENDING, []).append((org_id, payload))
    if payload.get("type") in DURABLE_EVENT_TYPES:
        db.add(OutboxEvent(org_id=org_id, type=payload["type"], payload=payload))
        session.info[_OUTBOX_ADDED] = True


@event.listens_for(Session, "after_commit")
def _publish_after_commit(session: Session) -> None:
    for org_id, payload in session.info.pop(_PENDING, []):
        hub.publish(org_id, payload)
    if session.info.pop(_OUTBOX_ADDED, False):
        _kick_outbox_worker()


@event.listens_for(Session, "after_rollback")
def _discard_on_rollback(session: Session) -> None:
    session.info.pop(_PENDING, None)
    session.info.pop(_OUTBOX_ADDED, None)


def _kick_outbox_worker() -> None:
    """Ask the worker to process the outbox now (beat also sweeps it every few seconds)."""
    from app.core.config import settings

    if not settings.redis_url:
        return
    try:
        from app.worker import celery_app

        celery_app.send_task("stockpilot.process_outbox", ignore_result=True)
    except Exception:  # the commit already succeeded; the periodic sweep will catch up
        logger.warning("could not enqueue outbox processing", exc_info=True)
