from __future__ import annotations

import asyncio
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine import CopilotSessionController, resolve_config


class AttachmentItem(BaseModel):
    type: str
    path: str | None = None
    name: str | None = None
    data: str | None = None
    media_type: str | None = None
    start: dict | None = None
    end: dict | None = None


class PromptRequest(BaseModel):
    prompt: str
    attachments: list[AttachmentItem] | None = None


class ApprovalRequest(BaseModel):
    approved: bool


class UserInputRequest(BaseModel):
    answer: str
    was_freeform: bool = True


class SessionRegistry:
    def __init__(self) -> None:
        self._sessions: dict[str, CopilotSessionController] = {}

    async def create(self) -> CopilotSessionController:
        config, _ = resolve_config()
        controller = CopilotSessionController(config, mode="service")
        await controller.start()
        self._sessions[controller.session_id] = controller
        return controller

    def list(self) -> list[dict]:
        return [controller.snapshot() for controller in self._sessions.values()]

    async def get(self, session_id: str) -> CopilotSessionController:
        controller = self._sessions.get(session_id)
        if controller is not None:
            return controller

        config, _ = resolve_config()
        controller = CopilotSessionController(config, mode="service")
        try:
            await controller.start(session_id=session_id, resume=True)
        except Exception as exc:
            await controller.close()
            raise KeyError(session_id) from exc

        self._sessions[controller.session_id] = controller
        return controller

    async def remove(self, session_id: str) -> None:
        controller = await self.get(session_id)
        await controller.close()
        self._sessions.pop(session_id, None)


app = FastAPI(title="Claude Cowork API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
registry = SessionRegistry()


async def get_controller_or_404(session_id: str) -> CopilotSessionController:
    try:
        return await registry.get(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/sessions")
async def list_sessions() -> dict:
    return {"sessions": registry.list()}


@app.post("/sessions")
async def create_session() -> dict:
    controller = await registry.create()
    return controller.snapshot()


@app.get("/sessions/{session_id}")
async def get_session(session_id: str) -> dict:
    controller = await get_controller_or_404(session_id)
    return controller.snapshot()


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str) -> dict:
    try:
        await registry.remove(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc
    return {"deleted": True, "id": session_id}


@app.post("/sessions/{session_id}/prompt")
async def send_prompt(session_id: str, body: PromptRequest) -> dict:
    controller = await get_controller_or_404(session_id)
    if controller.busy:
        raise HTTPException(status_code=409, detail="session is busy")
    attachments = [a.model_dump(exclude_none=True) for a in body.attachments] if body.attachments else None
    asyncio.create_task(controller.send_prompt(body.prompt, attachments=attachments), name=f"prompt-{session_id[:8]}")
    return {"started": True, "id": session_id, "prompt": body.prompt}


@app.post("/sessions/{session_id}/abort")
async def abort_turn(session_id: str) -> dict:
    controller = await get_controller_or_404(session_id)
    if not controller.busy:
        raise HTTPException(status_code=409, detail="session is not busy")
    aborted = await controller.abort()
    return {"aborted": aborted, "id": session_id}


@app.get("/sessions/{session_id}/history")
async def get_history(session_id: str) -> dict:
    controller = await get_controller_or_404(session_id)
    messages = await controller.get_history()
    return {"messages": messages}


@app.post("/sessions/{session_id}/approval/{request_id}")
async def reply_permission(session_id: str, request_id: str, body: ApprovalRequest) -> dict:
    controller = await get_controller_or_404(session_id)
    if not controller.resolve_permission(request_id, body.approved):
        raise HTTPException(status_code=404, detail="pending permission request not found")
    return {"resolved": True, "request_id": request_id, "approved": body.approved}


@app.post("/sessions/{session_id}/input/{request_id}")
async def reply_user_input(session_id: str, request_id: str, body: UserInputRequest) -> dict:
    controller = await get_controller_or_404(session_id)
    if not controller.resolve_user_input(
        request_id,
        answer=body.answer,
        was_freeform=body.was_freeform,
    ):
        raise HTTPException(status_code=404, detail="pending user input request not found")
    return {"resolved": True, "request_id": request_id}


@app.websocket("/sessions/{session_id}/events")
async def session_events(websocket: WebSocket, session_id: str) -> None:
    try:
        controller = await registry.get(session_id)
    except KeyError:
        await websocket.close(code=4004, reason="session not found")
        return
    await websocket.accept()
    queue = controller.subscribe(replay_recent=True)
    try:
        while True:
            await websocket.send_json(await queue.get())
    except WebSocketDisconnect:
        pass
    finally:
        controller.unsubscribe(queue)
