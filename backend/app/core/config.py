from functools import lru_cache

from pydantic import model_validator
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

    # Ask StockPilot (natural-language questions). Disabled when no key is set.
    anthropic_api_key: str | None = None
    assistant_model: str = "claude-opus-5-5"

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
