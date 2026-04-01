import { useCallback, useEffect, useRef, useState } from "react";

// ── Demo data ────────────────────────────────────────────
const DEMO_MESSAGES = [
  { id: "d1", role: "user", content: "Can you help me refactor the authentication module? The current implementation has a lot of code duplication." },
  { id: "d2", role: "assistant", content: "I'll take a look at the authentication module and identify the duplicated patterns. Let me start by examining the current code structure." },
  { id: "d3", role: "assistant", content: "I found three main areas of duplication:\n\n1. **Token validation** — repeated in both `middleware.js` and `auth.service.js`\n2. **Error handling** — each route handler has its own try-catch with identical error formatting\n3. **User lookup** — the same database query appears in 5 different files\n\nI'll create shared utilities for each of these." },
  { id: "d4", role: "user", content: "That sounds great. Can you start with the token validation?" },
  { id: "d5", role: "assistant", content: "I've created a unified `validateToken` utility:\n\n```javascript\n// src/utils/auth.js\nexport async function validateToken(token) {\n  if (!token) throw new AuthError('No token provided');\n  \n  const decoded = jwt.verify(token, process.env.JWT_SECRET);\n  const user = await User.findById(decoded.sub);\n  \n  if (!user) throw new AuthError('User not found');\n  return { user, decoded };\n}\n```\n\nThis replaces the duplicated logic in both files. The middleware now calls this single function, and the service layer references it too." },
  { id: "d6", role: "user", content: "Perfect. Now do the error handling one." },
  { id: "d7", role: "assistant", content: "Done. I created a higher-order function `withErrorHandler` that wraps any async route:\n\n```javascript\nexport const withErrorHandler = (fn) => async (req, res, next) => {\n  try {\n    await fn(req, res, next);\n  } catch (err) {\n    const status = err.statusCode || 500;\n    res.status(status).json({\n      error: err.message,\n      code: err.code || 'INTERNAL_ERROR'\n    });\n  }\n};\n```\n\nAll 12 route handlers now use this wrapper instead of individual try-catch blocks. The total line count dropped from 847 to 612." },
  { id: "d8", role: "user", content: "Nice, what about the user lookup duplication?" },
  { id: "d9", role: "assistant", content: "I extracted the user lookup into a cached service:\n\n```javascript\n// src/services/user.service.js\nconst cache = new Map();\n\nexport async function getUser(id, { fresh = false } = {}) {\n  if (!fresh && cache.has(id)) return cache.get(id);\n  \n  const user = await User.findById(id)\n    .select('-password')\n    .lean();\n    \n  if (user) cache.set(id, user);\n  return user;\n}\n```\n\nThis replaced 5 separate `User.findById()` calls scattered across the codebase. The cache keeps hot users in memory with a 30-second TTL that I added via a cleanup interval.\n\nAll three refactors are complete. Want me to run the test suite to verify nothing broke?" },
];

const TOOL_EVENTS_DEMO = [
  { type: "tool", name: "read_file", status: "completed" },
  { type: "tool", name: "edit_file", status: "running" },
];

// ── Smart auto-scroll hook ───────────────────────────────
function useSmartScroll(deps) {
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);
  const isNearBottom = useRef(true);
  const [showPill, setShowPill] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isNearBottom.current = entry.isIntersecting;
        if (entry.isIntersecting) setShowPill(false);
      },
      { root: containerRef.current, threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll when content changes if user is near bottom
  useEffect(() => {
    if (isNearBottom.current && containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    } else if (!isNearBottom.current) {
      setShowPill(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
      setShowPill(false);
    }
  }, []);

  return { containerRef, sentinelRef, showPill, scrollToBottom };
}

// ── Typing indicator ─────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      <span className="typing-dot" style={{ animationDelay: "0ms" }} />
      <span className="typing-dot" style={{ animationDelay: "150ms" }} />
      <span className="typing-dot" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

// ── Avatar ───────────────────────────────────────────────
function AssistantAvatar({ size = 28 }) {
  return (
    <div
      className="assistant-avatar"
      style={{ width: size, height: size, minWidth: size }}
    >
      <svg viewBox="0 0 24 24" fill="none" width={size * 0.57} height={size * 0.57}>
        <path
          d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

// ── Auto-resizing textarea ───────────────────────────────
function AutoTextarea({ value, onChange, onSubmit, disabled, placeholder }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + "px";
    }
  }, [value]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
      className="chat-textarea"
    />
  );
}

