# StockPilot

**Multi-tenant inventory, point-of-sale, purchasing and demand-forecasting platform for small retailers.**

Small shops track stock in spreadsheets, oversell items they don't have, and reorder too late.
StockPilot gives each shop one place to run its catalog, stock across locations, sales and
purchasing. It forecasts demand per product and tells the owner what to reorder, how much,
and by when. Its guarantees matter in a real store: two cashiers can never sell the same last
unit, a retried checkout never double-charges stock, and every stock change is auditable.

`FastAPI` · `PostgreSQL` · `SQLAlchemy 2 (async)` · `Alembic` · `WebSockets` · `Claude API (tool use)` · `React + TypeScript` · `TanStack Query` · `Tailwind` · `Docker` · `GitHub Actions`

---

## Highlights

| | |
|---|---|
| **Concurrency-safe checkout** | Stock rows are locked with `SELECT … FOR UPDATE` in a deterministic order, so concurrent orders queue instead of overselling or deadlocking. Tests fire 30 simultaneous checkouts at 10 units of stock: exactly 10 succeed. |
| **Idempotent orders** | `Idempotency-Key` header + a unique `(org_id, key)` constraint: a double-clicked or retried checkout returns the original order, never a second one. |
| **Auditable stock ledger** | Every change (sale, refund, adjustment, transfer, delivery) appends to `stock_movements`. A Postgres trigger makes the ledger append-only, and `/inventory/reconcile` proves `on_hand == SUM(movements)`. |
| **Demand forecasting + reorder planner** | Per-SKU Holt damped-trend smoothing with weekly seasonality, backtested against a seasonal-naive baseline (WAPE). Feeds safety stock, stock-out dates and suggested order quantities; one click turns them into a purchase order. |
| **Purchasing** | Suppliers, purchase orders (draft → ordered → partially received → received), partial deliveries, and weighted-average costing so margins stay accurate. |
| **Analytics** | Revenue, gross margin, period-over-period change, ABC (Pareto) classification, slow movers, category mix, inventory turnover and days of inventory, all in the store's local timezone. |
| **Ask StockPilot (LLM)** | Natural-language questions answered by Claude through a fixed set of read-only, tenant-scoped tools. No SQL generation. Answers cite which tools were used, and the endpoint is rate-limited per user. |
| **Real-time** | A WebSocket pushes stock, order and delivery events to every open screen in the shop. Events are published only **after** the database commits, so a rolled-back sale is never broadcast. |
| **Multi-tenancy + RBAC** | Every row is scoped by `org_id`, and every referenced id is checked against the caller's org. Roles: owner > manager > staff. Order and PO numbers are gapless per-tenant sequences. |

## Architecture

```
React + TS (Vite, TanStack Query, Tailwind, Recharts)
        │  REST (JSON, Bearer JWT)            WebSocket /api/v1/ws (live events)
        ▼                                     ▲
FastAPI ── api/v1 routers: auth · users · catalog · inventory · sales · purchasing
        │                  insights · reports · assistant · realtime
        ├─ services/   business rules, transactions, locking, idempotency,
        │              forecasting model (pure functions), analytics, assistant tool loop
        ├─ core/       config, security (JWT/bcrypt), deps (RBAC), errors, events hub,
        │              rate limiting
        ├─ schemas/    Pydantic request/response contracts
        └─ models/     SQLAlchemy 2.0 ORM (async, asyncpg)
                │                                   │
           PostgreSQL 16                       Claude API (optional)
   (constraints, row locks, ledger trigger)
```

### Data model (core)

```
organizations ─┬─ users (role)
               ├─ categories ── products ── product_variants (SKU, barcode, price, weighted-avg cost, reorder point)
               ├─ locations
               ├─ stock_levels (variant × location)       ← projection, CHECK on_hand >= 0
               ├─ stock_movements (append-only ledger)
               ├─ sales_orders (idempotency_key) ── sales_order_lines (price + cost snapshot)
               └─ suppliers ── purchase_orders ── purchase_order_lines (ordered / received)
```

### How a checkout stays correct

1. Take the next per-tenant order number (`UPDATE organizations SET order_seq = order_seq + 1 … RETURNING`) and insert the order. This claims the idempotency key; a concurrent duplicate blocks on the unique index, then replays the winner's order.
2. `INSERT … ON CONFLICT DO NOTHING` ensures a stock row exists for each SKU, so there is always a row to lock.
3. `SELECT … FOR UPDATE ORDER BY variant_id, location_id` locks the rows. The fixed order prevents deadlocks.
4. Check availability for **all** lines. Any shortfall raises a 409 and the whole transaction rolls back.
5. Decrement `stock_levels`, append ledger rows, commit, then publish the live events.

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

Accuracy is measured on a 14-day holdout with **WAPE** (Σ\|error\| / Σ actual), which, unlike MAPE, is defined on zero-sales days. It is compared with a seasonal-naive baseline ("same weekday last week"). On the seeded demo data the model's error is consistently **~9–12% lower** than the baseline (e.g. 44.1% vs 48.5% WAPE; it shifts slightly as the window moves day to day). In the unit tests, on synthetic noisy seasonal data, it is at least 15% lower. The lead time comes from each SKU's most recent supplier.

