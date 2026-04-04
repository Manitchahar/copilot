import { classifyToolEvent } from "./classifyToolEvent";

/**
 * Build block-based messages from a flat event stream.
 *
 * A message is: { id, role, blocks: [block, ...], timestamp }
 * Block types:
 *   { type: "text", content: string }
 *   { type: "tool-run", tools: [tool, ...], latestIntent, latestText, latestToolName, status }
 *   { type: "tool", toolCallId, toolName, arguments, status, resultText, errorText }
 *   { type: "tool-group", tools: [tool, ...] }
 *   { type: "typing" }
 *
 * The reducer processes WebSocket events and returns an array of messages.
 */

export function createInitialState() {
  return {
    messages: [],
    streamingMsgId: null,
  };
}

function findOrCreateAssistantMsg(state) {
  const last = state.messages[state.messages.length - 1];
  if (last && last.role === "assistant" && last.id === state.streamingMsgId) {
    const cloned = {
      ...last,
      blocks: last.blocks.map((b) =>
        b.type === "text"
          ? { ...b }
          : b.type === "tool-group" || b.type === "tool-run"
            ? { ...b, tools: b.tools.map((tool) => ({ ...tool })) }
            : { ...b }
      ),
    };
    state.messages[state.messages.length - 1] = cloned;
    return cloned;
  }
  const msg = {
    id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role: "assistant",
    blocks: [],
    timestamp: Date.now(),
  };
  state.messages = [...state.messages, msg];
  state.streamingMsgId = msg.id;
  return msg;
}

function lastTextBlock(msg) {
  const last = msg.blocks[msg.blocks.length - 1];
  return last && last.type === "text" ? last : null;
}

function appendTextDelta(msg, delta) {
  const tb = lastTextBlock(msg);
  if (tb) {
    tb.content += delta;
  } else {
    msg.blocks.push({ type: "text", content: delta });
  }
}

function closeFinishedToolRuns(msg) {
  msg.blocks = msg.blocks.map((block) =>
    block.type === "tool-run" && block.status !== "running"
      ? { ...block, _closed: true }
      : block
  );
}

function findToolBlock(msg, toolCallId) {
  for (const block of msg.blocks) {
    if (block.type === "tool" && block.toolCallId === toolCallId) return block;
    if (block.type === "tool-run") {
      const found = block.tools.find((t) => t.toolCallId === toolCallId);
      if (found) return found;
    }
    if (block.type === "tool-group") {
      const found = block.tools.find((t) => t.toolCallId === toolCallId);
      if (found) return found;
    }
  }
  return null;
}

function findToolRunBlock(msg, toolCallId) {
  for (const block of msg.blocks) {
    if (block.type !== "tool-run") continue;
    if (!toolCallId || block.tools.some((tool) => tool.toolCallId === toolCallId)) {
      return block;
    }
  }
  return null;
}

function updateToolRunStatus(run) {
  if (!run?.tools?.length) {
    run.status = "running";
    return;
  }
  if (run.tools.some((tool) => tool.status === "error")) {
    run.status = "error";
    return;
  }
  if (run.tools.some((tool) => tool.status === "running")) {
    run.status = "running";
    return;
  }
  run.status = "complete";
}

function trimSummary(text) {
  if (!text) return "";
  const compact = String(text).replace(/\s+/g, " ").trim();
  if (compact.length <= 120) return compact;
  return `${compact.slice(0, 117)}...`;
}

function buildToolSummary(toolName, content) {
  const summary = trimSummary(content);
  if (summary) return summary;
  const toolClass = classifyToolEvent(toolName);
  if (toolClass === "research") return "Searching workspace";
  return toolName ? `Running ${toolName}` : "Running tools";
}

function ensureToolRun(msg) {
  const last = msg.blocks[msg.blocks.length - 1];
  if (last?.type === "tool-run" && !last._closed) return last;
  const run = {
    type: "tool-run",
    tools: [],
    latestIntent: "",
    latestText: "",
    latestToolName: "",
    status: "running",
    _closed: false,
  };
  msg.blocks.push(run);
  return run;
}

