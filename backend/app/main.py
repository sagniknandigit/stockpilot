from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import api_router
from app.core.config import settings
from app.core.deps import DbSession
from app.core.exceptions import register_exception_handlers


def create_app() -> FastAPI:
    app = FastAPI(
        title="StockPilot API",
        version="0.1.0",
        description="Multi-tenant inventory, order and demand-forecasting platform.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Idempotent-Replayed"],
    )
    register_exception_handlers(app)
    app.include_router(api_router)

    @app.get("/health", tags=["ops"])
    async def health(db: DbSession) -> dict[str, str]:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok"}

    return app


app = create_app()
