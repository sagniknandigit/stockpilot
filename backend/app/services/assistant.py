"""Ask StockPilot: natural-language questions answered with Claude tool use.

Safety model: Claude never writes SQL. It can only call the fixed, read-only tools below,
each of which wraps an existing service function with validated parameters and is scoped
to the caller's organization by the server, never by anything the model supplies.
"""

import json
import logging
from collections.abc import Awaitable, Callable
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import anthropic
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import PageParams
from app.core.exceptions import AppError
from app.models import (
    Location,
    Organization,
    ProductVariant,
    PurchaseOrderStatus,
    Role,
    User,
)
from app.schemas.assistant import AskOut, ToolCallTrace
from app.services import analytics, forecasting, inventory, procurement
from app.services.forecasting import org_timezone

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 6
MAX_RESULT_CHARS = 12_000

SYSTEM_PROMPT = """\
You are StockPilot's analyst, embedded in an inventory and point-of-sale app used by a \
small retailer. Answer the user's question about their own store using the tools \
provided; they return live data for this store only.

How to work:
- Call tools to get facts; never invent numbers. If the tools cannot answer the question, \
say so plainly and suggest what the user could look at instead.
- Prefer one or two well-chosen tool calls. Call independent tools in parallel.
- Dates: interpret relative ranges ("last week", "this month") using today's date given \
in the user's message, and pass ISO dates (YYYY-MM-DD) to tools.

How to answer:
- Lead with the direct answer in one sentence, then supporting detail.
- Keep it short: a few sentences or a compact markdown table/bullet list (max ~8 rows).
- Format money with the store's currency, and name products the way the tools do.
- When something needs action (e.g. stock about to run out), say what to do next.
"""


# --- Tool parameter models (validated before anything touches the database) --------------


class DateRange(BaseModel):
    date_from: date | None = Field(None, description="Inclusive start date, YYYY-MM-DD")
    date_to: date | None = Field(None, description="Inclusive end date, YYYY-MM-DD")


class TopProductsIn(DateRange):
    sort_by: str = Field("revenue", pattern="^(revenue|units|gross_profit)$")
    order: str = Field("best", pattern="^(best|worst)$")
    limit: int = Field(5, ge=1, le=20)


class ReorderIn(BaseModel):
    urgency: str | None = Field(None, pattern="^(critical|warning)$")
    runs_out_within_days: int | None = Field(None, ge=0, le=60)
    limit: int = Field(10, ge=1, le=30)


class StockIn(BaseModel):
    search: str | None = Field(None, max_length=100)
    location_code: str | None = Field(None, max_length=20)
    low_stock_only: bool = False
    limit: int = Field(15, ge=1, le=50)


class ForecastIn(BaseModel):
    sku: str = Field(..., min_length=1, max_length=64)


class PurchaseOrdersIn(BaseModel):
    status: PurchaseOrderStatus | None = None
    limit: int = Field(10, ge=1, le=30)


def _schema(model: type[BaseModel]) -> dict[str, Any]:
    schema = model.model_json_schema()
    schema.pop("title", None)
    for prop in schema.get("properties", {}).values():
        prop.pop("title", None)
    schema["additionalProperties"] = False
    return schema


TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_sales_summary",
        "description": (
            "Revenue, orders, units, gross profit and margin, average order value, change vs "
            "the previous period, sales by category, and ABC class breakdown for a date "
            "range (defaults to the last 30 days)."
        ),
        "input_schema": _schema(DateRange),
    },
    {
        "name": "get_top_products",
        "description": (
            "Best- or worst-performing products in a date range, ranked by revenue, units or "
            "gross profit. Only products with at least one sale are included; for products "
            "that are not selling at all use get_inventory_health."
        ),
        "input_schema": _schema(TopProductsIn),
    },
    {
        "name": "get_inventory_health",
        "description": (
            "Current stock value, inventory turnover, days of inventory, and slow movers "
            "(stock on hand that is barely selling) for a date range."
        ),
        "input_schema": _schema(DateRange),
    },
    {
        "name": "get_reorder_suggestions",
        "description": (
            "Forecast-based restocking plan: for each product at risk, available stock, "
            "quantity on order, average daily demand, days of cover, predicted stock-out date, "
            "supplier lead time and suggested order quantity. Use for questions about what "
            "will run out or what to reorder."
        ),
        "input_schema": _schema(ReorderIn),
    },
    {
        "name": "get_stock_levels",
        "description": (
            "Current on-hand and available stock per product and location. Filter by a "
            "name/SKU search term, a location code (e.g. MAIN), or low stock only."
        ),
        "input_schema": _schema(StockIn),
    },
    {
        "name": "get_product_forecast",
        "description": (
            "Daily demand history (last 8 weeks) and a 14-day forecast for one product, by SKU. "
            "Use get_stock_levels with a search term first if you only know the product name."
        ),
        "input_schema": _schema(ForecastIn),
    },
    {
        "name": "get_purchase_orders",
        "description": "Recent purchase orders with supplier, status, expected date and value.",
        "input_schema": _schema(PurchaseOrdersIn),
    },
]


