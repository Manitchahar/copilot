# Claude Cowork — SDK Integration Design Spec

## Problem Statement

Claude Cowork wraps the GitHub Copilot SDK (`github-copilot-sdk` 0.2.0) but uses only ~15% of its API surface. The engine imports 2 types, maps 9 of 77 event types, and passes 5 of 24 session creation parameters. Key SDK capabilities — turn cancellation, file attachments, message history, reasoning effort, and rich event data — are already installed but not wired.

This spec covers wiring those SDK features into the backend and API layer so the frontend (see `ui-polish.md`) has the data it needs.

## Relationship to UI Polish Spec

| Spec | Scope |
|------|-------|
| `ui-polish.md` | Frontend: how things look — markdown, tool cards, scroll, input |
| **This spec** | Backend: what data flows to the UI — events, API endpoints, SDK params |

These specs are designed to be implemented together. The UI spec defines components that consume data this spec makes available.

---

## 1. Full Event Mapping

### Current State

`engine.py` normalizes 9 SDK event types into custom event names emitted to the WebSocket:

```
assistant_message_delta → assistant_delta
assistant_message      → assistant_message
session_error          → session_error
session_idle           → (internal flag)
elicitation_requested  → input_notice
tool_execution_start   → tool_start
tool_execution_partial → tool_output
tool_execution_progress → tool_progress
tool_execution_complete → tool_complete
```

### New Event Mappings

Add these SDK events to `on_sdk_event()`:

| SDK Event | Emit As | UI Usage |
|-----------|---------|----------|
| `assistant.intent` | `assistant_intent` | Show "Searching files…" indicator before tools run |
| `assistant.usage` | `usage_stats` | Token counts per response (prompt + completion) |
| `assistant.turn_start` | `turn_started` | Clear turn boundary, trigger typing indicator |
| `assistant.turn_end` | `turn_complete` | End turn, finalize tool cards |
| `assistant.reasoning_delta` | `reasoning_delta` | Extended thinking visualization (collapsible) |
| `assistant.reasoning` | `reasoning_complete` | Final reasoning content |
| `session.title_changed` | `title_changed` | Auto-name sessions in sidebar |
| `session.context_changed` | `context_changed` | Context window usage bar |
| `session.skills_loaded` | `skills_loaded` | Informational (log only for now) |
| `session.mcp_servers_loaded` | `mcp_loaded` | Informational (log only for now) |
| `session.mode_changed` | `mode_changed` | Show current mode (plan/autopilot/interactive) |
| `session.warning` | `session_warning` | Display warning banner |
| `session.info` | `session_info` | Informational toast |
| `subagent.started` | `subagent_started` | Show sub-agent card in tool visualization |
| `subagent.completed` | `subagent_completed` | Mark sub-agent as done |
| `subagent.failed` | `subagent_failed` | Mark sub-agent as errored |
| `skill.invoked` | `skill_invoked` | Show skill activation in tool cards |
| `permission.completed` | `permission_resolved` | Update permission card state |
| `user_input.completed` | `input_resolved` | Update input card state |
| `session.start` | `session_connected` | Connection confirmation |
| `abort` | `turn_aborted` | Clear busy state, show "Cancelled" |

### Event Data Extraction

Each event handler extracts relevant fields from `event.data`:

```python
# assistant.intent
{ "intent": str }

# assistant.usage
{ "prompt_tokens": int, "completion_tokens": int, "total_tokens": int }

# session.title_changed
{ "title": str }

# session.context_changed
{ "used": int, "total": int }  # context window tokens

# subagent.started
{ "agent_id": str, "agent_name": str }

# skill.invoked
{ "skill_name": str }
```

### Event Normalization Strategy

SDK event types come as either enums or strings. The current normalization pattern (lowercase + replace "." with "_") works. Extend it:

```python
def normalize_event_type(event) -> str:
    event_type = getattr(event, "type", "")
    value = getattr(event_type, "value", str(event_type))
    return str(value).lower().replace(".", "_")
```

Add a mapping dict instead of the current if/elif chain for cleaner dispatch:

```python
EVENT_HANDLERS = {
    "assistant_message_delta": _handle_assistant_delta,
    "assistant_message": _handle_assistant_message,
    "assistant_intent": _handle_intent,
    "assistant_usage": _handle_usage,
    "assistant_turn_start": _handle_turn_start,
    "assistant_turn_end": _handle_turn_end,
    # ... etc
}

def on_sdk_event(self, event):
    event_type = normalize_event_type(event)
    handler = EVENT_HANDLERS.get(event_type)
    if handler:
        handler(self, event)
    # Unknown events logged at debug level
```

