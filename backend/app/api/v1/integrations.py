from typing import Any
from uuid import UUID

from fastapi import APIRouter

from app.core.deps import DbSession, OwnerUser, Pagination
from app.core.events import DURABLE_EVENT_TYPES
from app.models import ApiKey, WebhookDelivery, WebhookEndpoint
from app.schemas.common import Page, paginate
from app.schemas.platform import (
    ApiKeyCreated,
    ApiKeyIn,
    ApiKeyOut,
    DeliveryOut,
    WebhookIn,
    WebhookOut,
    WebhookUpdate,
)
from app.services import api_keys, webhooks
from app.worker import celery_app

router = APIRouter(prefix="/integrations", tags=["integrations"])


def _dispatch(delivery_id: UUID) -> None:
    """Hand a delivery to the worker. Without Redis/Celery it stays pending in the log."""
    from app.core.config import settings

    if settings.redis_url:
        celery_app.send_task("stockpilot.deliver_webhook", args=[str(delivery_id)])


# --- API keys ----------------------------------------------------------------------------


@router.get("/api-keys", response_model=list[ApiKeyOut])
async def list_api_keys(user: OwnerUser, db: DbSession) -> list[ApiKey]:
    return await api_keys.list_keys(db, user.org_id)


@router.post("/api-keys", response_model=ApiKeyCreated, status_code=201)
async def create_api_key(data: ApiKeyIn, user: OwnerUser, db: DbSession) -> ApiKeyCreated:
    """Create a key. The full key is returned only in this response; store it securely."""
    key, raw = await api_keys.create_key(db, user, data)
    return ApiKeyCreated.model_validate({**ApiKeyOut.model_validate(key).model_dump(), "key": raw})


@router.delete("/api-keys/{key_id}", response_model=ApiKeyOut)
async def revoke_api_key(key_id: UUID, user: OwnerUser, db: DbSession) -> ApiKey:
    return await api_keys.revoke_key(db, user.org_id, key_id)


# --- Webhooks ----------------------------------------------------------------------------


@router.get("/webhook-events", response_model=list[str])
async def webhook_event_types(user: OwnerUser) -> list[str]:
    return sorted(DURABLE_EVENT_TYPES)


@router.get("/webhooks", response_model=list[WebhookOut])
async def list_webhooks(user: OwnerUser, db: DbSession) -> list[WebhookEndpoint]:
    return await webhooks.list_endpoints(db, user.org_id)


@router.post("/webhooks", response_model=WebhookOut, status_code=201)
async def create_webhook(data: WebhookIn, user: OwnerUser, db: DbSession) -> WebhookEndpoint:
    return await webhooks.create_endpoint(db, user.org_id, data)


@router.patch("/webhooks/{endpoint_id}", response_model=WebhookOut)
async def update_webhook(
    endpoint_id: UUID, data: WebhookUpdate, user: OwnerUser, db: DbSession
) -> WebhookEndpoint:
    return await webhooks.update_endpoint(db, user.org_id, endpoint_id, data)


@router.post("/webhooks/{endpoint_id}/rotate-secret", response_model=WebhookOut)
async def rotate_webhook_secret(
    endpoint_id: UUID, user: OwnerUser, db: DbSession
) -> WebhookEndpoint:
    return await webhooks.rotate_secret(db, user.org_id, endpoint_id)


@router.delete("/webhooks/{endpoint_id}", status_code=204)
async def delete_webhook(endpoint_id: UUID, user: OwnerUser, db: DbSession) -> None:
    await webhooks.delete_endpoint(db, user.org_id, endpoint_id)


@router.post("/webhooks/{endpoint_id}/test", response_model=DeliveryOut, status_code=202)
async def send_test_event(endpoint_id: UUID, user: OwnerUser, db: DbSession) -> WebhookDelivery:
    """Queue a `ping` event to check that the receiver is reachable and verifies signatures."""
    delivery = await webhooks.create_test_delivery(db, user.org_id, endpoint_id)
    _dispatch(delivery.id)
    return delivery


@router.get("/webhooks/{endpoint_id}/deliveries", response_model=Page[DeliveryOut])
async def list_deliveries(
    endpoint_id: UUID, user: OwnerUser, db: DbSession, params: Pagination
) -> dict[str, Any]:
    items, total = await webhooks.list_deliveries(db, user.org_id, endpoint_id, params)
    return paginate(items, total, params)


@router.post("/deliveries/{delivery_id}/redeliver", response_model=DeliveryOut, status_code=202)
async def redeliver(delivery_id: UUID, user: OwnerUser, db: DbSession) -> WebhookDelivery:
    delivery = await webhooks.redeliver(db, user.org_id, delivery_id)
    _dispatch(delivery.id)
    return delivery
