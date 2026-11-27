from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import api_router
from app.core import observability
from app.core.config import settings
from app.core.deps import DbSession
from app.core.events import hub
from app.core.exceptions import register_exception_handlers
from app.core.redis import close_redis, get_redis


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await hub.start()  # cross-worker live events (no-op without Redis)
    yield
    await hub.stop()
    await hub.flush()
    await close_redis()


def create_app() -> FastAPI:
    observability.configure_logging()
    app = FastAPI(
        title="StockPilot API",
        version="0.2.0",
        description="Multi-tenant inventory, order and demand-forecasting platform.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Idempotent-Replayed", "X-Request-ID", "Content-Disposition"],
    )
    observability.install(app)
    register_exception_handlers(app)
    app.include_router(api_router)

    @app.get("/health", tags=["ops"])
    async def health(db: DbSession) -> dict[str, str]:
        await db.execute(text("SELECT 1"))
        status = {"status": "ok", "database": "ok"}
        redis = get_redis()
        if redis is not None:
            try:
                await redis.ping()
                status["redis"] = "ok"
            except Exception:
                status["redis"] = "unavailable"
        return status

    return app


app = create_app()
