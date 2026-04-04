import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSession, getSession, sendPrompt } from "../api";

const categories = [
  { id: "all", label: "All" },
  { id: "files", label: "Files" },
  { id: "data", label: "Data" },
  { id: "reports", label: "Reports" },
  { id: "system", label: "System" },
  { id: "research", label: "Research" },
];

const commands = [
  {
    id: "organize-downloads",
    title: "Organize downloads",
    category: "files",
    icon: "folder_open",
    description: "Group recent files by type, move clutter into folders, and summarize what changed.",
    prompt:
      "Organize the most relevant cluttered files in my working directory into sensible folders by type. Explain what you moved and flag anything risky before deleting.",
    tags: ["folders", "cleanup", "safe-review"],
  },
  {
    id: "rename-batch",
    title: "Batch rename files",
    category: "files",
    icon: "drive_file_rename_outline",
    description: "Rename a group of files to a cleaner naming pattern with a preview-first approach.",
    prompt:
      "Rename the target files to a consistent naming pattern. Show the before and after names before making destructive changes.",
    tags: ["rename", "preview", "batch"],
  },
  {
    id: "analyze-csv",
    title: "Analyze a CSV",
    category: "data",
    icon: "table_chart",
    description: "Inspect a dataset, clean missing values, and summarize the most important findings.",
    prompt:
      "Analyze the attached CSV or the most relevant CSV in the workspace. Clean obvious issues, summarize the key trends, and call out anomalies worth attention.",
    tags: ["csv", "analysis", "pandas"],
  },
  {
    id: "plot-dataset",
    title: "Plot dataset",
    category: "data",
    icon: "monitoring",
    description: "Generate charts from a CSV and explain which ones matter.",
    prompt:
      "Create clear charts from the relevant dataset, save the outputs as artifacts, and explain which trends matter most.",
    tags: ["charts", "visualization", "artifacts"],
  },
  {
    id: "weekly-report",
    title: "Prepare weekly report",
    category: "reports",
    icon: "description",
    description: "Turn notes and recent outputs into a concise manager-friendly report.",
    prompt:
      "Prepare a polished weekly report from the relevant notes and files. Use clear sections, highlight risks, and end with recommended next steps.",
    tags: ["report", "notes", "manager"],
  },
  {
    id: "meeting-notes",
    title: "Analyze notes",
    category: "reports",
    icon: "note_stack",
    description: "Extract actions, decisions, and open questions from messy notes.",
    prompt:
      "Analyze the provided notes, extract decisions and action items, and return a concise follow-up summary.",
    tags: ["notes", "summary", "actions"],
  },
  {
    id: "system-diagnostics",
    title: "Run diagnostics",
    category: "system",
    icon: "memory",
    description: "Check CPU, memory, disk, and running processes and summarize anything unusual.",
    prompt:
      "Run a lightweight diagnostic of system resources, summarize CPU, memory, disk, and top processes, and flag anything that looks unhealthy.",
    tags: ["cpu", "memory", "disk"],
  },
  {
    id: "network-check",
    title: "Check network",
    category: "system",
    icon: "network_check",
    description: "Run a few connectivity checks and summarize the results.",
    prompt:
      "Run network checks against a few relevant hosts, summarize latency or failures, and explain the likely issue if something looks wrong.",
    tags: ["ping", "connectivity", "latency"],
  },
  {
    id: "web-research",
    title: "Collect web research",
    category: "research",
    icon: "travel_explore",
    description: "Gather and summarize source-backed research into a local working note.",
    prompt:
      "Collect source-backed research on the target topic, summarize the findings, and save a concise working note with links.",
    tags: ["research", "sources", "summary"],
  },
];

function formatStartError(err) {
  const message = err instanceof Error ? err.message : String(err || "");
  if (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Load failed")
  ) {
    return "Backend API is not running on http://127.0.0.1:8000. Start it with `npm run dev:api`.";
  }
  return message || "Could not run that command.";
}

