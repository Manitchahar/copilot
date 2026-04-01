from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import threading
from typing import Any
from uuid import uuid4

from copilot import CopilotClient
from copilot.types import PermissionRequestResult


@dataclass
class AppConfig:
    model: str = "gpt-5.4-mini"
    timeout: float = 60.0
    max_retries: int = 2
    idle_wait_extra_seconds: float = 5.0
    streaming_enabled: bool = True
    show_tool_events: bool = True
    system_prompt: str = ""

    initial_prompt: str = ""
    user_prompt_text: str = "\nYou: "
    user_input_prompt_text: str = "Your answer: "
    chat_start_message: str = "Claude Cowork session started. Type 'exit' to quit."
    goodbye_message: str = "Goodbye."
    assistant_prefix: str = "Claude Cowork: "
    exit_commands: set[str] = field(default_factory=lambda: {"exit", "quit", "q"})

    command_approval_mode: str = "permission"
    auto_approve_read_only: bool = True
    auto_approve_tools: set[str] = field(default_factory=lambda: {"read", "search"})
    dangerous_command_tokens: set[str] = field(
        default_factory=lambda: {"rm -rf", "sudo ", "curl |", "wget |"}
    )
    permission_prompt_text: str = "Approve this action? [y/N]: "
    approval_yes_values: set[str] = field(default_factory=lambda: {"y", "yes"})
    permission_block_message: str = "Blocked by local safety policy."
    permission_deny_message: str = "Denied by interactive policy."
    reasoning_effort: str | None = None
    working_directory: str | None = None


class ExitRequested(Exception):
    pass


PERSONA_GUARDRAIL_SUFFIX = """Runtime behavior override:
- Do not answer like GitHub Copilot CLI.
- Do not mention GitHub Copilot, Copilot CLI, slash commands, or GitHub-specific workflows unless the user explicitly asks.
- Answer like Claude Cowork or Open Interpreter: direct, practical, execution-focused, and calm.
- Prefer concrete actions and grounded explanations over platform-specific framing.
"""


def parse_scalar(value: str):
    text = value.strip()
    if not text:
        return ""

    if text.startswith('"') and text.endswith('"'):
        return bytes(text[1:-1], "utf-8").decode("unicode_escape")
    if text.startswith("'") and text.endswith("'"):
        return bytes(text[1:-1], "utf-8").decode("unicode_escape")

    lowered = text.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"

    try:
        if "." in text:
            return float(text)
        return int(text)
    except ValueError:
        return text


def parse_yaml_like_file(path: Path) -> dict:
    if not path.exists():
        return {}

    parsed = {}
    lines = path.read_text(encoding="utf-8").splitlines()
    index = 0
    while index < len(lines):
        raw_line = lines[index]
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            index += 1
            continue

        key, raw_value = line.split(":", 1)
        key = key.strip()
        value = raw_value.strip()
        if not key:
            index += 1
            continue

        if value.startswith("|"):
            parent_indent = len(raw_line) - len(raw_line.lstrip(" "))
            block_lines = []
            index += 1
            while index < len(lines):
                next_line = lines[index]
                next_stripped = next_line.strip()
                next_indent = len(next_line) - len(next_line.lstrip(" "))
                if next_stripped and next_indent <= parent_indent:
                    break
                block_lines.append(next_line)
                index += 1

            content_indent = min(
                (
                    len(block_line) - len(block_line.lstrip(" "))
                    for block_line in block_lines
                    if block_line.strip()
                ),
                default=parent_indent + 2,
            )
            parsed[key] = "\n".join(
                block_line[content_indent:] if block_line.strip() else ""
                for block_line in block_lines
            ).rstrip()
            continue

        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            parsed[key] = [
                str(parse_scalar(item.strip())).strip()
                for item in inner.split(",")
                if item.strip()
            ] if inner else []
            index += 1
            continue

        parsed[key] = parse_scalar(value)
        index += 1

    return parsed


def to_bool(value, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "y", "on"}:
            return True
        if lowered in {"false", "0", "no", "n", "off"}:
            return False
    return default


