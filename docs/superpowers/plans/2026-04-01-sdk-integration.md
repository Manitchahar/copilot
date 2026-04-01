# SDK Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire unused Copilot SDK features (30+ events, abort, attachments, history, reasoning effort, hooks) into engine.py and api.py so the frontend has rich data to consume.

**Architecture:** Extend `CopilotSessionController._on_sdk_event()` with a dispatch-table pattern. Add new methods (`abort`, `get_history`, attachment support). Add 2 new API endpoints and extend 2 existing ones. No breaking changes to existing API contracts.

**Tech Stack:** Python 3.14, FastAPI, github-copilot-sdk 0.2.0, Pydantic

**Spec:** `docs/superpowers/specs/sdk-integration.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `engine.py` | Modify | Add event dispatch table, abort(), get_history(), attachment builder, hooks, reasoning_effort config |
| `api.py` | Modify | Add `/abort`, `/history` endpoints; extend prompt endpoint with attachments |
| `config.yaml` | Modify | Add `reasoning_effort` and `working_directory` fields |

---

### Task 1: Add `reasoning_effort` and `working_directory` to AppConfig

**Files:**
- Modify: `engine.py:16-44` (AppConfig dataclass)
- Modify: `engine.py:225-271` (resolve_config)
- Modify: `config.yaml`

- [ ] **Step 1: Add new fields to AppConfig**

In `engine.py`, add two fields to the `AppConfig` dataclass after line 43 (`permission_deny_message`):

```python
    reasoning_effort: str | None = None
    working_directory: str | None = None
```

- [ ] **Step 2: Parse new fields in resolve_config()**

In the `resolve_config()` function, add these two lines inside the `AppConfig(...)` constructor, after the `permission_deny_message` line (around line 268):

```python
            reasoning_effort=to_str(config.get("reasoning_effort"), None) if config.get("reasoning_effort") else None,
            working_directory=to_str(config.get("working_directory"), None) if config.get("working_directory") else None,
```

- [ ] **Step 3: Pass new params in _build_session_kwargs()**

In `_build_session_kwargs()` (line 393-403), add after the provider block:

```python
        if self.config.reasoning_effort:
            session_kwargs["reasoning_effort"] = self.config.reasoning_effort
        if self.config.working_directory:
            session_kwargs["working_directory"] = self.config.working_directory
```

- [ ] **Step 4: Add fields to config.yaml**

Append to the end of `config.yaml`:

```yaml
# reasoning_effort: medium
# working_directory: .
```

(Commented out so they're optional — uncomment to enable.)

- [ ] **Step 5: Verify the server starts**

Run: `./.venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port 8000`
Expected: Server starts without errors.

- [ ] **Step 6: Commit**

```bash
git add engine.py config.yaml
git commit -m "feat: add reasoning_effort and working_directory to AppConfig

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Refactor event handler to dispatch-table pattern

**Files:**
- Modify: `engine.py:723-825` (_on_sdk_event method)

- [ ] **Step 1: Create the dispatch table**

Replace the entire `_on_sdk_event` method (lines 723-825) with a dispatch-table pattern. Insert this above the `_on_sdk_event` method, as a module-level constant near the top of the `CopilotSessionController` class:

The new `_on_sdk_event` method:

```python
    def _on_sdk_event(self, event) -> None:
        event_name = normalized_event_type(event)
        data = getattr(event, "data", None)

        handler = self._EVENT_DISPATCH.get(event_name)
        if handler:
            handler(self, event_name, data)
            return

        # Unknown events: log at debug level, don't emit
```

- [ ] **Step 2: Extract existing handlers into individual methods**

Add these methods to `CopilotSessionController`:

