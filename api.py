from __future__ import annotations

import asyncio
import base64
import binascii
import json
from pathlib import Path
import time
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine import CopilotSessionController, resolve_config

MAX_UPLOAD_FILE_BYTES = 25 * 1024 * 1024
MAX_UPLOAD_BATCH_BYTES = 75 * 1024 * 1024


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
        self._starting_tasks: dict[str, asyncio.Task] = {}
        self._storage_dir = Path(".cloudcowork").resolve()
        self._index_path = self._storage_dir / "session_index.json"
        self._max_loaded_sessions = 8
        self._records: dict[str, dict[str, Any]] = self._load_records()

    def _load_records(self) -> dict[str, dict[str, Any]]:
        if not self._index_path.exists():
            return {}
        try:
            data = json.loads(self._index_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        sessions = data.get("sessions", {})
        return sessions if isinstance(sessions, dict) else {}

    def _save_records(self) -> None:
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        payload = {"sessions": self._records}
        self._index_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    @staticmethod
    def _queue_preview_from_deferred(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "id": entry.get("id"),
                "prompt": entry.get("prompt"),
                "mode": entry.get("mode"),
                "attachment_count": len(entry.get("attachments") or []),
            }
            for entry in items
        ]

    @staticmethod
    def _extract_preview(snapshot: dict[str, Any], existing: dict[str, Any] | None = None) -> str:
        recent_events = snapshot.get("recent_events") or []
        for event in reversed(recent_events):
            event_type = event.get("type")
            data = event.get("data") or {}
            if event_type == "turn_started" and data.get("prompt"):
                return str(data["prompt"]).strip()
            if event_type == "assistant_message" and data.get("content"):
                return str(data["content"]).strip()
            if event_type == "input_requested" and data.get("question"):
                return str(data["question"]).strip()
        if existing and existing.get("preview"):
            return str(existing["preview"])
        return ""

    @staticmethod
    def _derive_status(snapshot: dict[str, Any], existing: dict[str, Any] | None = None) -> str:
        pending = snapshot.get("pending_requests") or []
        queued = snapshot.get("queued_prompts") or []
        recent_events = snapshot.get("recent_events") or []
        if pending:
            return "waiting"
        if snapshot.get("busy"):
            return "running"
        if recent_events:
            last_type = recent_events[-1].get("type")
            if last_type in {"session_error", "subagent_failed"}:
                return "error"
            if last_type == "turn_aborted":
                return "idle"
        if queued:
            return "queued"
        if existing and existing.get("status"):
            return str(existing["status"])
        return "idle"

    def _record_from_snapshot(
        self,
        snapshot: dict[str, Any],
        *,
        existing: dict[str, Any] | None = None,
        loaded: bool = True,
    ) -> dict[str, Any]:
        now = time.time()
        runtime = snapshot.get("runtime") or {}
        preview = self._extract_preview(snapshot, existing)
        title = snapshot.get("title") or ((existing or {}).get("title"))
        record = {
            "id": snapshot["id"],
            "sdk_session_id": snapshot.get("sdk_session_id") or snapshot["id"],
            "sdk_started": snapshot.get("started", False) or (existing or {}).get("sdk_started", False),
            "title": title or "Untitled session",
            "preview": preview,
            "status": self._derive_status(snapshot, existing),
            "busy": bool(snapshot.get("busy")),
            "loaded": loaded,
            "recent_events": snapshot.get("recent_events") or [],
            "pending_requests": snapshot.get("pending_requests") or [],
            "queued_prompts": snapshot.get("queued_prompts") or [],
            "pending_count": len(snapshot.get("pending_requests") or []),
            "queued_count": len(snapshot.get("queued_prompts") or []),
            "runtime": runtime,
            "total_tokens": snapshot.get("total_tokens") or 0,
            "context_usage": snapshot.get("context_usage") or {"used": 0, "total": 0},
            "config_overrides": (existing or {}).get("config_overrides", {}),
            "deferred_prompts": (existing or {}).get("deferred_prompts", []),
            "created_at": (existing or {}).get("created_at", now),
            "updated_at": now,
            "last_accessed_at": now,
        }
        return record

    def _upsert_record(
        self,
        snapshot: dict[str, Any],
        *,
        loaded: bool = True,
        accessed: bool = True,
    ) -> dict[str, Any]:
        existing = self._records.get(snapshot["id"])
        record = self._record_from_snapshot(snapshot, existing=existing, loaded=loaded)
        if not accessed and existing is not None:
            record["last_accessed_at"] = existing.get("last_accessed_at", record["last_accessed_at"])
        self._records[snapshot["id"]] = record
        self._save_records()
        return record

    def _view_record(self, record: dict[str, Any], *, loaded: bool | None = None) -> dict[str, Any]:
        view = dict(record)
        if loaded is not None:
            view["loaded"] = loaded

        deferred = list(view.get("deferred_prompts") or [])
        if deferred:
            view["queued_prompts"] = self._queue_preview_from_deferred(deferred)
        else:
            view["queued_prompts"] = list(view.get("queued_prompts") or [])

        view["pending_requests"] = list(view.get("pending_requests") or [])
        view["pending_count"] = len(view["pending_requests"])
        view["queued_count"] = len(view["queued_prompts"])

        status = str(view.get("status") or "idle")
        if view["pending_count"]:
            status = "waiting"
        elif view.get("busy"):
            status = "running"
        elif view["id"] in self._starting_tasks:
            status = "starting"
        elif view["queued_count"] and status != "error":
            status = "queued"
        elif not view.get("loaded") and status not in {"error", "queued", "starting"}:
            status = "idle"

        view["status"] = status
        return view

    def _create_record(
        self,
        *,
        session_id: str,
        overrides: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = time.time()
        record = {
            "id": session_id,
            "sdk_session_id": session_id,
            "sdk_started": False,
            "title": "Untitled session",
            "preview": "",
            "status": "idle",
            "busy": False,
            "loaded": False,
            "recent_events": [],
            "pending_requests": [],
            "queued_prompts": [],
            "pending_count": 0,
            "queued_count": 0,
            "runtime": {},
            "total_tokens": 0,
            "context_usage": {"used": 0, "total": 0},
            "config_overrides": overrides or {},
            "deferred_prompts": [],
            "created_at": now,
            "updated_at": now,
            "last_accessed_at": now,
        }
        self._records[session_id] = record
        self._save_records()
        return record

    def _build_config(self, overrides: dict[str, Any] | None = None):
        config, _ = resolve_config()
        for key, value in (overrides or {}).items():
            if value is not None and hasattr(config, key):
                setattr(config, key, value)
        return config

    async def clear_all(self) -> None:
        for session_id, controller in list(self._sessions.items()):
            try:
                await controller.close()
            finally:
                self._sessions.pop(session_id, None)

        for session_id, task in list(self._starting_tasks.items()):
            task.cancel()
            self._starting_tasks.pop(session_id, None)

        self._records = {}
        self._save_records()

    async def _evict_if_needed(self, *, exclude: set[str] | None = None) -> None:
        exclude = exclude or set()
        if len(self._sessions) <= self._max_loaded_sessions:
            return

        candidates: list[tuple[float, str, CopilotSessionController]] = []
        for session_id, controller in self._sessions.items():
            if session_id in exclude:
                continue
            if controller.busy or controller.has_pending_requests or controller.queued_prompt_count > 0:
                continue
            if controller.subscriber_count > 0:
                continue
            record = self._records.get(session_id, {})
            last_accessed = float(record.get("last_accessed_at", 0))
            candidates.append((last_accessed, session_id, controller))

        if not candidates:
            return

        candidates.sort(key=lambda item: item[0])
        while len(self._sessions) > self._max_loaded_sessions and candidates:
            _, session_id, controller = candidates.pop(0)
            snapshot = controller.snapshot()
            await controller.close()
            self._sessions.pop(session_id, None)
            self._upsert_record(snapshot, loaded=False, accessed=False)

    async def create(self, overrides: dict | None = None) -> dict[str, Any]:
        overrides = dict(overrides or {})
        session_id = overrides.pop("session_id", None) or str(uuid4())
        await self.clear_all()
        self._create_record(session_id=session_id, overrides=overrides)
        return self._records[session_id]

    def list(self) -> list[dict]:
        sessions_by_id = {
            session_id: self._view_record(record, loaded=False)
            for session_id, record in self._records.items()
        }
        for session_id, controller in list(self._sessions.items()):
            sessions_by_id[session_id] = self._record_from_snapshot(
                controller.snapshot(),
                existing=self._records.get(session_id),
                loaded=True,
            )
        sessions = list(sessions_by_id.values())
        sessions.sort(key=lambda item: item.get("updated_at", 0), reverse=True)
        return sessions

    def snapshot(self, session_id: str) -> dict[str, Any]:
        controller = self._sessions.get(session_id)
        if controller is not None:
            record = self._record_from_snapshot(
                controller.snapshot(),
                existing=self._records.get(session_id),
                loaded=True,
            )
            self._records[session_id] = record
            return record
        record = self._records.get(session_id)
        if record is None:
            raise KeyError(session_id)
        return self._view_record(record, loaded=False)

    async def _start_controller(self, session_id: str) -> CopilotSessionController:
        record = self._records.get(session_id)
        if record is None:
            raise KeyError(session_id)
        config = self._build_config(record.get("config_overrides"))
        controller = CopilotSessionController(config, mode="service")
        try:
            await controller.start(session_id=session_id, resume=bool(record.get("sdk_started")))
        except Exception:
            await controller.close()
            raise

        self._sessions[controller.session_id] = controller
        record["sdk_started"] = True
        self._upsert_record(controller.snapshot(), loaded=True)

        deferred = list(record.get("deferred_prompts") or [])
        if deferred:
            try:
                for item in deferred:
                    mode = (item.get("mode") or "run").strip().lower()
                    await controller.enqueue_prompt(
                        item.get("prompt", ""),
                        attachments=item.get("attachments"),
                        priority=mode == "immediate",
                    )
            except Exception:
                self._sessions.pop(controller.session_id, None)
                failure_record = {
                    **self._records.get(session_id, record),
                    "busy": False,
                    "loaded": False,
                    "status": "error",
                    "updated_at": time.time(),
                }
                self._records[session_id] = failure_record
                self._save_records()
                await controller.close()
                raise
            current = self._records.get(session_id, record)
            current["deferred_prompts"] = []
            self._records[session_id] = current
            self._upsert_record(controller.snapshot(), loaded=True)

        await self._evict_if_needed(exclude={controller.session_id})
        return controller

    def warmup(self, session_id: str) -> dict[str, Any]:
        if session_id not in self._records and session_id not in self._sessions:
            raise KeyError(session_id)
        if session_id in self._sessions:
            return self.snapshot(session_id)
        if session_id not in self._starting_tasks:
            async def runner():
                try:
                    return await self._start_controller(session_id)
                except Exception:
                    record = self._records.get(session_id)
                    if record is not None:
                        record["status"] = "error"
                        record["updated_at"] = time.time()
                        self._save_records()
                    raise
                finally:
                    self._starting_tasks.pop(session_id, None)

            self._starting_tasks[session_id] = asyncio.create_task(runner(), name=f"warmup-{session_id[:8]}")
            record = self._records[session_id]
            record["status"] = "starting"
            record["updated_at"] = time.time()
            self._save_records()
        return self.snapshot(session_id)

    async def get(self, session_id: str) -> CopilotSessionController:
        controller = self._sessions.get(session_id)
        if controller is not None:
            self._upsert_record(controller.snapshot(), loaded=True)
            return controller
        if session_id not in self._records:
            raise KeyError(session_id)
        task = self._starting_tasks.get(session_id)
        if task is None:
            task = asyncio.create_task(self._start_controller(session_id), name=f"start-{session_id[:8]}")
            self._starting_tasks[session_id] = task
        try:
            controller = await task
        except Exception as exc:
            self._starting_tasks.pop(session_id, None)
            raise KeyError(session_id) from exc
        finally:
            if task.done():
                self._starting_tasks.pop(session_id, None)
        if controller is None:
            raise KeyError(session_id)
        return controller

    def enqueue_deferred_prompt(
        self,
        session_id: str,
        *,
        prompt: str,
        attachments: list[dict[str, Any]] | None = None,
        mode: str = "run",
    ) -> dict[str, Any]:
        record = self._records.get(session_id)
        if record is None:
            raise KeyError(session_id)
        queue_id = str(uuid4())
        deferred = list(record.get("deferred_prompts") or [])
        item = {
            "id": queue_id,
            "prompt": prompt,
            "attachments": attachments,
            "mode": mode,
        }
        if mode == "immediate":
            deferred.insert(0, item)
        else:
            deferred.append(item)
        record["deferred_prompts"] = deferred
        record["queued_prompts"] = [
            {
                "id": entry["id"],
                "prompt": entry["prompt"],
                "mode": entry["mode"],
                "attachment_count": len(entry.get("attachments") or []),
            }
            for entry in deferred
        ]
        record["queued_count"] = len(record["queued_prompts"])
        record["preview"] = prompt.strip() or record.get("preview", "")
        record["status"] = "starting" if session_id in self._starting_tasks else "queued"
        record["updated_at"] = time.time()
        self._save_records()
        return {"started": False, "queued": True, "mode": mode, "queue_id": queue_id, "deferred": True}

    async def remove(self, session_id: str) -> None:
        controller = self._sessions.get(session_id)
        if controller is not None:
            await controller.close()
            self._sessions.pop(session_id, None)
        task = self._starting_tasks.pop(session_id, None)
        if task is not None:
            task.cancel()
        elif session_id not in self._records:
            raise KeyError(session_id)
        self._records.pop(session_id, None)
        self._save_records()


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
    return await registry.create(overrides=overrides)


@app.get("/sessions/{session_id}")
async def get_session(session_id: str) -> dict:
    try:
        return registry.snapshot(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc


@app.post("/sessions/{session_id}/warmup")
async def warmup_session(session_id: str) -> dict:
    try:
        return registry.warmup(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str) -> dict:
    try:
        await registry.remove(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc
    return {"deleted": True, "id": session_id}


@app.post("/sessions/{session_id}/prompt")
async def send_prompt(session_id: str, body: PromptRequest) -> dict:
    mode = (body.mode or "run").strip().lower()
    if mode not in {"run", "enqueue", "immediate"}:
        raise HTTPException(status_code=400, detail="mode must be run, enqueue, or immediate")
    attachments = [a.model_dump(exclude_none=True) for a in body.attachments] if body.attachments else None
    controller = registry._sessions.get(session_id)
    if controller is None:
        try:
            result = registry.enqueue_deferred_prompt(
                session_id,
                prompt=body.prompt,
                attachments=attachments,
                mode=mode,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="session not found") from exc
        registry.warmup(session_id)
        return {"id": session_id, "prompt": body.prompt, **result}
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
    if session_id not in registry._sessions:
        if session_id not in registry._records:
            raise HTTPException(status_code=404, detail="session not found")
        if not registry._records[session_id].get("sdk_started"):
            return {"messages": []}
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
    total_bytes = 0

    for item in body.files:
        try:
            raw = base64.b64decode(item.data.encode("utf-8"), validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(status_code=400, detail=f"invalid base64 payload for {item.name}") from exc

        if len(raw) > MAX_UPLOAD_FILE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"{item.name} exceeds the upload limit of {MAX_UPLOAD_FILE_BYTES // (1024 * 1024)} MB",
            )
        total_bytes += len(raw)
        if total_bytes > MAX_UPLOAD_BATCH_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"upload batch exceeds the limit of {MAX_UPLOAD_BATCH_BYTES // (1024 * 1024)} MB",
            )

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
