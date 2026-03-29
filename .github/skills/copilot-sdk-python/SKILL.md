# Copilot SDK Python Workflow

## Purpose

Use this skill to build or fix Python apps that use the GitHub Copilot SDK with correct async patterns, session setup, tools, and cleanup.

## Use this skill when

- Working in `**.py`, `pyproject.toml`, or `setup.py`
- Adding Copilot SDK client/session logic
- Debugging event handling, streaming, or tool wiring
- Implementing robust lifecycle/error handling

## Preconditions

- Python 3.9+
- Copilot CLI available in `PATH`
- SDK installed (`github-copilot-sdk`)

## Workflow

1. **Set up runtime**
   - Prefer project-local env (`uv venv .venv`).
   - Install SDK (`uv pip install --python .venv/bin/python github-copilot-sdk`).

2. **Initialize client correctly**
   - Prefer:
     - `async with CopilotClient() as client: ...`
     - or manual `client = CopilotClient(); await client.start(); ...; await client.stop()`
   - If async context manager support is unavailable in your installed SDK, use manual start/stop lifecycle.
   - If using manual lifecycle, always use `try/finally`.

3. **Create sessions with keyword arguments**
   - Use `await client.create_session(...)` with kwargs.
   - Always provide `on_permission_request`.
   - Use `async with await client.create_session(...) as session:` for auto-destroy.

4. **Send messages with correct signatures**
   - `await session.send("prompt text")`
   - `await session.send_and_wait("prompt text", timeout=60.0)`
   - Do not pass dict payloads unless API explicitly expects them.

5. **Handle events predictably**
   - Subscribe with `session.on(handler)`.
   - Wait for `session.idle` using `asyncio.Event`.
   - Capture `session.error` paths.
   - Treat event types as SDK-version dependent (string or enum); normalize before comparisons.
   - Unsubscribe handlers when done.

6. **Streaming and tools**
   - Enable streaming via `streaming=True`.
   - Handle both delta and final assistant events.
   - Define tools via `define_tool(...)`; validate params (Pydantic optional).

7. **Cleanup and verification**
   - Ensure session/client cleanup happens even on failure.
   - Prefer `await session.disconnect()` over deprecated `destroy()` where available.
   - Run script from project venv and confirm expected output.

## Decision points

- **Lifecycle mode**
  - Use context managers by default.
  - Use manual start/stop only when explicit lifecycle control is needed.

- **Permission handling**
  - Use strict handler in production.
  - Use permissive handler only for local experiments.

- **Response mode**
  - Use `send_and_wait` for simple request/response.
  - Use streaming + event handlers for interactive/long outputs.

## Quality checks

- No positional dict passed to `create_session`.
- No misuse of context managers (client/session both valid patterns).
- `session.error` and timeout paths considered.
- Event-type checks are robust to both enum and string representations.
- Handlers are unsubscribed where appropriate.
- Works when run via local `.venv`.

## Minimal template

```python
import asyncio
from copilot import CopilotClient, PermissionHandler

async def main():
   def is_assistant_message(event) -> bool:
      event_type = getattr(event, "type", "")
      value = getattr(event_type, "value", event_type)
      return "assistant_message" in str(value).lower().replace(".", "_")

   client = CopilotClient()
   await client.start()
   try:
      session = await client.create_session(
         on_permission_request=PermissionHandler.approve_all,
         model="gpt-5.4-mini",
      )
      try:
         response = await session.send_and_wait("Say hello from Copilot SDK", timeout=60.0)

         content = None
         if response and is_assistant_message(response):
            content = getattr(response.data, "content", None)

         if not content:
            messages = await session.get_messages()
            for event in reversed(messages):
               if is_assistant_message(event):
                  content = getattr(event.data, "content", None)
                  if content:
                     break

         if content:
            print(content)
         else:
            print("No assistant message was returned.")
      finally:
         await session.disconnect()
   finally:
      await client.stop()

asyncio.run(main())
```

## Example prompts to use this skill

- “Create a Python Copilot SDK script with streaming output and proper cleanup.”
- “Fix this SDK script; it throws context manager and session creation errors.”
- “Add a custom `define_tool` tool with Pydantic validation to my Copilot session.”
