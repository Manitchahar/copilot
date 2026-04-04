import { cn } from "../ui/cn";

export default function ToolStatusBadge({ status }) {
  return (
    <span className={cn(
      "material-symbols-outlined text-[14px]",
      status === "running" && "animate-spin text-primary",
      status === "complete" && "text-status-success",
      status === "error" && "text-destructive",
    )}>
      {status === "running" ? "progress_activity" : status === "error" ? "error" : "check_circle"}
    </span>
  );
}
