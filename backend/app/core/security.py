from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID, uuid4

import bcrypt
import jwt

from app.core.config import settings
from app.core.exceptions import Unauthorized

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=settings.bcrypt_rounds)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user_id: UUID, org_id: UUID, token_type: TokenType) -> str:
    now = datetime.now(UTC)
    ttl = (
        timedelta(minutes=settings.access_token_minutes)
        if token_type == "access"
        else timedelta(days=settings.refresh_token_days)
    )
    payload = {
        "sub": str(user_id),
        "org": str(org_id),
        "type": token_type,
        "iat": now,
        "exp": now + ttl,
        "jti": uuid4().hex,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise Unauthorized("Token expired", code="token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise Unauthorized("Invalid token") from exc
    if payload.get("type") != expected_type:
        raise Unauthorized("Invalid token type")
    return payload


def subject_id(payload: dict[str, Any]) -> UUID:
    try:
        return UUID(str(payload["sub"]))
    except ValueError as exc:
        raise Unauthorized("Invalid token") from exc
