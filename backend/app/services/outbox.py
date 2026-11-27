"""Fan-out of committed domain events (the consumer side of the transactional outbox)."""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import OutboxEvent, WebhookEndpoint
from app.services import email, notifications, webhooks

logger = logging.getLogger(__name__)

BATCH_SIZE = 200
LOW_STOCK_REPEAT_AFTER = timedelta(hours=12)


@dataclass
class OutboxResult:
    processed: int = 0
    deliveries: list[UUID] = field(default_factory=list)
    emails: list[tuple[list[str], str, str, str]] = field(default_factory=list)


async def process_batch(db: AsyncSession) -> OutboxResult:
    """Process one batch of unprocessed events in a single transaction.

    `FOR UPDATE SKIP LOCKED` lets several workers drain the outbox concurrently without
    ever handing the same event to two of them.
    """
    events = list(
        await db.scalars(
            select(OutboxEvent)
            .where(OutboxEvent.processed_at.is_(None))
            .order_by(OutboxEvent.created_at)
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
        )
    )
    result = OutboxResult()
    if not events:
        return result

    endpoints_by_org: dict[UUID, list[WebhookEndpoint]] = {}
    for event in events:
        if event.org_id not in endpoints_by_org:
            endpoints_by_org[event.org_id] = list(
                await db.scalars(
                    select(WebhookEndpoint).where(
                        WebhookEndpoint.org_id == event.org_id,
                        WebhookEndpoint.is_active.is_(True),
                    )
                )
            )
        for endpoint in endpoints_by_org[event.org_id]:
            if event.type in endpoint.events:
                delivery = webhooks.new_delivery(endpoint, event.type, event.payload, event.id)
                db.add(delivery)
                await db.flush()
                result.deliveries.append(delivery.id)

        if event.type == "stock.low":
            await _low_stock_alert(db, event, result)

        event.processed_at = datetime.now(UTC)
        result.processed += 1

    await db.commit()
    return result


async def _low_stock_alert(db: AsyncSession, event: OutboxEvent, result: OutboxResult) -> None:
    payload = event.payload
    key = str(payload.get("variant_id"))
    if await notifications.recently_notified(
        db, event.org_id, "stock.low", key, LOW_STOCK_REPEAT_AFTER
    ):
        return
    users = await notifications.recipients(db, event.org_id)
    name = payload.get("name", "A product")
    available = payload.get("available", 0)
    title = f"{'Out of stock' if available <= 0 else 'Low stock'}: {name}"
    body = (
        f"{available} left across all locations "
        f"(reorder point {payload.get('reorder_point', 0)}). Check the reorder planner."
    )
    await notifications.notify(
        db,
        event.org_id,
        users,
        type="stock.low",
        title=title,
        body=body,
        link="/insights",
        data={"key": key, "sku": payload.get("sku"), "available": available},
    )
    planner = f"{settings.app_url}/insights"
    result.emails.append(
        (
            [u.email for u in users],
            f"[StockPilot] {title}",
            email.render(title, [body], ("Open reorder planner", planner)),
            f"{title}\n\n{body}\n\n{planner}",
        )
    )
