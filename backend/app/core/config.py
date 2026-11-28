from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-only-secret-change-me-in-production-0123456789"
_LIBPQ_ONLY_PARAMS = {"channel_binding", "gssencmode", "target_session_attrs", "options"}


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
    # Optional regex for extra origins, e.g. Vercel preview deploys:
    #   ^https://stockpilot-[a-z0-9-]+\.vercel\.app$
    cors_origin_regex: str | None = None

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
    # When set, /metrics requires "Authorization: Bearer <token>". In production without
    # a token, /metrics is disabled (it would otherwise be public on hosts with no proxy).
    metrics_token: str | None = None

    # Background schedule. The API triggers outbox processing right after each commit, so
    # these sweeps are only a safety net; raise them on serverless Postgres (e.g. Neon) so
    # the database can scale to zero between sweeps.
    outbox_sweep_seconds: float = 5.0
    webhook_retry_sweep_seconds: float = 30.0
    # Public demo deployments: rebuild the demo shop every night (03:00 IST).
    demo_reset_daily: bool = False

    @field_validator("database_url")
    @classmethod
    def _async_driver(cls, url: str) -> str:
        """Accept the URLs that hosting platforms provide (Neon, Render, Railway, ...).

        - `postgres://` / `postgresql://` → `postgresql+asyncpg://`
        - libpq's `sslmode=require` → asyncpg's `ssl=require`
        - libpq-only options asyncpg doesn't understand (e.g. `channel_binding`) are dropped
        """
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                url = "postgresql+asyncpg://" + url.removeprefix(prefix)
                break
        parts = urlsplit(url)
        if not parts.query:
            return url
        query = []
        for key, value in parse_qsl(parts.query, keep_blank_values=True):
            if key == "sslmode":
                query.append(("ssl", value))
            elif key not in _LIBPQ_ONLY_PARAMS:
                query.append((key, value))
        return urlunsplit(parts._replace(query=urlencode(query)))

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