def _json(data: Any) -> str:
    def default(value: Any) -> Any:
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, date | datetime):
            return value.isoformat()
        if isinstance(value, UUID):
            return str(value)
        raise TypeError(type(value))

    text = json.dumps(data, default=default, separators=(",", ":"))
    return text if len(text) <= MAX_RESULT_CHARS else text[:MAX_RESULT_CHARS] + "…(truncated)"


ToolFn = Callable[[AsyncSession, User, dict[str, Any]], Awaitable[Any]]


async def _sales_summary(db: AsyncSession, user: User, raw: dict[str, Any]) -> Any:
    args = DateRange.model_validate(raw)
    out = await analytics.analytics(db, user.org_id, args.date_from, args.date_to)
    return {
        "period": {"from": out.date_from, "to": out.date_to},
        "totals": out.totals.model_dump(),
        "categories": [c.model_dump() for c in out.categories],
        "abc": [b.model_dump() for b in out.abc],
    }


async def _top_products(db: AsyncSession, user: User, raw: dict[str, Any]) -> Any:
    args = TopProductsIn.model_validate(raw)
    out = await analytics.analytics(db, user.org_id, args.date_from, args.date_to)
    ranked = sorted(
        out.products, key=lambda p: getattr(p, args.sort_by), reverse=args.order == "best"
    )
    return {
        "period": {"from": out.date_from, "to": out.date_to},
        "products": [p.model_dump(exclude={"variant_id"}) for p in ranked[: args.limit]],
    }


async def _inventory_health(db: AsyncSession, user: User, raw: dict[str, Any]) -> Any:
    args = DateRange.model_validate(raw)
    out = await analytics.analytics(db, user.org_id, args.date_from, args.date_to)
    return {
        "period": {"from": out.date_from, "to": out.date_to},
        "inventory": out.inventory.model_dump(),
        "slow_movers": [s.model_dump(exclude={"variant_id"}) for s in out.slow_movers],
    }


async def _reorder(db: AsyncSession, user: User, raw: dict[str, Any]) -> Any:
    args = ReorderIn.model_validate(raw)
    out = await forecasting.reorder_suggestions(db, user.org_id)
    today = datetime.now(await org_timezone(db, user.org_id)).date()
    items = out.items
    if args.urgency:
        items = [i for i in items if i.urgency == args.urgency]
    if args.runs_out_within_days is not None:
        items = [
            i
            for i in items
            if i.stockout_date and (i.stockout_date - today).days <= args.runs_out_within_days
        ]
    return {
        "today": today,
        "items": [
            i.model_dump(exclude={"variant_id", "product_id", "last_supplier_id"})
            for i in items[: args.limit]
        ],
        "total_matching": len(items),
    }


async def _stock_levels(db: AsyncSession, user: User, raw: dict[str, Any]) -> Any:
    args = StockIn.model_validate(raw)
    location_id = None
    if args.location_code:
        location_id = await db.scalar(
            select(Location.id).where(
                Location.org_id == user.org_id,
                func.upper(Location.code) == args.location_code.upper(),
            )
        )
        if location_id is None:
            return {"error": f"No location with code {args.location_code}"}
    rows, total = await inventory.list_stock(
        db,
        user.org_id,
        PageParams(page=1, size=args.limit),
        location_id=location_id,
        q=args.search,
        low_stock=args.low_stock_only,
    )
    return {
        "rows": [r.model_dump(exclude={"variant_id", "product_id", "location_id"}) for r in rows],
        "total_matching": total,
    }


async def _product_forecast(db: AsyncSession, user: User, raw: dict[str, Any]) -> Any:
    args = ForecastIn.model_validate(raw)
    variant_id = await db.scalar(
        select(ProductVariant.id).where(
            ProductVariant.org_id == user.org_id,
            func.lower(ProductVariant.sku) == args.sku.lower(),
        )
    )
    if variant_id is None:
        return {"error": f"No product with SKU {args.sku}"}
    out = await forecasting.variant_forecast(db, user.org_id, variant_id)
    history = [p for p in out.points if p.actual is not None]
    return {
        "product": f"{out.product_name} ({out.variant_name})",
        "sku": out.sku,
        "avg_daily_forecast_next_14_days": out.avg_daily_demand,
        "last_28_days_actual_total": sum(p.actual or 0 for p in history[-28:]),
        "forecast": [{"day": p.day, "units": p.forecast} for p in out.points if p.forecast],
        "backtest_wape": {"model": out.model_wape, "seasonal_naive": out.baseline_wape},
    }


async def _purchase_orders(db: AsyncSession, user: User, raw: dict[str, Any]) -> Any:
    args = PurchaseOrdersIn.model_validate(raw)
    pos, total = await procurement.list_pos(
        db, user.org_id, PageParams(page=1, size=args.limit), status=args.status
    )
    return {
        "purchase_orders": [
            {
                "number": f"PO-{po.number}",
                "supplier": po.supplier_name,
                "status": po.status.value,
                "expected_at": po.expected_at,
                "total_cost": po.total_cost,
                "lines": len(po.lines),
                "created_at": po.created_at,
            }
            for po in pos
        ],
        "total_matching": total,
    }


