# StockPilot

**Multi-tenant inventory, point-of-sale and demand-forecasting platform for small retailers.**

Small shops track stock in spreadsheets, oversell items they don't have, and reorder too late.
StockPilot gives each shop one place to manage its catalog, stock across locations, and sales,
with guarantees that matter in a real store: two cashiers can never sell the same last unit,
a retried checkout never double-charges stock, and every stock change is auditable.

`FastAPI` · `PostgreSQL` · `SQLAlchemy 2 (async)` · `Alembic` · `React + TypeScript` · `TanStack Query` · `Tailwind` · `Docker` · `GitHub Actions`

---

## Highlights

| | |
|---|---|
| **Concurrency-safe checkout** | Stock rows are locked with `SELECT … FOR UPDATE` in a deterministic order, so concurrent orders queue instead of overselling or deadlocking. Proven by tests that fire 30 simultaneous checkouts at 10 units of stock: exactly 10 succeed. |
| **Idempotent orders** | `Idempotency-Key` header + a unique `(org_id, key)` constraint: a double-clicked or network-retried checkout returns the original order (200 + `Idempotent-Replayed`), never a second one. Reusing a key with a different payload is rejected. |
| **Auditable stock ledger** | Every change (sale, refund, adjustment, transfer) appends to `stock_movements`. A Postgres trigger makes the ledger append-only, and `/inventory/reconcile` proves `on_hand == SUM(movements)` for every SKU and location. |
| **Multi-tenancy + RBAC** | Every row is scoped by `org_id`, and every referenced id is checked against the caller's org. Roles: owner > manager > staff. Staff can sell but can't override prices, give discounts, or adjust stock. Order numbers are a gapless per-tenant sequence (SO-1, SO-2, …), so one shop can't infer another's sales volume. |
| **Atomic multi-line operations** | An order or transfer either applies completely or not at all. A 409 `insufficient_stock` response lists exactly which lines are short. |
| **Production hygiene** | Layered architecture (routes → services → models), Pydantic v2 validation, a consistent error envelope, pagination, migrations tested up/down in CI, ruff + mypy, Dockerized. |

## Architecture

```
React + TS (Vite, TanStack Query, Tailwind, Recharts)
        │  REST (JSON, Bearer JWT)
        ▼
FastAPI ── api/v1 (routers: auth, users, catalog, inventory, sales, reports)
        │
        ├─ services/   business rules; transactions; locking; idempotency
        ├─ schemas/    Pydantic request/response contracts
        └─ models/     SQLAlchemy 2.0 ORM (async, asyncpg)
                │
           PostgreSQL 16 (constraints, row locks, ledger trigger)
```

### Data model (core)

```
organizations ─┬─ users (role)
               ├─ categories ── products ── product_variants (SKU, barcode, price, cost, reorder_point)
               ├─ locations
               ├─ stock_levels (variant × location: on_hand, reserved)   ← projection, CHECK on_hand >= 0
               ├─ stock_movements (append-only ledger: qty, reason, reference)
               └─ sales_orders (idempotency_key) ── sales_order_lines (price/cost snapshot)
```

### How a checkout stays correct

1. Take the next per-tenant order number (`UPDATE organizations SET order_seq = order_seq + 1 … RETURNING`) and insert the order. This claims the idempotency key; a concurrent duplicate blocks on the unique index, then replays the winner's order.
2. `INSERT … ON CONFLICT DO NOTHING` ensures a stock row exists for each SKU, so there is always a row to lock.
3. `SELECT … FOR UPDATE ORDER BY variant_id, location_id` locks the rows. The fixed order prevents deadlocks.
4. Check availability for **all** lines. Any shortfall raises a 409 and the whole transaction rolls back.
5. Decrement `stock_levels`, append ledger rows, commit, all in one transaction.

## Features

- **Auth**: register an organization (you become the owner), JWT access and refresh tokens, team management with roles
- **Catalog**: products with variants (size/flavour…), SKUs, barcodes, categories, search by name, SKU or barcode
- **Inventory**: multiple locations, stock view (including never-stocked SKUs), low-stock filter, adjustments, damage write-offs, inter-location transfers, movement history, ledger reconciliation
- **Point of sale**: barcode/SKU lookup ranked for scanners, cart checkout, discounts and price overrides (managers only), refunds that restock
- **Dashboard**: inventory value, units on hand, low-stock count, today's sales, 7-day revenue trend

### Roadmap

- [ ] Procurement: suppliers, purchase orders, goods receipt
- [ ] Background jobs (Celery + Redis): low-stock email alerts, nightly reports
- [ ] Demand forecasting per SKU → days of stock left and suggested reorder quantity
- [ ] Natural-language questions ("what will run out this week?") answered with safe, read-only queries
- [ ] Real-time stock updates across POS terminals (WebSockets)
- [ ] Public API keys with rate limiting, and webhooks
- [ ] Load tests (Locust) and deployment

## Running locally

### With Docker

```bash
docker compose up --build
docker compose exec backend python -m app.scripts.seed   # demo data (optional)
```

- App: http://localhost:8080
- API docs: http://localhost:8000/docs

### Without Docker

Requirements: Python 3.12+, Node 22+, PostgreSQL 16.

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # point DATABASE_URL at your Postgres
createdb stockpilot
alembic upgrade head
python -m app.scripts.seed      # demo tenant with 90 days of sales history
uvicorn app.main:app --reload   # http://localhost:8000/docs

# Frontend (second terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api to :8000)
```

**Demo login:** `demo@stockpilot.app` / `demo-password`

### Tests

```bash
cd backend
createdb stockpilot_test
TEST_DATABASE_URL=postgresql+asyncpg://<user>@localhost:5432/stockpilot_test pytest -q
```

The tests run against real PostgreSQL. Row locking, constraints and the ledger trigger can't be faked with SQLite. They cover auth, tenant isolation, RBAC, catalog, inventory, sales, idempotency, and the concurrency races.

## API overview

All endpoints are under `/api/v1`. Full interactive docs are at `/docs`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` |
| Team | `GET/POST /users` · `PATCH /users/{id}` |
| Catalog | `GET/POST /catalog/categories` · `GET/POST /catalog/products` · `GET/PATCH /catalog/products/{id}` · `POST /catalog/products/{id}/variants` · `PATCH /catalog/variants/{id}` · `GET /catalog/variants/search` |
| Inventory | `GET/POST /inventory/locations` · `GET /inventory/stock` · `POST /inventory/adjustments` · `POST /inventory/transfers` · `GET /inventory/movements` · `GET /inventory/reconcile` |
| Sales | `POST /sales/orders` · `GET /sales/orders` · `GET /sales/orders/{id}` · `POST /sales/orders/{id}/refund` |
| Reports | `GET /reports/summary` |

Every error has the same shape:

```json
{ "error": { "code": "insufficient_stock", "message": "Not enough stock to complete this operation",
             "details": [{ "variant_id": "…", "location_id": "…", "requested": 3, "available": 1 }] } }
```