```python
    def _handle_assistant_delta(self, event_name, data):
        chunk = normalize_text(getattr(data, "delta_content", None))
        if chunk:
            self._turn_state.saw_delta = True
            self._emit_threadsafe("assistant_delta", {"content": chunk})

    def _handle_assistant_message(self, event_name, data):
        content = normalize_text(getattr(data, "content", None))
        if content:
            self._turn_state.final_content = content
            self._emit_threadsafe("assistant_message", {"content": content})

    def _handle_session_error(self, event_name, data):
        message = normalize_text(getattr(data, "message", None))
        if message:
            self._turn_state.last_error = message
            self._emit_threadsafe("session_error", {"message": message})

    def _handle_session_idle(self, event_name, data):
        self._turn_state.idle.set()

    def _handle_elicitation(self, event_name, data):
        message = normalize_text(getattr(data, "message", None))
        self._emit_threadsafe(
            "input_notice",
            {"message": message or "Agent is asking for more input."},
        )

    def _handle_tool_start(self, event_name, data):
        if not self.config.show_tool_events:
            return
        tool_call_id = normalize_text(getattr(data, "tool_call_id", None))
        tool_name = normalize_text(getattr(data, "tool_name", None)) or "tool"
        arguments = format_tool_args(getattr(data, "arguments", None))
        if tool_call_id:
            self._turn_state.active_tool_names[tool_call_id] = tool_name
        self._emit_threadsafe(
            "tool_start",
            {"tool_call_id": tool_call_id, "tool_name": tool_name, "arguments": arguments},
        )

    def _handle_tool_partial(self, event_name, data):
        if not self.config.show_tool_events:
            return
        tool_call_id = normalize_text(getattr(data, "tool_call_id", None))
        partial_output = normalize_text(getattr(data, "partial_output", None))
        if partial_output:
            self._emit_threadsafe(
                "tool_output",
                {
                    "tool_call_id": tool_call_id,
                    "tool_name": self._render_tool_name(tool_call_id),
                    "content": partial_output,
                },
            )

    def _handle_tool_progress(self, event_name, data):
        if not self.config.show_tool_events:
            return
        tool_call_id = normalize_text(getattr(data, "tool_call_id", None))
        progress = normalize_text(getattr(data, "progress_message", None))
        if progress:
            self._emit_threadsafe(
                "tool_progress",
                {
                    "tool_call_id": tool_call_id,
                    "tool_name": self._render_tool_name(tool_call_id),
                    "content": progress,
                },
            )

    def _handle_tool_complete(self, event_name, data):
        if not self.config.show_tool_events:
            return
        tool_call_id = normalize_text(getattr(data, "tool_call_id", None))
        tool_name = self._render_tool_name(
            tool_call_id,
            normalize_text(getattr(data, "tool_name", None)),
        )
        success = getattr(data, "success", None)
        result_text = format_tool_result(getattr(data, "result", None))
        error_text = normalize_text(getattr(data, "error", None))
        self._emit_threadsafe(
            "tool_complete",
            {
                "tool_call_id": tool_call_id,
                "tool_name": tool_name,
                "success": success is not False,
                "result_text": result_text,
                "error_text": error_text,
            },
        )
```

- [ ] **Step 3: Define the dispatch table**

Add this as a class variable inside `CopilotSessionController`, after the handler methods:

```python
    _EVENT_DISPATCH = {
        "assistant_message_delta": _handle_assistant_delta,
        "assistant_message": _handle_assistant_message,
        "session_error": _handle_session_error,
        "session_idle": _handle_session_idle,
        "elicitation_requested": _handle_elicitation,
        "tool_execution_start": _handle_tool_start,
        "tool_execution_partial_result": _handle_tool_partial,
        "tool_execution_progress": _handle_tool_progress,
        "tool_execution_complete": _handle_tool_complete,
    }
```

- [ ] **Step 4: Verify behavior is identical**

Run: `./.venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port 8000`
Expected: Server starts. Existing events still work (test by sending a prompt via curl).

```bash
curl -s -X POST http://localhost:8000/sessions | jq .id
# Use the returned ID:
curl -s -X POST http://localhost:8000/sessions/<ID>/prompt -H 'Content-Type: application/json' -d '{"prompt":"say hello"}'
```

- [ ] **Step 5: Commit**

