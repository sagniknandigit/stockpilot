# Deploying StockPilot for $0

| Piece | Where | Cost |
|---|---|---|
| Frontend (React build) | **Vercel** (Hobby) | Free |
| API + Celery worker + scheduler (one container) | **Render** free web service | Free |
| PostgreSQL | **Neon** free plan | Free |
| Redis | **Render Key Value** free | Free |
| Uptime ping (prevents cold starts) | **cron-job.org** | Free |

None of these needs a credit card. If a free limit is ever reached, the service pauses;
nothing is billed. Never click "Upgrade" and you can't be charged.

Time needed: about 30 minutes. Do the steps in order, because later steps need URLs from
earlier ones.

---

## 0. Before you start

Push the latest code to GitHub (`main`). Render and Vercel deploy straight from the repo.

## 1. Neon: create the database

1. Sign up at <https://neon.tech> with GitHub.
2. **Create project**:
   - Name: `stockpilot`
   - Region: **AWS Asia Pacific (Singapore)**. This matches Render's Singapore region in
     `render.yaml`. If you change one, change both.
3. Open **Connect** on the project dashboard, then:
   - Turn **Connection pooling off**, so the host name has no `-pooler`. The pooled endpoint
     breaks asyncpg's prepared statements.
   - Copy the connection string. It looks like:
     ```
     postgresql://neondb_owner:XXXX@ep-something-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
     ```
   Paste it as-is everywhere below. The app converts `sslmode`/`channel_binding` to what
   asyncpg expects.

## 2. Load the schema and the demo shop (from your laptop)

Render's free tier has no shell, so seed Neon from your machine:

```bash
cd ~/stockpilot/backend
source .venv/bin/activate
export DATABASE_URL='postgresql://neondb_owner:XXXX@ep-...neon.tech/neondb?sslmode=require&channel_binding=require'
alembic upgrade head                 # creates the tables
python -m app.scripts.seed           # demo shop: demo@stockpilot.app / demo-password
unset DATABASE_URL                   # back to your local database
```

Keep the single quotes; the `&` in the URL would otherwise break the command.

## 3. Render: deploy the backend

1. Sign up at <https://render.com> with GitHub. **Skip adding a card.**
2. **New → Blueprint**, pick the `stockpilot` repo. Render reads `render.yaml` and shows
   two services: `stockpilot-api` (free web service) and `stockpilot-redis` (free Key Value).
