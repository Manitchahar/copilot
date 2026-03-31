import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
import json
import os
from pathlib import Path

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
        ),
        config_path,
    )


def is_assistant_message(event) -> bool:
    event_type = getattr(event, "type", "")
    value = getattr(event_type, "value", event_type)
    return "assistant_message" in str(value).lower().replace(".", "_")


def normalized_event_type(event) -> str:
    event_type = getattr(event, "type", "")
    value = getattr(event_type, "value", event_type)
    return str(value).lower().replace(".", "_")


class TurnState:
    def __init__(self) -> None:
        self.idle = asyncio.Event()
        self.final_content = None
        self.last_error = None
        self.saw_delta = False
        self.printed_final = False
        self.assistant_output_started = False
        self.tool_output_started: set[str] = set()
        self.active_tool_names: dict[str, str] = {}

    def reset(self) -> None:
        self.idle = asyncio.Event()
        self.final_content = None
        self.last_error = None
        self.saw_delta = False
        self.printed_final = False
        self.assistant_output_started = False
        self.tool_output_started = set()
        self.active_tool_names = {}


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


def print_event_line(label: str, message: str | None = None) -> None:
    if message:
        print(f"\n[{label}] {message}")
    else:
        print(f"\n[{label}]")


def begin_assistant_output(state: TurnState, config: AppConfig) -> None:
    if state.assistant_output_started:
        return
    print(f"\n{config.assistant_prefix}", end="", flush=True)
    state.assistant_output_started = True


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


def render_tool_name(state: TurnState, tool_call_id: str | None, fallback: str | None = None) -> str:
    if tool_call_id and tool_call_id in state.active_tool_names:
        return state.active_tool_names[tool_call_id]
    return fallback or "tool"


def build_user_input_handler(config: AppConfig):
    def on_user_input_request(request, invocation):
        question = to_str(getattr(request, "question", ""), "").strip()
        choices = list(getattr(request, "choices", []) or [])
        allow_freeform = bool(getattr(request, "allowFreeform", True))

        print_event_line("Input Request", question or "The agent requested input.")
        if choices:
            print("Choices:")
            for choice in choices:
                print(f"  - {choice}")

        while True:
            answer = prompt_input(config.user_input_prompt_text).strip()
            if choices and answer in choices:
                return {"answer": answer, "wasFreeform": False}
            if answer and (allow_freeform or not choices):
                return {"answer": answer, "wasFreeform": True}
            if choices and not allow_freeform:
                print("Please choose one of the listed options.")
            else:
                print("Please enter a response.")

    return on_user_input_request


def handle_stream_event(state: TurnState, config: AppConfig, event_name: str, event) -> None:
    data = getattr(event, "data", None)

    if event_name == "assistant_message_delta":
        chunk = normalize_text(getattr(data, "delta_content", None))
        if chunk:
            begin_assistant_output(state, config)
            state.saw_delta = True
            print(chunk, end="", flush=True)
        return

    if event_name == "assistant_message":
        content = normalize_text(getattr(data, "content", None))
        if content:
            state.final_content = content
        return

    if event_name == "elicitation_requested":
        message = normalize_text(getattr(data, "message", None))
        print_event_line("Input Request", message or "Agent is asking for more input.")
        return

    if not config.show_tool_events:
        return

    if event_name == "permission_requested":
        tool_name = normalize_text(getattr(data, "tool_name", None)) or normalize_text(
            getattr(data, "kind", None)
        )
        print_event_line("Permission", tool_name or "requested")
        return

    if event_name == "permission_completed":
        decision = normalize_text(getattr(data, "decision", None))
        if decision:
            print_event_line("Permission", decision)
        return

    if event_name == "tool_execution_start":
        tool_call_id = normalize_text(getattr(data, "tool_call_id", None))
        tool_name = normalize_text(getattr(data, "tool_name", None)) or "tool"
        arguments = format_tool_args(getattr(data, "arguments", None))
        if tool_call_id:
            state.active_tool_names[tool_call_id] = tool_name
        print_event_line("Tool Start", tool_name if not arguments else f"{tool_name} {arguments}")
        return

    if event_name == "tool_execution_partial_result":
        tool_call_id = normalize_text(getattr(data, "tool_call_id", None))
        tool_name = render_tool_name(state, tool_call_id)
        partial_output = normalize_text(getattr(data, "partial_output", None))
        if partial_output:
            if tool_call_id not in state.tool_output_started:
                print_event_line(f"Tool Output:{tool_name}")
                if tool_call_id:
                    state.tool_output_started.add(tool_call_id)
            print(partial_output, end="", flush=True)
        return

    if event_name == "tool_execution_progress":
        tool_call_id = normalize_text(getattr(data, "tool_call_id", None))
        tool_name = render_tool_name(state, tool_call_id)
        progress = normalize_text(getattr(data, "progress_message", None))
        if progress:
            print_event_line(f"Tool Progress:{tool_name}", progress)
        return

    if event_name == "tool_execution_complete":
        tool_call_id = normalize_text(getattr(data, "tool_call_id", None))
        tool_name = render_tool_name(
            state,
            tool_call_id,
            normalize_text(getattr(data, "tool_name", None)),
        )
        success = getattr(data, "success", None)
        result_text = format_tool_result(getattr(data, "result", None))
        error_text = normalize_text(getattr(data, "error", None))
        status = "success" if success is not False else "failed"
        print_event_line("Tool Complete", f"{tool_name}: {status}")
        if result_text:
            print(result_text)
        if error_text:
            print(error_text)


