import { cn } from "../ui/cn";

const STATUS_STYLES = {
  running: {
    dot: "bg-blue-500 animate-pulse",
    border: "border-blue-200",
    bg: "bg-blue-50/50",
    label: "Running",
  },
  completed: {
    dot: "bg-emerald-500",
    border: "border-emerald-200",
    bg: "bg-emerald-50/50",
    label: "Completed",
  },
  failed: {
    dot: "bg-red-500",
    border: "border-red-200",
    bg: "bg-red-50/50",
    label: "Failed",
  },
};

export default function SubagentCard({ block }) {
  const { agentName, status, error } = block;
  const style = STATUS_STYLES[status] || STATUS_STYLES.running;

  return (
    <div
      className={cn(
        "my-2 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        style.border,
        style.bg
      )}
    >
      <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", style.dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-on-surface">{agentName}</span>
          <span className="text-xs text-secondary">{style.label}</span>
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-600 break-words">{error}</p>
        )}
      </div>
    </div>
  );
}