3. Fill in the values it asks for:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | The Neon string from step 1 |
   | `CORS_ORIGINS` | `["http://localhost:5173"]` for now (you'll update it in step 5) |
   | `CORS_ORIGIN_REGEX` | `^https://stockpilot-[a-z0-9-]+\.vercel\.app$` (allows Vercel previews) |
   | `APP_URL` | `http://localhost:5173` for now (update in step 5) |
   | `GEMINI_API_KEY` | Your Gemini key (optional; enables Ask StockPilot) |
   | `METRICS_TOKEN` | Any long random string (optional; protects `/metrics`) |

   `JWT_SECRET` is generated for you, and `REDIS_URL` is wired to the Key Value instance
   automatically.
4. Click **Apply**. The first Docker build takes about 5–8 minutes.
5. Open `https://stockpilot-api.onrender.com/health` (use the URL Render shows if the name
   was taken). You should see:
   ```json
   {"status":"ok","database":"ok","redis":"ok"}
   ```
   The logs should show both `Uvicorn running` and `celery@... ready`.

## 4. Vercel: deploy the frontend

1. Sign up at <https://vercel.com> with GitHub.
2. **Add New → Project**, import the `stockpilot` repo.
3. Settings:
   - **Root Directory: `frontend`**. This is important.
   - Framework preset: Vite (auto-detected; `frontend/vercel.json` handles the rest).
   - **Environment variable:** `VITE_API_URL` = `https://stockpilot-api.onrender.com/api/v1`
     (your Render URL + `/api/v1`, no trailing slash).
4. Click **Deploy**, then copy the production URL, e.g. `https://stockpilot-abc.vercel.app`.

`VITE_API_URL` is baked in at build time. If you change it later, trigger a redeploy.

## 5. Render: allow the Vercel site

In Render → `stockpilot-api` → **Environment**:

| Variable | Value |
|---|---|
| `CORS_ORIGINS` | `["https://stockpilot-abc.vercel.app"]` (your exact URL, no trailing slash) |
| `APP_URL` | `https://stockpilot-abc.vercel.app` |

Saving redeploys the service automatically (about 1 minute; no rebuild).

If your Vercel project isn't named `stockpilot`, adjust `CORS_ORIGIN_REGEX` to match its
preview URLs, or leave it empty.

## 6. cron-job.org: keep the backend awake

Free Render services sleep after 15 minutes without traffic, and the first visitor then
waits about a minute. A ping every 10 minutes prevents that:

1. Sign up at <https://cron-job.org>.
2. **Create cronjob**:
   - URL: `https://stockpilot-api.onrender.com/health/live`
   - Schedule: every 10 minutes

This uses at most 744 of Render's 750 free hours a month, enough for exactly one
always-on service. `/health/live` doesn't touch the database, so Neon can still scale to
zero between real requests.

## 7. Check it works

Open your Vercel URL and:

- [ ] Click **Try the live demo**: the dashboard loads with 90 days of data
- [ ] The top bar shows **Live** (WebSocket connected)
- [ ] Make a sale at the POS, with a second tab open on Inventory: stock updates without
      a reload
- [ ] Sell a product below its reorder point: a notification appears on the bell
- [ ] **Ask StockPilot**: "What will run out this week?" (if you set `GEMINI_API_KEY`)
- [ ] Open the API docs at `https://stockpilot-api.onrender.com/docs`

## Optional: real emails

Free SMTP from Brevo (about 300 emails a day): create an account, verify a sender address,
then add these to Render:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USERNAME=<your Brevo SMTP login>
SMTP_PASSWORD=<your Brevo SMTP key>
EMAIL_FROM=StockPilot <your-verified-address@example.com>
```

Without these, alert and digest emails are written to the Render logs instead.

---

## How the free setup differs from Docker Compose

- **One container runs everything.** `RUN_WORKER_IN_PROCESS=true` makes `start.sh` run the
  Celery worker (with the scheduler embedded) next to uvicorn. Render's free tier has no
  background workers. If either process dies, the container exits and Render restarts it.
  Memory use is about 290 MB of the 512 MB available.
- **Background sweeps every 30 minutes instead of 5 seconds.** Events are still processed
  immediately, because every sale triggers the worker directly. The sweeps are only a
  safety net, and making them rare lets Neon scale to zero, which keeps you well inside its
  free compute hours.
- **Redis is disposable.** Free Key Value is in-memory, so a restart wipes it. Nothing is
  lost: events live in Postgres (the outbox) until processed.
- **The demo shop resets nightly** at 03:00 IST (`DEMO_RESET_DAILY=true`), so visitors'
  experiments don't pile up. Anyone logged into the demo just signs in again.
- **`/metrics` is off** unless `METRICS_TOKEN` is set. Then use
  `curl -H "Authorization: Bearer <token>" https://…/metrics`.

## Updating

Push to `main`:
- **Render** rebuilds the backend when `backend/**` changes; migrations run on start-up.
- **Vercel** rebuilds the frontend.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser console shows a CORS error | `CORS_ORIGINS` must contain the exact Vercel URL (`https://…`, no trailing slash), as a JSON list |
| `prepared statement … does not exist` in Render logs | You used Neon's pooled (`-pooler`) URL. Switch to the direct one |
| First page load takes about a minute | The service was asleep. Set up step 6 |
| "Live" indicator keeps reconnecting | Check that `VITE_API_URL` starts with `https://` (the app derives `wss://` from it) |
| Ask StockPilot says "busy" | Gemini is rate-limited or overloaded. Wait a minute |
| Login fails after 03:00 IST | The demo shop was reset. Click "Try the live demo" again |
| Render suspended the service | All 750 free hours were used, usually from running a second free service. It resumes next month |

## Moving to a paid setup later

The original multi-service layout is in `docker-compose.yml`. On Render's paid plans, add
a `type: worker` service running `celery -A app.worker worker` and a second for
`celery -A app.worker beat`. Then remove `RUN_WORKER_IN_PROCESS` from the web service and
put the sweep intervals back to their defaults.
