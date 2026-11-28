# StockPilot

**Multi-tenant inventory, point-of-sale, purchasing and demand-forecasting platform for small retailers.**

Small shops track stock in spreadsheets, oversell items they don't have, and reorder too late.
StockPilot gives each shop one place to run its catalog, stock across locations, sales and
purchasing. It forecasts demand per product and tells the owner what to reorder, how much,
and by when. Its guarantees matter in a real store: two cashiers can never sell the same last
unit, a retried checkout never double-charges stock, and every stock change is auditable.

`FastAPI` · `PostgreSQL` · `SQLAlchemy 2 (async)` · `Alembic` · `Redis` · `Celery` · `WebSockets` · `Google Gemini (function calling)` · `React + TypeScript` · `TanStack Query` · `Tailwind` · `Docker` · `GitHub Actions` · `Prometheus` · `Locust`

---

## Highlights

| | |
|---|---|
| **Concurrency-safe checkout** | Stock rows are locked with `SELECT … FOR UPDATE` in a deterministic order, so concurrent orders queue instead of overselling or deadlocking. Under load, 2,902 checkouts on one SKU at p95 38 ms left stock exact to the unit (see [load test](backend/loadtest/README.md)). |
| **Idempotent orders** | `Idempotency-Key` header + a unique `(org_id, key)` constraint: a double-clicked or retried checkout returns the original order, never a second one. |
| **Auditable stock ledger** | Every change (sale, refund, adjustment, transfer, delivery) appends to `stock_movements`. A Postgres trigger makes the ledger append-only, and `/inventory/reconcile` proves `on_hand == SUM(movements)`. |
| **Demand forecasting + reorder planner** | Per-SKU Holt damped-trend smoothing with weekly seasonality, backtested against a seasonal-naive baseline (WAPE). Feeds safety stock, stock-out dates and suggested order quantities; one click turns them into a purchase order. |
| **Transactional outbox + background jobs** | Domain events are written in the *same transaction* as the change that caused them. Celery workers drain the outbox with `FOR UPDATE SKIP LOCKED` and fan events out to webhooks, notifications and emails. Nothing is lost on a crash or invented on a rollback. |
| **Signed webhooks** | Stripe-style HMAC-SHA256 signatures with timestamps (replay protection), exponential-backoff retries, a delivery log with redelivery, and SSRF protection (https only, public addresses only, checked again at delivery time). |
| **Event-driven alerts** | Low-stock alerts fire when a variant's total stock *crosses* its reorder point, detected inside the stock transaction. They're de-duplicated, sent to managers in the app and by email, plus a morning digest. |
| **Purchasing** | Suppliers, purchase orders (draft → ordered → partially received → received), partial deliveries, and weighted-average costing so margins stay accurate. |
| **Analytics, net of refunds** | Revenue, gross margin, period-over-period change, ABC (Pareto) classes, genuine slow movers (> 45 days of cover), category mix, inventory turnover, all in the store's timezone. Partial refunds are reflected everywhere. |
| **Ask StockPilot (LLM)** | Natural-language questions answered by Google Gemini through seven read-only, tenant-scoped tools. No SQL generation; answers cite their tools; rate-limited. |
| **Real-time, multi-worker** | A WebSocket pushes stock, order, delivery and notification events to every open screen. Events are published after commit through Redis pub/sub, so it works across API worker processes. |
| **Integrations** | Per-tenant API keys (stored hashed, role-capped, rate-limited in Redis), CSV catalog import/export (validated, all-or-nothing, dry run), PDF invoices. |
| **Operable** | Request IDs end to end, JSON logs, Prometheus `/metrics` (latency per route template), health checks covering DB and Redis, CI on the real stack, one-click Render blueprint. |

## Architecture