HANDLERS: dict[str, ToolFn] = {
    "get_sales_summary": _sales_summary,
    "get_top_products": _top_products,
    "get_inventory_health": _inventory_health,
    "get_reorder_suggestions": _reorder,
    "get_stock_levels": _stock_levels,
    "get_product_forecast": _product_forecast,
    "get_purchase_orders": _purchase_orders,
}
# Financial tools are limited to managers and owners, matching the REST API.
MANAGER_ONLY = {"get_sales_summary", "get_top_products", "get_inventory_health"}


async def run_tool(db: AsyncSession, user: User, name: str, raw: Any) -> tuple[str, bool]:
    """Execute one tool call. Returns (result text, is_error)."""
    handler = HANDLERS.get(name)
    if handler is None:
        return f"Unknown tool: {name}", True
    if name in MANAGER_ONLY and user.role.rank < Role.MANAGER.rank:
        return "This information is only available to managers and owners.", True
    if not isinstance(raw, dict):
        return "Tool input must be a JSON object.", True
    try:
        return _json(await handler(db, user, raw)), False
    except ValidationError as exc:
        return f"Invalid arguments: {exc.errors(include_url=False)}", True
    except AppError as exc:
        return f"Error: {exc.message}", True


# --- The tool-use loop -------------------------------------------------------------------


class AssistantUnavailable(AppError):
    status_code = 503
    code = "assistant_unavailable"


_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        if not settings.anthropic_api_key:
            raise AssistantUnavailable(
                "The AI assistant is not configured. Set ANTHROPIC_API_KEY on the server."
            )
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


async def ask(
    db: AsyncSession,
    user: User,
    question: str,
    client: anthropic.AsyncAnthropic | None = None,
) -> AskOut:
    client = client or get_client()
    org_id = user.org_id
    tz = await org_timezone(db, org_id)
    org = await db.get(Organization, org_id)
    context = (
        f"Today is {datetime.now(tz):%A %Y-%m-%d} (store timezone {tz.key}). "
        f"Store: {org.name if org else 'unknown'}, currency {org.currency if org else 'INR'}. "
        f"The user is a {user.role.value}."
    )
    messages: list[dict[str, Any]] = [
        {"role": "user", "content": f"{context}\n\nQuestion: {question}"}
    ]
    traces: list[ToolCallTrace] = []
    usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0}

    for _ in range(MAX_TOOL_ROUNDS + 1):
        try:
            # Plain dicts + echoed response blocks; the SDK validates at runtime.
            response = await client.beta.messages.create(  # type: ignore[call-overload]
                model=settings.assistant_model,
                max_tokens=16000,
                # Tools and system prompt are static, so this breakpoint caches both.
                system=[
                    {
                        "type": "text",
                        "text": SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                tools=TOOLS,
                messages=messages,
                output_config={"effort": "medium"},
                # If the primary model declines, retry server-side on a fallback model.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.RateLimitError as exc:
            raise AssistantUnavailable("The AI assistant is busy. Try again shortly.") from exc
        except anthropic.APIStatusError as exc:
            logger.warning("assistant API error %s: %s", exc.status_code, exc.message)
            raise AssistantUnavailable("The AI assistant is unavailable right now.") from exc
        except anthropic.APIConnectionError as exc:
            raise AssistantUnavailable("Could not reach the AI assistant.") from exc

        for key in usage:
            usage[key] += getattr(response.usage, key, 0) or 0

        if response.stop_reason == "refusal":
            return AskOut(
                answer="I can't help with that request. Try asking about sales, stock or orders.",
                tool_calls=traces,
                model=response.model,
                usage=usage,
            )
        if response.stop_reason == "pause_turn":
            messages.append({"role": "assistant", "content": response.content})
            continue
        if response.stop_reason != "tool_use":
            answer = "\n".join(b.text for b in response.content if b.type == "text").strip()
            if response.stop_reason == "max_tokens":
                answer += "\n\n_(answer truncated)_"
            return AskOut(
                answer=answer or "I couldn't find an answer to that.",
                tool_calls=traces,
                model=response.model,
                usage=usage,
            )

        messages.append({"role": "assistant", "content": response.content})
        results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            text, is_error = await run_tool(db, user, block.name, block.input)
            traces.append(ToolCallTrace(name=block.name, input=block.input, is_error=is_error))
            results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": text,
                    "is_error": is_error,
                }
            )
        # All results for one turn go back in a single user message.
        messages.append({"role": "user", "content": results})

    return AskOut(
        answer="That question needed more lookups than I'm allowed. Try narrowing it down.",
        tool_calls=traces,
        model=settings.assistant_model,
        usage=usage,
    )
