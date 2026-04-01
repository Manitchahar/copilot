import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createSession, listSessions, sendPrompt } from "../api";

const quickActions = [
  { icon: "folder_open", label: "Organize my files" },
  { icon: "mail", label: "Send a message" },
  { icon: "edit_note", label: "Create a file" },
  { icon: "today", label: "Prepare for the day" },
];

const mobileTabs = [
  { icon: "today", label: "Daily", active: true, href: "/" },
  { icon: "chat_bubble", label: "Chat", href: "/session" },
  { icon: "folder_open", label: "Files", href: "#" },
  { icon: "mail", label: "Messages", href: "#" },
];

function formatSessionStartError(err) {
  const message = err instanceof Error ? err.message : String(err || "");
  if (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Load failed")
  ) {
    return "Backend API is not running on http://127.0.0.1:8000. Start it with `npm run dev:api`.";
  }
  return `Failed to start the session: ${message || "please try again."}`;
}

export default function WorkspacePage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [promptText, setPromptText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = "Cloud Cowork - Workspace";
    listSessions()
      .then((data) => setSessions(data.sessions || []))
      .catch(() => {}); // backend may not be running yet
  }, []);

  const startSession = async (prompt) => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const session = await createSession();
      const sessionId = session.id;
      await sendPrompt(sessionId, prompt.trim());
      navigate(`/session?id=${sessionId}`);
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

  const activeSessions = sessions.filter((s) => !s.closed);

  return (
    <div className="min-h-screen bg-background text-on-surface selection:bg-primary-container/30">
      <div className="flex min-h-screen flex-col">
        <nav className="fixed left-0 right-0 top-0 z-50 bg-[#FAF9F6]/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
            <Link to="/" className="font-serif text-2xl font-bold text-[#99462A]">
              Cloud Cowork
            </Link>
            <div className="hidden items-center space-x-8 md:flex">
              <Link
                to="/"
                className="font-serif tracking-tight text-[#99462A] font-semibold"
              >
                Daily
              </Link>
              <Link
                to="/session"
                className="rounded-full px-4 py-1 font-serif tracking-tight text-[#5C614D] transition-colors hover:bg-[#F4F3F1]"
              >
                Files
              </Link>
              <a
                href="#"
                className="rounded-full px-4 py-1 font-serif tracking-tight text-[#5C614D] transition-colors hover:bg-[#F4F3F1]"
              >
                Messages
              </a>
            </div>
            <div className="flex items-center space-x-2">
              <button className="rounded-full p-2 text-[#5C614D] transition-colors hover:bg-[#F4F3F1]">
                <span className="material-symbols-outlined">settings</span>
              </button>
              <button className="rounded-full p-2 text-[#5C614D] transition-colors hover:bg-[#F4F3F1]">
                <span className="material-symbols-outlined">help_outline</span>
              </button>
              <div className="ml-2 h-10 w-10 overflow-hidden rounded-full border border-outline-variant/20">
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDMDUC4BdA_HMJbJjK-1VaVbYVKUgD_T-DEnxvPIRqHq8OSzCRiQIe6-f25HxLqS15kOJBgVp_smvTRtNxWEoOqVIBxOLZLmBerHV13V-2UfLlDDS-WiISWZ4so6zNYzKRhE_aKnhncOF0hxW1lcYWuvlZpmGYFZ3CZ170YJjt0Pi7STzAFMwtwmCiYvKCKszG_E2Ebm7vT9GYcScu4um0Z3lFJfNIyMoukJ3UJ9UaDUZ_saVM3DG1ck8I9ZMK9qkFKR_lAO53MSxg"
                  alt="User profile"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </nav>

        <main className="mx-auto flex w-full max-w-5xl flex-grow flex-col px-6 pb-40 pt-28">
          <section className="mb-16 flex flex-grow flex-col items-center justify-center space-y-12 text-center">
            <div className="animate-fade-in max-w-2xl">
              <h1 className="serif-display text-5xl font-light leading-tight tracking-tight text-on-surface md:text-6xl">
                Let's knock something off your list
              </h1>
              <p className="mx-auto mt-6 max-w-lg font-body text-lg leading-relaxed text-secondary opacity-80">
                Your digital sanctuary for focused work and quiet productivity.
                What shall we tackle together today?
              </p>
            </div>

            <div className="relative aspect-video w-full max-w-md">
              <div className="absolute inset-0 -rotate-2 scale-105 rounded-xl bg-surface-container-low opacity-50" />
              <div className="absolute inset-0 flex rotate-1 scale-100 items-center justify-center overflow-hidden rounded-xl bg-surface-container-high">
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDessI1RvJkFg6Fi6D4EuzCw2ld2QgQTYxLzEzmLy-pVL1LaL5CmAQrD83_tnjkGjd0JD4Wajn_jvyvq-ypCpUaIVOi6nJR-7HuwhuAeicO0ii_aKdRY-r5WDk2olJv8IMi2pdyeErW3W7WxNcFxey8h6AP3JKB7J82eouACIfXti6ANq_NeW0ZLMBWBj03L3CtTiLJAagB_mqOvjnKSjkZjBffrt_YkAmlh6RExy0_Cg99yNNZjiuEvutbaLt5YRI9F0qlJhsGZ2E"
                  alt="Serene workspace"
                  className="h-full w-full object-cover opacity-40 mix-blend-multiply"
                />
              </div>
            </div>
          </section>

          {/* Active sessions */}
          {activeSessions.length > 0 && (
            <section className="mb-8 w-full">
              <h2 className="mb-4 font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
                Active Sessions
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {activeSessions.map((s) => (
                  <Link
                    key={s.id}
                    to={`/session?id=${s.id}`}
                    className="group flex items-center gap-4 rounded-[1rem] bg-surface-container-low p-5 transition-all hover:bg-surface-container-high"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <span className="material-symbols-outlined text-sm">
                        {s.busy ? "sync" : "chat_bubble"}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-on-surface">
                        Session {s.id.slice(0, 8)}…
                      </p>
                      <p className="text-xs text-secondary">
                        {s.busy ? "Working…" : "Idle"} · {s.recent_events?.length || 0} events
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-sm text-secondary opacity-0 transition-opacity group-hover:opacity-100">
                      arrow_forward
                    </span>
                  </Link>
                ))}
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
                  className="group flex flex-col items-start space-y-4 rounded-[1rem] bg-surface-container-low p-6 text-left transition-all duration-300 hover:bg-surface-container-high disabled:opacity-50"
                >
                  <div className="rounded-full bg-white/50 p-2 text-primary">
                    <span className="material-symbols-outlined">
                      {action.icon}
                    </span>
                  </div>
                  <span className="font-label text-sm font-medium text-on-surface-variant transition-colors group-hover:text-primary">
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
                className="flex items-center rounded-full border border-outline-variant/10 bg-surface-container-highest/90 p-2 shadow-sm backdrop-blur-xl"
              >
                <div className="flex-grow pl-6">
                  <input
                    type="text"
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    placeholder="Type a command or ask a question..."
                    disabled={loading}
                    className="w-full border-none bg-transparent py-3 font-body text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !promptText.trim()}
                  className="flex items-center space-x-2 rounded-full bg-gradient-to-r from-primary to-primary-container px-8 py-3 font-label text-sm font-bold tracking-wide text-on-primary transition-all hover:opacity-90 disabled:opacity-50"
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

        <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-[3rem] bg-[#FAF9F6]/90 px-4 pb-8 pt-4 shadow-[0_-10px_40px_rgba(26,28,26,0.05)] backdrop-blur-2xl md:hidden">
          {mobileTabs.map((tab) =>
            tab.href.startsWith("/") ? (
              <Link
                key={tab.label}
                to={tab.href}
                className={
                  tab.active
                    ? "flex flex-col items-center justify-center rounded-full bg-[#D97757]/10 px-5 py-2 text-[#99462A] transition-transform duration-300"
                    : "flex flex-col items-center justify-center px-5 py-2 text-[#5C614D] transition-all hover:text-[#99462A]"
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
                className="flex flex-col items-center justify-center px-5 py-2 text-[#5C614D] transition-all hover:text-[#99462A]"
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
            className="rotate-180 text-[10px] uppercase tracking-widest text-secondary"
            style={{ writingMode: "vertical-rl" }}
          >
            Est. MMXXIV   -   Crafted for focus
          </p>
        </aside>
      </div>
    </div>
  );
}
