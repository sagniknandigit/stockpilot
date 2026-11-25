from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.core.deps import PageParams


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[T]
    total: int
    page: int
    size: int


def paginate(items: Sequence[Any], total: int, params: PageParams) -> dict[str, Any]:
    return {"items": list(items), "total": total, "page": params.page, "size": params.size}