def build_permission_handler(config: AppConfig):
    approval_mode = normalize_command_approval_mode(config.command_approval_mode)

    def on_permission_request(request, invocation):
        tool_name = (getattr(request, "tool_name", "") or "").lower()
        full_command = (getattr(request, "full_command_text", "") or "").lower()
        read_only = bool(getattr(request, "read_only", False))

        if approval_mode == "auto":
            return PermissionRequestResult(kind="approved")

        if (config.auto_approve_read_only and read_only) or tool_name in config.auto_approve_tools:
            return PermissionRequestResult(kind="approved")

        if any(token in full_command for token in config.dangerous_command_tokens):
            return PermissionRequestResult(
                kind="denied-by-rules",
                message=config.permission_block_message,
            )

        summary = tool_name or str(getattr(request, "kind", "unknown"))
        print(f"\nPermission requested: {summary}")
        if full_command:
            print(f"Command: {full_command}")
        answer = prompt_input(config.permission_prompt_text).strip().lower()
        if answer in config.approval_yes_values:
            return PermissionRequestResult(kind="approved")

        return PermissionRequestResult(
            kind="denied-interactively-by-user",
            message=config.permission_deny_message,
        )

    return on_permission_request


def print_final_once(state: TurnState, config: AppConfig) -> None:
    if state.printed_final:
        return
    if state.saw_delta:
        print()
    if state.final_content and not state.saw_delta:
        print(f"{config.assistant_prefix}{state.final_content}")
    elif state.last_error:
        print(f"Session error: {state.last_error}")
    elif not state.saw_delta:
        print("No assistant message was returned.")
    state.printed_final = True


def build_system_message(config: AppConfig) -> dict[str, str] | None:
    content_parts = [config.system_prompt.strip(), PERSONA_GUARDRAIL_SUFFIX.strip()]
    content = "\n\n".join(part for part in content_parts if part)
    if not content:
        return None
    return {"mode": "append", "content": content}


def build_session_kwargs(config: AppConfig) -> dict[str, object]:
    kwargs = {
        "on_permission_request": build_permission_handler(config),
        "on_user_input_request": build_user_input_handler(config),
        "model": config.model,
        "system_message": build_system_message(config),
        "streaming": config.streaming_enabled,
    }
    provider = build_provider_from_env()
    if provider:
        kwargs["provider"] = provider
    return kwargs


def build_event_handler(state: TurnState, config: AppConfig):
    def on_event(event):
        event_name = normalized_event_type(event)
        handle_stream_event(state, config, event_name, event)

        if "session_error" in event_name:
            message = getattr(event.data, "message", None)
            if message:
                state.last_error = message
        elif "session_idle" in event_name:
            print_final_once(state, config)
            state.idle.set()

    return on_event


@asynccontextmanager
async def managed_client():
    client = CopilotClient()
    await client.start()
    try:
        yield client
    finally:
        await client.stop()


@asynccontextmanager
async def managed_session(client: CopilotClient, config: AppConfig, state: TurnState):
    session = await client.create_session(**build_session_kwargs(config))
    unsubscribe = session.on(build_event_handler(state, config))
    try:
        yield session
    finally:
        unsubscribe()
        await session.disconnect()


async def run_turn(session, prompt: str, config: AppConfig, state: TurnState) -> None:
    attempts = config.max_retries + 1
    for attempt in range(1, attempts + 1):
        state.reset()
        try:
            await session.send_and_wait(prompt, timeout=config.timeout)
        except ExitRequested:
            raise
        except asyncio.TimeoutError:
            state.last_error = f"Timed out after {config.timeout:.1f}s"
        except Exception as exc:
            state.last_error = str(exc)

        try:
            await asyncio.wait_for(
                state.idle.wait(),
                timeout=config.timeout + config.idle_wait_extra_seconds,
            )
        except asyncio.TimeoutError:
            messages = await session.get_messages()
            for event in reversed(messages):
                if is_assistant_message(event):
                    content = getattr(event.data, "content", None)
                    if content:
                        state.final_content = content
                        break

        if state.final_content:
            if not state.printed_final:
                print_final_once(state, config)
            return

        if attempt < attempts:
            print(f"Retrying... ({attempt}/{config.max_retries})")

    print_final_once(state, config)


async def main() -> None:
    config, config_path = resolve_config()

    async with managed_client() as client:
        state = TurnState()
        async with managed_session(client, config, state) as session:
            print(f"Using config: {config_path}")
            print(f"Command approval mode: {config.command_approval_mode}")
            print(f"Tool events: {'enabled' if config.show_tool_events else 'disabled'}")
            print(config.chat_start_message)
            print(f"Session: {session.session_id}")

            if config.initial_prompt:
                print(f"\nYou: {config.initial_prompt}")
                await run_turn(session, config.initial_prompt, config, state)

            while True:
                try:
                    user_prompt = await asyncio.to_thread(prompt_input, config.user_prompt_text)
                except ExitRequested:
                    print(f"\n{config.goodbye_message}")
                    break
                if not user_prompt.strip():
                    continue
                if user_prompt.strip().lower() in config.exit_commands:
                    print(config.goodbye_message)
                    break

                await run_turn(session, user_prompt, config, state)


try:
    asyncio.run(main())
except KeyboardInterrupt:
    print("\nGoodbye.")