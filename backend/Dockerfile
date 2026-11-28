FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

RUN useradd --create-home --uid 1000 appuser
USER appuser

EXPOSE 8000

# Migrations, then the API (and, with RUN_WORKER_IN_PROCESS=true, the Celery worker).
# Listens on $PORT when the platform provides one (Render, Railway, ...), else 8000.
CMD ["sh", "start.sh"]