export function processEvent(state, type, data) {
  const next = { ...state, messages: [...state.messages] };

  switch (type) {
    case "turn_started": {
      if (data?.prompt) {
        next.messages.push({
          id: `u-${Date.now()}`,
          role: "user",
          blocks: [{ type: "text", content: data.prompt }],
          timestamp: Date.now(),
        });
      }
      next.streamingMsgId = null;
      break;
    }

    case "assistant_delta": {
      const msg = findOrCreateAssistantMsg(next);
      appendTextDelta(msg, data?.content || "");
      msg._streaming = true;
      break;
    }

    case "assistant_message": {
      const msg = findOrCreateAssistantMsg(next);
      closeFinishedToolRuns(msg);
      const content = data?.content || "";
      const tb = lastTextBlock(msg);
      if (tb) {
        tb.content = content;
      } else {
        msg.blocks.push({ type: "text", content });
      }
      msg._streaming = false;
      break;
    }

    case "tool_start": {
      const msg = findOrCreateAssistantMsg(next);
      const run = ensureToolRun(msg);
      run.tools.push({
        toolCallId: data?.tool_call_id,
        toolName: data?.tool_name || "tool",
        arguments: data?.arguments || "",
        status: "running",
        resultText: null,
        errorText: null,
      });
      run.latestToolName = data?.tool_name || "tool";
      run.latestText = buildToolSummary(run.latestToolName, data?.arguments);
      updateToolRunStatus(run);
      break;
    }

    case "assistant_intent": {
      const msg = findOrCreateAssistantMsg(next);
      const run = findToolRunBlock(msg);
      if (run) {
        run.latestIntent = trimSummary(data?.intent);
        updateToolRunStatus(run);
      }
      break;
    }

    case "tool_output":
    case "tool_progress": {
      const msg = findOrCreateAssistantMsg(next);
      const tool = findToolBlock(msg, data?.tool_call_id);
      const run = findToolRunBlock(msg, data?.tool_call_id);
      if (tool) {
        tool.resultText = data?.content || tool.resultText;
      }
      if (run) {
        run.latestToolName = tool?.toolName || data?.tool_name || run.latestToolName;
        run.latestText = buildToolSummary(run.latestToolName, data?.content);
        updateToolRunStatus(run);
      }
      break;
    }

    case "tool_complete": {
      const msg = findOrCreateAssistantMsg(next);
      const tool = findToolBlock(msg, data?.tool_call_id);
      const run = findToolRunBlock(msg, data?.tool_call_id);
      if (tool) {
        tool.status = data?.success ? "complete" : "error";
        tool.resultText = data?.result_text || tool.resultText;
        tool.errorText = data?.error_text || tool.errorText;
      }
      if (run) {
        run.latestToolName = tool?.toolName || data?.tool_name || run.latestToolName;
        run.latestText = buildToolSummary(
          run.latestToolName,
          data?.error_text || data?.result_text || `${run.latestToolName || "Tool"} completed`
        );
        updateToolRunStatus(run);
      }
      break;
    }

    case "subagent_started": {
      const msg = findOrCreateAssistantMsg(next);
      msg.blocks.push({
        type: "subagent",
        agentId: data?.agent_id || "",
        agentName: data?.agent_name || data?.agent_id || "Subagent",
        status: "running",
        error: null,
      });
      break;
    }

    case "subagent_completed": {
      const msg = findOrCreateAssistantMsg(next);
      const block = msg.blocks.find(
        (b) => b.type === "subagent" && b.agentId === data?.agent_id
      );
      if (block) {
        block.status = "completed";
      }
      break;
    }

    case "subagent_failed": {
      const msg = findOrCreateAssistantMsg(next);
      const block = msg.blocks.find(
        (b) => b.type === "subagent" && b.agentId === data?.agent_id
      );
      if (block) {
        block.status = "failed";
        block.error = data?.error || "Unknown error";
      }
      break;
    }

    case "skill_invoked": {
      const msg = findOrCreateAssistantMsg(next);
      msg.blocks.push({
        type: "skill",
        skillName: data?.skill_name || "Unknown skill",
      });
      break;
    }

    case "turn_complete": {
      if (next.streamingMsgId) {
        const msg = next.messages.find((m) => m.id === next.streamingMsgId);
        if (msg) {
          msg._streaming = false;
        }
      }
      next.streamingMsgId = null;
      break;
    }

    case "turn_aborted": {
      if (next.streamingMsgId) {
        const msg = next.messages.find((m) => m.id === next.streamingMsgId);
        if (msg) {
          msg._streaming = false;
          msg._aborted = true;
        }
      }
      next.streamingMsgId = null;
      break;
    }

    default:
      break;
  }

  return next;
}

export function hydrateStateFromHistory(history = []) {
  return history.reduce(
    (state, event) => processEvent(state, event.type, event.data || {}),
    createInitialState()
  );
}
