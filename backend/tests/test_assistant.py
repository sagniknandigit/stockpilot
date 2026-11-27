"""The assistant's function-calling loop, tested with a scripted fake Gemini.

Responses are built from the SDK's real response types, so `.function_calls`,
`.candidates` and usage metadata behave exactly as they do against the live API.
No network, no API key, no cost.
"""

import json
from types import SimpleNamespace
from typing import Any
from uuid import UUID

from google.genai import types
from httpx import AsyncClient

from app.core.database import SessionLocal
from app.models import User
from app.services import assistant
from tests.conftest import Tenant, add_member, create_product, register, stock_in

MODEL = "gemini-3.5-flash-lite"


def _usage() -> types.GenerateContentResponseUsageMetadata:
    return types.GenerateContentResponseUsageMetadata(
        prompt_token_count=100, candidates_token_count=20
    )


def call(name: str, args: dict[str, Any], id_: str = "call_1") -> types.GenerateContentResponse:
    return types.GenerateContentResponse(
        candidates=[
            types.Candidate(
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part(function_call=types.FunctionCall(id=id_, name=name, args=args))
                    ],
                ),
                finish_reason=types.FinishReason.STOP,
            )
        ],
        usage_metadata=_usage(),
    )


def final(
    text: str, finish: types.FinishReason = types.FinishReason.STOP
) -> types.GenerateContentResponse:
    return types.GenerateContentResponse(
        candidates=[
            types.Candidate(
                content=types.Content(role="model", parts=[types.Part(text=text)]),
                finish_reason=finish,
            )
        ],
        usage_metadata=_usage(),
    )


class FakeGemini:
    """Mimics `client.aio.models.generate_content`, recording every request."""

    def __init__(self, *responses: types.GenerateContentResponse) -> None:
        self.responses = list(responses)
        self.requests: list[dict[str, Any]] = []
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._generate))

    async def _generate(
        self, *, model: str, contents: list[types.Content], config: Any
    ) -> types.GenerateContentResponse:
        self.requests.append({"model": model, "contents": list(contents), "config": config})
        return self.responses.pop(0)


async def _user(tenant: Tenant) -> User:
    async with SessionLocal() as db:
        user = await db.get(User, UUID(tenant.user["id"]))
        assert user is not None
        return user


async def _ask(tenant: Tenant, fake: FakeGemini, question: str = "q") -> Any:
    user = await _user(tenant)
    async with SessionLocal() as db:
        return await assistant.ask(db, user, question, client=fake)  # type: ignore[arg-type]


def _function_responses(request: dict[str, Any]) -> list[types.FunctionResponse]:
    last = request["contents"][-1]
    return [p.function_response for p in last.parts if p.function_response]


async def test_tool_loop_answers_from_live_data(client: AsyncClient, owner: Tenant) -> None:
    variant = (await create_product(client, owner, sku="MILK-1", name="Milk"))["variants"][0]
    await stock_in(client, owner, variant["id"], 12)
    fake = FakeGemini(
        call("get_stock_levels", {"search": "milk"}),
        final("You have **12** units of Milk."),
    )

    out = await _ask(owner, fake, "How much milk do we have?")

    assert out.answer == "You have **12** units of Milk."
    assert [(t.name, t.is_error) for t in out.tool_calls] == [("get_stock_levels", False)]
    assert out.usage["input_tokens"] == 200
    # The function response sent back to Gemini contains the real stock row.
    response = _function_responses(fake.requests[1])[0]
    assert response.id == "call_1" and response.name == "get_stock_levels"
    data = json.loads(response.response["result"])  # type: ignore[index]
    assert data["rows"][0]["sku"] == "MILK-1" and data["rows"][0]["on_hand"] == 12
    # The model turn is echoed back unchanged before the results.
    assert fake.requests[1]["contents"][1].parts[0].function_call.name == "get_stock_levels"
    # Static system instruction + declared tools; today's date lives in the user turn.
    config = fake.requests[0]["config"]
    assert config.system_instruction == assistant.SYSTEM_PROMPT
    declared = {f.name for f in config.tools[0].function_declarations}
    assert declared == set(assistant.HANDLERS)
    assert config.automatic_function_calling.disable is True
    assert "Today is" in fake.requests[0]["contents"][0].parts[0].text
    assert fake.requests[0]["model"] == MODEL


async def test_parallel_calls_return_together(client: AsyncClient, owner: Tenant) -> None:
    both = types.GenerateContentResponse(
        candidates=[
            types.Candidate(
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part(
                            function_call=types.FunctionCall(
                                id="a", name="get_purchase_orders", args={}
                            )
                        ),
                        types.Part(
                            function_call=types.FunctionCall(
                                id="b", name="get_stock_levels", args={}
                            )
                        ),
                    ],
                ),
                finish_reason=types.FinishReason.STOP,
            )
        ]
    )
    fake = FakeGemini(both, final("Done."))
    out = await _ask(owner, fake)
    assert [t.name for t in out.tool_calls] == ["get_purchase_orders", "get_stock_levels"]
    assert [r.id for r in _function_responses(fake.requests[1])] == ["a", "b"]


async def test_tools_are_tenant_scoped(client: AsyncClient, owner: Tenant) -> None:
    await create_product(client, owner, sku="SECRET-1")
    rival = await register(client, org="Rival")
    fake = FakeGemini(call("get_product_forecast", {"sku": "SECRET-1"}), final("Not found."))
    await _ask(rival, fake)
    result = _function_responses(fake.requests[1])[0].response
    assert "No product with SKU SECRET-1" in result["result"]  # type: ignore[index]


async def test_bad_tool_calls_are_reported_to_the_model(client: AsyncClient, owner: Tenant) -> None:
    fake = FakeGemini(
        call("drop_tables", {}, id_="a"),
        call("get_top_products", {"sort_by": "'; DROP TABLE users;--"}, id_="b"),
        final("Sorry."),
    )
    out = await _ask(owner, fake)
    assert [t.is_error for t in out.tool_calls] == [True, True]
    assert "Unknown tool" in _function_responses(fake.requests[1])[0].response["error"]  # type: ignore[index]
    assert "Invalid arguments" in _function_responses(fake.requests[2])[0].response["error"]  # type: ignore[index]


async def test_staff_cannot_use_financial_tools(client: AsyncClient, owner: Tenant) -> None:
    staff_headers = await add_member(client, owner, "staff")
    me = (await client.get("/api/v1/auth/me", headers=staff_headers)).json()
    staff = Tenant(staff_headers, me["user"], me["organization"], owner.location_id)
    fake = FakeGemini(call("get_sales_summary", {}), final("Restricted."))
    out = await _ask(staff, fake)
    assert out.tool_calls[0].is_error
    error = _function_responses(fake.requests[1])[0].response["error"]  # type: ignore[index]
    assert "only available to managers" in error


async def test_blocked_and_truncated_answers(client: AsyncClient, owner: Tenant) -> None:
    blocked = await _ask(owner, FakeGemini(final("", types.FinishReason.SAFETY)))
    assert "can't help" in blocked.answer
    cut = await _ask(owner, FakeGemini(final("Partial", types.FinishReason.MAX_TOKENS)))
    assert cut.answer.startswith("Partial") and "truncated" in cut.answer


async def test_loop_is_bounded(client: AsyncClient, owner: Tenant) -> None:
    fake = FakeGemini(*[call("get_purchase_orders", {}) for _ in range(10)])
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
    assert statuses[:10] == [503] * 10  # GEMINI_API_KEY is blank in tests
    assert statuses[10] == 429
