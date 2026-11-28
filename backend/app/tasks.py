"""Celery tasks. Thin wrappers that run the async service functions.

Each task runs in its own event loop (`asyncio.run`), so it disposes the DB connection
pool and the Redis client afterwards; connections can't be shared across event loops.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from app.core.database import SessionLocal, engine
from app.core.events import hub
from app.core.redis import close_redis
from app.services import digest, email, outbox, webhooks
from app.worker import celery_app

logger = logging.getLogger(__name__)


def run[T](factory: Callable[[], Awaitable[T]]) -> T:
    async def wrapper() -> T:
        try:
            return await factory()
        finally:
            await hub.flush()
            await engine.dispose()
            await close_redis()

    return asyncio.run(wrapper())


@celery_app.task(name="stockpilot.process_outbox")
def process_outbox() -> int:
    async def job() -> tuple[int, list[UUID], list[tuple[list[str], str, str, str]]]:
        processed, deliveries, emails = 0, [], []
        while True:  # drain everything pending, batch by batch
            async with SessionLocal() as db:
                result = await outbox.process_batch(db)
            processed += result.processed
            deliveries += result.deliveries
            emails += result.emails
            if result.processed < outbox.BATCH_SIZE:
                return processed, deliveries, emails

    processed, deliveries, emails = run(job)
    for delivery_id in deliveries:
        deliver_webhook.delay(str(delivery_id))
    for to, subject, html_body, text_body in emails:
        send_email.delay(to, subject, html_body, text_body)
    if processed:
        logger.info("outbox: %d events, %d webhook deliveries", processed, len(deliveries))
    return processed


@celery_app.task(name="stockpilot.deliver_webhook")
def deliver_webhook(delivery_id: str) -> None:
    async def job() -> Any:
        async with SessionLocal() as db:
            return await webhooks.deliver(db, UUID(delivery_id))

    retry_in = run(job)
    if retry_in is not None:
        deliver_webhook.apply_async((delivery_id,), countdown=int(retry_in.total_seconds()))


@celery_app.task(name="stockpilot.retry_due_webhooks")
def retry_due_webhooks() -> int:
    async def job() -> list[UUID]:
        async with SessionLocal() as db:
            return await webhooks.due_deliveries(db)

    due = run(job)
    for delivery_id in due:
        deliver_webhook.delay(str(delivery_id))
    return len(due)


@celery_app.task(
    name="stockpilot.send_email",
    autoretry_for=(OSError,),
    retry_backoff=30,
    max_retries=5,
)
def send_email(to: list[str], subject: str, html_body: str, text_body: str) -> None:
    run(lambda: email.send_email(to, subject, html_body, text_body))


@celery_app.task(name="stockpilot.send_daily_digests")
def send_daily_digests() -> int:
    async def job() -> int:
        async with SessionLocal() as db:
            org_ids = await digest.all_org_ids(db)
        sent = 0
        for org_id in org_ids:
            try:
                async with SessionLocal() as db:
                    sent += await digest.build_and_send(db, org_id)
            except Exception:  # one tenant's failure must not stop everyone's digest
                logger.exception("digest failed for org %s", org_id)
        return sent

    return run(job)


@celery_app.task(name="stockpilot.reset_demo")
def reset_demo() -> None:
    """Rebuild the public demo tenant (only scheduled when DEMO_RESET_DAILY=true)."""
    from app.scripts.seed import seed

    run(lambda: seed(reset=True))
