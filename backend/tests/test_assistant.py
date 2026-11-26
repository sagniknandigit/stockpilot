"""The assistant's tool loop, tested with a scripted fake Claude (no network, no cost)."""

import json
from types import SimpleNamespace
from typing import Any
from uuid import UUID

from httpx import AsyncClient

from app.core.database import SessionLocal
from app.models import User
from app.services import assistant
from tests.conftest import Tenant, add_member, create_product, register, stock_in


def _usage() -> SimpleNamespace:
    return SimpleNamespace(input_tokens=100, output_tokens=20, cache_read_input_tokens=0)


def tool_use(name: str, args: dict[str, Any], id_: str = "toolu_1") -> SimpleNamespace:
    return SimpleNamespace(
        stop_reason="tool_use",
        model="claude-opus-5-5",
        usage=_usage(),
        content=[SimpleNamespace(type="tool_use", id=id_, name=name, input=args)],
    )


def final(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        stop_reason="end_turn",
        model="claude-opus-5-5",
        usage=_usage(),
        content=[SimpleNamespace(type="text", text=text)],
    )


class FakeClaude:
    """Returns scripted responses and records every request it receives."""

    def __init__(self, *responses: SimpleNamespace) -> None:
        self.responses = list(responses)
        self.requests: list[dict[str, Any]] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs: Any) -> SimpleNamespace:
        self.requests.append(json.loads(json.dumps(kwargs, default=lambda o: o.__dict__)))
        return self.responses.pop(0)


async def _user(tenant: Tenant) -> User:
    async with SessionLocal() as db:
        user = await db.get(User, UUID(tenant.user["id"]))
        assert user is not None
        return user


async def _ask(tenant: Tenant, fake: FakeClaude, question: str = "q") -> Any:
    user = await _user(tenant)
    async with SessionLocal() as db:
        return await assistant.ask(db, user, question, client=fake)  # type: ignore[arg-type]


def _tool_results(request: dict[str, Any]) -> list[dict[str, Any]]:
    return request["messages"][-1]["content"]


async def test_tool_loop_answers_from_live_data(client: AsyncClient, owner: Tenant) -> None:
    variant = (await create_product(client, owner, sku="MILK-1", name="Milk"))["variants"][0]
    await stock_in(client, owner, variant["id"], 12)
    fake = FakeClaude(
        tool_use("get_stock_levels", {"search": "milk"}),
        final("You have **12** units of Milk."),
    )

    out = await _ask(owner, fake, "How much milk do we have?")

    assert out.answer == "You have **12** units of Milk."
    assert [(t.name, t.is_error) for t in out.tool_calls] == [("get_stock_levels", False)]
    assert out.usage["input_tokens"] == 200
    # The tool result sent back to Claude contains the real stock row.
    result = _tool_results(fake.requests[1])[0]
    data = json.loads(result["content"])
    assert data["rows"][0]["sku"] == "MILK-1" and data["rows"][0]["on_hand"] == 12
    # Static system prompt carries the cache breakpoint; today's date is in the user turn.
    first = fake.requests[0]
    assert first["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "Today is" in first["messages"][0]["content"]
    assert first["model"] == "claude-opus-5-5"


async def test_tools_are_tenant_scoped(client: AsyncClient, owner: Tenant) -> None:
    await create_product(client, owner, sku="SECRET-1")
    rival = await register(client, org="Rival")
    fake = FakeClaude(
        tool_use("get_product_forecast", {"sku": "SECRET-1"}),
        final("Not found."),
    )
    await _ask(rival, fake)
    result = _tool_results(fake.requests[1])[0]
    assert "No product with SKU SECRET-1" in result["content"]


async def test_bad_tool_calls_are_reported_to_the_model(client: AsyncClient, owner: Tenant) -> None:
    fake = FakeClaude(
        tool_use("drop_tables", {}, id_="a"),
        tool_use("get_top_products", {"sort_by": "'; DROP TABLE users;--"}, id_="b"),
        final("Sorry."),
    )
    out = await _ask(owner, fake)
    assert [t.is_error for t in out.tool_calls] == [True, True]
    assert "Unknown tool" in _tool_results(fake.requests[1])[0]["content"]
    assert "Invalid arguments" in _tool_results(fake.requests[2])[0]["content"]


async def test_staff_cannot_use_financial_tools(client: AsyncClient, owner: Tenant) -> None:
    staff_headers = await add_member(client, owner, "staff")
    me = (await client.get("/api/v1/auth/me", headers=staff_headers)).json()
    staff = Tenant(staff_headers, me["user"], me["organization"], owner.location_id)
    fake = FakeClaude(tool_use("get_sales_summary", {}), final("Restricted."))
    out = await _ask(staff, fake)
    assert out.tool_calls[0].is_error
    assert "only available to managers" in _tool_results(fake.requests[1])[0]["content"]


async def test_loop_is_bounded(client: AsyncClient, owner: Tenant) -> None:
    fake = FakeClaude(*[tool_use("get_purchase_orders", {}) for _ in range(10)])
    out = await _ask(owner, fake)
    assert len(fake.requests) == assistant.MAX_TOOL_ROUNDS + 1
    assert "more lookups" in out.answer


async def test_endpoint_without_api_key_and_rate_limit(client: AsyncClient, owner: Tenant) -> None:
    statuses = []
    for _ in range(11):
        resp = await client.post(
            "/api/v1/assistant/ask", headers=owner.headers, json={"question": "How are sales?"}
        )
        statuses.append(resp.status_code)
    assert statuses[:10] == [503] * 10  # assistant not configured in tests
    assert statuses[10] == 429
