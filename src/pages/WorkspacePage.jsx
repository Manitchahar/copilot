import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createSession, deleteSession, listSessions } from "../api";

const quickActions = [
  { icon: "folder_open", label: "Organize my files" },
  { icon: "mail", label: "Send a message" },
  { icon: "edit_note", label: "Create a file" },
  { icon: "today", label: "Prepare for the day" },
];

const mobileTabs = [
  { icon: "today", label: "Daily", active: true, href: "/" },
  { icon: "chat_bubble", label: "Sessions", href: "/" },
];

const sessionStatusMeta = {
  running: { icon: "sync", label: "Running", tone: "text-emerald-700 bg-emerald-100" },
  waiting: { icon: "pending_actions", label: "Waiting", tone: "text-amber-700 bg-amber-100" },
  queued: { icon: "schedule", label: "Queued", tone: "text-sky-700 bg-sky-100" },
  starting: { icon: "hourglass_top", label: "Starting", tone: "text-violet-700 bg-violet-100" },
  error: { icon: "error", label: "Error", tone: "text-rose-700 bg-rose-100" },
  idle: { icon: "chat_bubble", label: "Idle", tone: "text-slate-600 bg-slate-100" },
};

function describeSession(session) {
  const preview = session.preview?.trim();
  if (preview) return preview;
  if (session.pending_count) return "Waiting on your response";
  if (session.queued_count) return `${session.queued_count} queued prompt${session.queued_count > 1 ? "s" : ""}`;
  if (session.loaded) return "Loaded and ready";
  return "Resume when you need it";
}

function formatSessionStartError(err) {
  const message = err instanceof Error ? err.message : String(err || "");
  if (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Load failed")
  ) {
    return "Backend API is not running on http://127.0.0.1:8000. Start everything with `npm run dev`.";
  }
  return `Failed to start the session: ${message || "please try again."}`;
}