```bash
git add engine.py
git commit -m "refactor: convert event handler to dispatch-table pattern

No behavior change. Extracts each event handler into its own method
and uses a class-level dispatch dict for cleaner routing.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Add new SDK event handlers

**Files:**
- Modify: `engine.py` (add handler methods + extend dispatch table)

- [ ] **Step 1: Add new handler methods**

Add these methods to `CopilotSessionController` after the existing handlers:

```python
    def _handle_assistant_intent(self, event_name, data):
        intent = normalize_text(getattr(data, "intent", None))
        if intent:
            self._emit_threadsafe("assistant_intent", {"intent": intent})

    def _handle_assistant_usage(self, event_name, data):
        self._emit_threadsafe("usage_stats", {
            "prompt_tokens": getattr(data, "prompt_tokens", 0) or getattr(data, "input_tokens", 0) or 0,
            "completion_tokens": getattr(data, "completion_tokens", 0) or getattr(data, "output_tokens", 0) or 0,
            "total_tokens": getattr(data, "total_tokens", 0) or 0,
        })

    def _handle_turn_start(self, event_name, data):
        self._emit_threadsafe("turn_started_sdk", {})

    def _handle_turn_end(self, event_name, data):
        self._emit_threadsafe("turn_complete_sdk", {})

    def _handle_reasoning_delta(self, event_name, data):
        chunk = normalize_text(getattr(data, "delta_content", None) or getattr(data, "content", None))
        if chunk:
            self._emit_threadsafe("reasoning_delta", {"content": chunk})

    def _handle_reasoning_complete(self, event_name, data):
        content = normalize_text(getattr(data, "content", None))
        if content:
            self._emit_threadsafe("reasoning_complete", {"content": content})

    def _handle_title_changed(self, event_name, data):
        title = normalize_text(getattr(data, "title", None))
        if title:
            self._emit_threadsafe("title_changed", {"title": title})

    def _handle_context_changed(self, event_name, data):
        self._emit_threadsafe("context_changed", {
            "used": getattr(data, "used", 0) or 0,
            "total": getattr(data, "total", 0) or 0,
        })

    def _handle_mode_changed(self, event_name, data):
        mode = normalize_text(getattr(data, "mode", None))
        if mode:
            self._emit_threadsafe("mode_changed", {"mode": mode})

    def _handle_session_warning(self, event_name, data):
        message = normalize_text(getattr(data, "message", None))
        if message:
            self._emit_threadsafe("session_warning", {"message": message})

    def _handle_session_info(self, event_name, data):
        message = normalize_text(getattr(data, "message", None))
        if message:
            self._emit_threadsafe("session_info", {"message": message})

    def _handle_subagent_started(self, event_name, data):
        self._emit_threadsafe("subagent_started", {
            "agent_id": normalize_text(getattr(data, "agent_id", None)) or "",
            "agent_name": normalize_text(getattr(data, "agent_name", None)) or "",
        })

    def _handle_subagent_completed(self, event_name, data):
        self._emit_threadsafe("subagent_completed", {
            "agent_id": normalize_text(getattr(data, "agent_id", None)) or "",
        })

    def _handle_subagent_failed(self, event_name, data):
        self._emit_threadsafe("subagent_failed", {
            "agent_id": normalize_text(getattr(data, "agent_id", None)) or "",
            "error": normalize_text(getattr(data, "error", None)) or "",
        })

    def _handle_skill_invoked(self, event_name, data):
        self._emit_threadsafe("skill_invoked", {
            "skill_name": normalize_text(getattr(data, "skill_name", None) or getattr(data, "name", None)) or "",
        })

    def _handle_permission_completed(self, event_name, data):
        self._emit_threadsafe("permission_resolved", {
            "request_id": normalize_text(getattr(data, "request_id", None)) or "",
        })

    def _handle_input_completed(self, event_name, data):
        self._emit_threadsafe("input_resolved", {
            "request_id": normalize_text(getattr(data, "request_id", None)) or "",
        })

    def _handle_session_start(self, event_name, data):
        self._emit_threadsafe("session_connected", {})

    def _handle_abort(self, event_name, data):
        self._busy = False
        self._emit_threadsafe("turn_aborted", {})

    def _handle_passthrough(self, event_name, data):
        """For informational events we log but don't need special handling."""
        self._emit_threadsafe(event_name, {})
