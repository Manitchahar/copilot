import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  abortTurn,
  connectEvents,
  getSession,
  sendApproval,
  sendPrompt,
  sendUserInput,
} from "../api";
import { createInitialState, processEvent } from "../lib/blockBuilder";
import MessageList from "../components/chat/MessageList";
import ChatInput from "../components/chat/ChatInput";
import PermissionCard from "../components/tools/PermissionCard";
import MCPStatusPanel from "../components/agents/MCPStatusPanel";
import ConnectorsPanel from "../components/connectors/ConnectorsPanel";

// ── Sidebar nav items ────────────────────────────────────
const sidebarItems = [
  { icon: "monitoring", label: "Monitor", id: "chat" },
  { icon: "menu_book", label: "Research", href: "/" },
  { icon: "edit_note", label: "Notes", href: "#" },
  { icon: "hub", label: "Connectors", id: "connectors" },
];

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
        : "Waiting for permission";
    case "permission_decision":
      return data.decision ? `Permission ${data.decision}` : "Permission updated";
    case "input_requested":
      return data.question ? trimStatusText(data.question, 90) : "Waiting for input";
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
        card: "border-primary/20 bg-primary-fixed/30",
        text: "text-on-primary-fixed",
      };
    default:
      return {
        dot: "bg-green-500",
        card: "border-outline-variant/30 bg-surface-container-lowest",
        text: "text-secondary",
      };
  }
}