export default function WorkspacePage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [promptText, setPromptText] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = "Rocky — The Operator";
    let cancelled = false;
    const load = () =>
      listSessions()
        .then((data) => {
          if (!cancelled) setSessions(data.sessions || []);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const startSession = async (prompt) => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const session = await createSession();
      const sessionId = session.id;
      navigate(`/session?id=${sessionId}`, {
        state: { initialPrompt: prompt.trim() },
      });
    } catch (err) {
      console.error("Failed to create session:", err);
      setError(formatSessionStartError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    startSession(promptText);
  };

  const handleQuickAction = (label) => {
    startSession(label);
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.preventDefault();
    e.stopPropagation();
    if (deletingId) return;
    if (!window.confirm("Delete this session?")) return;
    setDeletingId(sessionId);
    setError(null);
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the session.");
    } finally {
      setDeletingId(null);
    }
  };

  const liveSession =
    sessions.find((s) => ["running", "waiting", "queued", "starting"].includes(s.status)) ||
    sessions.find((s) => s.loaded) ||
    sessions[0] ||
    null;
  const visibleSessions = sessions.slice(0, 6);
  const sessionHref = liveSession ? `/session?id=${liveSession.id}` : "/";

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-accent/30">
      <div className="flex min-h-screen flex-col">
        <nav className="fixed left-0 right-0 top-0 z-50 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
            <Link to="/" className="font-serif text-2xl font-bold text-primary">
              Rocky
            </Link>
            <div className="hidden items-center space-x-8 md:flex">
              <Link
                to="/"
                className="font-serif tracking-tight text-primary font-semibold"
              >
                Daily
              </Link>
              <Link
                to={sessionHref}
                className="rounded-full px-4 py-1 font-serif tracking-tight text-muted-foreground transition-colors hover:bg-muted"
              >
                Session
              </Link>
            </div>
            <div className="flex items-center space-x-2">
              <div className="ml-2 h-10 w-10 overflow-hidden rounded-full border border-border/20">
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/30 text-sm font-semibold text-primary">
                  CW
                </div>
              </div>
            </div>
          </div>
        </nav>

        <main className="mx-auto flex w-full max-w-5xl flex-grow flex-col px-6 pb-40 pt-28">
          <section className="mb-16 flex flex-grow flex-col items-center justify-center space-y-12 text-center">
            <div className="animate-fade-in max-w-2xl">
              <h1 className="serif-display text-5xl font-light leading-tight tracking-tight text-foreground md:text-6xl">
                Let's knock something off your list
              </h1>
              <p className="mx-auto mt-6 max-w-lg font-body text-lg leading-relaxed text-muted-foreground opacity-80">
                Your digital sanctuary for focused work and quiet productivity.
                What shall we tackle together today?
              </p>
            </div>

            <div className="relative aspect-video w-full max-w-md">
              <div className="absolute inset-0 -rotate-2 scale-105 rounded-xl bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 opacity-70" />
              <div className="absolute inset-0 rotate-1 scale-100 overflow-hidden rounded-xl border border-border/20 bg-[radial-gradient(circle_at_top,_rgba(217,119,87,0.22),_transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.9),rgba(244,243,241,0.95))]">
                <div className="flex h-full w-full flex-col justify-between p-6 text-left">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                      Operator Console
                    </span>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                      Ready
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="h-3 w-2/3 rounded-full bg-primary/20" />
                    <div className="h-3 w-1/2 rounded-full bg-secondary/20" />
                    <div className="grid grid-cols-3 gap-3 pt-2">
                      <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
                        <p className="text-xs text-muted-foreground">Files</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">24</p>
                      </div>
                      <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
                        <p className="text-xs text-muted-foreground">Reports</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">8</p>
                      </div>
                      <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
                        <p className="text-xs text-muted-foreground">Tasks</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">5</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Active sessions */}
          {visibleSessions.length > 0 && (
            <section className="mb-8 w-full">
              <h2 className="mb-4 font-label text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Recent Sessions
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {visibleSessions.map((s) => {
                  const meta = sessionStatusMeta[s.status] || sessionStatusMeta.idle;
                  return (
                    <Link
                      key={s.id}
                      to={`/session?id=${s.id}`}
                      className="group flex items-center gap-4 rounded-[1rem] bg-card p-5 transition-all hover:bg-muted"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <span
                          className={`material-symbols-outlined text-sm ${
                            s.status === "running" ? "animate-spin" : ""
                          }`}
                        >
                          {meta.icon}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {s.title || `Session ${s.id.slice(0, 8)}`}
                          </p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${meta.tone}`}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {describeSession(s)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(e, s.id)}
                        disabled={deletingId === s.id}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover:opacity-100 disabled:opacity-40"
                        aria-label={`Delete ${s.title || "session"}`}
                        title="Delete session"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {deletingId === s.id ? "progress_activity" : "delete"}
                        </span>
                      </button>
                      <span className="material-symbols-outlined text-sm text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                        arrow_forward
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Quick actions */}
          <section className="mb-8 w-full">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  disabled={loading}
                  onClick={() => handleQuickAction(action.label)}
                  className="group flex flex-col items-start space-y-4 rounded-[1rem] bg-card p-6 text-left transition-all duration-300 hover:bg-muted disabled:opacity-50"
                >
                  <div className="rounded-full bg-white/50 p-2 text-primary">
                    <span className="material-symbols-outlined">
                      {action.icon}
                    </span>
                  </div>
                  <span className="font-label text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {error && (
            <div className="mb-8 w-full">
              <div className="mx-auto max-w-2xl rounded-[1rem] border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-700">
                {error}
              </div>
            </div>
          )}

          {/* Prompt bar */}
          <div className="fixed bottom-24 left-0 right-0 z-40 px-6 md:bottom-12">
            <div className="mx-auto max-w-4xl">
              <form
                onSubmit={handleSubmit}
                className="flex items-center rounded-full border border-border/10 bg-muted/90 p-2 shadow-sm backdrop-blur-xl"
              >
                <div className="flex-grow pl-6">
                  <input
                    type="text"
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    placeholder="Type a command or ask a question..."
                    disabled={loading}
                    className="w-full border-none bg-transparent py-3 font-body text-foreground placeholder:text-muted-foreground/50 focus:ring-0"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !promptText.trim()}
                  className="flex items-center space-x-2 rounded-full bg-gradient-to-r from-primary to-accent px-8 py-3 font-label text-sm font-bold tracking-wide text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="material-symbols-outlined animate-spin text-sm">
                      progress_activity
                    </span>
                  ) : (
                    <>
                      <span>Let's go</span>
                      <span className="material-symbols-outlined text-sm">
                        arrow_forward
                      </span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </main>

        <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-[3rem] bg-background/90 px-4 pb-8 pt-4 shadow-[0_-10px_40px_rgba(26,28,26,0.05)] backdrop-blur-2xl md:hidden">
          {mobileTabs.map((tab) =>
            tab.href.startsWith("/") ? (
              <Link
                key={tab.label}
                to={tab.href}
                className={
                  tab.active
                    ? "flex flex-col items-center justify-center rounded-full bg-primary/10 px-5 py-2 text-primary transition-transform duration-300"
                    : "flex flex-col items-center justify-center px-5 py-2 text-muted-foreground transition-all hover:text-primary"
                }
              >
                <span className="material-symbols-outlined">{tab.icon}</span>
                <span className="mt-1 font-sans text-[11px] uppercase tracking-wider">
                  {tab.label}
                </span>
              </Link>
            ) : (
              <a
                key={tab.label}
                href={tab.href}
                className="flex flex-col items-center justify-center px-5 py-2 text-muted-foreground transition-all hover:text-primary"
              >
                <span className="material-symbols-outlined">{tab.icon}</span>
                <span className="mt-1 font-sans text-[11px] uppercase tracking-wider">
                  {tab.label}
                </span>
              </a>
            )
          )}
        </nav>

        <aside className="fixed left-12 top-1/2 hidden max-w-[120px] -translate-y-1/2 opacity-40 xl:block">
          <p
            className="rotate-180 text-[10px] uppercase tracking-widest text-muted-foreground"
            style={{ writingMode: "vertical-rl" }}
          >
            Est. MMXXIV   -   Crafted for focus
          </p>
        </aside>
      </div>
    </div>
  );
}