// ── Message component ────────────────────────────────────
function Message({ msg, isFirstInGroup, isLastInGroup }) {
  const isUser = msg.role === "user";

  return (
    <div
      className={`message-row ${isUser ? "message-row--user" : "message-row--assistant"}`}
      style={{
        marginTop: isFirstInGroup ? 20 : 2,
      }}
    >
      {!isUser && (
        <div className="message-avatar-col">
          {isFirstInGroup ? <AssistantAvatar /> : <div style={{ width: 28 }} />}
        </div>
      )}
      <div
        className={`message-bubble ${
          isUser ? "message-bubble--user" : "message-bubble--assistant"
        } ${isFirstInGroup && isUser ? "message-bubble--user-first" : ""}
          ${isLastInGroup && isUser ? "message-bubble--user-last" : ""}
          ${isFirstInGroup && !isUser ? "message-bubble--asst-first" : ""}
          ${isLastInGroup && !isUser ? "message-bubble--asst-last" : ""}`}
      >
        <div className="message-content" dangerouslySetInnerHTML={{
          __html: formatContent(msg.content)
        }} />
      </div>
    </div>
  );
}

// ── Simple markdown-lite formatter ───────────────────────
function formatContent(text) {
  if (!text) return "";
  return text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="msg-code-block"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="msg-inline-code">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Line breaks
    .replace(/\n/g, "<br />");
}

