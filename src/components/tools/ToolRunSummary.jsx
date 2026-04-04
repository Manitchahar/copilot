import React, { useEffect, useState } from "react";
import { cn } from "../ui/cn";
import { buildGroupSummary } from "../../lib/classifyToolEvent";
import ToolEventCard from "./ToolEventCard";

function deriveStatus(tools = [], explicitStatus) {
  if (explicitStatus) return explicitStatus;
  if (tools.some((tool) => tool.status === "error")) return "error";
  if (tools.some((tool) => tool.status === "running")) return "running";
  return "complete";
}

export default React.memo(function ToolRunSummary({ block }) {
  const tools = block.tools || [];
  const status = deriveStatus(tools, block.status);
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status === "error") setExpanded(true);
  }, [status]);

  useEffect(() => {
    if (status !== "running") return;
    const started = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  const icon =
    status === "error" ? "error" : status === "complete" ? "check_circle" : "progress_activity";
  const intent = block.latestIntent?.trim();
  const summary = buildGroupSummary(tools);
  const latestText = block.latestText?.trim();
  const primaryText = intent
    ? summary
      ? `${intent} · ${summary}`
      : intent
    : summary || latestText || (status === "running" ? "Working…" : "");
  const hasDetails = tools.length > 0;

  if (!primaryText) {
    return null;
  }

  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className={cn(
          "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
          "transition-colors",
          hasDetails && "cursor-pointer",
          status === "error"
            ? "bg-destructive/5 hover:bg-destructive/10"
            : "hover:bg-muted/30"
        )}
      >
        <span
          className={cn(
            "material-symbols-outlined shrink-0 text-[14px]",
            status === "running" && "animate-spin text-foreground/40",
            status === "complete" && "text-foreground/30",
            status === "error" && "text-destructive/70"
          )}
        >
          {icon}
        </span>
        <span
          className={cn(
            "flex-1 truncate text-[12px]",
            status === "error" ? "text-destructive/60" : "text-foreground/40"
          )}
        >
          {primaryText}
        </span>
        {status === "running" && (
          <span className="text-[11px] tabular-nums text-foreground/30">{elapsed}s</span>
        )}
        {hasDetails && (
          <span className="material-symbols-outlined shrink-0 text-[12px] text-foreground/20 opacity-0 transition-opacity group-hover:opacity-100">
            {expanded ? "expand_less" : "expand_more"}
          </span>
        )}
      </button>

      {expanded && hasDetails && (
        <div className="ml-1 mt-1 space-y-1 border-l border-border/10 pl-4">
          {tools.map((tool) => (
            <ToolEventCard key={tool.toolCallId} tool={tool} compact />
          ))}
        </div>
      )}
    </div>
  );
});