```

- [ ] **Step 2: Extend the dispatch table**

Update the `_EVENT_DISPATCH` class variable to include all new handlers:

```python
    _EVENT_DISPATCH = {
        # Existing
        "assistant_message_delta": _handle_assistant_delta,
        "assistant_message": _handle_assistant_message,
        "session_error": _handle_session_error,
        "session_idle": _handle_session_idle,
        "elicitation_requested": _handle_elicitation,
        "tool_execution_start": _handle_tool_start,
        "tool_execution_partial_result": _handle_tool_partial,
        "tool_execution_progress": _handle_tool_progress,
        "tool_execution_complete": _handle_tool_complete,
        # New — assistant events
        "assistant_intent": _handle_assistant_intent,
        "assistant_usage": _handle_assistant_usage,
        "assistant_turn_start": _handle_turn_start,
        "assistant_turn_end": _handle_turn_end,
        "assistant_reasoning_delta": _handle_reasoning_delta,
        "assistant_reasoning": _handle_reasoning_complete,
        # New — session events
        "session_title_changed": _handle_title_changed,
        "session_context_changed": _handle_context_changed,
        "session_mode_changed": _handle_mode_changed,
        "session_warning": _handle_session_warning,
        "session_info": _handle_session_info,
        "session_start": _handle_session_start,
        # New — subagent events
        "subagent_started": _handle_subagent_started,
        "subagent_completed": _handle_subagent_completed,
        "subagent_failed": _handle_subagent_failed,
        # New — skill events
        "skill_invoked": _handle_skill_invoked,
        # New — resolution events
        "permission_completed": _handle_permission_completed,
        "user_input_completed": _handle_input_completed,
        # New — abort
        "abort": _handle_abort,
        # Informational
        "session_skills_loaded": _handle_passthrough,
        "session_mcp_servers_loaded": _handle_passthrough,
    }
```

- [ ] **Step 3: Verify server starts**

Run: `./.venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port 8000`
Expected: No errors. New events will be emitted when the SDK fires them.

- [ ] **Step 4: Commit**

```bash
git add engine.py
git commit -m "feat: map 30+ SDK event types to WebSocket events

Adds handlers for assistant.intent, assistant.usage, reasoning,
title_changed, context_changed, subagent events, skill invocation,
mode changes, and more. Total mapped events: 9 → 30+.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Add abort() method and API endpoint

**Files:**
- Modify: `engine.py` (add abort method)
- Modify: `api.py` (add endpoint)

- [ ] **Step 1: Add abort method to CopilotSessionController**

Add this method after `send_prompt()` in `engine.py`:

```python
    async def abort(self) -> bool:
        """Cancel the current turn. Returns True if abort was sent."""
        if not self.session or not self._busy:
            return False
        try:
            await self.session.abort()
        except Exception:
            pass
        self._busy = False
        await self._emit("turn_aborted", {})
        return True
```

- [ ] **Step 2: Add API endpoint**

In `api.py`, add after the `send_prompt` endpoint (around line 113):

```python
@app.post("/sessions/{session_id}/abort")
async def abort_turn(session_id: str) -> dict:
    controller = await get_controller_or_404(session_id)
    if not controller.busy:
        raise HTTPException(status_code=409, detail="session is not busy")
    aborted = await controller.abort()
    return {"aborted": aborted, "id": session_id}
```

- [ ] **Step 3: Add to frontend api.js**

In `src/api.js`, add after `sendUserInput`:

```javascript
export const abortTurn = (id) =>
  request("POST", `/sessions/${id}/abort`);
```

- [ ] **Step 4: Test with curl**

