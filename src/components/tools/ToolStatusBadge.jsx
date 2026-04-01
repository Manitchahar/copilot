import { cn } from "../ui/cn";

export default function ToolStatusBadge({ status }) {
  const config = {
    running: {
      icon: "progress_activity",
      label: "Running",
      className: "text-primary animate-spin",
    },
    complete: {
      icon: "check_circle",
      label: "Done",
      className: "text-tertiary",
    },
    error: {
      icon: "error",
      label: "Error",
      className: "text-error",
    },
  };

  const { icon, label, className } = config[status] || config.running;

  return (
    <span className={cn("flex items-center gap-1 text-xs font-label", className)}>
      <span className="material-symbols-outlined text-sm">{icon}</span>
      {label}
    </span>
  );
}
