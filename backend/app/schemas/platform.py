from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AnyHttpUrl, BaseModel, Field

from app.models import DeliveryStatus, Role
from app.schemas.common import ORMModel

EventType = Literal["order.created", "order.refunded", "stock.changed", "stock.low", "po.received"]


# --- Notifications -----------------------------------------------------------------------


class NotificationOut(ORMModel):
    id: UUID
    type: str
    title: str
    body: str | None
    link: str | None
    data: dict[str, Any]
    created_at: datetime
    read_at: datetime | None


class NotificationsOut(BaseModel):
    items: list[NotificationOut]
    unread: int


# --- Webhooks ----------------------------------------------------------------------------


class WebhookIn(BaseModel):
    url: AnyHttpUrl
    description: Annotated[str | None, Field(max_length=200)] = None
    events: Annotated[list[EventType], Field(min_length=1)]


class WebhookUpdate(BaseModel):
    url: AnyHttpUrl | None = None
    description: Annotated[str | None, Field(max_length=200)] = None
    events: Annotated[list[EventType] | None, Field(min_length=1)] = None
    is_active: bool | None = None


class WebhookOut(ORMModel):
    id: UUID
    url: str
    description: str | None
    events: list[str]
    is_active: bool
    secret: str  # owners only; used by the receiver to verify signatures
    created_at: datetime


class DeliveryOut(ORMModel):
    id: UUID
    endpoint_id: UUID
    event_type: str
    payload: dict[str, Any]
    status: DeliveryStatus
    attempts: int
    response_status: int | None
    response_body: str | None
    error: str | None
    duration_ms: int | None
    next_attempt_at: datetime | None
    delivered_at: datetime | None
    created_at: datetime


# --- API keys ----------------------------------------------------------------------------


class ApiKeyIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    role: Literal[Role.STAFF, Role.MANAGER] = Role.STAFF


class ApiKeyOut(ORMModel):
    id: UUID
    name: str
    prefix: str
    role: Role
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class ApiKeyCreated(ApiKeyOut):
    key: str  # shown exactly once
