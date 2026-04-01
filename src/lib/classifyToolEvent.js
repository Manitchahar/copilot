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
