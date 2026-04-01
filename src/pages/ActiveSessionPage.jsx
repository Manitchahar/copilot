import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  connectEvents,
  getSession,
  sendApproval,
  sendPrompt,
  sendUserInput,
} from "../api";

// ── Sidebar nav items ────────────────────────────────────
const sidebarItems = [
  { icon: "monitoring", label: "Monitor", active: true, href: "/session" },
  { icon: "menu_book", label: "Research", href: "/" },
  { icon: "edit_note", label: "Notes", href: "#" },
  { icon: "database", label: "Sources", href: "#" },
];

// ── Helpers ──────────────────────────────────────────────
function scrollToBottom(el) {
  if (el) el.scrollTop = el.scrollHeight;
}

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
  const [messages, setMessages] = useState([]); // { role, content, id }
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
  const [artifacts, setArtifacts] = useState([]);
  const [folders, setFolders] = useState([]);
  const [queryCount, setQueryCount] = useState(0);
  const [currentFile, setCurrentFile] = useState(null);

  // Pending approval / input requests
  const [pendingRequests, setPendingRequests] = useState([]); // { request_id, kind, payload }

  const chatRef = useRef(null);
  const wsRef = useRef(null);
  const streamingRef = useRef(null); // msg id currently being streamed

  useEffect(() => {
    document.title = "Cloud Cowork Active Session";
  }, []);

  // ── Append / update messages helpers ───────────────────
  const pushMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateStreamingMessage = useCallback((msgId, delta) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, content: m.content + delta } : m
      )
    );
  }, []);

  const finaliseStreamingMessage = useCallback((content) => {
    if (!streamingRef.current) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === streamingRef.current ? { ...m, content } : m
      )
    );
    streamingRef.current = null;
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

    // Extract folder paths
    const dirMatch = resultText.match(/(?:\/[\w.-]+){2,}/g);
    if (dirMatch) {
      setFolders((prev) => {
        const existing = new Set(prev.map((f) => f.path));
        const newFolders = dirMatch
          .filter((d) => !existing.has(d))
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
    setMessages([]);
    setInputText("");
    setBusy(false);
    setConnected(false);
    setError(null);
    setLastTurnError(null);
    setActiveTools([]);
    setArtifacts([]);
    setFolders([]);
    setQueryCount(0);
    setCurrentFile(null);
    setPendingRequests([]);
    setStatusText("Connecting to session");
    setStatusTone("ready");
    setActivityLog([]);
    streamingRef.current = null;
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
          if (data?.prompt) {
            pushMessage({
              role: "user",
              content: data.prompt,
              id: `u-\${Date.now()}`,
            });
            setQueryCount((c) => c + 1);
          }
          break;

        case "assistant_delta": {
          setStatusTone("working");
          setStatusText("Writing response");
          if (!streamingRef.current) {
            const msgId = `a-\${Date.now()}`;
            streamingRef.current = msgId;
            pushMessage({
              role: "assistant",
              content: data.content || "",
              id: msgId,
            });
          } else {
            updateStreamingMessage(
              streamingRef.current,
              data.content || ""
            );
          }
          break;
        }

        case "assistant_message":
          if (data?.content) {
            setStatusTone("ready");
            setStatusText("Response received");
            appendActivity(type, data);
            if (streamingRef.current) {
              finaliseStreamingMessage(data.content);
            } else {
              pushMessage({
                role: "assistant",
                content: data.content,
                id: `a-\${Date.now()}`,
              });
            }
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
          break;

        case "tool_output":
          setStatusTone("working");
          setStatusText(summariseEvent(type, data));
          appendActivity(type, data, "working");
          break;

        case "tool_progress":
          setStatusTone("working");
          setStatusText(summariseEvent(type, data));
          appendActivity(type, data, "working");
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
          streamingRef.current = null;
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

        case "session_error":
          setError(data?.message || "An error occurred");
          setLastTurnError(data?.message || "An error occurred");
          setStatusTone("error");
          setStatusText("Session error");
          appendActivity(type, data, "error");
          break;

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
    pushMessage,
    updateStreamingMessage,
    finaliseStreamingMessage,
    processToolComplete,
    appendActivity,
  ]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom(chatRef.current);
  }, [messages]);

  // ── Handlers ───────────────────────────────────────────
  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || busy || !sessionId) return;
    const text = inputText.trim();
    setInputText("");
    try {
      await sendPrompt(sessionId, text);
    } catch (err) {
      setError("Failed to send prompt");
      console.error(err);
    }
  };

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
    <div className="min-h-screen overflow-hidden bg-background text-on-background">
      <div className="flex min-h-screen overflow-hidden">
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
              const className = item.active
                ? "ml-2 flex items-center gap-3 rounded-l-full bg-surface px-4 py-3 font-bold text-primary shadow-sm"
                : "mx-2 flex items-center gap-3 rounded-full px-6 py-3 text-secondary transition-colors hover:bg-surface-container-high";
              return item.href.startsWith("/") ? (
                <Link key={item.label} to={item.href} className={className}>
                  {content}
                </Link>
              ) : (
                <a key={item.label} href={item.href} className={className}>
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
        <main className="flex min-w-0 flex-1 flex-col">
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
                  className={`h-2 w-2 rounded-full \${
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
            {/* ── Chat area ────────────────────────────── */}
            <div className="relative flex flex-1 flex-col border-r border-outline-variant/10 bg-surface">
              <div
                ref={chatRef}
                className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-8"
              >
                <div className={`rounded-[1rem] border p-4 \${toneClasses.card}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <RuntimeBadge label="Engine" value={sessionMeta.engine} />
                    <RuntimeBadge label="Model" value={sessionMeta.model} />
                    <RuntimeBadge label="Provider" value={sessionMeta.provider} />
                    <RuntimeBadge
                      label="Approvals"
                      value={sessionMeta.approval_mode}
                    />
                  </div>
                  <div className={`mt-3 flex items-center gap-2 text-sm \${toneClasses.text}`}>
                    <span className={`h-2.5 w-2.5 rounded-full \${toneClasses.dot}`} />
                    <span>{statusText}</span>
                  </div>
                  {lastTurnError && (
                    <p className="mt-2 text-sm text-red-700">{lastTurnError}</p>
                  )}
                </div>

                {messages.length === 0 && !busy && (
                  <div className="flex h-full items-center justify-center text-secondary/50">
                    <p className="font-newsreader text-lg italic">
                      Waiting for the first message…
                    </p>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex \${
                      msg.role === "user" ? "justify-end" : "justify-start gap-4"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-on-secondary">
                        <span className="material-symbols-outlined text-xs">
                          auto_awesome
                        </span>
                      </div>
                    )}
                    <div
                      className={
                        msg.role === "user"
                          ? "max-w-[80%] rounded-[1rem] bg-surface-container-high p-6 shadow-sm"
                          : "max-w-[85%] rounded-[1rem] border border-outline-variant/20 bg-surface-container-lowest p-6"
                      }
                    >
                      <p className="font-newsreader text-lg leading-relaxed text-on-surface whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Streaming / busy indicator */}
                {busy && !streamingRef.current && messages.length > 0 && (
                  <div className="flex justify-start gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-on-secondary">
                      <span className="material-symbols-outlined text-xs">
                        auto_awesome
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-secondary-container px-4 py-2 text-xs font-label text-on-secondary-container">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                      {activeTools.length > 0
                        ? `Running \${activeTools.map((t) => t.name).join(", ")}…`
                        : "Thinking…"}
                    </div>
                  </div>
                )}

                {/* Active tool indicators */}
                {activeTools.length > 0 && (
                  <div className="flex flex-wrap gap-2 pl-12">
                    {activeTools.map((tool) => (
                      <div
                        key={tool.id}
                        className="inline-flex items-center gap-2 rounded-full bg-tertiary-fixed/30 px-3 py-1 text-xs"
                      >
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tertiary" />
                        <span className="font-label text-on-tertiary-fixed">
                          {tool.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending approval / input requests */}
                {pendingRequests.map((req) => (
                  <div
                    key={req.request_id}
                    className="mx-auto max-w-lg rounded-[1rem] border-2 border-primary/30 bg-primary-container/20 p-6"
                  >
                    {req.kind === "permission" ? (
                      <PermissionBanner
                        req={req}
                        onApprove={() =>
                          handleApproval(req.request_id, true)
                        }
                        onDeny={() =>
                          handleApproval(req.request_id, false)
                        }
                      />
                    ) : (
                      <UserInputBanner
                        req={req}
                        onSubmit={(answer) =>
                          handleUserInput(req.request_id, answer)
                        }
                      />
                    )}
                  </div>
                ))}

                {/* Error toast */}
                {error && (
                  <div className="mx-auto max-w-md rounded-[1rem] border border-red-300 bg-red-50 p-4 text-center text-sm text-red-700">
                    {error}
                  </div>
                )}
              </div>

              {/* Chat input */}
              <div className="bg-background p-6">
                <form
                  onSubmit={handleSend}
                  className="mx-auto flex max-w-4xl items-center gap-3 rounded-full bg-surface-container-highest p-2 shadow-inner"
                >
                  <button
                    type="button"
                    className="p-3 text-secondary transition-colors hover:text-primary"
                  >
                    <span className="material-symbols-outlined">
                      attach_file
                    </span>
                  </button>
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={
                      busy
                        ? "Agent is working…"
                        : "Type a command or inquiry..."
                    }
                    disabled={busy}
                    className="flex-1 border-none bg-transparent px-2 text-base font-body text-on-surface focus:ring-0 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={busy || !inputText.trim()}
                    className="rounded-full bg-primary p-3 text-on-primary transition-transform hover:scale-95 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </form>
              </div>
            </div>

            {/* ── Right sidebar ────────────────────────── */}
            <aside className="custom-scrollbar hidden w-96 flex-col gap-8 overflow-y-auto bg-surface-container-low p-8 lg:flex">
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
                  </div>
                </div>

                <div className="mb-10">
                  <h3 className="mb-4 font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
                    Run Status
                  </h3>
                  <div className={`rounded-[1rem] border p-4 \${toneClasses.card}`}>
                    <div className={`flex items-center gap-2 text-sm font-medium \${toneClasses.text}`}>
                      <span className={`h-2.5 w-2.5 rounded-full \${toneClasses.dot}`} />
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
                          <span className="font-body text-sm text-on-surface truncate">
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
          to={`/session?id=\${sessionId}`}
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

function PermissionBanner({ req, onApprove, onDeny }) {
  const { payload } = req;
  return (
    <div className="space-y-4 text-center">
      <div className="flex items-center justify-center gap-2 text-primary">
        <span className="material-symbols-outlined">shield</span>
        <span className="font-label text-sm font-bold uppercase tracking-wide">
          Permission Required
        </span>
      </div>
      <p className="font-newsreader text-base text-on-surface">
        <span className="font-semibold">{payload.tool_name}</span>
        {payload.full_command_text && (
          <>
            {" "}
            wants to run:
            <code className="mt-2 block rounded bg-surface-container-highest p-3 text-left text-xs">
              {payload.full_command_text}
            </code>
          </>
        )}
      </p>
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={onDeny}
          className="rounded-full border border-outline-variant px-6 py-2 font-label text-sm font-bold text-secondary transition-colors hover:bg-surface-container-high"
        >
          Deny
        </button>
        <button
          onClick={onApprove}
          className="rounded-full bg-primary px-6 py-2 font-label text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
        >
          Approve
        </button>
      </div>
    </div>
  );
}

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