```bash
# Start a session and send a long prompt
ID=$(curl -s -X POST http://localhost:8000/sessions | jq -r .id)
curl -s -X POST "http://localhost:8000/sessions/$ID/prompt" -H 'Content-Type: application/json' -d '{"prompt":"write a very long essay about the history of computing"}'
# Immediately abort
curl -s -X POST "http://localhost:8000/sessions/$ID/abort"
# Expected: {"aborted": true, "id": "..."}
```

- [ ] **Step 5: Commit**

```bash
git add engine.py api.py src/api.js
git commit -m "feat: add turn cancellation (abort) endpoint

POST /sessions/{id}/abort cancels in-progress turns via SDK abort().
Frontend api.js also updated with abortTurn() function.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Add message history endpoint

**Files:**
- Modify: `engine.py` (add get_history method)
- Modify: `api.py` (add endpoint)

- [ ] **Step 1: Add get_history method to CopilotSessionController**

Add this method after `abort()`:

```python
    async def get_history(self) -> list[dict[str, Any]]:
        """Get full conversation history from SDK."""
        if not self.session:
            return []
        try:
            messages = await self.session.get_messages()
        except Exception:
            return []
        result = []
        for event in messages:
            event_name = normalized_event_type(event)
            data = getattr(event, "data", None)
            entry = {"type": event_name}
            if data:
                content = normalize_text(getattr(data, "content", None))
                if content:
                    entry["content"] = content
                tool_name = normalize_text(getattr(data, "tool_name", None))
                if tool_name:
                    entry["tool_name"] = tool_name
            result.append(entry)
        return result
```

- [ ] **Step 2: Add API endpoint**

In `api.py`, add after the abort endpoint:

```python
@app.get("/sessions/{session_id}/history")
async def get_history(session_id: str) -> dict:
    controller = await get_controller_or_404(session_id)
    messages = await controller.get_history()
    return {"messages": messages}
```

- [ ] **Step 3: Add to frontend api.js**

In `src/api.js`, add:

```javascript
export const getHistory = (id) =>
  request("GET", `/sessions/${id}/history`);
