import asyncio
from dataclasses import dataclass, field
import shlex
from pathlib import Path
from copilot import CopilotClient
from copilot.types import PermissionRequestResult

from backend import BackendError, CommandNotFoundError, RepoBackend


@dataclass
class AppConfig:
    model: str = "gpt-5-mini"
    timeout: float = 60.0
    max_retries: int = 2
    idle_wait_extra_seconds: float = 5.0
    streaming_enabled: bool = True

    initial_prompt: str = ""
    user_prompt_text: str = "\nYou: "
    chat_start_message: str = "Copilot chat started. Type 'exit' to quit."
    goodbye_message: str = "Goodbye."
    assistant_prefix: str = "Copilot says: "
    backend_command_prefix: str = "Backend commands: /help, /git ..., /gh ..."

    auto_approve_read_only: bool = True
    permission_prompt_enabled: bool = True
    permission_prompt_text: str = "Approve this action? [y/N]: "
    permission_block_message: str = "Blocked by local safety policy."
    permission_deny_message: str = "Denied by interactive policy."

    auto_approve_tools: set[str] = field(default_factory=lambda: {"read", "search"})
    dangerous_command_tokens: set[str] = field(
        default_factory=lambda: {"rm -rf", "sudo ", "curl |", "wget |"}
    )
    exit_commands: set[str] = field(default_factory=lambda: {"exit", "quit", "q"})
    approval_yes_values: set[str] = field(default_factory=lambda: {"y", "yes"})


def parse_scalar(value: str):
    text = value.strip()
    if not text:
        return ""

    if text.startswith('"') and text.endswith('"'):
        inner = text[1:-1]
        return bytes(inner, "utf-8").decode("unicode_escape")
    if text.startswith("'") and text.endswith("'"):
        inner = text[1:-1]
        return bytes(inner, "utf-8").decode("unicode_escape")

    lower = text.lower()
    if lower in {"true", "false"}:
        return lower == "true"

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
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue

        key, raw_value = line.split(":", 1)
        key = key.strip()
        value = raw_value.strip()

        if not key:
            continue

        # Support one-line lists: [read, search]
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            if not inner:
                parsed[key] = []
            else:
                parsed[key] = [
                    str(parse_scalar(item.strip())).strip()
                    for item in inner.split(",")
                    if item.strip()
                ]
            continue

        parsed[key] = parse_scalar(value)

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


def resolve_config() -> tuple[AppConfig, Path]:
    config_path = Path("config.yaml")
    config = parse_yaml_like_file(config_path)

    app_config = AppConfig(
        model=to_str(config.get("model"), "gpt-5-mini"),
        timeout=to_float(config.get("timeout"), 60.0),
        max_retries=to_int(config.get("max_retries"), 2),
        idle_wait_extra_seconds=to_float(config.get("idle_wait_extra_seconds"), 5.0),
        streaming_enabled=to_bool(config.get("streaming_enabled"), True),
        initial_prompt=to_str(config.get("initial_prompt"), "").strip(),
        user_prompt_text=to_str(config.get("user_prompt_text"), "\nYou: "),
        chat_start_message=to_str(
            config.get("chat_start_message"),
            "Copilot chat started. Type 'exit' to quit.",
        ),
        goodbye_message=to_str(config.get("goodbye_message"), "Goodbye."),
        assistant_prefix=to_str(config.get("assistant_prefix"), "Copilot says: "),
        backend_command_prefix=to_str(
            config.get("backend_command_prefix"),
            "Backend commands: /help, /git ..., /gh ...",
        ),
        auto_approve_read_only=to_bool(config.get("auto_approve_read_only"), True),
        permission_prompt_enabled=to_bool(config.get("permission_prompt_enabled"), True),
        permission_prompt_text=to_str(
            config.get("permission_prompt_text"), "Approve this action? [y/N]: "
        ),
        permission_block_message=to_str(
            config.get("permission_block_message"), "Blocked by local safety policy."
        ),
        permission_deny_message=to_str(
            config.get("permission_deny_message"), "Denied by interactive policy."
        ),
        auto_approve_tools=to_set(config.get("auto_approve_tools"), {"read", "search"}),
        dangerous_command_tokens=to_set(
            config.get("dangerous_command_tokens"),
            {"rm -rf", "sudo ", "curl |", "wget |"},
        ),
        exit_commands=to_set(config.get("exit_commands"), {"exit", "quit", "q"}),
        approval_yes_values=to_set(config.get("approval_yes_values"), {"y", "yes"}),
    )

    return app_config, config_path


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

    def reset(self) -> None:
        self.idle = asyncio.Event()
        self.final_content = None
        self.last_error = None
        self.saw_delta = False
        self.printed_final = False