---

## 2. Turn Cancellation (abort)

### Backend

Add `abort()` method to `CopilotSessionController`:

```python
async def abort(self):
    """Cancel the current turn. Safe to call when idle."""
    if self._session:
        await self._session.abort()
        self._emit("turn_aborted", {})
        self._busy = False
```

### API Endpoint

```
POST /sessions/{session_id}/abort
Response: { "status": "aborted" }
```

No request body needed. Returns 200 if aborted, 404 if session not found, 409 if session is already idle.

### Frontend Contract

When user clicks stop button:
1. `POST /sessions/{id}/abort`
2. Receive `turn_aborted` event via WebSocket
3. Clear busy state, finalize any in-progress tool cards
4. Show "Cancelled" indicator on the interrupted message

---

## 3. File Attachments

### Backend

Extend `send_prompt()` to accept attachments:

```python
async def send_prompt(self, prompt: str, attachments: list[dict] | None = None):
    sdk_attachments = None
    if attachments:
        sdk_attachments = [self._build_attachment(a) for a in attachments]
    
    await self._session.send(prompt, attachments=sdk_attachments)
```

Attachment builder maps frontend format to SDK types:

```python
def _build_attachment(self, attachment: dict) -> dict:
    att_type = attachment["type"]
    if att_type == "file":
        return {"type": "file", "path": attachment["path"]}
    elif att_type == "directory":
        return {"type": "directory", "path": attachment["path"]}
    elif att_type == "blob":
        return {
            "type": "blob",
            "displayName": attachment["name"],
            "media_type": attachment.get("media_type", "text/plain"),
            "data": attachment["data"]
        }
    elif att_type == "selection":
        return {
            "type": "selection",
            "path": attachment["path"],
            "start": attachment["start"],
            "end": attachment["end"]
        }
```

### API Endpoint

Extend existing prompt endpoint:

```
POST /sessions/{session_id}/prompt
Body: {
    "prompt": "Review this file",
    "attachments": [
        { "type": "file", "path": "/home/user/src/main.py" },
        { "type": "blob", "name": "clipboard.txt", "data": "pasted content" }
    ]
}
```

### Security

- File paths are validated: must exist, must be within allowed directories
- Blob data has a size limit (configurable, default 1MB)
- No path traversal (`..` blocked)

### Web vs Electron Considerations

**Current (web dev mode):** The backend runs locally, so file paths on the server ARE local paths. The user can:
- Type a file path in the input (developer UX)
- Paste text → creates `blob` attachment
- The API accepts paths because client and server share the same filesystem

**Future (Electron):** Same architecture — the Electron app runs the FastAPI backend locally. File paths work natively. Add:
- Native file picker dialog → resolves to local path → sends as `file` attachment
- Drag-and-drop from OS → resolves to local path

No architecture changes needed for the web → Electron transition.

### Frontend Contract

The chat input supports:
- Type file path with `@` prefix → creates `file` attachment (e.g., `@src/main.py`)
- Paste text → creates `blob` attachment
- Attachments shown as chips below the input, removable before sending
- (Electron future: drag-and-drop files, native file picker)

---

## 4. Message History

### Backend

Expose `session.get_messages()` via API:

```python
async def get_history(self) -> list[dict]:
    """Get full conversation history from SDK."""
    if not self._session:
        return []
    messages = await self._session.get_messages()
    return [self._serialize_event(e) for e in messages]
```

### API Endpoint

```
GET /sessions/{session_id}/history
Response: {
    "messages": [
        { "type": "user.message", "data": { "content": "..." }, "timestamp": ... },
        { "type": "assistant.message", "data": { "content": "..." }, "timestamp": ... },
        { "type": "tool.execution_complete", "data": { ... }, "timestamp": ... }
    ]
}
```

### Frontend Contract

On page load / reconnect:
1. `GET /sessions/{id}/history` → rebuild message list
2. Connect WebSocket for live events
3. Deduplicate: history events have IDs, skip any already rendered

This solves the "page refresh loses everything" problem.

---

## 5. Reasoning Effort

### Config

Add to `AppConfig`:

```python
reasoning_effort: str | None = None  # "low", "medium", "high", "xhigh", or None
```

Add to `config.yaml`:

```yaml
reasoning_effort: medium
```

### Backend

Pass to session creation:

```python
if self.config.reasoning_effort:
    session_kwargs["reasoning_effort"] = self.config.reasoning_effort
```

### Frontend Contract

