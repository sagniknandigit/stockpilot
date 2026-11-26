from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import DbSession
from app.core.rate_limit import SlidingWindowLimiter, rate_limit
from app.models import User
from app.schemas.assistant import AskIn, AskOut
from app.services import assistant as service

router = APIRouter(prefix="/assistant", tags=["assistant"])

# Each question costs real money (LLM tokens): cap it per user.
ask_limiter = SlidingWindowLimiter(limit=10, window_seconds=60)


@router.post("/ask", response_model=AskOut)
async def ask(
    data: AskIn,
    db: DbSession,
    user: Annotated[User, Depends(rate_limit(ask_limiter))],
) -> AskOut:
    """Answer a natural-language question about this store's data.

    Claude chooses from a fixed set of read-only, tenant-scoped tools (no SQL generation);
    the response lists which tools were used so the answer can be traced to its data.
    """
    return await service.ask(db, user, data.question)
