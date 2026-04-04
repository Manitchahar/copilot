import React, { useCallback, useState } from "react";
import { useAutoResize } from "../../hooks/useAutoResize";
import { cn } from "../ui/cn";

const SEND_MODE_LABELS = {
  run: "Run now",
  enqueue: "Queue next",
  immediate: "Steer next",
};

export default React.memo(function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  onAbort,
  isBusy,
  sendMode = "run",
  onSendModeChange,
  queuedCount = 0,
  attachments = [],
  onAttachPath,
  onRemoveAttachment,
}) {
  const { ref, resize } = useAutoResize(6);
  const [showPathInput, setShowPathInput] = useState(false);
  const [pathValue, setPathValue] = useState("");
  const [pathKind, setPathKind] = useState("file");
  const [isAddingPath, setIsAddingPath] = useState(false);

  const handleChange = useCallback(
    (e) => {
      onChange(e.target.value);
      resize();
    },
    [onChange, resize]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && (value.trim() || attachments.length > 0)) {
          onSend(value.trim(), sendMode);
        }
      }
      if (e.key === "Escape") {
        onChange("");
        resize();
      }
    },
    [attachments.length, disabled, value, onSend, onChange, resize, sendMode]
  );

  const handleAttachPathSubmit = useCallback(async () => {
    const val = pathValue.trim();
    if (!val || !onAttachPath) return;
    setIsAddingPath(true);
    try {
      const attached = await onAttachPath(val, pathKind);
      if (attached !== false) {
        setPathValue("");
        setShowPathInput(false);
      }
    } finally {
      setIsAddingPath(false);
    }
  }, [onAttachPath, pathKind, pathValue]);

  return (
    <div className="border-t border-border/20 bg-background px-4 py-4">
      <div className="mx-auto max-w-[48rem]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {Object.entries(SEND_MODE_LABELS).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSendModeChange?.(mode)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                sendMode === mode
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/30 bg-white text-muted-foreground hover:bg-background"
              )}
            >
              {label}
            </button>
          ))}
          {queuedCount > 0 && (
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              {queuedCount} queued
            </span>
          )}
        </div>

        {showPathInput && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border/20 bg-white px-3 py-3 shadow-sm">
            <div className="inline-flex rounded-full border border-border/20 bg-card p-1 text-xs">
              {[
                ["file", "File"],
                ["directory", "Folder"],
              ].map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setPathKind(kind)}
                  className={cn(
                    "rounded-full px-3 py-1 transition-colors",
                    pathKind === kind ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={pathValue}
              onChange={(e) => setPathValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAttachPathSubmit();
                }
                if (e.key === "Escape") {
                  setShowPathInput(false);
                  setPathValue("");
                }
              }}
              placeholder={pathKind === "directory" ? "~/Downloads/project" : "./report.csv"}
              className="min-w-[16rem] flex-1 rounded-full border border-border/20 bg-background px-4 py-2 text-sm text-foreground outline-none focus:border-primary/40"
            />
            <button
              type="button"
              onClick={handleAttachPathSubmit}
              disabled={!pathValue.trim() || isAddingPath}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              {isAddingPath ? "Adding…" : "Attach"}
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((att) => (
              <span
                key={att.id}
                className="inline-flex items-center gap-2 rounded-full border border-border/20 bg-white px-3 py-1.5 text-xs text-foreground shadow-sm"
              >
                <span className="material-symbols-outlined text-[15px] text-muted-foreground">
                  {att.attachment?.type === "directory" ? "folder" : "description"}
                </span>
                <span className="max-w-[14rem] truncate">{att.name}</span>
                {att.sizeLabel && (
                  <span className="text-muted-foreground">{att.sizeLabel}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveAttachment?.(att.id)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={`Remove ${att.name}`}
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              </span>
            ))}
          </div>
        )}

        <div
          className="flex items-end gap-3 rounded-2xl border border-border/30 bg-white px-4 py-3 shadow-sm focus-within:border-primary/40 focus-within:shadow-md transition-all duration-200"
        >
          <button
            type="button"
            onClick={() => setShowPathInput((v) => !v)}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors mb-0.5",
              showPathInput
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            )}
            title="Attach file or folder path"
          >
            <span className="material-symbols-outlined text-[18px]">attach_file</span>
          </button>
          <textarea
            ref={ref}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Message Rocky…"
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-foreground",
              "placeholder:text-foreground/35 outline-none",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          />
          {isBusy ? (
            <button
              type="button"
              onClick={onAbort}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/80 text-white transition-colors hover:bg-foreground"
              title="Stop"
            >
              <span className="material-symbols-outlined text-[16px]">stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => (value.trim() || attachments.length > 0) && onSend(value.trim(), sendMode)}
              disabled={disabled || (!value.trim() && attachments.length === 0)}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-150",
                value.trim() || attachments.length > 0
                  ? "bg-primary text-white hover:bg-primary/85"
                  : "bg-foreground/10 text-foreground/30 cursor-not-allowed"
              )}
              title={SEND_MODE_LABELS[sendMode]}
            >
              <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
