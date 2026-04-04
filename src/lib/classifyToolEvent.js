const ACTION_TOOLS = new Set([
  "bash", "shell", "terminal", "exec", "run_command",
  "write_file", "edit_file", "create_file", "delete_file",
  "git_commit", "git_push", "apply_patch",
]);

const RESEARCH_TOOLS = new Set([
  "read_file", "view_file", "cat",
  "grep", "search", "find", "glob", "rg",
  "list_directory", "ls",
]);

const RESEARCH_PREFIXES = ["get_", "fetch_", "list_", "read_"];

export function classifyToolEvent(toolName) {
  if (!toolName) return "action";
  const name = toolName.toLowerCase();
  if (ACTION_TOOLS.has(name)) return "action";
  if (RESEARCH_TOOLS.has(name)) return "research";
  if (RESEARCH_PREFIXES.some((p) => name.startsWith(p))) return "research";
  return "action";
}

export function getToolIcon(toolName, status) {
  const tier = classifyToolEvent(toolName);
  if (status === "error") return "error";
  if (status === "running") return "progress_activity";
  if (tier === "research") return "menu_book";
  return "terminal";
}

export function getToolLabel(toolName) {
  if (!toolName) return "Running tool";
  const name = toolName.toLowerCase();
  if (name === "bash" || name === "shell" || name === "terminal") return "Running command";
  if (name.includes("write") || name === "apply_patch") return "Editing file";
  if (name.includes("create")) return "Creating file";
  if (name.includes("delete")) return "Deleting file";
  if (name.includes("read") || name === "view_file" || name === "cat") return "Reading file";
  if (name === "grep" || name === "rg" || name === "search" || name === "find" || name === "glob") return "Searching";
  if (name.includes("list") || name === "ls") return "Listing directory";
  if (name.includes("git")) return "Git operation";
  return `Running ${toolName}`;
}

export function getToolCategory(toolName) {
  if (!toolName) return "other";
  const name = toolName.toLowerCase();
  if (["bash", "shell", "terminal", "exec", "run_command"].includes(name)) return "command";
  if (name.includes("edit") || name.includes("write") || name === "apply_patch") return "edit";
  if (name.includes("create")) return "create";
  if (name.includes("delete")) return "delete";
  if (name === "grep" || name === "rg" || name === "search" || name === "find" || name === "glob") return "search";
  if (name.includes("read") || name === "view_file" || name === "cat") return "read";
  if (name.includes("list") || name === "ls") return "read";
  if (name.includes("git")) return "git";
  if (RESEARCH_PREFIXES.some((p) => name.startsWith(p))) return "read";
  return "other";
}

export function buildGroupSummary(tools) {
  const total = tools.length;
  if (total === 0) return "";
  const running = tools.filter((t) => t.status === "running");
  const errors = tools.filter((t) => t.status === "error");
  const done = tools.filter((t) => t.status === "complete");

  if (running.length > 0) {
    if (total === 1) return getToolLabel(running[0].toolName) + "…";
    if (done.length === 0) return `Running ${total} tools…`;
    return `${done.length} of ${total} complete`;
  }

  if (errors.length > 0) {
    if (errors.length === total) return `${total} tool${total === 1 ? "" : "s"} failed`;
    return `${errors.length} failed · ${total} tool calls`;
  }

  const cats = {};
  for (const t of tools) {
    const cat = getToolCategory(t.toolName);
    cats[cat] = (cats[cat] || 0) + 1;
  }

  const fmt = {
    command: (n) => (n === 1 ? "Ran command" : `Ran ${n} commands`),
    edit: (n) => (n === 1 ? "Edited file" : `Edited ${n} files`),
    create: (n) => (n === 1 ? "Created file" : `Created ${n} files`),
    delete: (n) => (n === 1 ? "Deleted file" : `Deleted ${n} files`),
    search: (n) => (n === 1 ? "Searched" : `${n} searches`),
    read: (n) => (n === 1 ? "Read file" : `Read ${n} files`),
    git: (n) => (n === 1 ? "Git op" : `${n} git ops`),
    other: (n) => (n === 1 ? "Used tool" : `Used ${n} tools`),
  };

  const order = ["command", "edit", "create", "delete", "search", "read", "git", "other"];
  const parts = order.filter((k) => cats[k]).map((k) => fmt[k](cats[k]));

  if (parts.length <= 3) return parts.join(" · ");
  return `Used ${total} tools`;
}
