from datetime import date
from uuid import UUID

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession, ManagerUser
from app.schemas.insights import AnalyticsOut, ReorderOut, VariantForecastOut
from app.services import analytics as analytics_service
from app.services import forecasting as forecasting_service

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/analytics", response_model=AnalyticsOut)
async def analytics(
    user: ManagerUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
) -> AnalyticsOut:
    """Revenue, margin, best sellers, ABC classes, slow movers and inventory turnover.

    Dates are local to the store's timezone; defaults to the last 30 days.
    """
    return await analytics_service.analytics(db, user.org_id, date_from, date_to)


@router.get("/reorder-suggestions", response_model=ReorderOut)
async def reorder_suggestions(
    user: CurrentUser, db: DbSession, only_needed: bool = True
) -> ReorderOut:
    """Forecast-driven reorder quantities, most urgent first, plus backtested accuracy."""
    return await forecasting_service.reorder_suggestions(db, user.org_id, only_needed=only_needed)


@router.get("/forecast/{variant_id}", response_model=VariantForecastOut)
async def variant_forecast(
    variant_id: UUID, user: CurrentUser, db: DbSession
) -> VariantForecastOut:
    """56 days of actual daily demand followed by a 14-day forecast, for charting."""
    return await forecasting_service.variant_forecast(db, user.org_id, variant_id)