```
React + TS (Vite, TanStack Query, Tailwind, Recharts, motion)
        │  REST (Bearer JWT or X-API-Key)         WebSocket /api/v1/ws (live events)
        ▼                                         ▲
FastAPI (N workers) ─────────── Redis ──────────── pub/sub fan-out to every API worker
   │  routers: auth · users · catalog · inventory · sales · purchasing · insights
   │           reports · assistant · notifications · integrations · realtime
   │  services/  business rules, locking, idempotency, forecasting, analytics, assistant
   │  core/      security, RBAC, errors, events (outbox + live), limiter, observability
   │
   ├── PostgreSQL 16 ── outbox_events ──► Celery worker (Redis broker) ──► webhooks (HMAC)
   │   (row locks, constraints,           ▲  process outbox (SKIP LOCKED)   notifications
   │    ledger trigger)                   │  retry due deliveries           emails (SMTP)
   │                                      └─ Celery beat: outbox sweep · retries · daily digest
   └── Gemini API (optional, function calling)
```

### Data model (core)

```
organizations ─┬─ users (role) ── notifications
               ├─ categories ── products ── product_variants (SKU, barcode, price, weighted-avg cost, reorder point)
               ├─ locations
               ├─ stock_levels (variant × location)       ← projection, CHECK on_hand >= 0
               ├─ stock_movements (append-only ledger)
               ├─ sales_orders (idempotency_key, refunded_amount) ── sales_order_lines (price/cost snapshot, refunded_qty)
               ├─ suppliers ── purchase_orders ── purchase_order_lines (ordered / received)
               ├─ outbox_events (written in the same transaction as the change)
               ├─ webhook_endpoints ── webhook_deliveries (attempts, status, next_attempt_at)
               └─ api_keys (sha256 hash, role cap)
```

### How a checkout stays correct

1. Take the next per-tenant order number (`UPDATE organizations SET order_seq = order_seq + 1 … RETURNING`) and insert the order. This claims the idempotency key; a concurrent duplicate blocks on the unique index, then replays the winner's order.
2. `INSERT … ON CONFLICT DO NOTHING` ensures a stock row exists for each SKU, so there is always a row to lock.
3. `SELECT … FOR UPDATE ORDER BY variant_id, location_id` locks the rows. The fixed order prevents deadlocks.
4. Check availability for **all** lines. Any shortfall raises a 409 and the whole transaction rolls back.
5. Decrement `stock_levels`, append ledger rows, detect reorder-point crossings, add outbox events, commit. Then publish the live events.

### How events leave the system (transactional outbox)

```
API transaction:  UPDATE stock … ; INSERT stock_movements … ; INSERT outbox_events …  COMMIT
                                                                                  │
after commit ─► Redis pub/sub ─► every API worker ─► WebSocket clients (live UI)  │
             └─► kick Celery ──► worker: SELECT … FROM outbox_events WHERE processed_at IS NULL
                                         FOR UPDATE SKIP LOCKED  (many workers, no double work)
                                 ├─► webhook_deliveries ─► POST signed JSON, retry 10s/1m/5m/30m/2h
                                 ├─► notifications (stock.low, de-duplicated for 12h)
                                 └─► emails (SMTP; logged in dev)
```

Measured locally end to end: sale committed → both subscribed webhooks received and signature-verified in **0.29 s**.

### How the reorder planner works

For each active SKU, using the last 56 days of sales (today excluded, because it is incomplete):

| Step | Formula |
|---|---|
| Weekly pattern | weekday factor = mean(demand on that weekday) / mean(demand) |
| Forecast | Holt's damped-trend smoothing on deseasonalised demand (α 0.25, β 0.05, φ 0.9), re-seasonalised |
| Safety stock | z × σ(daily demand, last 28 days) × √lead time, with z = 1.65 (95% service level) |
| Target | forecast demand over (lead time + 7-day review period) + safety stock (never below the reorder point) |
| Suggested qty | target − available − already on order |
| Urgency | *critical* when stock runs out before a new order could arrive |

Accuracy is measured on a 14-day holdout with **WAPE** (Σ\|error\| / Σ actual), which, unlike MAPE, is defined on zero-sales days. It is compared with a seasonal-naive baseline ("same weekday last week"). On the seeded demo data the model's error is consistently **~9–12% lower** than the baseline (e.g. 44.1% vs 48.5% WAPE; it shifts slightly as the window moves day to day). In the unit tests, on synthetic noisy seasonal data, it is at least 15% lower. Demand is net of refunds, and the lead time comes from each SKU's most recent supplier.