export default function CommandsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [customPrompt, setCustomPrompt] = useState("");
  const [runningId, setRunningId] = useState(null);
  const [error, setError] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(Boolean(sessionId));

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setSessionReady(false);
      setSessionChecking(false);
      return undefined;
    }

    setSessionChecking(true);
    getSession(sessionId)
      .then(() => {
        if (!cancelled) {
          setSessionReady(true);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessionReady(false);
          setError("That attached session is no longer available. Start a new one instead.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSessionChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return commands.filter((command) => {
      const categoryMatch =
        activeCategory === "all" ? true : command.category === activeCategory;
      if (!categoryMatch) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        command.title,
        command.description,
        command.prompt,
        ...(command.tags || []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeCategory, query]);

  const runCommand = async (prompt, target = sessionId ? "current" : "new", commandId = "custom") => {
    if (!prompt.trim()) return;
    setRunningId(commandId);
    setError(null);
    try {
      if (target === "current" && sessionId && sessionReady) {
        try {
          await sendPrompt(sessionId, prompt.trim(), null, "run");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err || "");
          if (message.includes("409")) {
            await sendPrompt(sessionId, prompt.trim(), null, "enqueue");
          } else {
            throw err;
          }
        }
        navigate(`/session?id=${sessionId}`);
        return;
      }

      const session = await createSession();
      navigate(`/session?id=${session.id}`, {
        state: { initialPrompt: prompt.trim() },
      });
    } catch (err) {
      setError(formatStartError(err));
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-16 pt-10">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link to="/" className="font-newsreader text-2xl font-semibold text-primary">
              Cloud Cowork
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/20 text-primary">
                Command Library
              </Badge>
              {sessionId ? (
                sessionReady ? (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                    Current session attached
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    {sessionChecking ? "Checking session…" : "Session unavailable"}
                  </Badge>
                )
              ) : (
                <Badge variant="outline">Starts a new session</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sessionId && sessionReady && (
              <Button asChild variant="outline">
                <Link to={`/session?id=${sessionId}`}>Back to Session</Link>
              </Button>
            )}
            <Button asChild>
              <Link to="/">Workspace</Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_360px]">
          <div className="space-y-6">
            <div className="rounded-[1.5rem] border border-outline-variant/20 bg-surface px-6 py-7 shadow-sm">
              <div className="max-w-3xl">
                <h1 className="font-newsreader text-4xl leading-tight text-on-surface">
                  Structured commands for the harness
                </h1>
                <p className="mt-3 text-base text-muted-foreground">
                  Use starter workflows for the common jobs you want this operator to handle.
                  This is the beginning of the command layer, so each action already runs a real prompt.
                </p>
              </div>
              <div className="mt-6 flex flex-col gap-3 md:flex-row">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search commands, workflows, or outcomes"
                  className="h-11 rounded-full border-outline-variant/30 bg-background px-4"
                />
                <Button
                  variant="outline"
                  className="h-11 rounded-full px-5"
                  onClick={() => {
                    setQuery("");
                    setActiveCategory("all");
                  }}
                >
                  Clear
                </Button>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    aria-pressed={activeCategory === category.id}
                    className={
                      activeCategory === category.id
                        ? "rounded-full bg-primary px-4 py-2 text-sm font-medium text-white"
                        : "rounded-full border border-outline-variant/20 bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                    }
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-[1rem] border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {filteredCommands.map((command) => {
                const isRunning = runningId === command.id;
                return (
                  <div
                    key={command.id}
                    className="flex h-full flex-col rounded-[1.5rem] border border-outline-variant/15 bg-surface-container-low px-5 py-5 shadow-sm"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <span className="material-symbols-outlined">{command.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-semibold text-on-surface">{command.title}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{command.description}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {command.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="border-outline-variant/30">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-4 rounded-2xl bg-background/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
                      {command.prompt}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {sessionId && sessionReady && (
                        <Button
                          size="lg"
                          className="rounded-full px-5"
                          disabled={Boolean(runningId) || sessionChecking}
                          onClick={() => runCommand(command.prompt, "current", command.id)}
                        >
                          {isRunning ? "Running…" : "Run Here"}
                        </Button>
                      )}
                      <Button
                        size="lg"
                        variant={sessionId ? "outline" : "default"}
                        className="rounded-full px-5"
                        disabled={Boolean(runningId) || sessionChecking}
                        onClick={() => runCommand(command.prompt, "new", command.id)}
                      >
                        {isRunning && !sessionId ? "Starting…" : "Start New Session"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {!filteredCommands.length && (
              <div className="rounded-[1.5rem] border border-dashed border-outline-variant/30 bg-surface px-6 py-10 text-center text-muted-foreground">
                No commands matched that search yet.
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-[1.5rem] border border-outline-variant/20 bg-surface px-6 py-6 shadow-sm">
              <h2 className="font-newsreader text-2xl text-on-surface">Quick Compose</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Type your own command-like instruction here if the starter library is close but not exact.
              </p>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Example: Review the latest CSV in this folder, chart the trends, and write a short summary."
                className="mt-4 min-h-36 w-full rounded-[1.25rem] border border-outline-variant/20 bg-background px-4 py-4 text-sm text-on-surface outline-none transition-colors focus:border-primary/40"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {sessionId && sessionReady && (
                  <Button
                    className="rounded-full px-5"
                    disabled={Boolean(runningId) || !customPrompt.trim() || sessionChecking}
                    onClick={() => runCommand(customPrompt, "current")}
                  >
                    {runningId === "custom" ? "Running…" : "Run in Current Session"}
                  </Button>
                )}
                <Button
                  variant={sessionId ? "outline" : "default"}
                  className="rounded-full px-5"
                  disabled={Boolean(runningId) || !customPrompt.trim() || sessionChecking}
                  onClick={() => runCommand(customPrompt, "new")}
                >
                  {runningId === "custom" && !sessionId ? "Starting…" : "Start Fresh"}
                </Button>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-low px-6 py-6">
              <h2 className="font-newsreader text-2xl text-on-surface">What This Becomes</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                <li>Reusable command templates for common managerial and operator workflows.</li>
                <li>Future home for saved prompts, skills, and connector-backed actions.</li>
                <li>Natural entry point for a command palette with keyboard search later.</li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