### How Ask StockPilot stays safe

- Claude can call only seven tools (sales summary, top products, inventory health, reorder suggestions, stock levels, product forecast, purchase orders). Each wraps an existing service, and its arguments are validated with Pydantic before touching the database.
- The organization comes from the authenticated user on the server, never from the model. Financial tools are restricted to managers and owners, matching the REST API.
- The loop is bounded to 6 tool rounds. Unknown tools and bad arguments go back to the model as tool errors, and refusals are handled.
- The system prompt and tools are a static, cached prefix; today's date goes in the user turn. Server-side model fallback is enabled.
- Tests drive the loop with a scripted fake client, so CI needs no API key.

## Features

- **Auth & team**: register an organization, JWT access and refresh tokens, roles, invite staff and managers
- **Catalog**: products with variants, SKUs, barcodes, categories, search, POS lookup ranked for scanners
- **Inventory**: multiple locations, stock view, low-stock rule shared by every screen, adjustments, write-offs, transfers, movement history, reconciliation
- **Point of sale**: barcode or camera scan, cart, idempotent checkout, discounts (managers only), refunds that restock, printable receipts
- **Purchasing**: suppliers with lead times, PO lifecycle, partial receiving, weighted-average cost, POs drafted from suggestions
- **Insights**: reorder planner, per-SKU forecast chart, analytics (margin, ABC, slow movers, turnover)
- **Ask StockPilot**: natural-language Q&A over the store's own data
- **Live updates**: stock, sales and deliveries appear on every open screen without reloading

### Roadmap

- [ ] Background jobs (Celery + Redis): low-stock email alerts, nightly forecast precompute
- [ ] Redis-backed event hub and rate limiter, so they work across multiple API workers
- [ ] Public API keys and outgoing webhooks
- [ ] CSV import/export, invoice PDFs, partial refunds
- [ ] Load tests (Locust), deployment, monitoring

## Running locally

### Without Docker (recommended for development)

Requirements: Python 3.12+, Node 22+, PostgreSQL 16 running locally.

**1. Backend** (terminal 1)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
# Edit .env and set DATABASE_URL to your Postgres, e.g.
#   DATABASE_URL=postgresql+asyncpg://<your-user>@localhost:5432/stockpilot
# Optional: set ANTHROPIC_API_KEY to enable Ask StockPilot.
createdb stockpilot
alembic upgrade head
python -m app.scripts.seed          # demo shop with 90 days of history (use --reset to rebuild)
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

**2. Frontend** (terminal 2)

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173. The dev server proxies `/api`, including the WebSocket, to port 8000.

**Demo login:** `demo@stockpilot.app` / `demo-password` (or use "Try the demo" on the login page)

### With Docker

```bash
docker compose up --build
docker compose exec backend python -m app.scripts.seed
```

- App: http://localhost:8080
- API: http://localhost:8000/docs

### Tests and checks

```bash
cd backend
createdb stockpilot_test
TEST_DATABASE_URL=postgresql+asyncpg://<your-user>@localhost:5432/stockpilot_test pytest -q
ruff check . && mypy app

cd ../frontend
npm run lint && npm run build
```

The backend tests run against real PostgreSQL, because row locking, constraints and the ledger trigger can't be faked with SQLite. They cover auth, tenant isolation, RBAC, catalog, inventory, sales, idempotency, concurrency races, purchasing, forecasting, analytics, the assistant's tool loop, and real-time events.

## API overview

All endpoints are under `/api/v1`. Full interactive docs are at `/docs`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` |
| Team | `GET/POST /users` · `PATCH /users/{id}` |
| Catalog | `/catalog/categories` · `/catalog/products` · `/catalog/products/{id}/variants` · `PATCH /catalog/variants/{id}` · `GET /catalog/variants/search` |
| Inventory | `/inventory/locations` · `GET /inventory/stock` · `POST /inventory/adjustments` · `POST /inventory/transfers` · `GET /inventory/movements` · `GET /inventory/reconcile` |
| Sales | `POST/GET /sales/orders` · `GET /sales/orders/{id}` · `POST /sales/orders/{id}/refund` |
| Purchasing | `/purchasing/suppliers` · `/purchasing/orders` · `POST /purchasing/orders/{id}/submit` · `…/cancel` · `…/receive` · `POST /purchasing/orders/from-suggestions` |
| Insights | `GET /insights/reorder-suggestions` · `GET /insights/forecast/{variant_id}` · `GET /insights/analytics` |
| Reports | `GET /reports/summary` |
| Assistant | `POST /assistant/ask` |
| Real-time | `WS /ws` (send `{"type":"auth","token":…}` first) |

Every error has the same shape:

```json
{ "error": { "code": "insufficient_stock", "message": "Not enough stock to complete this operation",
             "details": [{ "variant_id": "…", "location_id": "…", "requested": 3, "available": 1 }] } }
```