### How Ask StockPilot stays safe

- Gemini can call only seven tools (sales summary, top products, inventory health, reorder suggestions, stock levels, product forecast, purchase orders). Each wraps an existing service, and its arguments are validated with Pydantic before touching the database.
- The organization comes from the authenticated user on the server, never from the model. Financial tools are restricted to managers and owners, matching the REST API.
- The loop is bounded to 6 tool rounds. Unknown tools and bad arguments go back to the model as tool errors, and safety blocks are handled.
- The system instruction and tool declarations are an identical prefix on every request (eligible for Gemini's implicit caching); today's date goes in the user turn.
- The SDK retries 429/503 ("model overloaded") with exponential backoff, and each attempt has a timeout.
- Model choice was measured, not guessed: `gemini-3.5-flash-lite` answered the demo questions with correct (often parallel) tool calls in ~2–4 s, while larger models took 10–100 s or were overloaded. It's configurable with `GEMINI_MODEL`.
- Tests drive the loop with a scripted fake Gemini built from the SDK's real response types, so CI needs no API key.

### Performance

From the [load test](backend/loadtest/README.md): 100 concurrent users, 4 API workers on a laptop.

| | p50 | p95 | p99 |
|---|---:|---:|---:|
| Checkout (all on one SKU) | 16 ms | 38 ms | 85 ms |
| POS search | 4 ms | 8 ms | 41 ms |
| All 7,153 requests (0 failures) | 6 ms | 31 ms | 67 ms |

The throughput ceiling is about 125 checkouts/s *per shop*, because checkouts within one tenant are serialized by design (stock row lock + gapless order numbers). That is more than 100× what a busy small shop needs; the README in `loadtest/` explains the tradeoff.

## Features

- **Auth & team**: register an organization, JWT access and refresh tokens, roles, add staff and managers
- **Catalog**: products with variants, SKUs, barcodes, categories, search, CSV import/export
- **Inventory**: multiple locations, stock view, adjustments, write-offs, transfers, movement history, reconciliation
- **Point of sale**: barcode or camera scan, cart, idempotent checkout, discounts (managers only), receipts and PDF invoices
- **Refunds**: full or partial per line, discount-aware amounts, restocking, net-of-refund reporting
- **Purchasing**: suppliers with lead times, PO lifecycle, partial receiving, weighted-average cost, POs drafted from suggestions
- **Insights**: reorder planner, per-SKU forecast chart, analytics (margin, ABC, slow movers, turnover)
- **Notifications**: in-app bell, low-stock alerts, daily email digest
- **Integrations**: API keys, signed webhooks with delivery logs
- **Ask StockPilot**: natural-language Q&A over the store's own data
- **Live updates**: stock, sales, deliveries and alerts appear on every open screen without reloading

### Roadmap

- [ ] Per-location order sequences, to lift the single-tenant checkout ceiling
- [ ] Barcode label printing; supplier email for purchase orders

## Running locally

### Without Docker (recommended for development)

Requirements: Python 3.12+, Node 22+, PostgreSQL 16. Redis 7+ is optional: you need it for background jobs (alerts, webhooks, digest) and multi-worker live updates. On macOS: `brew install redis`.

**1. Backend API** (terminal 1)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql+asyncpg://<your-user>@localhost:5432/stockpilot
#   GEMINI_API_KEY=...            (optional: enables Ask StockPilot)
#   REDIS_URL=redis://localhost:6379/0   (optional: background jobs)
createdb stockpilot
alembic upgrade head
python -m app.scripts.seed          # demo shop with 90 days of history (use --reset to rebuild)
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

**2. Background jobs** (optional; terminals 2 and 3, needs Redis running: `redis-server`)

```bash
cd backend && source .venv/bin/activate
celery -A app.worker worker --loglevel=info     # terminal 2: outbox, webhooks, emails
celery -A app.worker beat --loglevel=info       # terminal 3: periodic sweeps + daily digest
```

Without SMTP settings, emails are printed in the worker's log.

**3. Frontend** (another terminal)

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173. The dev server proxies `/api`, including the WebSocket, to port 8000.

**Demo login:** `demo@stockpilot.app` / `demo-password` (or use "Try the live demo" on the login page)

### With Docker

Docker Compose reads secrets from a `.env` file in the **project root** (not `backend/.env`).
To enable Ask StockPilot:

```bash
echo "GEMINI_API_KEY=your-key" > .env     # git-ignored
```

```bash
docker compose up --build
docker compose exec backend python -m app.scripts.seed
```

- App: http://localhost:8080
- API: http://localhost:8000/docs
- Email inbox (Mailpit): http://localhost:8025

This starts Postgres, Redis, the API (2 workers), a Celery worker, Celery beat, Mailpit and nginx serving the SPA.

### Deploying (free)

**Live demo:** _add your Vercel URL here after deploying_

The whole stack deploys for **$0, with no credit card**: Vercel (frontend), Render's free
web service (API + Celery in one container), Neon (Postgres) and Render Key Value (Redis).
[`DEPLOY.md`](DEPLOY.md) is a step-by-step guide (about 30 minutes), and `render.yaml` is
the Render Blueprint.

### Tests and checks

```bash
cd backend
createdb stockpilot_test
TEST_DATABASE_URL=postgresql+asyncpg://<your-user>@localhost:5432/stockpilot_test \
TEST_REDIS_URL=redis://localhost:6379/15 \
pytest -q                       # Redis tests are skipped when TEST_REDIS_URL is unset
ruff check . && mypy app && alembic check

cd ../frontend
npm run lint && npm run build
```

The 71 backend tests run against real PostgreSQL, because row locking, constraints and the ledger trigger can't be faked with SQLite. They cover auth, tenant isolation, RBAC, idempotency, concurrency races, refunds, purchasing, forecasting, analytics, the outbox, webhook signing and retries, API keys, CSV import, the assistant's tool loop with a fake Gemini, and multi-worker Redis behaviour. CI runs them on Python 3.12 with Postgres and Redis services.

## API overview

All endpoints are under `/api/v1`. Full interactive docs are at `/docs`. Authenticate with `Authorization: Bearer <access token>` or `X-API-Key: sp_…`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` |
| Team | `GET/POST /users` · `PATCH /users/{id}` |
| Catalog | `/catalog/categories` · `/catalog/products` · `GET /catalog/products/export.csv` · `POST /catalog/products/import` · `/catalog/products/{id}/variants` · `GET /catalog/variants/search` |
| Inventory | `/inventory/locations` · `GET /inventory/stock` · `POST /inventory/adjustments` · `POST /inventory/transfers` · `GET /inventory/movements` · `GET /inventory/reconcile` |
| Sales | `POST/GET /sales/orders` · `GET /sales/orders/{id}` · `POST /sales/orders/{id}/refund` · `GET /sales/orders/{id}/invoice.pdf` |
| Purchasing | `/purchasing/suppliers` · `/purchasing/orders` · `…/submit` · `…/cancel` · `…/receive` · `POST /purchasing/orders/from-suggestions` |
| Insights | `GET /insights/reorder-suggestions` · `GET /insights/forecast/{variant_id}` · `GET /insights/analytics` |
| Reports | `GET /reports/summary` |
| Notifications | `GET /notifications` · `POST /notifications/{id}/read` · `POST /notifications/read-all` |
| Integrations | `/integrations/api-keys` · `/integrations/webhooks` · `…/test` · `…/rotate-secret` · `…/deliveries` · `POST /integrations/deliveries/{id}/redeliver` |
| Assistant | `POST /assistant/ask` |
| Real-time | `WS /ws` (send `{"type":"auth","token":…}` first) |
| Ops | `GET /health` · `GET /metrics` |

Webhook requests carry `X-StockPilot-Event`, `X-StockPilot-Delivery` (de-duplication id) and `X-StockPilot-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`. Receivers should verify the signature and reject timestamps older than 5 minutes.

Every error has the same shape:

```json
{ "error": { "code": "insufficient_stock", "message": "Not enough stock to complete this operation",
             "details": [{ "variant_id": "…", "location_id": "…", "requested": 3, "available": 1 }] } }
```
