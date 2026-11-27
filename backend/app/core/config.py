from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-only-secret-change-me-in-production-0123456789"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "StockPilot"
    environment: str = "local"  # local | test | production
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/stockpilot"

    jwt_secret: str = _DEV_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    bcrypt_rounds: int = 12

    cors_origins: list[str] = ["http://localhost:5173"]

    # Ask StockPilot (natural-language questions via Gemini). Disabled when no key is set.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_timeout_seconds: int = 30

    # Redis: cross-worker live events + rate limits, and the Celery broker. Optional in
    # development (in-process fallbacks are used when unset).
    redis_url: str | None = None

    # Outgoing email (alerts, daily digest). When SMTP_HOST is unset, emails are logged.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    email_from: str = "StockPilot <alerts@stockpilot.local>"
    app_url: str = "http://localhost:5173"

    # Webhooks: allow http:// and private-network URLs (local testing only).
    webhooks_allow_insecure_urls: bool = False

    log_json: bool = False

    @field_validator("database_url")
    @classmethod
    def _async_driver(cls, url: str) -> str:
        """Accept the postgres:// URLs that hosting platforms provide."""
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+asyncpg://" + url.removeprefix(prefix)
        return url

    @property
    def is_test(self) -> bool:
        return self.environment == "test"

    @model_validator(mode="after")
    def _check_production_secret(self) -> "Settings":
        if self.environment == "production" and self.jwt_secret == _DEV_SECRET:
            raise ValueError("JWT_SECRET must be set in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
