import asyncio
import contextlib
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.database import SessionLocal
from app.core.events import hub
from app.core.exceptions import Unauthorized
from app.core.security import decode_token, subject_id
from app.models import User

router = APIRouter(tags=["realtime"])

AUTH_TIMEOUT_SECONDS = 5
HEARTBEAT_SECONDS = 25
CLOSE_UNAUTHORIZED = 4401


async def _authenticate(websocket: WebSocket) -> User | None:
    """First message must be {"type": "auth", "token": "<access token>"}.

    Authenticating in-band keeps the token out of URLs (and so out of access logs).
    """
    try:
        message = await asyncio.wait_for(websocket.receive_json(), AUTH_TIMEOUT_SECONDS)
        if not isinstance(message, dict) or message.get("type") != "auth":
            return None
        payload = decode_token(str(message.get("token", "")), "access")
    except (TimeoutError, Unauthorized, ValueError, WebSocketDisconnect):
        return None
    async with SessionLocal() as db:
        user = await db.get(User, subject_id(payload))
    return user if user is not None and user.is_active else None


@router.websocket("/ws")
async def events(websocket: WebSocket) -> None:
    """Live stream of this organization's events (stock changes, orders, deliveries)."""
    await websocket.accept()
    user = await _authenticate(websocket)
    if user is None:
        await websocket.close(code=CLOSE_UNAUTHORIZED, reason="Unauthorized")
        return

    queue = hub.subscribe(user.org_id)
    await websocket.send_json({"type": "ready"})

    async def pump() -> None:
        while True:
            try:
                event: dict[str, Any] = await asyncio.wait_for(queue.get(), HEARTBEAT_SECONDS)
            except TimeoutError:
                event = {"type": "ping"}
            await websocket.send_json(event)

    async def drain() -> None:
        # Detects disconnects; clients may send {"type":"pong"} which we ignore.
        while True:
            await websocket.receive_text()

    tasks = [asyncio.create_task(pump()), asyncio.create_task(drain())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, WebSocketDisconnect, RuntimeError):
                await task
        hub.unsubscribe(user.org_id, queue)
