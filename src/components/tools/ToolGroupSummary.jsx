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
          "flex w-full items-center gap-2 rounded-xl border px-3 py-2",
          "bg-surface-container border-outline-variant/30",
          "hover:bg-surface-container-high transition-colors text-left"
        )}
      >
        <span className="material-symbols-outlined text-lg text-on-surface/60">menu_book</span>
        <span className="flex-1 font-label text-[13px] font-medium text-on-surface/70">
          {hasError ? `Researched ${count} files (with errors)` : `Researched ${count} files`}
        </span>
        {allDone && (
          <span className="material-symbols-outlined text-sm text-tertiary">check_circle</span>
        )}
        <span className="material-symbols-outlined text-sm text-on-surface/40">
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