- Reasoning deltas (`reasoning_delta` events) render in a collapsible "Thinking…" section above the response
- Shows the AI's chain-of-thought when `reasoning_effort` is set
- Collapsed by default, expandable on click

---

## 6. Session Hooks

### Backend

Build hooks for logging and telemetry:

```python
def _build_hooks(self) -> dict:
    return {
        "pre_tool_use": self._on_pre_tool,
        "post_tool_use": self._on_post_tool,
        "error_occurred": self._on_hook_error,
    }

def _on_pre_tool(self, hook_input):
    """Log tool execution start for telemetry."""
    tool_name = hook_input.get("tool_name", "unknown")
    self._emit("hook_pre_tool", {"tool_name": tool_name})
    return {}  # No modifications

def _on_post_tool(self, hook_input):
    """Log tool execution end, capture timing."""
    tool_name = hook_input.get("tool_name", "unknown")
    self._emit("hook_post_tool", {"tool_name": tool_name})
    return {}

def _on_hook_error(self, hook_input):
    """Log errors for debugging."""
    error = hook_input.get("error", "unknown")
    self._emit("session_warning", {"message": f"Hook error: {error}"})
    return {}
```

Hooks complement event mapping — events tell the UI *what happened*, hooks let us *intercept and log* tool execution with timing data.

---

## 7. Switch from `send_and_wait()` to `send()`

### Current Problem

`send_and_wait()` blocks the async task until the response is complete. This works but:
- The caller can't do anything while waiting
- Timeout handling is manual
- Abort requires a separate mechanism to signal the blocked coroutine

### New Approach

Use `send()` (fire-and-forget) + event-driven flow:

```python
async def send_prompt(self, prompt: str, attachments=None):
    self._busy = True
    self._emit("turn_started", {"prompt": prompt})
    
    # Fire and forget — events drive the rest
    await self._session.send(prompt, attachments=sdk_attachments)
    
    # Don't wait. Events will signal:
    # - assistant_delta → streaming content
    # - tool_start/complete → tool execution
    # - session.idle → turn complete
```

The `session.idle` event (already handled) signals turn completion. This simplifies the flow and makes abort() work naturally.

### Retry Logic

Current retry logic wraps `send_and_wait()` in a loop. With `send()`, retries happen at the event level:
- On `session_error`, check retry count and re-send if under limit
- Emit `turn_retry` event to UI

---

## 8. New API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/sessions/{id}/abort` | POST | Cancel current turn |
| `/sessions/{id}/history` | GET | Full message history |
| `/sessions/{id}/prompt` | POST | Extended with `attachments` field |

### Existing Endpoints — Enhanced

| Endpoint | Change |
|----------|--------|
| `GET /sessions/{id}` | Add `title`, `context_usage`, `total_tokens` to snapshot |
| `WebSocket /sessions/{id}/events` | Emit 30 event types instead of 9 |

---

## 9. Config.yaml Extensions

```yaml
# Existing
model: gpt-4.1
timeout: 60
streaming_enabled: true
system_prompt: |
  You are Claude Cowork...

# NEW
reasoning_effort: medium        # low, medium, high, xhigh (or omit for default)
working_directory: .            # explicit working directory for session
```

These are simple additions to the existing `AppConfig` dataclass and YAML parser.

---

## 10. AppConfig Changes

New fields added to the `AppConfig` dataclass:

```python
@dataclass
class AppConfig:
    # ... existing 21 fields ...
    
    # NEW
    reasoning_effort: str | None = None
    working_directory: str | None = None
```

Total: 23 config properties (up from 21).

---

## Out of Scope

- ❌ MCP servers / connectors (future workflow integration)
- ❌ Skills / plugins (future extensibility)
- ❌ Custom agents (future multi-agent)
- ❌ `define_tool()` custom tools (future, tied to plugins)
- ❌ Model switching mid-session (BYOK concerns)
- ❌ Computer use / screen control
- ❌ Mobile → Desktop sync
- ❌ Scheduled tasks
- ❌ `list_models()` endpoint (deferred until model switching)
- ❌ Infinite sessions (deferred)

---

## Success Criteria

1. WebSocket emits 30+ event types (up from 9)
2. `POST /sessions/{id}/abort` cancels in-progress turns
3. `POST /sessions/{id}/prompt` accepts `attachments` array
4. `GET /sessions/{id}/history` returns full conversation history
5. `reasoning_effort` configurable via `config.yaml`
6. Session hooks log pre/post tool execution
7. `send()` replaces `send_and_wait()` for streaming flow
8. Session snapshot includes `title`, `context_usage`, `total_tokens`
9. All new events include properly extracted data fields
10. No breaking changes to existing API contracts
