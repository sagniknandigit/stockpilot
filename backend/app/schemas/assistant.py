from typing import Annotated, Any

from pydantic import BaseModel, Field


class AskIn(BaseModel):
    question: Annotated[str, Field(min_length=3, max_length=500)]


class ToolCallTrace(BaseModel):
    """Which data the answer was based on, shown in the UI for transparency."""

    name: str
    input: Any
    is_error: bool


class AskOut(BaseModel):
    answer: str  # markdown
    tool_calls: list[ToolCallTrace]
    model: str
    usage: dict[str, int]
