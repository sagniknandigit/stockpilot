"""Celery application: background jobs and the periodic schedule.

Run (from backend/):
    celery -A app.worker worker --loglevel=info      # executes tasks
    celery -A app.worker beat --loglevel=info        # schedules periodic tasks
"""

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "stockpilot",
    broker=settings.redis_url or "memory://",
    include=["app.tasks"],
)
celery_app.conf.update(
    task_default_queue="stockpilot",
    task_acks_late=True,  # a task lost to a worker crash is redelivered
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_ignore_result=True,
    timezone="UTC",
    broker_connection_retry_on_startup=True,
    beat_schedule={
        # Safety net: the API also kicks this right after each commit that adds events.
        "process-outbox": {
            "task": "stockpilot.process_outbox",
            "schedule": settings.outbox_sweep_seconds,
        },
        "retry-due-webhooks": {
            "task": "stockpilot.retry_due_webhooks",
            "schedule": settings.webhook_retry_sweep_seconds,
        },
        # 02:30 UTC = 08:00 IST, before most shops open.
        "daily-digest": {
            "task": "stockpilot.send_daily_digests",
            "schedule": crontab(hour=2, minute=30),
        },
    },
)

if settings.demo_reset_daily:
    # 21:30 UTC = 03:00 IST: keep the public demo shop tidy, whatever visitors did to it.
    celery_app.conf.beat_schedule["reset-demo"] = {
        "task": "stockpilot.reset_demo",
        "schedule": crontab(hour=21, minute=30),
    }
