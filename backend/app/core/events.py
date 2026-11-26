"""Real-time events: published to a tenant's connected clients only after the DB commits.

Services call `queue_event(db, org_id, {...})` inside a transaction. The events are held on
the session and delivered from SQLAlchemy's `after_commit` hook, and discarded on rollback,
so clients never see a stock change that didn't actually happen.

The hub is in-process: with several API workers, swap `EventHub` for a Redis pub/sub
fan-out behind the same `subscribe` / `publish` interface.
"""

import asyncio
import logging
from typing import Any
from uuid import UUID

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

QUEUE_SIZE = 256
_PENDING = "pending_events"


class EventHub:
    def __init__(self) -> None:
        self._subscribers: dict[UUID, set[asyncio.Queue[dict[str, Any]]]] = {}

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

    def publish(self, org_id: UUID, payload: dict[str, Any]) -> None:
        for queue in list(self._subscribers.get(org_id, ())):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                # A client that can't keep up gets told to refetch instead of blocking others.
                while not queue.empty():
                    queue.get_nowait()
                queue.put_nowait({"type": "resync"})


hub = EventHub()


def queue_event(db: AsyncSession, org_id: UUID, payload: dict[str, Any]) -> None:
    db.sync_session.info.setdefault(_PENDING, []).append((org_id, payload))


@event.listens_for(Session, "after_commit")
def _publish_after_commit(session: Session) -> None:
    for org_id, payload in session.info.pop(_PENDING, []):
        hub.publish(org_id, payload)


@event.listens_for(Session, "after_rollback")
def _discard_on_rollback(session: Session) -> None:
    session.info.pop(_PENDING, None)