```

- [ ] **Step 4: Test with curl**

```bash
ID=$(curl -s -X POST http://localhost:8000/sessions | jq -r .id)
curl -s -X POST "http://localhost:8000/sessions/$ID/prompt" -H 'Content-Type: application/json' -d '{"prompt":"say hello"}'
sleep 5
curl -s "http://localhost:8000/sessions/$ID/history" | jq .
# Expected: {"messages": [{"type": "user_message", "content": "say hello"}, {"type": "assistant_message", "content": "..."}]}
```

- [ ] **Step 5: Commit**

```bash
git add engine.py api.py src/api.js
git commit -m "feat: add message history endpoint

GET /sessions/{id}/history returns full conversation history from SDK.
Frontend api.js updated with getHistory() function.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Add attachment support to send_prompt

**Files:**
- Modify: `engine.py` (extend send_prompt, add attachment builder)
- Modify: `api.py` (extend PromptRequest model)

- [ ] **Step 1: Add attachment builder to engine.py**

Add this method to `CopilotSessionController`, before `send_prompt()`:

```python
    @staticmethod
    def _build_attachment(attachment: dict[str, Any]) -> dict[str, Any]:
        att_type = attachment.get("type", "")
        if att_type == "file":
            path = attachment.get("path", "")
            if ".." in path:
                raise ValueError(f"Path traversal blocked: {path}")
            return {"type": "file", "path": path}
        if att_type == "directory":
            path = attachment.get("path", "")
            if ".." in path:
                raise ValueError(f"Path traversal blocked: {path}")
            return {"type": "directory", "path": path}
        if att_type == "blob":
            data = attachment.get("data", "")
            if len(data) > 1_048_576:  # 1MB limit
                raise ValueError("Blob attachment exceeds 1MB limit")
            return {
                "type": "blob",
                "displayName": attachment.get("name", "attachment"),
                "media_type": attachment.get("media_type", "text/plain"),
                "data": data,
            }
        if att_type == "selection":
            path = attachment.get("path", "")
            if ".." in path:
                raise ValueError(f"Path traversal blocked: {path}")
            return {
                "type": "selection",
                "path": path,
                "start": attachment.get("start", {"line": 0, "character": 0}),
                "end": attachment.get("end", {"line": 0, "character": 0}),
            }
        raise ValueError(f"Unknown attachment type: {att_type}")
```

- [ ] **Step 2: Extend send_prompt to accept attachments**

Modify the `send_prompt` signature and body. Change line 501:

```python
    async def send_prompt(self, prompt: str, attachments: list[dict[str, Any]] | None = None) -> dict[str, Any]:
```

Inside the method, after `self._turn_state.reset()` (line 511), before `await self.session.send_and_wait(...)`, build SDK attachments:

```python
                    sdk_attachments = None
                    if attachments:
                        try:
                            sdk_attachments = [self._build_attachment(a) for a in attachments]
                        except ValueError as exc:
                            self._turn_state.last_error = str(exc)
                            break
```

And change the `send_and_wait` call to include attachments:

```python
                    await self.session.send_and_wait(
                        prompt, timeout=self.config.timeout, attachments=sdk_attachments
                    )
```

- [ ] **Step 3: Extend API PromptRequest model**

In `api.py`, update the `PromptRequest` class:

```python
from typing import Any

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
```

Update the `send_prompt` endpoint to pass attachments:

```python
@app.post("/sessions/{session_id}/prompt")
async def send_prompt(session_id: str, body: PromptRequest) -> dict:
    controller = await get_controller_or_404(session_id)
    if controller.busy:
        raise HTTPException(status_code=409, detail="session is busy")
    attachments = [a.model_dump(exclude_none=True) for a in body.attachments] if body.attachments else None
    asyncio.create_task(controller.send_prompt(body.prompt, attachments=attachments))
    return {"started": True, "id": session_id, "prompt": body.prompt}
```

- [ ] **Step 4: Update frontend api.js**

Update the `sendPrompt` function:

```javascript
export const sendPrompt = (id, prompt, attachments = null) =>
  request("POST", `/sessions/${id}/prompt`, {
    prompt,
    ...(attachments ? { attachments } : {}),
  });
```

- [ ] **Step 5: Test with curl**

```bash
ID=$(curl -s -X POST http://localhost:8000/sessions | jq -r .id)
# Send with file attachment
curl -s -X POST "http://localhost:8000/sessions/$ID/prompt" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"summarize this file","attachments":[{"type":"file","path":"engine.py"}]}'
# Send with blob attachment
curl -s -X POST "http://localhost:8000/sessions/$ID/prompt" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"review this","attachments":[{"type":"blob","name":"code.py","data":"print(42)"}]}'
```

- [ ] **Step 6: Commit**

```bash
git add engine.py api.py src/api.js
git commit -m "feat: add file attachment support to prompt endpoint

Supports file, directory, and blob attachment types via the SDK.
Includes path traversal protection and 1MB blob size limit.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Migrate send_prompt from send_and_wait() to send()

**Files:**
- Modify: `engine.py` (rewrite send_prompt method)

This is a significant change per spec §7: replace blocking `send_and_wait()` with fire-and-forget `send()`, driven by events.

- [ ] **Step 1: Rewrite send_prompt()**

Replace the entire `send_prompt` method with the event-driven version:

```python
    async def send_prompt(self, prompt: str, attachments: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        await self.start()

        async with self._turn_lock:
            self._busy = True
            self._turn_state.reset()
            await self._emit("turn_started", {"prompt": prompt})

            sdk_attachments = None
            if attachments:
                try:
                    sdk_attachments = [self._build_attachment(a) for a in attachments]
                except ValueError as exc:
                    self._busy = False
                    await self._emit("turn_complete", {"prompt": prompt, "final_content": None, "error": str(exc)})
                    return {"prompt": prompt, "final_content": None, "error": str(exc)}

            result: dict[str, Any] = {"prompt": prompt, "final_content": None, "error": None}
            attempts = self.config.max_retries + 1

            for attempt in range(1, attempts + 1):
                self._turn_state.reset()
                try:
                    # Fire-and-forget: send() returns a message_id, does not block
                    await self.session.send(prompt, attachments=sdk_attachments)
                except ExitRequested:
                    raise
                except Exception as exc:
                    self._turn_state.last_error = str(exc)

                # Wait for the SDK to signal idle (turn complete)
                try:
                    await asyncio.wait_for(
                        self._turn_state.idle.wait(),
                        timeout=self.config.timeout + self.config.idle_wait_extra_seconds,
                    )
                except asyncio.TimeoutError:
                    # Fallback: try to recover content from message history
                    try:
                        messages = await self.session.get_messages()
                        for event in reversed(messages):
                            if is_assistant_message(event):
                                content = getattr(event.data, "content", None)
                                if content:
                                    self._turn_state.final_content = content
                                    break
                    except Exception:
                        pass

                if self._turn_state.final_content:
                    result["final_content"] = self._turn_state.final_content
                    break

                if self._turn_state.last_error:
                    result["error"] = self._turn_state.last_error

                if attempt < attempts:
                    await self._emit(
                        "turn_retry",
                        {"attempt": attempt, "max_retries": self.config.max_retries},
                    )

            self._busy = False
            await self._emit(
                "turn_complete",
                {
                    "prompt": prompt,
                    "final_content": result["final_content"],
                    "error": result["error"],
                },
            )
            return result
```

Key changes from the old version:
- Uses `send()` (fire-and-forget) instead of `send_and_wait()`
- Passes `attachments` to SDK
- Still waits for `idle` event — the event-driven signal that the turn is done
- Retry logic remains but now operates on the event-driven flow
- `abort()` works naturally because `send()` doesn't block a coroutine

- [ ] **Step 2: Verify server starts and prompts still work**

```bash
./.venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port 8000
```

Test:
```bash
ID=$(curl -s -X POST http://localhost:8000/sessions | jq -r .id)
curl -s -X POST "http://localhost:8000/sessions/$ID/prompt" \
  -H 'Content-Type: application/json' -d '{"prompt":"say hello"}'
sleep 5
curl -s "http://localhost:8000/sessions/$ID/history" | jq '.messages | length'
# Expected: > 0 messages
```

- [ ] **Step 3: Test abort works with fire-and-forget send**

```bash
ID=$(curl -s -X POST http://localhost:8000/sessions | jq -r .id)
curl -s -X POST "http://localhost:8000/sessions/$ID/prompt" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"write a very long essay about computing history in 2000 words"}'
sleep 1
curl -s -X POST "http://localhost:8000/sessions/$ID/abort"
# Expected: {"aborted": true, ...}
```

- [ ] **Step 4: Commit**

```bash
git add engine.py
git commit -m "refactor: migrate send_prompt from send_and_wait to send

Uses fire-and-forget send() + event-driven idle signal instead of
blocking send_and_wait(). Enables clean abort and attachment passing.
Retry logic preserved via session_error events.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Add session hooks

**Files:**
- Modify: `engine.py` (add hooks builder, pass to session creation)

- [ ] **Step 1: Add hook methods**

Add these methods to `CopilotSessionController`:

```python
    def _build_hooks(self) -> dict:
        return {
            "pre_tool_use": self._hook_pre_tool,
            "post_tool_use": self._hook_post_tool,
            "error_occurred": self._hook_error,
        }

    def _hook_pre_tool(self, hook_input):
        tool_name = str(hook_input.get("tool_name", "unknown") if isinstance(hook_input, dict) else getattr(hook_input, "tool_name", "unknown"))
        self._emit_threadsafe("hook_pre_tool", {"tool_name": tool_name})
        return {}

    def _hook_post_tool(self, hook_input):
        tool_name = str(hook_input.get("tool_name", "unknown") if isinstance(hook_input, dict) else getattr(hook_input, "tool_name", "unknown"))
        self._emit_threadsafe("hook_post_tool", {"tool_name": tool_name})
        return {}

    def _hook_error(self, hook_input):
        error = str(hook_input.get("error", "unknown") if isinstance(hook_input, dict) else getattr(hook_input, "error", "unknown"))
        self._emit_threadsafe("session_warning", {"message": f"Hook error: {error}"})
        return {}
```

- [ ] **Step 2: Pass hooks in _build_session_kwargs()**

In `_build_session_kwargs()`, add after the working_directory block:

```python
        session_kwargs["hooks"] = self._build_hooks()
```

- [ ] **Step 3: Verify server starts**

Run: `./.venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port 8000`
Expected: No errors. Hook events emit alongside tool events.

- [ ] **Step 4: Commit**

```bash
git add engine.py
git commit -m "feat: add session hooks for tool execution logging

Pre/post tool use hooks emit events for frontend telemetry.
Error hook surfaces errors as session warnings.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Enhance session snapshot with new fields

**Files:**
- Modify: `engine.py` (snapshot method + track new state)

- [ ] **Step 1: Add state tracking fields**

In `CopilotSessionController.__init__()`, add after `self._recent_events`:

```python
        self._session_title: str | None = None
        self._context_usage: dict[str, int] = {"used": 0, "total": 0}
        self._total_tokens: int = 0
```

- [ ] **Step 2: Update handlers to track state**

Update `_handle_title_changed` to also store the title:

```python
    def _handle_title_changed(self, event_name, data):
        title = normalize_text(getattr(data, "title", None))
        if title:
            self._session_title = title
            self._emit_threadsafe("title_changed", {"title": title})
```

Update `_handle_context_changed` to also store:

```python
    def _handle_context_changed(self, event_name, data):
        used = getattr(data, "used", 0) or 0
        total = getattr(data, "total", 0) or 0
        self._context_usage = {"used": used, "total": total}
        self._emit_threadsafe("context_changed", {"used": used, "total": total})
```

Update `_handle_assistant_usage` to accumulate tokens:

```python
    def _handle_assistant_usage(self, event_name, data):
        prompt_tokens = getattr(data, "prompt_tokens", 0) or getattr(data, "input_tokens", 0) or 0
        completion_tokens = getattr(data, "completion_tokens", 0) or getattr(data, "output_tokens", 0) or 0
        total = getattr(data, "total_tokens", 0) or (prompt_tokens + completion_tokens)
        self._total_tokens += total
        self._emit_threadsafe("usage_stats", {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total,
        })
```

- [ ] **Step 3: Enhance snapshot()**

Add to the returned dict in `snapshot()`:

```python
            "title": self._session_title,
            "context_usage": self._context_usage,
            "total_tokens": self._total_tokens,
```

- [ ] **Step 4: Verify with curl**

```bash
ID=$(curl -s -X POST http://localhost:8000/sessions | jq -r .id)
curl -s "http://localhost:8000/sessions/$ID" | jq '{title, context_usage, total_tokens}'
# Expected: {"title": null, "context_usage": {"used": 0, "total": 0}, "total_tokens": 0}
```

- [ ] **Step 5: Commit**

```bash
git add engine.py
git commit -m "feat: enhance session snapshot with title, context, tokens

Session snapshot now includes auto-generated title, context window
usage, and cumulative token count from usage events.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: Final verification

- [ ] **Step 1: Start the server**

```bash
cd /mnt/legion/copilot
./.venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port 8000
```

- [ ] **Step 2: Run integration check**

```bash
# Create session
ID=$(curl -s -X POST http://localhost:8000/sessions | jq -r .id)
echo "Session: $ID"

# Check snapshot has new fields
curl -s "http://localhost:8000/sessions/$ID" | jq '{title, context_usage, total_tokens, busy}'

# Send prompt
curl -s -X POST "http://localhost:8000/sessions/$ID/prompt" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"say hello"}'
sleep 5

# Check history
curl -s "http://localhost:8000/sessions/$ID/history" | jq '.messages | length'

# Check snapshot updated
curl -s "http://localhost:8000/sessions/$ID" | jq '{title, total_tokens}'

# Cleanup
curl -s -X DELETE "http://localhost:8000/sessions/$ID"
```

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during integration verification

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
