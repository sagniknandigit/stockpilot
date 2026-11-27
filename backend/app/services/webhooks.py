"""Outgoing webhooks: endpoint management, HMAC signing, delivery with retries.

Every request carries:
    X-StockPilot-Event:      event type, e.g. "order.created"
    X-StockPilot-Delivery:   unique delivery id (receivers use it to de-duplicate retries)
    X-StockPilot-Signature:  t=<unix ts>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>

Receivers verify the signature and reject timestamps older than a few minutes, which
stops both forgery and replay. Failed deliveries are retried with exponential backoff.
"""

import asyncio
import hashlib
import hmac
import ipaddress
import json
import secrets
import socket
import time
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import PageParams
from app.core.events import DURABLE_EVENT_TYPES
from app.core.exceptions import NotFound, Unprocessable
from app.models import DeliveryStatus, WebhookDelivery, WebhookEndpoint
from app.schemas.platform import WebhookIn, WebhookUpdate
from app.services.utils import count

# Attempt n (1-based) failed → wait RETRY_DELAYS[n-1] before the next one.
RETRY_DELAYS = [timedelta(seconds=s) for s in (10, 60, 300, 1800, 7200)]
MAX_ATTEMPTS = len(RETRY_DELAYS) + 1
TIMEOUT_SECONDS = 10
USER_AGENT = "StockPilot-Webhooks/1.0"


# --- URL safety (SSRF) -------------------------------------------------------------------


