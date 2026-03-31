import asyncio

from engine import CopilotSessionController, ExitRequested, prompt_input, resolve_config


class CliRenderer:
    def __init__(self, assistant_prefix: str) -> None:
        self.assistant_prefix = assistant_prefix
        self._assistant_started = False

    def render(self, event: dict) -> None:
        event_type = event.get("type")
        data = event.get("data", {})

        if event_type == "assistant_delta":
            if not self._assistant_started:
                print(f"\n{self.assistant_prefix}", end="", flush=True)
                self._assistant_started = True
            print(data.get("content", ""), end="", flush=True)
            return

        if event_type == "assistant_message":
            return

        if event_type == "tool_start":
            tool_name = data.get("tool_name") or "tool"
            arguments = data.get("arguments")
            print(
                f"\n[Tool Start] {tool_name}"
                if not arguments
                else f"\n[Tool Start] {tool_name} {arguments}"
            )
            return

        if event_type == "tool_output":
            tool_name = data.get("tool_name") or "tool"
            print(f"\n[Tool Output:{tool_name}]")
            print(data.get("content", ""), end="", flush=True)
            return

        if event_type == "tool_progress":
            tool_name = data.get("tool_name") or "tool"
            print(f"\n[Tool Progress:{tool_name}] {data.get('content', '')}")
            return

        if event_type == "tool_complete":
            tool_name = data.get("tool_name") or "tool"
            status = "success" if data.get("success", True) else "failed"
            print(f"\n[Tool Complete] {tool_name}: {status}")
            if data.get("result_text"):
                print(data["result_text"])
            if data.get("error_text"):
                print(data["error_text"])
            return

        if event_type == "turn_retry":
            print(f"Retrying... ({data.get('attempt')}/{data.get('max_retries')})")
            return

        if event_type == "session_error":
            print(f"\nSession error: {data.get('message', '')}")
            return

        if event_type == "input_notice":
            print(f"\n[Input Request] {data.get('message', '')}")
            return

        if event_type == "turn_complete":
            if self._assistant_started:
                print()
                self._assistant_started = False
            elif data.get("final_content"):
                print(f"{self.assistant_prefix}{data['final_content']}")
            elif data.get("error"):
                print(f"Session error: {data['error']}")
            else:
                print("No assistant message was returned.")


async def consume_events(controller: CopilotSessionController, renderer: CliRenderer) -> None:
    queue = controller.subscribe()
    try:
        while True:
            renderer.render(await queue.get())
    except asyncio.CancelledError:
        raise
    finally:
        controller.unsubscribe(queue)


async def main() -> None:
    config, config_path = resolve_config()
    controller = CopilotSessionController(config, mode="cli")
    renderer = CliRenderer(config.assistant_prefix)

    await controller.start()
    consumer = asyncio.create_task(consume_events(controller, renderer))
    try:
        print(f"Using config: {config_path}")
        print(f"Command approval mode: {config.command_approval_mode}")
        print(f"Tool events: {'enabled' if config.show_tool_events else 'disabled'}")
        print(config.chat_start_message)
        print(f"Session: {controller.sdk_session_id}")

        if config.initial_prompt:
            print(f"\nYou: {config.initial_prompt}")
            await controller.send_prompt(config.initial_prompt)

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

            await controller.send_prompt(user_prompt)
    finally:
        consumer.cancel()
        try:
            await consumer
        except asyncio.CancelledError:
            pass
        await controller.close()


try:
    asyncio.run(main())
except KeyboardInterrupt:
    print("\nGoodbye.")
