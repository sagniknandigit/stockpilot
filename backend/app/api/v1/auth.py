from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.schemas.auth import AuthOut, LoginIn, MeOut, RefreshIn, RegisterIn, TokenPair
from app.services import auth as service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthOut, status_code=201)
async def register(data: RegisterIn, db: DbSession) -> AuthOut:
    """Sign up a new organization; the caller becomes its owner."""
    org, user = await service.register(db, data)
    return AuthOut.model_validate(
        {"user": user, "organization": org, "tokens": service.issue_tokens(user)}
    )


@router.post("/login", response_model=AuthOut)
async def login(data: LoginIn, db: DbSession) -> AuthOut:
    user = await service.authenticate(db, data.email, data.password)
    org = await service.get_organization(db, user.org_id)
    return AuthOut.model_validate(
        {"user": user, "organization": org, "tokens": service.issue_tokens(user)}
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh(data: RefreshIn, db: DbSession) -> TokenPair:
    return await service.refresh(db, data.refresh_token)


@router.get("/me", response_model=MeOut)
async def me(user: CurrentUser, db: DbSession) -> MeOut:
    org = await service.get_organization(db, user.org_id)
    return MeOut.model_validate({"user": user, "organization": org})
