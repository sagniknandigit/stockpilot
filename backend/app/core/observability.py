"""Request IDs, structured logs and Prometheus metrics."""

import json
import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar

from fastapi import FastAPI, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from app.core.config import settings

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

HTTP_REQUESTS = Counter(
    "stockpilot_http_requests_total", "HTTP requests", ["method", "route", "status"]
)
HTTP_LATENCY = Histogram(
    "stockpilot_http_request_duration_seconds",
    "HTTP request latency",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
ORDERS_CREATED = Counter("stockpilot_orders_created_total", "Sales orders created")
ASSISTANT_LATENCY = Histogram(
    "stockpilot_assistant_seconds",
    "Ask StockPilot end-to-end latency",
    buckets=(0.5, 1, 2, 4, 8, 15, 30, 60),
)


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry)


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.addFilter(_RequestIdFilter())
    handler.setFormatter(
        _JsonFormatter()
        if settings.log_json
        else logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s")
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


def _route_template(request: Request) -> str:
    """Label metrics by route template (/orders/{order_id}), never raw paths (cardinality).

    The router records the matched route in the ASGI scope; read it after the call.
    """
    route = request.scope.get("route")
    template = getattr(route, "path", None)
    if not isinstance(template, str):
        return "unmatched"
    # Routes inside included routers know only their path relative to that router
    # (e.g. "/catalog/products/{product_id}"). Recover the mount prefix ("/api/v1") by
    # filling the template with this request's params and stripping it from the path.
    path: str = request.scope.get("path", "")
    try:
        concrete = template.format(**request.scope.get("path_params", {}))
    except (KeyError, IndexError, ValueError):
        return template
    if path.endswith(concrete):
        return path[: len(path) - len(concrete)] + template
    return template


def install(app: FastAPI) -> None:
    @app.middleware("http")
    async def observe(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex
        token = request_id_var.set(rid[:64])
        started = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["X-Request-ID"] = rid[:64]
            return response
        finally:
            elapsed = time.perf_counter() - started
            route = _route_template(request)
            if route not in ("/metrics", "/health"):
                HTTP_REQUESTS.labels(request.method, route, str(status)).inc()
                HTTP_LATENCY.labels(request.method, route).observe(elapsed)
            request_id_var.reset(token)

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        # Expose only on the internal network in production (e.g. via the reverse proxy).
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
