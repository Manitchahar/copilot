from __future__ import annotations

import asyncio
import base64
import binascii
from pathlib import Path
from typing import Any
from uuid import uuid4

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
    mode: str = "run"


class ApprovalRequest(BaseModel):
    approved: bool


class UserInputRequest(BaseModel):
    answer: str
    was_freeform: bool = True


class UploadFileRequest(BaseModel):
    name: str
    data: str
    media_type: str | None = None
    relative_path: str | None = None


class UploadRequest(BaseModel):
    files: list[UploadFileRequest]


class CreateSessionRequest(BaseModel):
    session_id: str | None = None
    mcp_servers: dict | None = None
    skill_directories: list[str] | None = None
    disabled_skills: list[str] | None = None
    custom_agents: list[dict] | None = None


class SessionRegistry:
    def __init__(self) -> None:
        self._sessions: dict[str, CopilotSessionController] = {}

    async def create(self, overrides: dict | None = None) -> CopilotSessionController:
        config, _ = resolve_config()
        session_id = None
        if overrides:
            session_id = overrides.pop("session_id", None)
            for key, value in overrides.items():
                if value is not None and hasattr(config, key):
                    setattr(config, key, value)
        controller = CopilotSessionController(config, mode="service")
        await controller.start(session_id=session_id or str(uuid4()))
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
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
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
async def create_session(body: CreateSessionRequest | None = None) -> dict:
    overrides = body.model_dump(exclude_none=True) if body else None
    controller = await registry.create(overrides=overrides)
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
    mode = (body.mode or "run").strip().lower()
    if mode not in {"run", "enqueue", "immediate"}:
        raise HTTPException(status_code=400, detail="mode must be run, enqueue, or immediate")
    attachments = [a.model_dump(exclude_none=True) for a in body.attachments] if body.attachments else None
    if mode == "run" and controller.busy:
        raise HTTPException(status_code=409, detail="session is busy")
    if mode in {"enqueue", "immediate"}:
        result = await controller.enqueue_prompt(
            body.prompt,
            attachments=attachments,
            priority=mode == "immediate",
        )
        return {"id": session_id, "prompt": body.prompt, **result}
    result = await controller.enqueue_prompt(body.prompt, attachments=attachments, priority=False)
    return {"id": session_id, "prompt": body.prompt, **result}


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


@app.post("/uploads")
async def upload_attachments(body: UploadRequest) -> dict:
    upload_root = Path(".uploads").resolve()
    upload_root.mkdir(exist_ok=True)
    batch_dir = upload_root / uuid4().hex
    batch_dir.mkdir(exist_ok=True)

    attachments: list[dict[str, Any]] = []
    saved: list[dict[str, Any]] = []

    for item in body.files:
        try:
            raw = base64.b64decode(item.data.encode("utf-8"), validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(status_code=400, detail=f"invalid base64 payload for {item.name}") from exc

        relative_name = item.relative_path or item.name
        safe_parts = [part for part in Path(relative_name).parts if part not in {"", ".", ".."}]
        if not safe_parts:
            safe_parts = [item.name or f"upload-{uuid4().hex}"]
        destination = batch_dir.joinpath(*safe_parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)

        attachments.append(
            {
                "type": "file",
                "path": str(destination),
                "name": item.name,
                "media_type": item.media_type,
            }
        )
        saved.append(
            {
                "name": item.name,
                "path": str(destination),
                "media_type": item.media_type,
                "size": len(raw),
            }
        )

    return {"attachments": attachments, "files": saved}


class ConnectorConfigRequest(BaseModel):
    mcp_servers: dict | None = None
    skill_directories: list[str] | None = None
    disabled_skills: list[str] | None = None
    custom_agents: list[dict] | None = None


@app.get("/config/connectors")
async def get_connector_config() -> dict:
    config, _ = resolve_config()
    return {
        "mcp_servers": config.mcp_servers,
        "skill_directories": config.skill_directories,
        "disabled_skills": config.disabled_skills,
        "custom_agents": config.custom_agents,
    }


@app.put("/config/connectors")
async def save_connector_config(body: ConnectorConfigRequest) -> dict:
    from engine import save_connector_config as do_save
    updates = body.model_dump(exclude_none=True)
    do_save(updates)
    return {"saved": True}


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
async def session_events(websocket: WebSocket, session_id: str, replay_recent: bool = True) -> None:
    try:
        controller = await registry.get(session_id)
    except KeyError:
        await websocket.close(code=4004, reason="session not found")
        return
    await websocket.accept()
    queue = controller.subscribe(replay_recent=replay_recent)
    try:
        while True:
            await websocket.send_json(await queue.get())
    except WebSocketDisconnect:
        pass
    finally:
        controller.unsubscribe(queue)
