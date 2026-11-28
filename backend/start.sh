#!/bin/sh
# Container entrypoint: apply migrations, then serve the API.
#
# RUN_WORKER_IN_PROCESS=true also runs the Celery worker (with the beat scheduler embedded)
# in this container. That's for hosts with no separate background-worker service, such as
# Render's free tier. Docker Compose and paid plans run the worker as its own service.
set -e
set -f  # no globbing: "$API" below is word-split on purpose and contains a literal *

alembic upgrade head

API="uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=*"

if [ "${RUN_WORKER_IN_PROCESS:-false}" != "true" ]; then
    exec $API
fi

# --pool=solo: one task at a time in the worker process itself, the smallest memory
# footprint (fits in 512 MB next to the API).
celery -A app.worker worker --beat --pool=solo --loglevel=info \
    --schedule /tmp/celerybeat-schedule &
WORKER_PID=$!
$API &
API_PID=$!

shutdown() {
    kill -TERM "$API_PID" "$WORKER_PID" 2>/dev/null || true
    wait
    exit 0
}
trap shutdown TERM INT

# If either process dies, stop the other and exit non-zero so the platform restarts us.
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WORKER_PID" 2>/dev/null; do
    sleep 2
done
echo "start.sh: a process exited; stopping the container" >&2
kill -TERM "$API_PID" "$WORKER_PID" 2>/dev/null || true
wait
exit 1
