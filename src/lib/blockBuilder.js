import { classifyToolEvent } from "./classifyToolEvent";

/**
 * Build block-based messages from a flat event stream.
 *
 * A message is: { id, role, blocks: [block, ...], timestamp }
 * Block types:
 *   { type: "text", content: string }
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
    return last;
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

function findToolBlock(msg, toolCallId) {
  for (const block of msg.blocks) {
    if (block.type === "tool" && block.toolCallId === toolCallId) return block;
    if (block.type === "tool-group") {
      const found = block.tools.find((t) => t.toolCallId === toolCallId);
      if (found) return found;
    }
  }
  return null;
}

function maybeGroupResearch(msg) {
  const blocks = msg.blocks;
  const newBlocks = [];
  let researchRun = [];

  const flushResearch = () => {
    if (researchRun.length === 0) return;
    if (researchRun.length === 1) {
      newBlocks.push(researchRun[0]);
    } else {
      newBlocks.push({ type: "tool-group", tools: researchRun });
    }
    researchRun = [];
  };

  for (const block of blocks) {
    if (block.type === "tool" && classifyToolEvent(block.toolName) === "research") {
      researchRun.push(block);
    } else {
      flushResearch();
      newBlocks.push(block);
    }
  }
  flushResearch();
  msg.blocks = newBlocks;
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
      msg.blocks.push({
        type: "tool",
        toolCallId: data?.tool_call_id,
        toolName: data?.tool_name || "tool",
        arguments: data?.arguments || "",
        status: "running",
        resultText: null,
        errorText: null,
      });
      break;
    }

    case "tool_output":
    case "tool_progress": {
      const msg = findOrCreateAssistantMsg(next);
      const tool = findToolBlock(msg, data?.tool_call_id);
      if (tool) {
        tool.resultText = data?.content || tool.resultText;
      }
      break;
    }

    case "tool_complete": {
      const msg = findOrCreateAssistantMsg(next);
      const tool = findToolBlock(msg, data?.tool_call_id);
      if (tool) {
        tool.status = data?.success ? "complete" : "error";
        tool.resultText = data?.result_text || tool.resultText;
        tool.errorText = data?.error_text || tool.errorText;
      }
      maybeGroupResearch(msg);
      break;
    }

    case "turn_complete": {
      if (next.streamingMsgId) {
        const msg = next.messages.find((m) => m.id === next.streamingMsgId);
        if (msg) {
          msg._streaming = false;
          maybeGroupResearch(msg);
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
