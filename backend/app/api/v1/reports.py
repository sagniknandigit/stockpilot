from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.schemas.reports import SummaryOut
from app.services import reports as service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=SummaryOut)
async def summary(user: CurrentUser, db: DbSession) -> SummaryOut:
    """Dashboard KPIs: stock value, low-stock count, and the last 7 days of sales."""
    return await service.summary(db, user.org_id)