def _is_public_ip(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    return not (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


def validate_url(url: str) -> None:
    """Reject URLs that would let a tenant make our servers call internal services."""
    if settings.webhooks_allow_insecure_urls:
        return
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise Unprocessable("Webhook URLs must use https://")
    host = parts.hostname
    if host == "localhost" or host.endswith((".local", ".internal", ".localhost")):
        raise Unprocessable("Webhook URLs must point to a public host")
    try:
        if not _is_public_ip(host):
            raise Unprocessable("Webhook URLs must point to a public host")
    except ValueError:
        pass  # a hostname, not an IP literal; resolved and checked again at delivery


async def _resolves_to_public(url: str) -> bool:
    if settings.webhooks_allow_insecure_urls:
        return True
    host = urlsplit(url).hostname or ""
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, host, None)
    except OSError:
        return False
    # Every resolved address must be public (defends against DNS tricks).
    return bool(infos) and all(_is_public_ip(str(info[4][0])) for info in infos)


# --- Endpoint management -----------------------------------------------------------------


def _check_events(events: Sequence[str]) -> None:
    unknown = sorted(set(events) - DURABLE_EVENT_TYPES)
    if unknown:
        raise Unprocessable("Unknown event types", details={"unknown": unknown})


async def list_endpoints(db: AsyncSession, org_id: UUID) -> list[WebhookEndpoint]:
    rows = await db.scalars(
        select(WebhookEndpoint)
        .where(WebhookEndpoint.org_id == org_id)
        .order_by(WebhookEndpoint.created_at)
    )
    return list(rows)


async def get_endpoint(db: AsyncSession, org_id: UUID, endpoint_id: UUID) -> WebhookEndpoint:
    endpoint = await db.scalar(
        select(WebhookEndpoint).where(
            WebhookEndpoint.id == endpoint_id, WebhookEndpoint.org_id == org_id
        )
    )
    if endpoint is None:
        raise NotFound("Webhook endpoint not found")
    return endpoint


async def create_endpoint(db: AsyncSession, org_id: UUID, data: WebhookIn) -> WebhookEndpoint:
    validate_url(str(data.url))
    _check_events(data.events)
    endpoint = WebhookEndpoint(
        org_id=org_id,
        url=str(data.url),
        description=data.description,
        events=sorted(set(data.events)),
        secret=f"whsec_{secrets.token_urlsafe(32)}",
    )
    db.add(endpoint)
    await db.commit()
    return endpoint


async def update_endpoint(
    db: AsyncSession, org_id: UUID, endpoint_id: UUID, data: WebhookUpdate
) -> WebhookEndpoint:
    endpoint = await get_endpoint(db, org_id, endpoint_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("url"):
        validate_url(str(changes["url"]))
        endpoint.url = str(changes["url"])
    if changes.get("events") is not None:
        _check_events(changes["events"])
        endpoint.events = sorted(set(changes["events"]))
    if "description" in changes:
        endpoint.description = changes["description"]
    if changes.get("is_active") is not None:
        endpoint.is_active = changes["is_active"]
    await db.commit()
    return endpoint


async def rotate_secret(db: AsyncSession, org_id: UUID, endpoint_id: UUID) -> WebhookEndpoint:
    endpoint = await get_endpoint(db, org_id, endpoint_id)
    endpoint.secret = f"whsec_{secrets.token_urlsafe(32)}"
    await db.commit()
    return endpoint


async def delete_endpoint(db: AsyncSession, org_id: UUID, endpoint_id: UUID) -> None:
    await db.delete(await get_endpoint(db, org_id, endpoint_id))
    await db.commit()


async def list_deliveries(
    db: AsyncSession, org_id: UUID, endpoint_id: UUID, params: PageParams
) -> tuple[list[WebhookDelivery], int]:
    await get_endpoint(db, org_id, endpoint_id)
    stmt = select(WebhookDelivery).where(
        WebhookDelivery.org_id == org_id, WebhookDelivery.endpoint_id == endpoint_id
    )
    total = await count(db, stmt)
    rows = await db.scalars(
        stmt.order_by(WebhookDelivery.created_at.desc()).offset(params.offset).limit(params.size)
    )
    return list(rows), total


def new_delivery(
    endpoint: WebhookEndpoint, event_type: str, payload: dict[str, Any], event_id: UUID | None
) -> WebhookDelivery:
    return WebhookDelivery(
        org_id=endpoint.org_id,
        endpoint_id=endpoint.id,
        event_id=event_id,
        event_type=event_type,
        payload=payload,
        status=DeliveryStatus.PENDING,
        next_attempt_at=datetime.now(UTC),
    )


async def create_test_delivery(
    db: AsyncSession, org_id: UUID, endpoint_id: UUID
) -> WebhookDelivery:
    endpoint = await get_endpoint(db, org_id, endpoint_id)
    delivery = new_delivery(
        endpoint, "ping", {"type": "ping", "message": "Hello from StockPilot"}, None
    )
    db.add(delivery)
    await db.commit()
    return delivery


async def redeliver(db: AsyncSession, org_id: UUID, delivery_id: UUID) -> WebhookDelivery:
    delivery = await db.scalar(
        select(WebhookDelivery).where(
            WebhookDelivery.id == delivery_id, WebhookDelivery.org_id == org_id
        )
    )
    if delivery is None:
        raise NotFound("Delivery not found")
    copy = new_delivery(delivery.endpoint, delivery.event_type, delivery.payload, delivery.event_id)
    db.add(copy)
    await db.commit()
    return copy


# --- Signing & delivery ------------------------------------------------------------------


def sign(secret: str, timestamp: int, body: bytes) -> str:
    digest = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256)
    return f"t={timestamp},v1={digest.hexdigest()}"


def verify(secret: str, header: str, body: bytes, tolerance_seconds: int = 300) -> bool:
    """Reference implementation of what a receiver should do (also used in tests)."""
    try:
        fields = dict(part.split("=", 1) for part in header.split(","))
        timestamp = int(fields["t"])
    except (KeyError, ValueError):
        return False
    if abs(time.time() - timestamp) > tolerance_seconds:
        return False
    return hmac.compare_digest(sign(secret, timestamp, body), header)


async def deliver(
    db: AsyncSession, delivery_id: UUID, client: httpx.AsyncClient | None = None
) -> timedelta | None:
    """Attempt one delivery. Returns the delay before the next retry, or None if done."""
    delivery = await db.scalar(
        select(WebhookDelivery)
        .where(WebhookDelivery.id == delivery_id)
        .with_for_update(of=WebhookDelivery, skip_locked=True)  # never double-send
    )
    if delivery is None or delivery.status != DeliveryStatus.PENDING:
        return None
    endpoint = delivery.endpoint
    if not endpoint.is_active:
        delivery.status = DeliveryStatus.FAILED
        delivery.error = "Endpoint disabled"
        await db.commit()
        return None

    body = json.dumps(
        {
            "id": str(delivery.id),
            "type": delivery.event_type,
            "created_at": delivery.created_at.isoformat(),
            "data": delivery.payload,
        },
        separators=(",", ":"),
    ).encode()
    headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-StockPilot-Event": delivery.event_type,
        "X-StockPilot-Delivery": str(delivery.id),
        "X-StockPilot-Signature": sign(endpoint.secret, int(time.time()), body),
    }
    delivery.attempts += 1
    started = time.perf_counter()
    try:
        if not await _resolves_to_public(endpoint.url):
            raise httpx.ConnectError("Destination is not a public address")
        own_client = client is None
        http = client or httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=False)
        try:
            response = await http.post(endpoint.url, content=body, headers=headers)
        finally:
            if own_client:
                await http.aclose()
        delivery.response_status = response.status_code
        delivery.response_body = response.text[:500]
        delivery.error = None
        ok = 200 <= response.status_code < 300
    except httpx.HTTPError as exc:
        delivery.response_status = None
        delivery.error = f"{type(exc).__name__}: {exc}"[:500]
        ok = False
    delivery.duration_ms = int((time.perf_counter() - started) * 1000)

    retry_in: timedelta | None = None
    if ok:
        delivery.status = DeliveryStatus.SUCCEEDED
        delivery.delivered_at = datetime.now(UTC)
        delivery.next_attempt_at = None
    elif delivery.attempts >= MAX_ATTEMPTS:
        delivery.status = DeliveryStatus.FAILED
        delivery.next_attempt_at = None
    else:
        retry_in = RETRY_DELAYS[delivery.attempts - 1]
        delivery.next_attempt_at = datetime.now(UTC) + retry_in
    await db.commit()
    return retry_in


async def due_deliveries(db: AsyncSession, limit: int = 200) -> list[UUID]:
    """Pending deliveries whose retry time has passed (safety net for lost broker tasks)."""
    rows = await db.scalars(
        select(WebhookDelivery.id)
        .where(
            WebhookDelivery.status == DeliveryStatus.PENDING,
            WebhookDelivery.next_attempt_at <= datetime.now(UTC),
        )
        .order_by(WebhookDelivery.next_attempt_at)
        .limit(limit)
    )
    return list(rows)
