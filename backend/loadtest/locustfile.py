"""Load test: a busy multi-till shop.

    # API with several workers (Redis required for shared live events + rate limits):
    uvicorn app.main:app --port 8002 --workers 4
    locust -f loadtest/locustfile.py --host http://localhost:8002 \\
        --headless -u 100 -r 20 -t 60s --csv loadtest/results/run
    STRESS=1 locust ... -u 50 -r 50 -t 30s     # throughput ceiling, checkouts only

Uses the seeded demo tenant (python -m app.scripts.seed). A dedicated SKU with a huge
stock is created at start so checkouts measure the write path, not "out of stock".
Afterwards, check that stock still reconciles: GET /api/v1/inventory/reconcile.
"""

import os
import random
import uuid
from typing import Any

import httpx
from locust import HttpUser, between, constant, events, task

EMAIL, PASSWORD = "demo@stockpilot.app", "demo-password"
STATE: dict[str, Any] = {}
INITIAL_STOCK = 1_000_000
# STRESS=1: no think time, checkouts only, to find the throughput ceiling.
STRESS = os.environ.get("STRESS") == "1"


@events.test_start.add_listener
def setup(environment: Any, **_: Any) -> None:
    base = f"{environment.host}/api/v1"
    with httpx.Client(timeout=30) as client:
        login = client.post(f"{base}/auth/login", json={"email": EMAIL, "password": PASSWORD})
        login.raise_for_status()
        headers = {"Authorization": f"Bearer {login.json()['tokens']['access_token']}"}
        location = client.get(f"{base}/inventory/locations", headers=headers).json()[0]["id"]
        sku = f"LOAD-{uuid.uuid4().hex[:6].upper()}"
        product = client.post(
            f"{base}/catalog/products",
            headers=headers,
            json={"name": "Load Test Water", "variants": [{"sku": sku, "price": "20"}]},
        ).json()
        variant_id = product["variants"][0]["id"]
        client.post(
            f"{base}/inventory/adjustments",
            headers=headers,
            json={"variant_id": variant_id, "location_id": location, "quantity": INITIAL_STOCK},
        ).raise_for_status()
    STATE.update(headers=headers, location=location, variant_id=variant_id, sku=sku)


class Cashier(HttpUser):
    """Scans an item, then checks out (idempotent). Most traffic in a shop."""

    weight = 6
    wait_time = constant(0) if STRESS else between(0.5, 2)

    @task(3)
    def scan_and_checkout(self) -> None:
        self.client.get(
            "/api/v1/catalog/variants/search",
            params={"location_id": STATE["location"], "q": STATE["sku"]},
            headers=STATE["headers"],
            name="POS search",
        )
        with self.client.post(
            "/api/v1/sales/orders",
            json={
                "location_id": STATE["location"],
                "lines": [{"variant_id": STATE["variant_id"], "quantity": random.randint(1, 3)}],
            },
            headers={**STATE["headers"], "Idempotency-Key": uuid.uuid4().hex},
            name="Checkout",
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"checkout returned {resp.status_code}")

    @task(0 if STRESS else 1)
    def browse(self) -> None:
        self.client.get(
            "/api/v1/catalog/variants/search",
            params={"location_id": STATE["location"], "q": random.choice(["milk", "tea", "bar"])},
            headers=STATE["headers"],
            name="POS search",
        )


class Manager(HttpUser):
    """Back-office reads: stock list, dashboard, analytics, reorder planner."""

    weight = 0 if STRESS else 1
    wait_time = between(1, 4)

    @task(3)
    def stock(self) -> None:
        self.client.get("/api/v1/inventory/stock", headers=STATE["headers"], name="Stock list")

    @task(2)
    def dashboard(self) -> None:
        self.client.get("/api/v1/reports/summary", headers=STATE["headers"], name="Dashboard")

    @task(1)
    def analytics(self) -> None:
        self.client.get("/api/v1/insights/analytics", headers=STATE["headers"], name="Analytics")

    @task(1)
    def planner(self) -> None:
        self.client.get(
            "/api/v1/insights/reorder-suggestions", headers=STATE["headers"], name="Reorder planner"
        )
