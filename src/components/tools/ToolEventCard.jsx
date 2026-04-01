import { useState, useEffect } from "react";
import { cn } from "../ui/cn";
import { getToolLabel, getToolIcon } from "../../lib/classifyToolEvent";
import ToolStatusBadge from "./ToolStatusBadge";

export default function ToolEventCard({ tool }) {
  const { toolName, toolCallId, arguments: args, status, resultText, errorText } = tool;
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(status === "error");

  useEffect(() => {
    if (status !== "running") return;
    const start = Date.now();
    const id = setInterval(() => setElapsed(((Date.now() - start) / 1000).toFixed(1)), 100);
    return () => clearInterval(id);
  }, [status]);

  const icon = getToolIcon(toolName, status);
  const label = getToolLabel(toolName);
  const hasOutput = resultText || errorText;

  return (
    <div
      className={cn(
        "my-2 rounded-xl border bg-surface-container p-3",
        status === "error"
          ? "border-error/30"
          : status === "complete"
          ? "border-outline-variant/30"
          : "border-primary/30"
      )}
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => hasOutput && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "material-symbols-outlined text-lg",
              status === "running" && "animate-spin text-primary",
              status === "complete" && "text-tertiary",
              status === "error" && "text-error"
            )}
          >
            {icon}
          </span>
          <span className="font-label text-[13px] font-semibold text-on-surface">
            {label}
          </span>
          {args && (
            <span className="max-w-xs truncate font-mono text-xs text-on-surface/50">
              {args}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === "running" && (
            <span className="font-label text-xs text-on-surface/50">{elapsed}s</span>
          )}
          <ToolStatusBadge status={status} />
          {hasOutput && (
            <span className="material-symbols-outlined text-sm text-on-surface/40">
              {expanded ? "expand_less" : "expand_more"}
            </span>
          )}
        </div>
      </div>

      {expanded && hasOutput && (
        <div className="mt-2 rounded-lg bg-on-surface/5 p-3">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-on-surface/70">
            {errorText || resultText}
          </pre>
        </div>
      )}
    </div>
  );
}