// ── Tool activity pill ───────────────────────────────────
function ToolPill({ name, status }) {
  return (
    <div className="tool-pill">
      {status === "running" && <span className="tool-pill-dot tool-pill-dot--running" />}
      {status === "completed" && (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="tool-pill-check">
          <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      <span>{name}</span>
    </div>
  );
}

// ── Main prototype page ──────────────────────────────────
export default function ChatPrototype() {
  const [messages, setMessages] = useState(DEMO_MESSAGES);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [toolEvents] = useState(TOOL_EVENTS_DEMO);

  const { containerRef, sentinelRef, showPill, scrollToBottom } =
    useSmartScroll([messages, isTyping]);

  useEffect(() => {
    document.title = "Chat — Prototype";
  }, []);

  const addDemoMessage = () => {
    const roles = ["user", "assistant"];
    const samples = [
      "Can you also add unit tests for the new utilities?",
      "Sure! I'll create a comprehensive test suite. Let me set up the testing framework first with Jest and add test cases for `validateToken`, `withErrorHandler`, and `getUser`.",
      "How about adding TypeScript types?",
      "I've added TypeScript declarations for all three utilities. The type definitions cover the function signatures, option objects, and error types. Each file now has a corresponding `.d.ts` file.",
      "Can you check if there are any circular dependencies?",
      "I ran a dependency analysis and found one circular reference between `auth.service.js` and `user.service.js`. I've resolved it by extracting the shared interface into a new `types.js` module.",
    ];
    const idx = (messages.length - DEMO_MESSAGES.length) % samples.length;
    const role = roles[idx % 2];

    // Show typing indicator for assistant messages
    if (role === "assistant") {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          { id: `demo-${Date.now()}`, role, content: samples[idx] },
        ]);
      }, 1200);
    } else {
      setMessages((prev) => [
        ...prev,
        { id: `demo-${Date.now()}`, role, content: samples[idx] },
      ]);
    }
  };

  const handleSend = () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: text },
    ]);

    // Simulate assistant response
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: `I received your message: "${text}". This is a prototype demo response — in production this would come from your WebSocket backend.`,
        },
      ]);
    }, 1500);
  };

  // Compute message groups
  const groupedMessages = messages.map((msg, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const isFirstInGroup = !prev || prev.role !== msg.role;
    const isLastInGroup = !next || next.role !== msg.role;
    return { msg, isFirstInGroup, isLastInGroup };
  });

  return (
    <>
      <style>{PROTOTYPE_STYLES}</style>
      <div className="proto-root">
        {/* ── Sidebar ──────────────────────────────────── */}
        <aside className="proto-sidebar">
          <div className="proto-sidebar-header">
            <div className="proto-logo">
              <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                <path
                  d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <div>
              <h1 className="proto-brand">Cloud Cowork</h1>
              <p className="proto-brand-sub">Chat Prototype</p>
            </div>
          </div>

          <button className="proto-new-chat" onClick={() => setMessages([])}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            New chat
          </button>

          <nav className="proto-sidebar-nav">
            <div className="proto-nav-section-label">Today</div>
            <a href="#" className="proto-nav-item proto-nav-item--active">
              Auth module refactor
            </a>
            <a href="#" className="proto-nav-item">
              API rate limiting
            </a>
            <a href="#" className="proto-nav-item">
              Database migration plan
            </a>
            <div className="proto-nav-section-label">Yesterday</div>
            <a href="#" className="proto-nav-item">
              CI/CD pipeline setup
            </a>
            <a href="#" className="proto-nav-item">
              Component library review
            </a>
          </nav>

          {/* Tool activity in sidebar */}
          {toolEvents.length > 0 && (
            <div className="proto-sidebar-tools">
              <div className="proto-nav-section-label">Tool Activity</div>
              {toolEvents.map((t, i) => (
                <ToolPill key={i} name={t.name} status={t.status} />
              ))}
            </div>
          )}

          <div className="proto-sidebar-footer">
            <div className="proto-user-pill">
              <div className="proto-user-avatar">M</div>
              <span>Manit</span>
            </div>
          </div>
        </aside>

        {/* ── Main chat area ──────────────────────────── */}
        <main className="proto-main">
          {/* Top bar */}
          <header className="proto-topbar">
            <div className="proto-topbar-title">Auth module refactor</div>
            <div className="proto-topbar-actions">
              <button
                className="proto-demo-btn"
                onClick={addDemoMessage}
                title="Add a demo message to test scrolling"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Add message
              </button>
              <div className="proto-model-badge">gemini-2.5-pro</div>
            </div>
          </header>

          {/* Chat messages */}
          <div className="proto-chat-scroll" ref={containerRef}>
            <div className="proto-chat-inner">
              {messages.length === 0 && (
                <div className="proto-empty">
                  <AssistantAvatar size={48} />
                  <h2 className="proto-empty-title">How can I help you?</h2>
                  <p className="proto-empty-sub">
                    Send a message to start a conversation.
                  </p>
                </div>
              )}

              {groupedMessages.map(({ msg, isFirstInGroup, isLastInGroup }) => (
                <Message
                  key={msg.id}
                  msg={msg}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                />
              ))}

              {isTyping && (
                <div className="message-row message-row--assistant" style={{ marginTop: 20 }}>
                  <div className="message-avatar-col">
                    <AssistantAvatar />
                  </div>
                  <div className="message-bubble message-bubble--assistant message-bubble--asst-first message-bubble--asst-last">
                    <TypingIndicator />
                  </div>
                </div>
              )}

              {/* Scroll sentinel */}
              <div ref={sentinelRef} style={{ height: 1 }} />
            </div>
          </div>

          {/* Scroll-to-bottom pill */}
          {showPill && (
            <button className="proto-scroll-pill" onClick={scrollToBottom}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8.5L8 13L13 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              New messages
            </button>
          )}

          {/* Input area */}
          <div className="proto-input-area">
            <div className="proto-input-container">
              <AutoTextarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onSubmit={handleSend}
                disabled={false}
                placeholder="Message Cloud Cowork…"
              />
              <button
                className={`proto-send-btn ${inputText.trim() ? "proto-send-btn--active" : ""}`}
                onClick={handleSend}
                disabled={!inputText.trim()}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 13V3M3.5 7.5L8 3L12.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <p className="proto-disclaimer">
              Prototype demo — messages are simulated locally
            </p>
          </div>
        </main>
      </div>
    </>
  );
}

