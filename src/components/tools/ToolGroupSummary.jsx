import { useState } from "react";
import { cn } from "../ui/cn";
import ToolEventCard from "./ToolEventCard";

export default function ToolGroupSummary({ tools }) {
  const [expanded, setExpanded] = useState(false);
  const count = tools.length;
  const allDone = tools.every((t) => t.status === "complete");
  const hasError = tools.some((t) => t.status === "error");

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-3 py-2",
          "border-outline-variant/20 bg-surface-container-high/20",
          "hover:bg-surface-container-high/40 transition-colors text-left"
        )}
      >
        <span className={cn(
          "material-symbols-outlined text-[16px]",
          hasError ? "text-error" : allDone ? "text-green-600" : "text-on-surface/40"
        )}>
          {hasError ? "error" : allDone ? "check_circle" : "progress_activity"}
        </span>
        <span className="flex-1 text-[13px] font-medium text-on-surface/60">
          Researched {count} files
        </span>
        <span className="material-symbols-outlined text-[14px] text-on-surface/25">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 space-y-1 pl-2">
          {tools.map((tool) => (
            <ToolEventCard key={tool.toolCallId} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
