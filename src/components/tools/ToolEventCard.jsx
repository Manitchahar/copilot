import React, { useState, useEffect } from "react";
import { cn } from "../ui/cn";
import { getToolLabel, getToolIcon } from "../../lib/classifyToolEvent";

export default React.memo(function ToolEventCard({ tool }) {
  const { toolName, toolCallId, arguments: args, status, resultText, errorText } = tool;
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(status === "error");

  useEffect(() => {
    if (status !== "running") return;
    const start = Date.now();
    const id = setInterval(() => setElapsed(((Date.now() - start) / 1000).toFixed(1)), 1000);
    return () => clearInterval(id);
  }, [status]);

  const icon = getToolIcon(toolName, status);
  const label = getToolLabel(toolName);
  const hasOutput = resultText || errorText;

  return (
    <div
      className={cn(
        "my-2 rounded-lg border px-3 py-2.5",
        status === "error"
          ? "border-error/20 bg-error/5"
          : "border-outline-variant/20 bg-surface-container-high/20"
      )}
    >
      <div
        className={cn("flex items-center justify-between", hasOutput && "cursor-pointer")}
        onClick={() => hasOutput && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "material-symbols-outlined text-[16px] shrink-0",
              status === "running" && "animate-spin text-primary",
              status === "complete" && "text-green-600",
              status === "error" && "text-error"
            )}
          >
            {status === "complete" ? "check_circle" : icon}
          </span>
          <span className="text-[13px] font-medium text-on-surface/70">
            {label}
          </span>
          {args && (
            <span className="truncate font-mono text-[11px] text-on-surface/35">
              {args}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status === "running" && (
            <span className="text-[11px] tabular-nums text-on-surface/35">{elapsed}s</span>
          )}
          {hasOutput && (
            <span className="material-symbols-outlined text-[14px] text-on-surface/25">
              {expanded ? "expand_less" : "expand_more"}
            </span>
          )}
        </div>
      </div>

      {expanded && hasOutput && (
        <div className="mt-2 rounded-lg bg-[#1e1e1e] p-3">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-[#e5e5e0]/70">
            {errorText || resultText}
          </pre>
        </div>
      )}
    </div>
  );
});