// ── All styles scoped to this prototype ──────────────────
const PROTOTYPE_STYLES = `
  /* ── Reset for prototype ──────────────────────── */
  .proto-root {
    display: flex;
    height: 100vh;
    overflow: hidden;
    font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #f9f9f8;
    color: #1a1a1a;
  }

  /* ── Sidebar ──────────────────────────────────── */
  .proto-sidebar {
    width: 260px;
    min-width: 260px;
    background: #1a1a1a;
    color: #e8e8e8;
    display: flex;
    flex-direction: column;
    padding: 16px 12px;
    gap: 4px;
  }

  .proto-sidebar-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 20px;
  }

  .proto-logo {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, #d97757 0%, #99462a 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .proto-brand {
    font-size: 15px;
    font-weight: 700;
    margin: 0;
    line-height: 1.2;
    color: #fff;
  }

  .proto-brand-sub {
    font-size: 11px;
    margin: 0;
    color: #888;
    font-weight: 500;
  }

  .proto-new-chat {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12);
    background: transparent;
    color: #e8e8e8;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    font-family: inherit;
    margin-bottom: 8px;
  }
  .proto-new-chat:hover {
    background: rgba(255,255,255,0.08);
  }

  .proto-sidebar-nav {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .proto-nav-section-label {
    font-size: 11px;
    font-weight: 600;
    color: #666;
    padding: 12px 14px 6px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .proto-nav-item {
    display: block;
    padding: 9px 14px;
    border-radius: 8px;
    font-size: 13px;
    color: #b0b0b0;
    text-decoration: none;
    transition: all 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .proto-nav-item:hover {
    background: rgba(255,255,255,0.06);
    color: #e8e8e8;
  }
  .proto-nav-item--active {
    background: rgba(255,255,255,0.1);
    color: #fff;
    font-weight: 600;
  }

  .proto-sidebar-tools {
    padding: 4px 0;
    border-top: 1px solid rgba(255,255,255,0.08);
    margin-top: 4px;
  }

  .proto-sidebar-footer {
    border-top: 1px solid rgba(255,255,255,0.08);
    padding-top: 12px;
  }

  .proto-user-pill {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #ccc;
  }

  .proto-user-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #d97757 0%, #99462a 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 12px;
    font-weight: 700;
  }

  /* ── Main area ────────────────────────────────── */
  .proto-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    position: relative;
  }

  .proto-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    border-bottom: 1px solid #e8e5e0;
    background: #f9f9f8;
    min-height: 48px;
  }

  .proto-topbar-title {
    font-size: 14px;
    font-weight: 600;
    color: #1a1a1a;
  }

  .proto-topbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .proto-demo-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #e0ddd8;
    background: white;
    color: #666;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }
  .proto-demo-btn:hover {
    background: #f5f3f0;
    color: #333;
    border-color: #ccc;
  }

  .proto-model-badge {
    font-size: 11px;
    font-weight: 600;
    color: #888;
    padding: 4px 10px;
    border-radius: 20px;
    background: #f0ede8;
  }

  /* ── Chat scroll container ────────────────────── */
  .proto-chat-scroll {
    flex: 1;
    overflow-y: auto;
    scroll-behavior: auto;
  }
  .proto-chat-scroll::-webkit-scrollbar {
    width: 6px;
  }
  .proto-chat-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .proto-chat-scroll::-webkit-scrollbar-thumb {
    background: #d4d0ca;
    border-radius: 10px;
  }
  .proto-chat-scroll::-webkit-scrollbar-thumb:hover {
    background: #b8b4ae;
  }

  .proto-chat-inner {
    max-width: 768px;
    margin: 0 auto;
    padding: 24px 20px 40px;
  }

  /* ── Empty state ──────────────────────────────── */
  .proto-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    gap: 12px;
    text-align: center;
  }

  .proto-empty-title {
    font-size: 24px;
    font-weight: 700;
    color: #1a1a1a;
    margin: 8px 0 0;
  }

  .proto-empty-sub {
    font-size: 14px;
    color: #888;
    margin: 0;
  }

  /* ── Messages ─────────────────────────────────── */
  .message-row {
    display: flex;
    align-items: flex-start;
    gap: 0;
  }

  .message-row--user {
    justify-content: flex-end;
  }

  .message-row--assistant {
    justify-content: flex-start;
  }

  .message-avatar-col {
    width: 36px;
    min-width: 36px;
    padding-top: 2px;
    display: flex;
    justify-content: center;
  }

  .assistant-avatar {
    border-radius: 50%;
    background: linear-gradient(135deg, #d97757 0%, #c45a3a 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    flex-shrink: 0;
  }

  .message-bubble {
    max-width: 85%;
    line-height: 1.65;
  }

  .message-bubble--user {
    background: #e8d5cb;
    padding: 10px 16px;
    border-radius: 20px;
    color: #2a1a12;
    max-width: 75%;
  }

  .message-bubble--user-first {
    border-top-right-radius: 20px;
    border-bottom-right-radius: 6px;
  }
  .message-bubble--user-last {
    border-top-right-radius: 6px;
    border-bottom-right-radius: 20px;
  }
  .message-bubble--user-first.message-bubble--user-last {
    border-radius: 20px;
  }

  .message-bubble--assistant {
    padding: 6px 14px 6px 0;
    color: #1a1a1a;
  }

  .message-bubble--asst-first {}
  .message-bubble--asst-last {}

  .message-content {
    font-size: 15px;
    word-break: break-word;
  }

  .message-content strong {
    font-weight: 700;
  }

  .message-content br + br {
    content: '';
    display: block;
    margin-top: 4px;
  }

  /* ── Code in messages ─────────────────────────── */
  .msg-code-block {
    background: #1a1a1a;
    color: #e8e8e8;
    padding: 14px 18px;
    border-radius: 10px;
    font-size: 13px;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    overflow-x: auto;
    margin: 10px 0 6px;
    line-height: 1.55;
  }

  .msg-code-block code {
    background: none;
    padding: 0;
    font-size: inherit;
    color: inherit;
  }

  .msg-inline-code {
    background: #f0ede8;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    color: #99462a;
  }

  /* ── Typing indicator ─────────────────────────── */
  .typing-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #999;
    display: inline-block;
    animation: typingBounce 1.2s ease-in-out infinite;
  }

  @keyframes typingBounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-6px); opacity: 1; }
  }

  /* ── Tool pills ───────────────────────────────── */
  .tool-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-radius: 6px;
    font-size: 12px;
    color: #b0b0b0;
    background: rgba(255,255,255,0.04);
    margin: 0 8px 2px;
  }

  .tool-pill-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .tool-pill-dot--running {
    background: #f5a623;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .tool-pill-check {
    color: #4caf50;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* ── Scroll pill ──────────────────────────────── */
  .proto-scroll-pill {
    position: absolute;
    bottom: 120px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 20px;
    background: #1a1a1a;
    color: white;
    font-size: 12px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    z-index: 10;
    animation: fadeInUp 0.2s ease-out;
    font-family: inherit;
  }
  .proto-scroll-pill:hover {
    background: #333;
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* ── Input area ───────────────────────────────── */
  .proto-input-area {
    padding: 0 20px 16px;
    background: #f9f9f8;
  }

  .proto-input-container {
    max-width: 768px;
    margin: 0 auto;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 16px;
    background: white;
    border: 1px solid #e0ddd8;
    box-shadow: 0 1px 6px rgba(0,0,0,0.04);
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .proto-input-container:focus-within {
    border-color: #d97757;
    box-shadow: 0 0 0 2px rgba(217,119,87,0.12);
  }

  .chat-textarea {
    flex: 1;
    border: none;
    outline: none;
    resize: none;
    font-size: 14px;
    line-height: 1.5;
    color: #1a1a1a;
    background: transparent;
    font-family: inherit;
    padding: 4px 0;
    max-height: 200px;
  }

  .chat-textarea::placeholder {
    color: #aaa;
  }

  .proto-send-btn {
    width: 32px;
    height: 32px;
    min-width: 32px;
    border-radius: 8px;
    border: none;
    background: #e0ddd8;
    color: #999;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
  }

  .proto-send-btn--active {
    background: #1a1a1a;
    color: white;
  }
  .proto-send-btn--active:hover {
    background: #333;
  }

  .proto-disclaimer {
    text-align: center;
    font-size: 11px;
    color: #bbb;
    margin: 8px 0 0;
  }

  /* ── Responsive ───────────────────────────────── */
  @media (max-width: 768px) {
    .proto-sidebar {
      display: none;
    }
    .proto-chat-inner {
      padding: 16px 12px 32px;
    }
    .message-bubble--user {
      max-width: 88%;
    }
  }
`;
