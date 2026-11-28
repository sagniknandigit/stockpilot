"""Behaviour that only matters once deployed (Neon URLs, uptime pings, /metrics exposure)."""

from collections.abc import Iterator

import pytest
from httpx import AsyncClient

from app.core.config import Settings, settings


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        (  # Neon's dashboard string: libpq options asyncpg rejects
            "postgresql://owner:pw@ep-x-123.ap-southeast-1.aws.neon.tech/neondb"
            "?sslmode=require&channel_binding=require",
            "postgresql+asyncpg://owner:pw@ep-x-123.ap-southeast-1.aws.neon.tech/neondb"
            "?ssl=require",
        ),
        (  # Render / Heroku style
            "postgres://u:p@host:5432/db",
            "postgresql+asyncpg://u:p@host:5432/db",
        ),
        (  # already correct: untouched
            "postgresql+asyncpg://u@localhost:5432/stockpilot",
            "postgresql+asyncpg://u@localhost:5432/stockpilot",
        ),
    ],
)
def test_database_url_normalisation(given: str, expected: str) -> None:
    assert Settings(database_url=given).database_url == expected


async def test_liveness_needs_no_database(client: AsyncClient) -> None:
    resp = await client.get("/health/live")
    assert resp.status_code == 200 and resp.json() == {"status": "ok"}


@pytest.fixture
def restore_metrics_settings() -> Iterator[None]:
    saved = (settings.metrics_token, settings.environment)
    yield
    settings.metrics_token, settings.environment = saved


async def test_metrics_protection(client: AsyncClient, restore_metrics_settings: None) -> None:
    settings.metrics_token = "s3cret"
    assert (await client.get("/metrics")).status_code == 401
    ok = await client.get("/metrics", headers={"Authorization": "Bearer s3cret"})
    assert ok.status_code == 200 and "stockpilot_http_requests_total" in ok.text

    settings.metrics_token = None
    settings.environment = "production"
    assert (await client.get("/metrics")).status_code == 404  # never public by accident