def build_permission_handler(
    config: AppConfig,
):

    def on_permission_request(request, invocation):
        tool_name = (getattr(request, "tool_name", "") or "").lower()
        full_command = (getattr(request, "full_command_text", "") or "").lower()
        read_only = bool(getattr(request, "read_only", False))

        if (config.auto_approve_read_only and read_only) or tool_name in config.auto_approve_tools:
            return PermissionRequestResult(kind="approved")

        if any(token in full_command for token in config.dangerous_command_tokens):
            return PermissionRequestResult(
                kind="denied-by-rules",
                message=config.permission_block_message,
            )

        if not config.permission_prompt_enabled:
            return PermissionRequestResult(
                kind="denied-by-rules",
                message=config.permission_deny_message,
            )

        summary = tool_name or str(getattr(request, "kind", "unknown"))
        print(f"\nPermission requested: {summary}")
        if full_command:
            print(f"Command: {full_command}")
        answer = input(config.permission_prompt_text).strip().lower()
        if answer in config.approval_yes_values:
            return PermissionRequestResult(kind="approved")

        return PermissionRequestResult(
            kind="denied-interactively-by-user",
            message=config.permission_deny_message,
        )

    return on_permission_request


def print_final_once(
    state: TurnState,
    config: AppConfig,
) -> None:
    if state.printed_final:
        return
    if state.saw_delta:
        print()
    if state.final_content:
        print(f"{config.assistant_prefix}{state.final_content}")
    elif state.last_error:
        print(f"Session error: {state.last_error}")
    else:
        print("No assistant message was returned.")
    state.printed_final = True


def render_backend_help(config: AppConfig, backend: RepoBackend) -> str:
    lines = [
        config.backend_command_prefix,
        backend.describe(),
        "",
        "Examples:",
        "  /git status",
        "  /git branches",
        "  /git init",
        "  /gh pr list",
        "  /gh pr view 123",
        "  /gh pr checkout 123",
        "  /gh repo view",
    ]
    return "\n".join(lines)


async def run_backend_command(
    backend: RepoBackend,
    prompt: str,
    config: AppConfig,
) -> bool:
    if not prompt.startswith("/"):
        return False

    try:
        tokens = shlex.split(prompt[1:])
    except ValueError as exc:
        print(f"Invalid backend command: {exc}")
        return True

    if not tokens:
        print(render_backend_help(config, backend))
        return True

    command = tokens[0].lower()
    args = tokens[1:]

    try:
        if command in {"help", "?"}:
            print(render_backend_help(config, backend))
        elif command == "git":
            if not args:
                print("Usage: /git <git arguments>")
            elif args[0] == "init":
                result = await asyncio.to_thread(backend.git_init)
                print(result.render())
            else:
                result = await asyncio.to_thread(backend.run_git, args)
                print(result.render())
        elif command == "gh":
            if not args:
                print("Usage: /gh <gh arguments>")
            else:
                result = await asyncio.to_thread(backend.run_gh, args)
                print(result.render())
        else:
            print(f"Unknown backend command: /{command}")
            print(render_backend_help(config, backend))
    except CommandNotFoundError as exc:
        print(str(exc))
    except BackendError as exc:
        print(str(exc))
    except Exception as exc:
        print(f"Backend command failed: {exc}")

    return True


async def run_turn(
    session,
    prompt: str,
    config: AppConfig,
    state: TurnState,
) -> None:
    attempts = config.max_retries + 1
    for attempt in range(1, attempts + 1):
        state.reset()
        try:
            await session.send_and_wait(prompt, timeout=config.timeout)
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
            # If no idle event arrives, attempt to recover from message history.
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

async def main():
    config, config_path = resolve_config()
    backend = RepoBackend.discover(Path.cwd())

    client = CopilotClient()
    await client.start()

    try:
        state = TurnState()

        session = await client.create_session(
            on_permission_request=build_permission_handler(config),
            model=config.model,
            streaming=config.streaming_enabled,
        )
        try:
            print(f"Using config: {config_path}")
            print(config.chat_start_message)
            print(render_backend_help(config, backend))

            def on_event(event):
                event_name = normalized_event_type(event)

                if "assistant_message_delta" in event_name:
                    chunk = getattr(event.data, "delta_content", None)
                    if chunk:
                        state.saw_delta = True
                        print(chunk, end="", flush=True)
                elif is_assistant_message(event) and "delta" not in event_name:
                    content = getattr(event.data, "content", None)
                    if content:
                        state.final_content = content
                elif "session_error" in event_name:
                    message = getattr(event.data, "message", None)
                    if message:
                        state.last_error = message
                elif "session_idle" in event_name:
                    print_final_once(state, config)
                    state.idle.set()

            unsubscribe = session.on(on_event)
            try:
                if config.initial_prompt:
                    print(f"\nYou: {config.initial_prompt}")
                    await run_turn(session, config.initial_prompt, config, state)

                while True:
                    user_prompt = await asyncio.to_thread(input, config.user_prompt_text)
                    if not user_prompt.strip():
                        continue
                    if user_prompt.strip().lower() in config.exit_commands:
                        print(config.goodbye_message)
                        break

                    if await run_backend_command(backend, user_prompt, config):
                        continue

                    await run_turn(session, user_prompt, config, state)
            finally:
                unsubscribe()
        finally:
            await session.disconnect()
    finally:
        await client.stop()


asyncio.run(main())