export default function ActiveSessionPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("id");

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
  const [sessionMeta, setSessionMeta] = useState({
    engine: "copilot-sdk",
    model: "unknown",
    provider: "copilot-sdk-default",
    approval_mode: "permission",
  });

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

  // Pending approval / input requests
  const [pendingRequests, setPendingRequests] = useState([]); // { request_id, kind, payload }

  const wsRef = useRef(null);

  useEffect(() => {
    document.title = "Cloud Cowork Active Session";
  }, []);

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
    setStatusText("Connecting to session");
    setStatusTone("ready");
    setActivityLog([]);
  }, []);

  // ── WebSocket connection ───────────────────────────────
  useEffect(() => {
    resetSessionState();
    if (!sessionId) return;

    let cancelled = false;

    // Load initial snapshot
    getSession(sessionId)
      .then((snap) => {
        if (cancelled) return;
        setBusy(snap.busy);
        setPendingRequests(snap.pending_requests || []);
        if (snap.runtime) {
          setSessionMeta(snap.runtime);
        }
        if (snap.recent_events?.length) {
          const lastEvent = snap.recent_events[snap.recent_events.length - 1];
          setStatusText(summariseEvent(lastEvent.type, lastEvent.data));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load session");
          setStatusTone("error");
          setStatusText("Could not load this session");
        }
      });

    const { socket, close } = connectEvents(sessionId);
    wsRef.current = socket;

    socket.onopen = () => {
      if (!cancelled) {
        setConnected(true);
        setStatusTone("ready");
        setStatusText("Connected to live session");
      }
    };
    socket.onclose = () => {
      if (!cancelled) {
        setConnected(false);
        setStatusTone("error");
        setStatusText("Live connection closed");
      }
    };
    socket.onerror = () => {
      if (!cancelled) {
        setError("WebSocket connection lost");
        setStatusTone("error");
        setStatusText("Live connection lost");
      }
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

        case "assistant_delta": {
          setStatusTone("working");
          setStatusText("Writing response");
          setMsgState((prev) => processEvent(prev, type, data));
          break;
        }

        case "assistant_message":
          if (data?.content) {
            setStatusTone("ready");
            setStatusText("Response received");
            appendActivity(type, data);
            setMsgState((prev) => processEvent(prev, type, data));
          }
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
          setStatusTone("working");
          setStatusText(summariseEvent(type, data));
          appendActivity(type, data, "working");
          setMsgState((prev) => processEvent(prev, type, data));
          break;

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
          setActiveTools((prev) =>
            prev.filter((t) => t.id !== data.tool_call_id)
          );
          processToolComplete(data);
          setMsgState((prev) => processEvent(prev, type, data));
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
          setStatusTone("blocked");
          setStatusText(summariseEvent(type, data));
          appendActivity(type, data, "blocked");
          enqueuePendingRequest({
            request_id: data.request_id,
            kind: "user_input",
            payload: data,
          });
          break;

        case "input_notice":
          setStatusTone("blocked");
          setStatusText(summariseEvent(type, data));
          appendActivity(type, data, "blocked");
          break;

        case "input_received":
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

        case "subagent_started": {
          setActiveSubagents((prev) => [
            ...prev,
            { id: data.agent_id, name: data.agent_name || data.agent_id, status: "running" },
          ]);
          setStatusText(summariseEvent(type, data));
          setStatusTone("working");
          appendActivity(type, data, "working");
          setMsgState((s) => processEvent(s, type, data));
          break;
        }

        case "subagent_completed": {
          setActiveSubagents((prev) =>
            prev.map((a) => a.id === data.agent_id ? { ...a, status: "completed" } : a)
          );
          setStatusText(summariseEvent(type, data));
          appendActivity(type, data, "ready");
          setMsgState((s) => processEvent(s, type, data));
          break;
        }

        case "subagent_failed": {
          setActiveSubagents((prev) =>
            prev.map((a) => a.id === data.agent_id ? { ...a, status: "failed", error: data.error } : a)
          );
          setStatusText(summariseEvent(type, data));
          setStatusTone("error");
          appendActivity(type, data, "error");
          setMsgState((s) => processEvent(s, type, data));
          break;
        }

        case "skill_invoked": {
          setLoadedSkills((prev) => {
            const name = data.skill_name;
            if (prev.includes(name)) return prev;
            return [...prev, name];
          });
          setStatusText(summariseEvent(type, data));
          appendActivity(type, data, "working");
          setMsgState((s) => processEvent(s, type, data));
          break;
        }

        case "skills_loaded": {
          if (data.skills && data.skills.length > 0) {
            setLoadedSkills(data.skills);
          }
          appendActivity(type, data, "ready");
          break;
        }

        case "mcp_loaded": {
          setMcpStatus({ loaded: true, servers: data.servers || [] });
          appendActivity(type, data, "ready");
          break;
        }

        default:
          break;
      }
    };

    return () => {
      cancelled = true;
      close();
      wsRef.current = null;
    };
  }, [
    enqueuePendingRequest,
    resetSessionState,
    sessionId,
    processToolComplete,
    appendActivity,
  ]);

  // ── Handlers ───────────────────────────────────────────
  const handleApproval = async (requestId, approved) => {
    try {
      await sendApproval(sessionId, requestId, approved);
      setPendingRequests((prev) =>
        prev.filter((r) => r.request_id !== requestId)
      );
    } catch (err) {
      console.error("Approval failed:", err);
    }
  };

  const handleUserInput = async (requestId, answer) => {
    try {
      await sendUserInput(sessionId, requestId, answer);
      setPendingRequests((prev) =>
        prev.filter((r) => r.request_id !== requestId)
      );
    } catch (err) {
      console.error("Input reply failed:", err);
    }
  };

  // ── No session ID guard ────────────────────────────────
  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-secondary">
        <div className="text-center space-y-4">
          <span className="material-symbols-outlined text-6xl text-primary/40">
            link_off
          </span>
          <p className="font-newsreader text-xl">No session selected</p>
          <Link
            to="/"
            className="inline-block rounded-full bg-primary px-6 py-3 font-label text-sm font-bold text-on-primary"
          >
            Go to Workspace
          </Link>
        </div>
      </div>
    );
  }

  const toneClasses = statusToneClasses(statusTone);

  return (
    <div className="h-screen overflow-hidden bg-background text-on-background">
      <div className="flex h-full overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────── */}
        <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-outline-variant/30 bg-surface-container-low py-6 md:flex">
          <div className="mb-10 px-6">
            <Link to="/session" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary">
                <span className="material-symbols-outlined">menu_book</span>
              </div>
              <div>
                <h1 className="font-newsreader text-lg font-semibold leading-tight text-on-surface">
                  Cloud Cowork
                </h1>
                <p className="font-body text-[10px] uppercase tracking-widest text-secondary">
                  {connected ? "Connected" : "Connecting…"}
                </p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 px-2">
            {sidebarItems.map((item) => {
              const isActive = item.id ? activeView === item.id : false;
              const content = (
                <>
                  <span className="material-symbols-outlined">
                    {item.icon}
                  </span>
                  <span className="font-label text-sm uppercase tracking-wide">
                    {item.label}
                  </span>
                </>
              );
              const cls = isActive
                ? "ml-2 flex items-center gap-3 rounded-l-full bg-surface px-4 py-3 font-bold text-primary shadow-sm"
                : "mx-2 flex items-center gap-3 rounded-full px-6 py-3 text-secondary transition-colors hover:bg-surface-container-high cursor-pointer";
              if (item.id) {
                return (
                  <button key={item.label} onClick={() => setActiveView(item.id)} className={cls}>
                    {content}
                  </button>
                );
              }
              return item.href.startsWith("/") ? (
                <Link key={item.label} to={item.href} className={cls}>
                  {content}
                </Link>
              ) : (
                <a key={item.label} href={item.href} className={cls}>
                  {content}
                </a>
              );
            })}
          </nav>

          <div className="mt-auto px-6">
            <Link
              to="/"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary-container py-4 font-label font-bold text-on-primary-container transition-opacity hover:opacity-90"
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
                to="/session"
                className="font-newsreader text-xl font-bold text-on-surface"
              >
                Cloud Cowork
              </Link>
              <nav className="hidden gap-6 lg:flex">
                <Link
                  to="/"
                  className="font-newsreader text-lg italic tracking-tight text-secondary transition-colors hover:text-primary"
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
              <div className="flex items-center gap-2 text-xs text-secondary">
                <span
                  className={`h-2 w-2 rounded-full ${
                    connected ? "bg-green-500" : "bg-red-400"
                  }`}
                />
                {connected ? "Live" : "Offline"}
              </div>
              <div className="h-8 w-8 overflow-hidden rounded-full border border-outline-variant">
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuARkImWc52BWoTjge5UGSbt5Oxc4C95JNdj1YU0H13Q-r-5sfxE4YOAxGxcv8oZPqNcOwk8BaA6wmq8tMnVsybaGa3oK7hLfcOge0LSb4cI_28ux7fgTvD-c-gr7VQTkPYM2vWARCa9IKxLhox7p-swpukTgjM6fAxYlQ8tMupMCmq6s1iI8rkONqT4eyQIPIIgkX7XyYDLF_IC5ANjycbKVOO3uXCxpi6ABNoWLYGM-GByeJ-AgicW-BEH6jB6n8BJk7eWZp4Atfg"
                  alt="User avatar"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </header>

          <section className="flex flex-1 overflow-hidden">
            {activeView === "connectors" ? (
              <div className="flex-1 bg-background">
                <ConnectorsPanel />
              </div>
            ) : (
            <>
            {/* ── Chat area ────────────────────────────── */}
            <div className="relative flex min-h-0 flex-1 flex-col border-r border-outline-variant/10 bg-surface">
              {/* Status card — runtime details live in the sidebar */}
              <div className="px-4 pt-4 pb-2">
                <div className={`rounded-[1rem] border px-4 py-3 ${toneClasses.card}`}>
                  <div className={`flex items-center gap-2 text-sm font-medium ${toneClasses.text}`}>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${toneClasses.dot}`} />
                    <span className="truncate">{statusText}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-surface-container px-2.5 py-0.5 text-[11px] font-normal text-secondary">
                      {sessionMeta.model}
                    </span>
                  </div>
                  {lastTurnError && (
                    <p className="mt-2 text-sm text-red-700">{lastTurnError}</p>
                  )}
                </div>
              </div>

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
                renderPendingRequest={(req) => {
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
                }}
              />
              <ChatInput
                value={inputText}
                onChange={setInputText}
                onSend={(text) => {
                  sendPrompt(sessionId, text);
                  setInputText("");
                }}
                onAbort={() => abortTurn(sessionId)}
                disabled={busy}
                isBusy={busy}
              />
            </div>

            {/* ── Right sidebar ────────────────────────── */}
            <aside className="custom-scrollbar hidden w-96 shrink-0 flex-col gap-8 overflow-y-auto bg-surface-container-low p-8 lg:flex">
              <div>
                <h2 className="mb-6 font-newsreader text-xl font-bold text-on-surface">
                  Session Intelligence
                </h2>

                {/* Current file */}
                <div className="mb-10">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
                      Runtime
                    </h3>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-secondary">
                      LIVE
                    </span>
                  </div>
                  <div className="space-y-3 rounded-[1rem] border border-outline-variant/10 bg-surface p-4 shadow-sm">
                    <RuntimeRow label="Engine" value={sessionMeta.engine} />
                    <RuntimeRow label="Model" value={sessionMeta.model} />
                    <RuntimeRow label="Provider" value={sessionMeta.provider} />
                    <RuntimeRow label="Approvals" value={sessionMeta.approval_mode} />
                    {sessionMeta.mcp_servers && sessionMeta.mcp_servers.length > 0 && (
                      <p className="text-xs text-secondary">
                        MCP: {sessionMeta.mcp_servers.join(", ")}
                      </p>
                    )}
                    {sessionMeta.custom_agents && sessionMeta.custom_agents.length > 0 && (
                      <p className="text-xs text-secondary">
                        Agents: {sessionMeta.custom_agents.join(", ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mb-10">
                  <h3 className="mb-4 font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
                    Run Status
                  </h3>
                  <div className={`rounded-[1rem] border p-4 ${toneClasses.card}`}>
                    <div className={`flex items-center gap-2 text-sm font-medium ${toneClasses.text}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${toneClasses.dot}`} />
                      <span>{statusText}</span>
                    </div>
                    {lastTurnError && (
                      <p className="mt-2 text-xs text-red-700">{lastTurnError}</p>
                    )}
                  </div>
                </div>

                <div className="mb-10">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
                      Current File
                    </h3>
                    {currentFile && (
                      <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-[10px] text-primary">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  {currentFile ? (
                    <div className="group flex items-center gap-4 rounded-[1rem] border border-outline-variant/10 bg-surface p-4 shadow-sm">
                      <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-secondary-container text-on-secondary-container">
                        <span className="material-symbols-outlined">
                          description
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-on-surface">
                          {currentFile.name}
                        </p>
                        <p className="text-xs text-secondary">
                          via {currentFile.tool}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs italic text-secondary/50">
                      No files touched yet
                    </p>
                  )}
                </div>

                {/* Artifacts */}
                {artifacts.length > 0 && (
                  <div className="mb-10">
                    <h3 className="mb-4 font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
                      Project Artifacts
                    </h3>
                    <div className="space-y-3">
                      {artifacts.map((artifact) => (
                        <div
                          key={artifact.name}
                          className="flex items-center gap-4 rounded-[1rem] bg-surface-container p-4 transition-all hover:bg-surface"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed">
                            <span className="material-symbols-outlined text-sm">
                              {artifact.icon}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-on-surface">
                              {artifact.name}
                            </p>
                            <p className="text-xs text-secondary">
                              {artifact.meta}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Folders */}
                {folders.length > 0 && (
                  <div className="mb-10">
                    <h3 className="mb-4 font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
                      Relevant Folders
                    </h3>
                    <div className="space-y-2">
                      {folders.map((folder) => (
                        <div
                          key={folder.path}
                          className="group flex cursor-pointer items-center gap-3 rounded-full p-2 transition-colors hover:bg-surface-container"
                        >
                          <span className="material-symbols-outlined text-secondary transition-colors group-hover:text-primary">
                            {folder.icon}
                          </span>
                          <span className="font-body text-sm text-on-surface truncate" title={folder.path}>
                            {folder.path}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Running tools indicator */}
                {activeTools.length > 0 && (
                  <div className="mb-10">
                    <h3 className="mb-4 font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
                      Active Tools
                    </h3>
                    <div className="space-y-2">
                      {activeTools.map((tool) => (
                        <div
                          key={tool.id}
                          className="flex items-center gap-3 rounded-full bg-secondary-container/40 p-3"
                        >
                          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                          <span className="font-label text-xs text-on-secondary-container">
                            {tool.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <MCPStatusPanel mcpStatus={mcpStatus} />

                {activeSubagents.length > 0 && (
                  <div className="mb-10">
                    <h3 className="mb-4 font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
                      Active Subagents
                    </h3>
                    <ul className="space-y-2">
                      {activeSubagents.map((agent) => (
                        <li
                          key={agent.id}
                          className="flex items-center gap-2 text-xs text-on-surface"
                        >
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
                          <span className="ml-auto text-secondary capitalize">{agent.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {loadedSkills.length > 0 && (
                  <div className="mb-10">
                    <h3 className="mb-4 font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
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

                {activityLog.length > 0 && (
                  <div className="mb-10">
                    <h3 className="mb-4 font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
                      Recent Activity
                    </h3>
                    <div className="space-y-2">
                      {activityLog.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-[1rem] bg-surface px-4 py-3 text-sm text-on-surface shadow-sm"
                        >
                          {item.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Stats footer */}
              <div className="mt-auto border-t border-outline-variant/10 pt-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="font-newsreader text-xl font-bold text-primary">
                      {queryCount}
                    </p>
                    <p className="text-[10px] uppercase tracking-tighter text-secondary">
                      Queries This Session
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="font-newsreader text-xl font-bold text-primary">
                      {artifacts.length}
                    </p>
                    <p className="text-[10px] uppercase tracking-tighter text-secondary">
                      Artifacts Created
                    </p>
                  </div>
                </div>
              </div>
            </aside>
            </>
            )}
          </section>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-[3rem] border-t border-outline-variant/30 bg-background px-6 pb-4 pt-2 shadow-[0_-4px_30px_rgba(26,28,26,0.05)] md:hidden">
        <a
          href="#"
          className="flex flex-col items-center justify-center p-3 text-secondary"
        >
          <span className="material-symbols-outlined">terminal</span>
          <span className="mt-1 font-label text-[10px] font-semibold">
            Command
          </span>
        </a>
        <Link
          to={`/session?id=${sessionId}`}
          className="-translate-y-4 scale-110 rounded-full bg-primary p-4 text-background shadow-lg shadow-primary/20"
        >
          <span className="material-symbols-outlined">monitoring</span>
        </Link>
        <Link
          to="/"
          className="flex flex-col items-center justify-center p-3 text-secondary"
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

function RuntimeBadge({ label, value }) {
  return (
    <span className="rounded-full bg-surface px-3 py-1 text-[11px] uppercase tracking-wide text-secondary">
      {label}: {value}
    </span>
  );
}

function RuntimeRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-secondary">{label}</span>
      <span className="text-right font-medium text-on-surface">{value}</span>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────

function UserInputBanner({ req, onSubmit }) {
  const [answer, setAnswer] = useState("");
  const { payload } = req;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 text-primary">
        <span className="material-symbols-outlined">help</span>
        <span className="font-label text-sm font-bold uppercase tracking-wide">
          Input Requested
        </span>
      </div>
      <p className="font-newsreader text-base text-center text-on-surface">
        {payload.question || "The agent needs your input."}
      </p>
      {payload.choices?.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {payload.choices.map((choice) => (
            <button
              key={choice}
              onClick={() => onSubmit(choice)}
              className="rounded-full border border-outline-variant px-4 py-2 text-sm transition-colors hover:bg-primary hover:text-on-primary"
            >
              {choice}
            </button>
          ))}
        </div>
      )}
      {(payload.allow_freeform !== false || !payload.choices?.length) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (answer.trim()) onSubmit(answer.trim());
          }}
          className="flex items-center gap-2"
        >
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer…"
            className="flex-1 rounded-full border border-outline-variant bg-surface px-4 py-2 text-sm focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={!answer.trim()}
            className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-40"
          >
            Submit
          </button>
        </form>
      )}
    </div>
  );
}
