# Load test results

Locust, run locally against `uvicorn --workers 4` + PostgreSQL 16 + Redis 8 on an Apple
Silicon laptop (MacBook Air). The load generator ran on the same machine, so these are
conservative numbers.

## 1. Realistic shop traffic: 100 concurrent users, 60 s

Cashiers (6 of 7 users) scan an item and check out with an `Idempotency-Key`, with
0.5–2 s of think time. Managers browse stock, the dashboard, analytics and the reorder
planner. **Every checkout hits the same SKU row**, the worst case for lock contention.

| Endpoint | Requests | Failures | p50 | p95 | p99 |
|---|---:|---:|---:|---:|---:|
| Checkout (POST /sales/orders) | 2,902 | 0 | 16 ms | 38 ms | 85 ms |
| POS search | 3,931 | 0 | 4 ms | 8 ms | 41 ms |
| Stock list | 148 | 0 | 8 ms | 15 ms | 64 ms |
| Dashboard | 84 | 0 | 15 ms | 38 ms | 84 ms |
| Reorder planner (forecasts 28 SKUs) | 51 | 0 | 29 ms | 38 ms | 72 ms |
| Analytics (30 days) | 37 | 0 | 58 ms | 100 ms | 100 ms |
| **All** | **7,153** | **0** | **6 ms** | **31 ms** | **67 ms** |

## 2. Throughput ceiling: checkouts only, no think time, 50 users, 30 s

| | |
|---|---|
| Checkouts | 3,713, 0 failures |
| Throughput | **~125 checkouts/s** on a single hot SKU |
| Latency at saturation | p50 260 ms, p95 950 ms |

## Correctness after both runs

- `on_hand` = 1,000,000 − units sold, exactly (994,245 and 992,505).
- `GET /inventory/reconcile`: 0 mismatches between stock levels and the ledger.
- 0 duplicate and 0 missing per-tenant order numbers (`SO-1…SO-n` gapless).

## Why the ceiling is ~125/s, and why that's fine

A checkout briefly holds two row locks: the SKU's stock row (`SELECT … FOR UPDATE`) and
the tenant's order counter (gapless `SO-n` numbers). Within one shop, checkouts are
therefore serial (about 8 ms each), so throughput doesn't grow with more API workers.
Different shops don't contend at all.

A busy small shop with 10 tills, each ringing up a sale every 10 s, needs about 1
checkout/s: over 100× headroom. If a single tenant ever needed more, the options are
per-location number sequences, or a non-gapless `SEQUENCE` with invoice numbers assigned
asynchronously.

## Re-running

```bash
uvicorn app.main:app --port 8002 --workers 4
locust -f loadtest/locustfile.py --host http://localhost:8002 --headless -u 100 -r 20 -t 60s
STRESS=1 locust -f loadtest/locustfile.py --host http://localhost:8002 --headless -u 50 -r 50 -t 30s
python -m app.scripts.seed --reset   # the test adds orders to the demo shop
```
