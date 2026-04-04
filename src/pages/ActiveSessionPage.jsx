import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  abortTurn,
  connectEvents,
  deleteSession,
  getHistory,
  getSession,
  sendApproval,
  sendPrompt,
  sendUserInput,
  warmupSession,
  listSessions,
} from "../api";
import { cn } from "../components/ui/cn";
import { createInitialState, hydrateStateFromHistory, processEvent } from "../lib/blockBuilder";
import MessageList from "../components/chat/MessageList";
import ChatInput from "../components/chat/ChatInput";
import PermissionCard from "../components/tools/PermissionCard";
import MCPStatusPanel from "../components/agents/MCPStatusPanel";
import CapabilitiesPanel from "../components/agents/CapabilitiesPanel";
import useConnectorConfig from "../hooks/useConnectorConfig";

const ConnectorsPanel = lazy(() => import("../components/connectors/ConnectorsPanel"));

// ── Helpers ──────────────────────────────────────────────
function trimStatusText(value, max = 120) {
  if (!value) return "";
  const text = String(value).trim().replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function summariseEvent(type, data = {}) {
  switch (type) {
    case "session_started":
      return "Session connected";
    case "turn_started":
      return data.prompt ? `Working on: ${trimStatusText(data.prompt, 90)}` : "Turn started";
    case "assistant_delta":
      return "Writing response";
    case "assistant_message":
      return "Response received";
    case "assistant_intent":
      return data.intent ? trimStatusText(data.intent, 90) : "Working";
    case "tool_start":
      return data.tool_name ? `Running ${data.tool_name}` : "Running tool";
    case "tool_progress":
      return data.content ? trimStatusText(data.content, 90) : "Tool progress updated";
    case "tool_output":
      return data.content ? trimStatusText(data.content, 90) : "Tool produced output";
    case "tool_complete":
      return data.success === false
        ? `${data.tool_name || "Tool"} failed`
        : `${data.tool_name || "Tool"} completed`;
    case "permission_requested":
      return data.tool_name
        ? `Waiting for permission: ${data.tool_name}`
        : data.message
          ? trimStatusText(data.message, 90)
          : "Waiting for permission";
    case "permission_decision":
      return data.decision ? `Permission ${data.decision}` : "Permission updated";
    case "input_requested":
      return data.question || data.message
        ? trimStatusText(data.question || data.message, 90)
        : "Waiting for your input";
    case "input_received":
      return "Input received";
    case "turn_retry":
      return `Retrying (${data.attempt}/${data.max_retries})`;
    case "turn_complete":
      return data.error ? "Run stopped with an error" : "Run completed";
    case "session_error":
      return data.message ? trimStatusText(data.message, 90) : "Session error";
    case "subagent_started":
      return data.agent_name ? `Subagent started: ${data.agent_name}` : "Subagent started";
    case "subagent_completed":
      return "Subagent completed";
    case "subagent_failed":
      return data.error ? `Subagent failed: ${trimStatusText(data.error, 60)}` : "Subagent failed";
    case "skill_invoked":
      return data.skill_name ? `Skill invoked: ${data.skill_name}` : "Skill invoked";
    case "skills_loaded":
      return "Skills loaded";
    case "mcp_loaded":
      return "MCP servers loaded";
    case "prompt_queued":
      return data.prompt ? `Queued: ${trimStatusText(data.prompt, 80)}` : "Prompt queued";
    case "prompt_steered":
      return data.prompt ? `Steer next: ${trimStatusText(data.prompt, 80)}` : "Priority prompt queued";
    default:
      return type.replaceAll("_", " ");
  }
}

function statusToneClasses(tone) {
  switch (tone) {
    case "error":
      return {
        dot: "bg-red-500",
        card: "border-red-200 bg-red-50",
        text: "text-red-700",
      };
    case "blocked":
      return {
        dot: "bg-amber-500",
        card: "border-amber-200 bg-amber-50",
        text: "text-amber-700",
      };
    case "working":
      return {
        dot: "bg-primary",
        card: "border-primary/20 bg-primary/10",
        text: "text-primary",
      };
    default:
      return {
        dot: "bg-green-500",
        card: "border-border/30 bg-card",
        text: "text-muted-foreground",
      };
  }
}

export default function ActiveSessionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("id");
  const resumeRequested = searchParams.get("resume") === "1";
  const initialPrompt = location.state?.initialPrompt || null;
  const sidebarItems = [
    { icon: "monitoring", label: "Monitor", id: "chat" },
    { icon: "hub", label: "Connectors", id: "connectors" },
    { icon: "home", label: "Workspace", href: "/" },
  ];

  // Chat state
  const [msgState, setMsgState] = useState(createInitialState);
  const [inputText, setInputText] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [lastTurnError, setLastTurnError] = useState(null);
  const [statusText, setStatusText] = useState("Connecting to session");
  const [statusTone, setStatusTone] = useState("ready");
  const [activityLog, setActivityLog] = useState([]);
  const [sidebarSessions, setSidebarSessions] = useState([]);
  const [sessionTitle, setSessionTitle] = useState("Untitled session");
  const [sessionMeta, setSessionMeta] = useState({
    engine: "copilot-sdk",
    model: "unknown",
    provider: "copilot-sdk-default",
    approval_mode: "permission",
  });
  const [runtimeStats, setRuntimeStats] = useState({
    totalTokens: 0,
    contextUsage: { used: 0, total: 0 },
  });
  const [sendMode, setSendMode] = useState("run");
  const [queuedPrompts, setQueuedPrompts] = useState([]);
  const [draftAttachments, setDraftAttachments] = useState([]);
  const [deletingSessionId, setDeletingSessionId] = useState(null);

  // Sidebar state (populated from events)
  const [activeTools, setActiveTools] = useState([]); // running tool names
  const [activeSubagents, setActiveSubagents] = useState([]);
  const [loadedSkills, setLoadedSkills] = useState([]);
  const [mcpStatus, setMcpStatus] = useState({ loaded: false, servers: [] });
  const [artifacts, setArtifacts] = useState([]);
  const [folders, setFolders] = useState([]);
  const [queryCount, setQueryCount] = useState(0);
  const [currentFile, setCurrentFile] = useState(null);
  const [activeView, setActiveView] = useState("chat"); // "chat" | "connectors"
  const connectorConfig = useConnectorConfig();

  const confirmCanLeaveConnectors = useCallback(() => {
    if (activeView !== "connectors" || !connectorConfig.dirty) return true;
    if (!window.confirm("You have unsaved connector changes. Discard them?")) return false;
    connectorConfig.reset();
    return true;
  }, [activeView, connectorConfig]);

  function handleViewChange(viewId) {
    if (!confirmCanLeaveConnectors()) return;
    setActiveView(viewId);
  }

  const handleRouteLeave = useCallback(
    (e) => {
      if (!confirmCanLeaveConnectors()) {
        e.preventDefault();
      }
    },
    [confirmCanLeaveConnectors]
  );

  const handleSessionHome = useCallback(
    (e) => {
      e.preventDefault();
      if (!confirmCanLeaveConnectors()) return;
      setActiveView("chat");
    },
    [confirmCanLeaveConnectors]
  );

  // Pending approval / input requests
  const [pendingRequests, setPendingRequests] = useState([]); // { request_id, kind, payload }

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const manualCloseRef = useRef(false);
  const initialPromptSentRef = useRef(false);
  const latestInputHintRef = useRef("");

  useEffect(() => {
    document.title = "Rocky — Session";
  }, []);

  const applyAcceptedPromptState = useCallback((result, promptText, requestedMode = "run") => {
    if (!result) return;
    const compactPrompt = trimStatusText(promptText, 72);
    if (result.started) {
      setStatusTone("working");
      setStatusText(compactPrompt ? `Working on: ${compactPrompt}` : "Working on your request");
      setError(null);
      return;
    }
    if (result.queued) {
      const queuedItem = {
        id: result.queue_id || `${Date.now()}-${Math.random()}`,
        prompt: promptText,
        mode: result.mode || requestedMode,
        attachment_count: 0,
      };
      setQueuedPrompts((prev) =>
        prev.some((item) => item.id === queuedItem.id)
          ? prev
          : queuedItem.mode === "immediate"
            ? [queuedItem, ...prev]
            : [...prev, queuedItem]
      );
      if (result.deferred) {
        setStatusTone("working");
        setStatusText(
          compactPrompt
            ? `Starting session… queued: ${compactPrompt}`
            : "Starting session…"
        );
      } else if ((result.mode || requestedMode) === "immediate") {
        setStatusTone("working");
        setStatusText(
          compactPrompt
            ? `Steer next queued: ${compactPrompt}`
            : "Priority prompt queued"
        );
      } else {
        setStatusTone("blocked");
        setStatusText(
          compactPrompt
            ? `Queued: ${compactPrompt}`
            : "Prompt queued"
        );
      }
      setError(null);
    }
  }, []);

  useEffect(() => {
    if (!sessionId || !initialPrompt || initialPromptSentRef.current) return;
    initialPromptSentRef.current = true;
    setStatusTone("working");
    setStatusText("Starting session…");
    sendPrompt(sessionId, initialPrompt)
      .then((result) => {
        applyAcceptedPromptState(result, initialPrompt, "run");
      })
      .catch(() => {
        setError("Could not start the initial prompt");
        setStatusTone("error");
        setStatusText("Initial prompt failed");
        initialPromptSentRef.current = false;
      });
  }, [applyAcceptedPromptState, initialPrompt, sessionId]);

  // ── Extract artifacts / folders from tool events ───────
  const processToolComplete = useCallback((data) => {
    const toolName = data.tool_name || "";
    const resultText = data.result_text || "";

    // Try to extract file paths from tool results
    const fileMatch = resultText.match(
      /(?:wrote|created|modified|saved|updated)\s+["`']?([^\s"'`]+\.\w+)/i
    );
    if (fileMatch) {
      const filePath = fileMatch[1];
      const ext = filePath.split(".").pop();
      const iconMap = {
        json: "data_object",
        py: "code",
        js: "javascript",
        jsx: "javascript",
        ts: "code",
        tsx: "code",
        md: "article",
        txt: "article",
        css: "style",
        html: "html",
        pdf: "picture_as_pdf",
        docx: "article",
      };
      setArtifacts((prev) => {
        if (prev.some((a) => a.name === filePath.split("/").pop())) return prev;
        return [
          ...prev,
          {
            icon: iconMap[ext] || "description",
            name: filePath.split("/").pop(),
            meta: `via ${toolName}`,
          },
        ];
      });
      setCurrentFile({
        name: filePath.split("/").pop(),
        tool: toolName,
      });
    }

    // Extract folder paths (deduplicate by normalised directory)
    const dirMatch = resultText.match(/(?:\/[\w.-]+){2,}/g);
    if (dirMatch) {
      setFolders((prev) => {
        const existing = new Set(prev.map((f) => f.path));
        const seen = new Set(existing);
        const newFolders = dirMatch
          .map((d) => d.replace(/\/[^/]+\.[^/]+$/, "")) // strip trailing filename
          .filter((d) => {
            if (seen.has(d)) return false;
            seen.add(d);
            return true;
          })
          .slice(0, 5)
          .map((d) => ({
            icon: "folder",
            path: d,
          }));
        return newFolders.length ? [...prev, ...newFolders].slice(-8) : prev;
      });
    }
  }, []);

  const enqueuePendingRequest = useCallback((request) => {
    setPendingRequests((prev) =>
      prev.some((item) => item.request_id === request.request_id)
        ? prev
        : [...prev, request]
    );
  }, []);

  const appendActivity = useCallback((type, data = {}, tone = "ready") => {
    const label = summariseEvent(type, data);
    setActivityLog((prev) => {
      const next = [
        {
          id: `${type}-${Date.now()}-${Math.random()}`,
          label,
          tone,
        },
        ...prev,
      ];
      return next.slice(0, 10);
    });
  }, []);

  const resetSessionState = useCallback(() => {
    setMsgState(createInitialState());
    setInputText("");
    setBusy(false);
    setConnected(false);
    setError(null);
    setLastTurnError(null);
    setActiveTools([]);
    setActiveSubagents([]);
    setLoadedSkills([]);
    setMcpStatus({ loaded: false, servers: [] });
    setArtifacts([]);
    setFolders([]);
    setQueryCount(0);
    setCurrentFile(null);
    setPendingRequests([]);
    setQueuedPrompts([]);
    setDraftAttachments([]);
    setSessionTitle("Untitled session");
    setRuntimeStats({ totalTokens: 0, contextUsage: { used: 0, total: 0 } });
    setStatusText("Connecting to session");
    setStatusTone("ready");
    setActivityLog([]);
    setSidebarSessions([]);
  }, []);

  const applySessionData = useCallback(
    (snap, history, options = {}) => {
      const { isReconnect = false } = options;
      setBusy(Boolean(snap.busy));
      setPendingRequests(snap.pending_requests || []);
      setQueuedPrompts(snap.queued_prompts || []);
      if (snap.runtime) {
        setSessionMeta(snap.runtime);
      }
      if (snap.title) {
        setSessionTitle(snap.title);
      }
      setRuntimeStats({
        totalTokens: snap.total_tokens || 0,
        contextUsage: snap.context_usage || { used: 0, total: 0 },
      });
      if (history?.messages?.length) {
        setMsgState(hydrateStateFromHistory(history.messages));
      } else if (isReconnect) {
        setMsgState(createInitialState());
      }
      if (isReconnect) {
        setActiveTools([]);
        setActiveSubagents([]);
        setStatusTone(snap.busy ? "working" : "ready");
        setStatusText(snap.busy ? "Reconnected to live session" : "Reconnected and synced");
      } else if (snap.recent_events?.length) {
        const lastEvent = snap.recent_events[snap.recent_events.length - 1];
        setStatusText(
          resumeRequested && !snap.busy
            ? "Resumed existing session"
            : summariseEvent(lastEvent.type, lastEvent.data)
        );
      } else if (resumeRequested) {
        setStatusText("Resumed existing session");
      }
    },
    [resumeRequested]
  );

  const loadSessionSnapshot = useCallback(
    async (options = {}) => {
      if (!sessionId) return null;
      const snap = await getSession(sessionId);
      applySessionData(snap, null, options);
      return snap;
    },
    [applySessionData, sessionId]
  );

  const loadSessionHistory = useCallback(
    async (options = {}) => {
      if (!sessionId) return null;
      try {
        const snap = await getSession(sessionId);
        const history = await getHistory(sessionId);
        applySessionData(snap, history, options);
        return history;
      } catch (historyError) {
        console.error("Failed to load session history:", historyError);
        return null;
      }
    },
    [applySessionData, sessionId]
  );

  const handleRemoveAttachment = useCallback((attachmentId) => {
    setDraftAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  }, []);

  const refreshSidebarSessions = useCallback(() => {
    listSessions()
      .then((data) => setSidebarSessions((data.sessions || []).slice(0, 8)))
      .catch(() => {});
  }, []);

  const handleAttachPath = useCallback(async (pathValue, kind = "file") => {
    const normalized = String(pathValue || "").trim();
    if (!normalized) return false;
    const cleaned = normalized.replace(/[\\/]+$/, "") || normalized;
    const name = cleaned.split(/[\\/]/).pop() || cleaned;
    const attachment = {
      type: kind === "directory" ? "directory" : "file",
      path: normalized,
      name,
    };
    setDraftAttachments((prev) => [
      ...prev,
      {
        id: `${attachment.type}:${normalized}:${Date.now()}`,
        name,
        media_type: null,
        sizeLabel: kind === "directory" ? "Local folder" : "Local path",
        source: "path",
        attachment,
      },
    ]);
    setStatusTone("ready");
    setStatusText(
      kind === "directory" ? `Attached folder path: ${name}` : `Attached file path: ${name}`
    );
    setError(null);
    return true;
  }, []);

  // ── WebSocket connection ───────────────────────────────
  useEffect(() => {
    resetSessionState();
    if (!sessionId) return;

    let cancelled = false;

    manualCloseRef.current = false;
    reconnectAttemptRef.current = 0;
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;

    const scheduleReconnect = () => {
      if (cancelled || manualCloseRef.current) return;
      if (reconnectTimerRef.current) return;
      reconnectAttemptRef.current += 1;
      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      setConnected(false);
      setStatusTone("blocked");
      setStatusText(
        attempt === 1
          ? "Reconnecting to live session…"
          : `Reconnecting to live session… (${attempt})`
      );
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connectSocket(true);
      }, delay);
    };

    const connectSocket = (isReconnect = false) => {
      if (cancelled) return;
      const connection = connectEvents(sessionId, { replayRecent: false });
      const { socket } = connection;
      wsRef.current = connection;

      socket.onopen = async () => {
        if (cancelled) return;
        setConnected(true);
        setError(null);
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
        if (isReconnect || reconnectAttemptRef.current > 0) {
          try {
            await loadSessionHistory({ isReconnect: true });
          } catch {
            setStatusTone("blocked");
            setStatusText("Live connection restored, waiting to resync");
          }
        } else {
          setStatusTone("ready");
          setStatusText("Connected to live session");
        }
        reconnectAttemptRef.current = 0;
      };

      socket.onclose = () => {
        if (cancelled || manualCloseRef.current) return;
        scheduleReconnect();
      };

      socket.onerror = () => {
        if (cancelled || manualCloseRef.current) return;
        setError("WebSocket connection lost");
        scheduleReconnect();
      };

      socket.onmessage = (e) => {
        if (cancelled) return;

        let evt;
        try {
          evt = JSON.parse(e.data);
        } catch {
          return;
        }
        const { type, data } = evt;

        switch (type) {
          case "session_started":
            if (data?.runtime) {
              setSessionMeta(data.runtime);
            }
            setStatusTone("ready");
            setStatusText("Session ready");
            appendActivity(type, data);
            break;

          case "title_changed":
            if (data?.title) {
              setSessionTitle(data.title);
              appendActivity(type, data);
            }
            break;

          case "usage_stats":
            setRuntimeStats((prev) => ({
              ...prev,
              totalTokens: data.total_tokens ?? prev.totalTokens ?? 0,
            }));
            break;

          case "context_changed":
            setRuntimeStats((prev) => ({
              ...prev,
              contextUsage: {
                used: data.used || 0,
                total: data.total || 0,
              },
            }));
            break;

          case "turn_started":
            setBusy(true);
            setLastTurnError(null);
            setStatusTone("working");
            setStatusText(summariseEvent(type, data));
            appendActivity(type, data, "working");
            setMsgState((prev) => processEvent(prev, type, data));
            if (data?.prompt) {
              setQueryCount((c) => c + 1);
            }
            break;

          case "assistant_delta":
            setStatusTone("working");
            setStatusText("Writing response");
            setMsgState((prev) => processEvent(prev, type, data));
            break;

          case "assistant_message":
            if (data?.content) {
              setStatusTone("ready");
              setStatusText("Response received");
              appendActivity(type, data);
              setMsgState((prev) => processEvent(prev, type, data));
            }
            break;

          case "assistant_intent":
            setStatusTone("working");
            setStatusText(summariseEvent(type, data));
            appendActivity(type, data, "working");
            setMsgState((prev) => processEvent(prev, type, data));
            break;

          case "tool_start":
            setStatusTone("working");
            setStatusText(summariseEvent(type, data));
            appendActivity(type, data, "working");
            setActiveTools((prev) => [
              ...prev,
              { id: data.tool_call_id, name: data.tool_name },
            ]);
            setMsgState((prev) => processEvent(prev, type, data));
            break;

          case "tool_output":
          case "tool_progress":
            setStatusTone("working");
            setStatusText(summariseEvent(type, data));
            appendActivity(type, data, "working");
            setMsgState((prev) => processEvent(prev, type, data));
            break;

          case "tool_complete":
            setStatusTone(data.success === false ? "error" : "working");
            setStatusText(summariseEvent(type, data));
            appendActivity(type, data, data.success === false ? "error" : "ready");
            if (data.error_text) {
              setLastTurnError(data.error_text);
              setError(data.error_text);
            }
            setActiveTools((prev) => prev.filter((t) => t.id !== data.tool_call_id));
            processToolComplete(data);
            setMsgState((prev) => processEvent(prev, type, data));
            break;

          case "prompt_queued":
            setQueuedPrompts((prev) => [
              ...prev,
              {
                id: data.id,
                prompt: data.prompt,
                mode: data.mode,
                attachment_count: data.attachment_count || 0,
              },
            ]);
            setStatusTone("blocked");
            setStatusText(`Queued: ${trimStatusText(data.prompt, 80)}`);
            appendActivity(type, data, "blocked");
            break;

          case "prompt_steered":
            setQueuedPrompts((prev) => [
              {
                id: data.id,
                prompt: data.prompt,
                mode: data.mode,
                attachment_count: data.attachment_count || 0,
              },
              ...prev,
            ]);
            setStatusTone("working");
            setStatusText(`Steer next: ${trimStatusText(data.prompt, 80)}`);
            appendActivity(type, data, "working");
            break;

          case "permission_requested":
            setStatusTone("blocked");
            setStatusText(summariseEvent(type, data));
            appendActivity(type, data, "blocked");
            enqueuePendingRequest({
              request_id: data.request_id,
              kind: "permission",
              payload: data,
            });
            break;

          case "permission_decision":
            setStatusTone(data.decision?.includes("denied") ? "error" : "working");
            setStatusText(summariseEvent(type, data));
            appendActivity(type, data, data.decision?.includes("denied") ? "error" : "ready");
            if (data.decision?.includes("denied")) {
              setLastTurnError("Permission denied");
            }
            break;

          case "input_requested":
            latestInputHintRef.current = data?.question || data?.message || latestInputHintRef.current;
            {
              const payload = {
                ...data,
                message: data?.message || latestInputHintRef.current || undefined,
              };
              setStatusTone("blocked");
              setStatusText(summariseEvent(type, payload));
              appendActivity(type, payload, "blocked");
              enqueuePendingRequest({
                request_id: payload.request_id,
                kind: "user_input",
                payload,
              });
            }
            break;

          case "input_notice": {
            const hint = data?.message || data?.question || "";
            if (hint) {
              latestInputHintRef.current = hint;
              setPendingRequests((prev) =>
                prev.map((req) =>
                  req.kind === "user_input" &&
                  (!req.payload?.question && !req.payload?.message)
                    ? {
                        ...req,
                        payload: {
                          ...req.payload,
                          message: hint,
                        },
                      }
                    : req
                )
              );
            }
            setStatusTone("blocked");
            setStatusText(hint ? trimStatusText(hint, 90) : summariseEvent(type, data));
            appendActivity(type, data, "blocked");
            break;
          }

          case "input_received":
            latestInputHintRef.current = "";
            setStatusTone("working");
            setStatusText("Input received");
            appendActivity(type, data);
            break;

          case "turn_retry":
            setStatusTone("working");
            setStatusText(summariseEvent(type, data));
            appendActivity(type, data, "working");
            break;

          case "turn_complete":
            setBusy(false);
            setQueuedPrompts((prev) => prev.slice(1));
            setMsgState((prev) => processEvent(prev, type, data));
            if (data?.error) {
              setLastTurnError(data.error);
              setError(data.error);
              setStatusTone("error");
              setStatusText("Run stopped with an error");
              appendActivity(type, data, "error");
            } else {
              setStatusTone("ready");
              setStatusText("Run completed");
              appendActivity(type, data);
            }
            break;

          case "turn_aborted":
            setBusy(false);
            setStatusTone("ready");
            setStatusText("Turn cancelled");
            appendActivity(type, data);
            setMsgState((prev) => processEvent(prev, type, data));
            break;

          case "session_error":
            setError(data?.message || "An error occurred");
            setLastTurnError(data?.message || "An error occurred");
            setStatusTone("error");
            setStatusText("Session error");
            appendActivity(type, data, "error");
            break;

          case "subagent_started":
            setActiveSubagents((prev) => [
              ...prev,
              { id: data.agent_id, name: data.agent_name || data.agent_id, status: "running" },
            ]);
            setStatusText(summariseEvent(type, data));
            setStatusTone("working");
            appendActivity(type, data, "working");
            setMsgState((s) => processEvent(s, type, data));
            break;

          case "subagent_completed":
            setActiveSubagents((prev) =>
              prev.map((a) => (a.id === data.agent_id ? { ...a, status: "completed" } : a))
            );
            setStatusText(summariseEvent(type, data));
            appendActivity(type, data, "ready");
            setMsgState((s) => processEvent(s, type, data));
            break;

          case "subagent_failed":
            setActiveSubagents((prev) =>
              prev.map((a) =>
                a.id === data.agent_id ? { ...a, status: "failed", error: data.error } : a
              )
            );
            setStatusText(summariseEvent(type, data));
            setStatusTone("error");
            appendActivity(type, data, "error");
            setMsgState((s) => processEvent(s, type, data));
            break;

          case "skill_invoked":
            setLoadedSkills((prev) => {
              const name = data.skill_name;
              if (prev.includes(name)) return prev;
              return [...prev, name];
            });
            setStatusText(summariseEvent(type, data));
            appendActivity(type, data, "working");
            setMsgState((s) => processEvent(s, type, data));
            break;

          case "skills_loaded":
            if (data.skills && data.skills.length > 0) {
              setLoadedSkills(data.skills);
            }
            appendActivity(type, data, "ready");
            break;

          case "mcp_loaded":
            setMcpStatus({ loaded: true, servers: data.servers || [] });
            appendActivity(type, data, "ready");
            break;

          default:
            break;
        }
      };
    };

    loadSessionSnapshot()
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load session");
          setStatusTone("error");
          setStatusText("Could not load this session");
        }
      })
      .finally(() => {
        if (!cancelled) {
          warmupSession(sessionId).catch(() => {});
          connectSocket(false);
          refreshSidebarSessions();
          loadSessionHistory().catch(() => {});
        }
      });

    return () => {
      cancelled = true;
      manualCloseRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      wsRef.current?.close?.();
      wsRef.current = null;
    };
  }, [
    applySessionData,
    enqueuePendingRequest,
    loadSessionHistory,
    loadSessionSnapshot,
    refreshSidebarSessions,
    resetSessionState,
    sessionId,
    processToolComplete,
    appendActivity,
  ]);

  // ── Handlers ───────────────────────────────────────────
  const handleAbort = useCallback(() => abortTurn(sessionId), [sessionId]);

  const handleApproval = useCallback(async (requestId, approved) => {
    try {
      await sendApproval(sessionId, requestId, approved);
      setPendingRequests((prev) =>
        prev.filter((r) => r.request_id !== requestId)
      );
    } catch (err) {
      console.error("Approval failed:", err);
    }
  }, [sessionId]);

  const handleUserInput = useCallback(async (requestId, answer) => {
    try {
      setStatusTone("working");
      setStatusText("Answer sent. Continuing the run…");
      setError(null);
      await sendUserInput(sessionId, requestId, answer);
      setPendingRequests((prev) =>
        prev.filter((r) => r.request_id !== requestId)
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not submit your answer";
      setError(message);
      setStatusTone("error");
      setStatusText("Input submission failed");
    }
  }, [sessionId]);

  const renderPendingRequest = useCallback((req) => {
    if (req.kind === "permission") {
      return (
        <PermissionCard
          key={req.request_id}
          request={req}
          onApprove={(id) => handleApproval(id, true)}
          onDeny={(id) => handleApproval(id, false)}
        />
      );
    }
    return (
      <UserInputBanner
        key={req.request_id}
        req={req}
        onSubmit={(answer) => handleUserInput(req.request_id, answer)}
      />
    );
  }, [handleApproval, handleUserInput]);

  const handleSend = useCallback((text, mode) => {
    const outgoingAttachments = draftAttachments.map((item) => item.attachment);
    if (!text && outgoingAttachments.length === 0) return;
    const resolvedMode = busy && mode === "run" ? "enqueue" : mode;
    const promptText = text || (outgoingAttachments.length ? "Attached files/folders" : "");
    if (resolvedMode === "run") {
      setStatusTone("working");
      setStatusText("Starting session…");
    }
    sendPrompt(sessionId, text, outgoingAttachments, resolvedMode)
      .then((result) => {
        if (result?.error) {
          throw new Error(result.error);
        }
        if (result?.started === false && result?.queued === false) {
          throw new Error("Prompt was not accepted");
        }
        applyAcceptedPromptState(result, promptText, resolvedMode);
        setInputText("");
        setDraftAttachments([]);
        if (busy && mode === "run") {
          setSendMode("enqueue");
        }
        setError(null);
      })
      .catch((err) => {
        setError(err.message || "Could not send prompt");
        setStatusTone("error");
        setStatusText("Could not send prompt");
      });
  }, [applyAcceptedPromptState, draftAttachments, busy, sessionId]);

  const handleDeleteSession = useCallback(
    async (targetSessionId, { redirectHome = false } = {}) => {
      if (deletingSessionId) return;
      const target =
        sidebarSessions.find((session) => session.id === targetSessionId) ||
        (targetSessionId === sessionId ? { title: sessionTitle } : null);
      if (!window.confirm(`Delete ${target?.title || "this session"}?`)) return;
      setDeletingSessionId(targetSessionId);
      setError(null);
      try {
        await deleteSession(targetSessionId);
        setSidebarSessions((prev) => prev.filter((session) => session.id !== targetSessionId));
        if (redirectHome || targetSessionId === sessionId) {
          navigate("/", { replace: true });
          return;
        }
        refreshSidebarSessions();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete the session.");
        setStatusTone("error");
        setStatusText("Could not delete session");
      } finally {
        setDeletingSessionId(null);
      }
    },
    [deletingSessionId, navigate, refreshSidebarSessions, sessionId, sessionTitle, sidebarSessions]
  );

  // ── No session ID guard ────────────────────────────────
  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <div className="text-center space-y-4">
          <span className="material-symbols-outlined text-6xl text-primary/40">
            link_off
          </span>
          <p className="font-newsreader text-xl">No session selected</p>
          <Link
            to="/"
            className="inline-block rounded-full bg-primary px-6 py-3 font-label text-sm font-bold text-primary-foreground"
          >
            Go to Workspace
          </Link>
        </div>
      </div>
    );
  }

  const toneClasses = statusToneClasses(statusTone);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────── */}
        <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border/30 bg-card py-6 md:flex">
          <div className="mb-6 px-6">
            <Link
              to={`/session?id=${sessionId}`}
              onClick={handleSessionHome}
              className="flex items-center gap-3"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <span className="material-symbols-outlined">bolt</span>
              </div>
              <div>
                <h1 className="font-newsreader text-lg font-semibold leading-tight text-foreground">
                  Rocky
                </h1>
                <p className="font-body text-[10px] uppercase tracking-widest text-muted-foreground">
                  {connected ? "Connected" : "Connecting…"}
                </p>
              </div>
            </Link>
          </div>

          <nav className="space-y-1 px-3">
            {sidebarItems.map((item) => {
              const isActive = item.id ? activeView === item.id : false;
              const content = (
                <>
                  <span className="material-symbols-outlined">
                    {item.icon}
                  </span>
                  <span className="text-sm">
                    {item.label}
                  </span>
                </>
              );
              const cls = isActive
                ? "flex items-center gap-3 rounded-lg bg-primary/10 px-4 py-2.5 font-medium text-primary"
                : "flex items-center gap-3 rounded-lg px-4 py-2.5 text-muted-foreground transition-colors hover:bg-muted cursor-pointer";
              if (item.id) {
                return (
                  <button key={item.label} onClick={() => handleViewChange(item.id)} aria-current={isActive ? "true" : undefined} className={cls}>
                    {content}
                  </button>
                );
              }
              return item.href.startsWith("/") ? (
                <Link key={item.label} to={item.href} onClick={handleRouteLeave} className={cls}>
                  {content}
                </Link>
              ) : (
                <a key={item.label} href={item.href} className={cls}>
                  {content}
                </a>
              );
            })}
          </nav>

          {/* Chat History */}
          <div className="mt-6 flex-1 overflow-y-auto px-3">
            <h3 className="mb-2 px-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              History
            </h3>
            <div className="space-y-0.5">
              {sidebarSessions.map((s) => {
                const isCurrentSession = s.id === sessionId;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      isCurrentSession
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Link
                      to={`/session?id=${s.id}`}
                      onClick={isCurrentSession ? handleSessionHome : handleRouteLeave}
                      className="flex min-w-0 flex-1 items-center gap-2.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isCurrentSession ? "chat_bubble" : "chat_bubble_outline"}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {s.title || `Session ${s.id.slice(0, 8)}`}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(s.id, { redirectHome: isCurrentSession })}
                      disabled={deletingSessionId === s.id}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover:opacity-100 disabled:opacity-40"
                      aria-label={`Delete ${s.title || "session"}`}
                      title="Delete session"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {deletingSessionId === s.id ? "progress_activity" : "delete"}
                      </span>
                    </button>
                  </div>
                );
              })}
              {sidebarSessions.length === 0 && (
                <p className="px-3 py-2 text-xs italic text-muted-foreground/50">
                  No recent sessions
                </p>
              )}
            </div>
          </div>

          <div className="mt-auto px-6">
            <Link
              to="/"
              onClick={handleRouteLeave}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-4 font-label font-bold text-accent-foreground transition-opacity hover:opacity-90"
            >
              <span className="material-symbols-outlined">add</span>
              New Inquiry
            </Link>
          </div>
        </aside>

        {/* ── Main content ────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-50 flex w-full items-center justify-between bg-background/80 px-8 py-4 shadow-sm backdrop-blur-xl">
            <div className="flex items-center gap-8">
              <Link
                to={`/session?id=${sessionId}`}
                onClick={handleSessionHome}
                className="font-newsreader text-xl font-bold text-foreground"
              >
                Rocky
              </Link>
              <nav className="hidden gap-6 lg:flex">
                <Link
                  to="/"
                  onClick={handleRouteLeave}
                  className="font-newsreader text-lg italic tracking-tight text-muted-foreground transition-colors hover:text-primary"
                >
                  Workspace
                </Link>
                <span className="border-b-2 border-primary pb-1 font-newsreader text-lg italic tracking-tight text-primary">
                  Session
                </span>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              {/* Connection indicator */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={`h-2 w-2 rounded-full ${
                    connected ? "bg-green-500" : "bg-red-400"
                  }`}
                />
                {connected ? "Live" : "Offline"}
              </div>
              <div className="h-8 w-8 overflow-hidden rounded-full border border-border">
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/30 text-[11px] font-semibold text-primary">
                  CW
                </div>
              </div>
            </div>
          </header>

          <section className="flex flex-1 overflow-hidden">
            {activeView === "connectors" ? (
              <div className="flex-1 bg-background">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center">
                      <div className="rounded-[1.25rem] border border-border/20 bg-background px-6 py-5 text-center shadow-sm">
                        <p className="font-medium text-foreground">Loading connectors…</p>
                        <p className="mt-1 text-sm text-muted-foreground">Preparing integration settings</p>
                      </div>
                    </div>
                  }
                >
                  <ConnectorsPanel connectorConfig={connectorConfig} />
                </Suspense>
              </div>
            ) : (
            <>
            {/* ── Chat area ────────────────────────────── */}
            <div className="relative flex min-h-0 flex-1 flex-col border-r border-border/10 bg-background">
              {/* Compact status line */}
              <div className="flex items-center gap-2 px-5 pt-3 pb-1">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneClasses.dot}`} />
                <span className={`truncate text-xs ${toneClasses.text}`}>{statusText}</span>
                <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {sessionMeta.model}
                </span>
              </div>
              {lastTurnError && (
                <p className="px-5 pb-1 text-xs text-red-700">{lastTurnError}</p>
              )}

              {/* Error toast */}
              {error && (
                <div className="mx-8 mb-2 rounded-[1rem] border border-red-300 bg-red-50 p-4 text-center text-sm text-red-700">
                  {error}
                </div>
              )}

              <MessageList
                messages={msgState.messages}
                isTyping={busy && !msgState.streamingMsgId}
                pendingRequests={pendingRequests}
                renderPendingRequest={renderPendingRequest}
              />
              <ChatInput
                value={inputText}
                onChange={setInputText}
                onSend={handleSend}
                onAbort={handleAbort}
                disabled={!connected}
                isBusy={busy}
                sendMode={sendMode}
                onSendModeChange={setSendMode}
                queuedCount={queuedPrompts.length}
                attachments={draftAttachments}
                onAttachPath={handleAttachPath}
                onRemoveAttachment={handleRemoveAttachment}
              />
            </div>

            {/* ── Right sidebar ────────────────────────── */}
            <aside className="custom-scrollbar hidden w-96 shrink-0 flex-col gap-4 overflow-y-auto bg-card p-6 lg:flex">
              <div>
                {/* ── 1. Compact status line ──────────────── */}
                <div className="mb-4 flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${toneClasses.dot}`} />
                  <span className={`truncate text-sm font-medium ${toneClasses.text}`}>{statusText}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {sessionMeta.model}
                  </span>
                </div>
                {lastTurnError && (
                  <p className="mb-4 text-xs text-red-700">{lastTurnError}</p>
                )}

                {/* ── 2. Context meter ────────────────────── */}
                {runtimeStats.contextUsage.total > 0 && (() => {
                  const pct = Math.round((runtimeStats.contextUsage.used / runtimeStats.contextUsage.total) * 100);
                  return (
                    <div className="mb-6">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Context</span>
                        <span className="text-[10px] text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${pct > 85 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* ── 3. Active work (tools + subagents) ──── */}
                {(activeTools.length > 0 || activeSubagents.length > 0) && (
                  <div className="mb-6">
                    <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      Active Work
                    </h3>
                    <ul className="space-y-1">
                      {activeTools.map((tool) => (
                        <li key={tool.id} className="flex items-center gap-2 text-xs text-foreground">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                          <span className="truncate">{tool.name}</span>
                        </li>
                      ))}
                      {activeSubagents.map((agent) => (
                        <li key={agent.id} className="flex items-center gap-2 text-xs text-foreground">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              agent.status === "running"
                                ? "bg-blue-500 animate-pulse"
                                : agent.status === "completed"
                                ? "bg-emerald-500"
                                : "bg-red-500"
                            }`}
                          />
                          <span className="truncate">{agent.name}</span>
                          <span className="ml-auto text-muted-foreground capitalize">{agent.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <CapabilitiesPanel
                  runtime={sessionMeta}
                  mcpStatus={mcpStatus}
                  loadedSkills={loadedSkills}
                />

                {/* ── 4. Current file (compact row) ───────── */}
                <div className="mb-6">
                  <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Current File
                  </h3>
                  {currentFile ? (
                    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                      <span className="material-symbols-outlined text-sm text-muted-foreground">description</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{currentFile.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">via {currentFile.tool}</span>
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted-foreground/50">No files touched yet</p>
                  )}
                </div>

                {/* ── 5. Artifacts (compact rows) ─────────── */}
                {artifacts.length > 0 && (
                  <div className="mb-6">
                    <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      Artifacts
                    </h3>
                    <div className="space-y-1">
                      {artifacts.map((artifact) => (
                        <div
                          key={artifact.name}
                          className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors hover:bg-muted"
                        >
                          <span className="material-symbols-outlined text-sm text-muted-foreground">{artifact.icon}</span>
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{artifact.name}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{artifact.meta}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 6. Folders ──────────────────────────── */}
                {folders.length > 0 && (
                  <div className="mb-6">
                    <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      Relevant Folders
                    </h3>
                    <div className="space-y-1">
                      {folders.map((folder) => (
                        <div
                          key={folder.path}
                          className="group flex items-center gap-2 rounded-full px-2 py-1.5 transition-colors hover:bg-muted"
                        >
                          <span className="material-symbols-outlined text-sm text-muted-foreground transition-colors group-hover:text-primary">
                            {folder.icon}
                          </span>
                          <span className="truncate text-sm text-foreground" title={folder.path}>
                            {folder.path}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <MCPStatusPanel mcpStatus={mcpStatus} />

                {/* ── 7. Skills ───────────────────────────── */}
                {loadedSkills.length > 0 && (
                  <div className="mb-6">
                    <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      Skills
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {loadedSkills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50/50 px-2 py-0.5 text-xs text-violet-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 8. Queued work (simple numbered list) ── */}
                {queuedPrompts.length > 0 && (
                  <div className="mb-6">
                    <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      Queued Work
                    </h3>
                    <ol className="list-inside list-decimal space-y-1 text-sm text-foreground">
                      {queuedPrompts.map((prompt) => (
                        <li key={prompt.id} className="truncate">
                          <span>{trimStatusText(prompt.prompt, 70)}</span>
                          {prompt.attachment_count > 0 && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              ({prompt.attachment_count} file{prompt.attachment_count > 1 ? "s" : ""})
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </aside>
            </>
            )}
          </section>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-[3rem] border-t border-border/30 bg-background px-6 pb-4 pt-2 shadow-[0_-4px_30px_rgba(26,28,26,0.05)] md:hidden">
        <Link
          to={`/session?id=${sessionId}`}
          onClick={handleSessionHome}
          className="-translate-y-4 scale-110 rounded-full bg-primary p-4 text-background shadow-lg shadow-primary/20"
        >
          <span className="material-symbols-outlined">monitoring</span>
        </Link>
        <Link
          to="/"
          onClick={handleRouteLeave}
          className="flex flex-col items-center justify-center p-3 text-muted-foreground"
        >
          <span className="material-symbols-outlined">history_edu</span>
          <span className="mt-1 font-label text-[10px] font-semibold">
            Home
          </span>
        </Link>
      </nav>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────

function UserInputBanner({ req, onSubmit }) {
  const [answer, setAnswer] = useState("");
  const [submittingChoice, setSubmittingChoice] = useState(null);
  const { payload } = req;
  const promptText =
    payload.question ||
    payload.message ||
    payload.prompt ||
    "The agent needs your input.";

  const submitAnswer = async (value) => {
    if (!value?.trim()) return;
    setSubmittingChoice(value);
    try {
      await onSubmit(value.trim());
    } finally {
      setSubmittingChoice(null);
    }
  };

  return (
    <div className="rounded-[1.25rem] border border-amber-300 bg-amber-50 px-5 py-5 shadow-sm">
      <div className="flex items-center justify-center gap-2 text-primary">
        <span className="material-symbols-outlined">help</span>
        <span className="font-label text-sm font-bold uppercase tracking-wide">
          Input Requested
        </span>
      </div>
      <p className="mt-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-primary/70">
        Reply to continue
      </p>
      <p className="mt-2 font-newsreader text-lg text-center text-foreground">
        {promptText}
      </p>
      {payload.choices?.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {payload.choices.map((choice) => (
            <button
              key={choice}
              onClick={() => submitAnswer(choice)}
              disabled={Boolean(submittingChoice)}
              className="rounded-full border border-border bg-white px-4 py-2 text-sm transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submittingChoice === choice ? "Sending…" : choice}
            </button>
          ))}
        </div>
      )}
      {(payload.allow_freeform !== false || !payload.choices?.length) && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await submitAnswer(answer);
          }}
          className="mt-4 flex items-center gap-2"
        >
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer…"
            disabled={Boolean(submittingChoice)}
            className="flex-1 rounded-full border border-border bg-white px-4 py-2 text-sm focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!answer.trim() || Boolean(submittingChoice)}
            className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {submittingChoice ? "Sending…" : "Submit"}
          </button>
        </form>
      )}
    </div>
  );
}
