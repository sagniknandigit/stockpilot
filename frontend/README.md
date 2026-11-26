# StockPilot — Frontend

React single-page app for StockPilot, a multi-tenant inventory and point-of-sale SaaS for small
retailers. It talks to the FastAPI backend in `../backend`.

**Stack:** Vite · React 19 · TypeScript (strict) · Tailwind CSS v4 · TanStack Query v5 ·
React Router v7 · react-hook-form + zod · Recharts · motion · lucide-react

**Highlights:** a fast point-of-sale (scan, tap tiles, keyboard shortcuts, idempotent checkout),
an inventory ledger with reconciliation, purchasing (purchase orders with partial receiving), demand
forecasts with a reorder planner, analytics, an "Ask StockPilot" AI assistant, live updates over
WebSocket, a ⌘K command palette, and light/dark themes.

## Getting started

```bash
# 1. Start the API (port 8000)
cd ../backend && .venv/bin/uvicorn app.main:app --port 8000

# 2. Start the frontend (port 5173, proxies /api to the backend)
cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173 and create an account, or click **Try the live demo** on the sign-in
page (demo@stockpilot.app, seeded with ~90 days of data). Registering creates an organization,
makes you its owner, and adds a default "Main Store" location.

## Scripts

| Command                | What it does                                      |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Dev server with HMR; `/api` is proxied to `:8000` |
| `npm run build`        | Type-check (`tsc -b`) and build to `dist/`        |
| `npm run preview`      | Serve the production build locally                |
| `npm run lint`         | ESLint (typescript-eslint, react-hooks)           |
| `npm run typecheck`    | TypeScript only                                   |
| `npm run format`       | Prettier (with Tailwind class sorting)            |
| `npm run format:check` | Prettier in check mode (for CI)                   |

## Environment variables

| Variable       | Default   | Description                                                                                                                     |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL` | `/api/v1` | API base URL, read at build time. Leave unset when the API is served from the same origin (Vite proxy in dev, nginx in Docker). |

See `.env.example`.

## Docker

```bash
docker build -t stockpilot-frontend .
docker run -p 8080:80 --network <network-with-backend> stockpilot-frontend
```

A multi-stage build: Node builds the app, then `nginx:alpine` serves `dist/`. `nginx.conf` falls
back to `index.html` for client-side routes and proxies `/api/` (including the `/api/v1/ws`
WebSocket upgrade) to `http://backend:8000`, so the backend container must be reachable as
`backend` (e.g. a docker-compose service name).

## Project structure

```
src/
  api/            Typed fetch client + one module per backend domain
    client.ts       Base URL, JSON, bearer token, ApiError, token refresh (deduplicated)
    tokenStore.ts   JWT pair in localStorage with a subscribe API
    types.ts        Mirrors the backend Pydantic schemas
  auth/           AuthProvider, useAuth/useSession/useCan, ProtectedRoute, role helpers
  hooks/          TanStack Query hooks per domain + the query-key factory
  providers/      Theme (light/dark/system) and current-location context
  realtime/       WebSocket provider (auth, backoff, cache updates), Live indicator
  components/
    ui/           Button, Input, Select, Dialog, Table, Badge, Toast, EmptyState, AnimatedNumber, …
    layout/       App shell: collapsible sidebar, breadcrumbs, location switcher, user menu
    command/      ⌘K command palette
    assistant/    "Ask StockPilot" slide-over chat (markdown renderer is lazy-loaded)
  pages/          One folder per area: dashboard, pos, products, inventory, orders, purchasing,
                  insights (reorder planner, forecasts, analytics), team, auth
  lib/            Formatting, integer-cents money, validation, motion presets, barcode scanner
```

## Design notes

- **Errors.** Every API error arrives as `{"error": {code, message, details}}` and is surfaced as
  an `ApiError` with `status`, `code`, `message` and `details`. Mutation errors show a toast by
  default; components that render errors inline (POS checkout, login) opt out via
  `meta: { silentError: true }`.
- **Auth.** On a `401 token_expired`, the client calls `/auth/refresh` once — concurrent requests
  share the same refresh — and retries. If the refresh fails, tokens are cleared and the app
  returns to the login page.
- **Roles.** `can(role, 'manager')` / `useCan('manager')` hide or disable controls the user can't
  use (owner > manager > staff). The backend enforces the same rules.
- **Time zones.** Dates are shown in the organization's time zone (`organization.timezone`),
  the same zone the backend uses for daily reports. Order date filters are calendar days in that zone.
- **Low stock.** A variant is low when its total available across all locations is at or below
  its reorder point. The Inventory table shows each location's count next to the all-locations
  total, and the dashboard shows one row per low variant for the current location.
- **Money.** Amounts are decimal strings from the API. Cart totals are computed in integer cents
  (`lib/money.ts`) and formatted with `Intl.NumberFormat` using the organization's currency.
- **Checkout idempotency.** The POS creates an `Idempotency-Key` on the first checkout attempt
  and reuses it when retrying after a network error, so a sale can't be recorded twice. Any cart
  change discards the key. A `409 insufficient_stock` highlights the lines that are short.
- **Barcode scanning.** USB scanners type the code and press Enter; an exact barcode or SKU match is
  added straight to the cart. Camera scanning uses the native `BarcodeDetector` when the browser
  has it and otherwise lazy-loads ZXing, so ZXing isn't in the main bundle.
- **Design tokens.** Colors, shadows and chart series are CSS variables in `src/index.css`
  (separate light and dark values), exposed to Tailwind as `bg-surface`, `text-muted`,
  `shadow-card`, `bg-chart-1`… Components never hard-code palette colors.
- **Motion.** Page transitions, staggered cards, spring dialogs, count-up numbers and animated cart
  lines use `motion`; everything respects `prefers-reduced-motion`.
- **Live updates.** After sign-in the app opens `/api/v1/ws`, authenticates in-band, and turns
  events (`stock.changed`, `order.created`, `po.received`, `resync`) into query invalidations; POS
  availability is patched in place. Reconnects back off exponentially; a 4401 close re-auths.
- **Keyboard.** ⌘K / Ctrl+K opens the command palette anywhere. At the POS: F2 focuses search,
  F9 or Ctrl/⌘+Enter charges, Esc clears; a USB barcode scanner works out of the box.
- **Code splitting.** Each page is lazy-loaded, as are Recharts, ZXing, and marked + DOMPurify.