def to_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def to_float(value, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def to_str(value, default: str) -> str:
    if value is None:
        return default
    return str(value)


def to_set(value, default_values: set[str]) -> set[str]:
    if isinstance(value, list):
        return {str(item).strip().lower() for item in value if str(item).strip()}
    if isinstance(value, str):
        return {item.strip().lower() for item in value.split(",") if item.strip()}
    return default_values


def normalize_command_approval_mode(value, default: str = "permission") -> str:
    normalized = to_str(value, default).strip().lower()
    if normalized in {"auto", "automatic"}:
        return "auto"
    return "permission"


def build_provider_from_env() -> dict[str, object] | None:
    provider_type = os.getenv("COPILOT_PROVIDER_TYPE", "").strip().lower()
    if provider_type not in {"openai", "azure", "anthropic"}:
        return None

    provider: dict[str, object] = {"type": provider_type}

    base_url = os.getenv("COPILOT_PROVIDER_BASE_URL", "").strip()
    wire_api = os.getenv("COPILOT_PROVIDER_WIRE_API", "").strip().lower()
    api_key = os.getenv("COPILOT_PROVIDER_API_KEY", "").strip()
    bearer_token = os.getenv("COPILOT_PROVIDER_BEARER_TOKEN", "").strip()
    azure_api_version = os.getenv("COPILOT_PROVIDER_AZURE_API_VERSION", "").strip()

    if base_url:
        provider["base_url"] = base_url
    if wire_api in {"completions", "responses"}:
        provider["wire_api"] = wire_api
    if api_key:
        provider["api_key"] = api_key
    if bearer_token:
        provider["bearer_token"] = bearer_token
    if provider_type == "azure" and azure_api_version:
        provider["azure"] = {"api_version": azure_api_version}

    return provider


def describe_provider(provider: dict[str, object] | None) -> str:
    if not provider:
        return "copilot-sdk-default"
    provider_type = to_str(provider.get("type"), "").strip().lower()
    return provider_type or "custom-provider"


def resolve_config() -> tuple[AppConfig, Path]:
    config_path = Path("config.yaml")
    config = parse_yaml_like_file(config_path)

    return (
        AppConfig(
            model=to_str(config.get("model"), "gpt-5.4-mini"),
            timeout=to_float(config.get("timeout"), 60.0),
            max_retries=to_int(config.get("max_retries"), 2),
            idle_wait_extra_seconds=to_float(config.get("idle_wait_extra_seconds"), 5.0),
            streaming_enabled=to_bool(config.get("streaming_enabled"), True),
            show_tool_events=to_bool(config.get("show_tool_events"), True),
            system_prompt=to_str(config.get("system_prompt"), "").strip(),
            initial_prompt=to_str(config.get("initial_prompt"), "").strip(),
            user_prompt_text=to_str(config.get("user_prompt_text"), "\nYou: "),
            user_input_prompt_text=to_str(
                config.get("user_input_prompt_text"), "Your answer: "
            ),
            chat_start_message=to_str(
                config.get("chat_start_message"),
                "Claude Cowork session started. Type 'exit' to quit.",
            ),
            goodbye_message=to_str(config.get("goodbye_message"), "Goodbye."),
            assistant_prefix=to_str(config.get("assistant_prefix"), "Claude Cowork: "),
            exit_commands=to_set(config.get("exit_commands"), {"exit", "quit", "q"}),
            command_approval_mode=normalize_command_approval_mode(
                config.get("command_approval_mode")
            ),
            auto_approve_read_only=to_bool(config.get("auto_approve_read_only"), True),
            auto_approve_tools=to_set(config.get("auto_approve_tools"), {"read", "search"}),
            dangerous_command_tokens=to_set(
                config.get("dangerous_command_tokens"),
                {"rm -rf", "sudo ", "curl |", "wget |"},
            ),
            permission_prompt_text=to_str(
                config.get("permission_prompt_text"), "Approve this action? [y/N]: "
            ),
            approval_yes_values=to_set(config.get("approval_yes_values"), {"y", "yes"}),
            permission_block_message=to_str(
                config.get("permission_block_message"), "Blocked by local safety policy."
            ),
            permission_deny_message=to_str(
                config.get("permission_deny_message"), "Denied by interactive policy."
            ),
            reasoning_effort=to_str(config.get("reasoning_effort"), None) if config.get("reasoning_effort") else None,
            working_directory=to_str(config.get("working_directory"), None) if config.get("working_directory") else None,
        ),
        config_path,
    )


def normalize_text(value) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text if text else None


def prompt_input(prompt: str) -> str:
    try:
        return input(prompt)
    except (EOFError, KeyboardInterrupt) as exc:
        raise ExitRequested() from exc


def serialize_event_value(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=True)
    except TypeError:
        return str(value)


def format_tool_args(arguments) -> str | None:
    rendered = serialize_event_value(arguments)
    if not rendered:
        return None
    if len(rendered) > 240:
        return f"{rendered[:237]}..."
    return rendered


def format_tool_result(result) -> str | None:
    if result is None:
        return None
    if hasattr(result, "detailed_content") and getattr(result, "detailed_content"):
        return str(getattr(result, "detailed_content"))
    if hasattr(result, "content") and getattr(result, "content"):
        return str(getattr(result, "content"))
    if hasattr(result, "contents") and getattr(result, "contents"):
        return serialize_event_value(getattr(result, "contents"))
    return serialize_event_value(result)


def is_assistant_message(event) -> bool:
    event_type = getattr(event, "type", "")
    value = getattr(event_type, "value", event_type)
    return "assistant_message" in str(value).lower().replace(".", "_")


def normalized_event_type(event) -> str:
    event_type = getattr(event, "type", "")
    value = getattr(event_type, "value", event_type)
    return str(value).lower().replace(".", "_")


def build_system_message(config: AppConfig) -> dict[str, str] | None:
    content_parts = [config.system_prompt.strip(), PERSONA_GUARDRAIL_SUFFIX.strip()]
    content = "\n\n".join(part for part in content_parts if part)
    if not content:
        return None
    return {"mode": "append", "content": content}


@dataclass
class PendingDecision:
    request_id: str
    kind: str
    payload: dict[str, Any]
    response: dict[str, Any] | None = None
    event: threading.Event = field(default_factory=threading.Event, repr=False)


class TurnState:
    def __init__(self) -> None:
        self.idle = asyncio.Event()
        self.final_content: str | None = None
        self.last_error: str | None = None
        self.saw_delta = False
        self.active_tool_names: dict[str, str] = {}

    def reset(self) -> None:
        self.idle = asyncio.Event()
        self.final_content = None
        self.last_error = None
        self.saw_delta = False
        self.active_tool_names = {}


class CopilotSessionController:
    def __init__(self, config: AppConfig, *, mode: str = "service") -> None:
        self.config = config
        self.mode = mode
        self._fallback_id = str(uuid4())
        self.client: CopilotClient | None = None
        self.session = None
        self.sdk_session_id: str | None = None
        self._unsubscribe = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._started = False
        self._closed = False
        self._busy = False
        self._turn_lock = asyncio.Lock()
        self._turn_state = TurnState()
        self._subscribers: set[asyncio.Queue] = set()
        self._pending_requests: dict[str, PendingDecision] = {}
        self._recent_events: list[dict[str, Any]] = []
        self._session_title: str | None = None
        self._context_usage: dict[str, int] = {"used": 0, "total": 0}
        self._total_tokens: int = 0
        self._provider = build_provider_from_env()

    @property
    def busy(self) -> bool:
        return self._busy

    @property
    def session_id(self) -> str:
        return self.sdk_session_id or self._fallback_id

    def _build_hooks(self) -> dict:
        """Build session hooks for tool execution logging."""
        return {
            "pre_tool_use": self._hook_pre_tool,
            "post_tool_use": self._hook_post_tool,
            "error_occurred": self._hook_error,
        }

    def _hook_pre_tool(self, hook_input):
        """Log tool execution start for telemetry."""
        tool_name = str(hook_input.get("tool_name", "unknown") if isinstance(hook_input, dict) else getattr(hook_input, "tool_name", "unknown"))
        self._emit_threadsafe("hook_pre_tool", {"tool_name": tool_name})
        return {}

    def _hook_post_tool(self, hook_input):
        """Log tool execution end."""
        tool_name = str(hook_input.get("tool_name", "unknown") if isinstance(hook_input, dict) else getattr(hook_input, "tool_name", "unknown"))
        self._emit_threadsafe("hook_post_tool", {"tool_name": tool_name})
        return {}

    def _hook_error(self, hook_input):
        """Log errors for debugging."""
        error = str(hook_input.get("error", "unknown") if isinstance(hook_input, dict) else getattr(hook_input, "error", "unknown"))
        self._emit_threadsafe("session_warning", {"message": f"Hook error: {error}"})
        return {}

    def _build_session_kwargs(self) -> dict[str, object]:
        session_kwargs: dict[str, object] = {
            "on_permission_request": self._on_permission_request,
            "on_user_input_request": self._on_user_input_request,
            "model": self.config.model,
            "system_message": build_system_message(self.config),
            "streaming": self.config.streaming_enabled,
        }
        if self._provider:
            session_kwargs["provider"] = self._provider
        if self.config.reasoning_effort:
            session_kwargs["reasoning_effort"] = self.config.reasoning_effort
        if self.config.working_directory:
            session_kwargs["working_directory"] = self.config.working_directory
        session_kwargs["hooks"] = self._build_hooks()
        return session_kwargs

    def runtime_metadata(self) -> dict[str, Any]:
        return {
            "engine": "copilot-sdk",
            "model": self.config.model,
            "provider": describe_provider(self._provider),
            "approval_mode": self.config.command_approval_mode,
            "streaming": self.config.streaming_enabled,
            "tool_events": self.config.show_tool_events,
        }

    async def start(self, *, session_id: str | None = None, resume: bool = False) -> None:
        if self._started:
            return

        self._loop = asyncio.get_running_loop()
        self.client = CopilotClient()
        await self.client.start()

        session_kwargs = self._build_session_kwargs()
        if resume and session_id:
            self.session = await self.client.resume_session(session_id, **session_kwargs)
        else:
            self.session = await self.client.create_session(session_id=session_id, **session_kwargs)

        self.sdk_session_id = getattr(self.session, "session_id", None) or session_id or self._fallback_id
        self._unsubscribe = self.session.on(self._on_sdk_event)
        self._started = True
        self._emit_threadsafe(
            "session_started",
            {
                "id": self.session_id,
                "sdk_session_id": self.sdk_session_id,
                "runtime": self.runtime_metadata(),
            },
        )

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True

        for pending in list(self._pending_requests.values()):
            pending.response = {"cancelled": True}
            pending.event.set()

        if self._unsubscribe is not None:
            self._unsubscribe()
            self._unsubscribe = None
        if self.session is not None:
            await self.session.disconnect()
            self.session = None
        if self.client is not None:
            await self.client.stop()
            self.client = None

        await self._emit(
            "session_closed",
            {
                "id": self.session_id,
                "sdk_session_id": self.sdk_session_id,
            },
        )

    def snapshot(self) -> dict[str, Any]:
        return {
            "id": self.session_id,
            "sdk_session_id": self.sdk_session_id,
            "busy": self._busy,
            "started": self._started,
            "closed": self._closed,
            "runtime": self.runtime_metadata(),
            "pending_requests": [
                {
                    "request_id": pending.request_id,
                    "kind": pending.kind,
                    "payload": pending.payload,
                }
                for pending in self._pending_requests.values()
            ],
            "recent_events": self._recent_events[-20:],
            "title": self._session_title,
            "context_usage": self._context_usage,
            "total_tokens": self._total_tokens,
        }

    def subscribe(self, *, replay_recent: bool = True) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._subscribers.add(queue)
        if replay_recent:
            for event in self._recent_events[-20:]:
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    break
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)

    @staticmethod
    def _validate_attachment_path(path_str: str) -> str:
        """Validate attachment path exists and is within allowed directories."""
        path = Path(path_str).expanduser().resolve()
        repo_root = Path.cwd().resolve()
        if not path.exists():
            raise ValueError(f"Attachment path does not exist: {path}")
        if path != repo_root and repo_root not in path.parents:
            raise ValueError(f"Attachment path is outside allowed directories: {path}")
        return str(path)

    @staticmethod
    def _build_attachment(attachment: dict[str, Any]) -> dict[str, Any]:
        """Convert frontend attachment format to SDK format."""
        att_type = attachment.get("type", "")
        if att_type == "file":
            path = CopilotSessionController._validate_attachment_path(attachment.get("path", ""))
            return {"type": "file", "path": path}
        if att_type == "directory":
            path = CopilotSessionController._validate_attachment_path(attachment.get("path", ""))
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
            path = CopilotSessionController._validate_attachment_path(attachment.get("path", ""))
            return {
                "type": "selection",
                "path": path,
                "start": attachment.get("start", {"line": 0, "character": 0}),
                "end": attachment.get("end", {"line": 0, "character": 0}),
            }
        raise ValueError(f"Unknown attachment type: {att_type}")

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

    @staticmethod
    def _serialize_sdk_payload(value):
        """Recursively serialize SDK objects into JSON-safe dicts."""
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, list):
            return [CopilotSessionController._serialize_sdk_payload(item) for item in value]
        if isinstance(value, dict):
            return {
                str(key): CopilotSessionController._serialize_sdk_payload(item)
                for key, item in value.items()
            }
        if hasattr(value, "model_dump"):
            return CopilotSessionController._serialize_sdk_payload(
                value.model_dump(exclude_none=True)
            )
        if hasattr(value, "__dict__"):
            return {
                key: CopilotSessionController._serialize_sdk_payload(item)
                for key, item in vars(value).items()
                if not key.startswith("_") and item is not None
            }
        return str(value)

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
            entry = {
                "id": normalize_text(
                    getattr(data, "message_id", None)
                    or getattr(data, "tool_call_id", None)
                    or getattr(data, "request_id", None)
                ),
                "type": event_name,
                "data": self._serialize_sdk_payload(data),
            }
            timestamp = getattr(event, "timestamp", None) or getattr(data, "timestamp", None)
            if timestamp is not None:
                entry["timestamp"] = serialize_event_value(timestamp)
            result.append(entry)
        return result

    def resolve_permission(self, request_id: str, approved: bool) -> bool:
        pending = self._pending_requests.get(request_id)
        if pending is None or pending.kind != "permission":
            return False
        pending.response = {"approved": approved}
        pending.event.set()
        return True

    def resolve_user_input(
        self,
        request_id: str,
        *,
        answer: str,
        was_freeform: bool = True,
    ) -> bool:
        pending = self._pending_requests.get(request_id)
        if pending is None or pending.kind != "user_input":
            return False
        pending.response = {"answer": answer, "wasFreeform": was_freeform}
        pending.event.set()
        return True

    async def _emit(self, event_type: str, data: dict[str, Any]) -> None:
        event = {"type": event_type, "data": data}
        self._recent_events.append(event)
        if len(self._recent_events) > 200:
            self._recent_events = self._recent_events[-200:]

        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    pass

    def _emit_threadsafe(self, event_type: str, data: dict[str, Any]) -> None:
        if self._loop is None:
            return
        self._loop.call_soon_threadsafe(
            asyncio.create_task,
            self._emit(event_type, data),
        )

    def _wait_for_pending(self, pending: PendingDecision) -> dict[str, Any] | None:
        self._pending_requests[pending.request_id] = pending
        try:
            pending.event.wait()
            return pending.response
        finally:
            self._pending_requests.pop(pending.request_id, None)

    def _on_permission_request(self, request, invocation):
        tool_name = (getattr(request, "tool_name", "") or "").lower()
        full_command = (getattr(request, "full_command_text", "") or "").lower()
        read_only = bool(getattr(request, "read_only", False))
        approval_mode = normalize_command_approval_mode(self.config.command_approval_mode)

        payload = {
            "tool_name": tool_name,
            "full_command_text": full_command,
            "read_only": read_only,
        }

        if approval_mode == "auto":
            self._emit_threadsafe("permission_decision", {**payload, "decision": "approved-auto"})
            return PermissionRequestResult(kind="approved")

        if (self.config.auto_approve_read_only and read_only) or tool_name in self.config.auto_approve_tools:
            self._emit_threadsafe("permission_decision", {**payload, "decision": "approved-auto"})
            return PermissionRequestResult(kind="approved")

        if any(token in full_command for token in self.config.dangerous_command_tokens):
            self._emit_threadsafe("permission_decision", {**payload, "decision": "denied-by-rules"})
            return PermissionRequestResult(
                kind="denied-by-rules",
                message=self.config.permission_block_message,
            )

        request_id = str(uuid4())
        self._emit_threadsafe("permission_requested", {"request_id": request_id, **payload})

        if self.mode == "cli":
            summary = tool_name or str(getattr(request, "kind", "unknown"))
            print(f"\nPermission requested: {summary}")
            if full_command:
                print(f"Command: {full_command}")
            answer = prompt_input(self.config.permission_prompt_text).strip().lower()
            approved = answer in self.config.approval_yes_values
        else:
            pending = PendingDecision(
                request_id=request_id,
                kind="permission",
                payload=payload,
            )
            response = self._wait_for_pending(pending) or {}
            approved = bool(response.get("approved"))

        self._emit_threadsafe(
            "permission_decision",
            {**payload, "request_id": request_id, "decision": "approved" if approved else "denied"},
        )
        if approved:
            return PermissionRequestResult(kind="approved")

        return PermissionRequestResult(
            kind="denied-interactively-by-user",
            message=self.config.permission_deny_message,
        )

    def _on_user_input_request(self, request, invocation):
        question = to_str(getattr(request, "question", ""), "").strip()
        choices = list(getattr(request, "choices", []) or [])
        allow_freeform = bool(getattr(request, "allowFreeform", True))
        request_id = str(uuid4())
        payload = {
            "question": question,
            "choices": choices,
            "allow_freeform": allow_freeform,
        }
        self._emit_threadsafe("input_requested", {"request_id": request_id, **payload})

        if self.mode == "cli":
            print(f"\n[Input Request] {question or 'The agent requested input.'}")
            if choices:
                print("Choices:")
                for choice in choices:
                    print(f"  - {choice}")
            while True:
                answer = prompt_input(self.config.user_input_prompt_text).strip()
                if choices and answer in choices:
                    response = {"answer": answer, "wasFreeform": False}
                    break
                if answer and (allow_freeform or not choices):
                    response = {"answer": answer, "wasFreeform": True}
                    break
                if choices and not allow_freeform:
                    print("Please choose one of the listed options.")
                else:
                    print("Please enter a response.")
        else:
            pending = PendingDecision(
                request_id=request_id,
                kind="user_input",
                payload=payload,
            )
            response = self._wait_for_pending(pending) or {
                "answer": "",
                "wasFreeform": True,
            }

        self._emit_threadsafe("input_received", {"request_id": request_id})
        return response

    def _render_tool_name(self, tool_call_id: str | None, fallback: str | None = None) -> str:
        if tool_call_id and tool_call_id in self._turn_state.active_tool_names:
            return self._turn_state.active_tool_names[tool_call_id]
        return fallback or "tool"

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

    def _handle_assistant_intent(self, event_name, data):
        intent = normalize_text(getattr(data, "intent", None))
        if intent:
            self._emit_threadsafe("assistant_intent", {"intent": intent})

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
            self._session_title = title
            self._emit_threadsafe("title_changed", {"title": title})

    def _handle_context_changed(self, event_name, data):
        used = getattr(data, "used", 0) or 0
        total = getattr(data, "total", 0) or 0
        self._context_usage = {"used": used, "total": total}
        self._emit_threadsafe("context_changed", {"used": used, "total": total})

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

    def _handle_skills_loaded(self, event_name, data):
        self._emit_threadsafe("skills_loaded", {})

    def _handle_mcp_loaded(self, event_name, data):
        self._emit_threadsafe("mcp_loaded", {})

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
        "session_skills_loaded": _handle_skills_loaded,
        "session_mcp_servers_loaded": _handle_mcp_loaded,
    }

    def _on_sdk_event(self, event) -> None:
        event_name = normalized_event_type(event)
        data = getattr(event, "data", None)

        handler = self._EVENT_DISPATCH.get(event_name)
        if handler:
            handler(self, event_name, data)
