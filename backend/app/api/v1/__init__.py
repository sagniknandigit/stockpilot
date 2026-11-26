from fastapi import APIRouter

from app.api.v1 import (
    assistant,
    auth,
    catalog,
    insights,
    inventory,
    purchasing,
    realtime,
    reports,
    sales,
    users,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(catalog.router)
api_router.include_router(inventory.router)
api_router.include_router(sales.router)
api_router.include_router(purchasing.router)
api_router.include_router(insights.router)
api_router.include_router(reports.router)
api_router.include_router(assistant.router)
api_router.include_router(realtime.router)
