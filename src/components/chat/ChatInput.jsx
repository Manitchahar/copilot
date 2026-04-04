import React, { useCallback, useRef, useState } from "react";
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
  isUploading = false,
  onAttachFiles,
  onRemoveAttachment,
}) {
  const { ref, resize } = useAutoResize(6);
  const fileInputRef = useRef(null);
  const directoryInputRef = useRef(null);
  const [isDragActive, setIsDragActive] = useState(false);

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
        if (!disabled && !isUploading && (value.trim() || attachments.length > 0)) {
          onSend(value.trim(), sendMode);
        }
      }
      if (e.key === "Escape") {
        onChange("");
        resize();
      }
    },
    [attachments.length, disabled, isUploading, value, onSend, onChange, resize, sendMode]
  );

  const handleAttach = useCallback(
    (fileList) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      onAttachFiles?.(files);
    },
    [onAttachFiles]
  );

  const handlePaste = useCallback(
    (e) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (!files.length) return;
      e.preventDefault();
      handleAttach(files);
    },
    [handleAttach]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragActive(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      handleAttach(files);
    },
    [handleAttach]
  );

  return (
    <div className="border-t border-outline-variant/20 bg-[#f3f3ee] px-4 py-4">
      <div className="mx-auto max-w-[48rem]">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleAttach(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={directoryInputRef}
          type="file"
          multiple
          directory=""
          webkitdirectory=""
          className="hidden"
          onChange={(e) => {
            handleAttach(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {Object.entries(SEND_MODE_LABELS).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSendModeChange?.(mode)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                sendMode === mode
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant/30 bg-white text-muted-foreground hover:bg-surface"
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
          {isUploading && (
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
              Uploading attachments…
            </span>
          )}
        </div>
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex items-center gap-2 rounded-full border border-outline-variant/20 bg-white px-3 py-1.5 text-xs text-on-surface shadow-sm"
              >
                <span className="material-symbols-outlined text-[15px] text-muted-foreground">
                  {attachment.media_type?.startsWith("image/") ? "image" : "attach_file"}
                </span>
                <span className="max-w-[14rem] truncate">{attachment.name}</span>
                {attachment.sizeLabel && (
                  <span className="text-muted-foreground">{attachment.sizeLabel}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveAttachment?.(attachment.id)}
                  className="text-muted-foreground transition-colors hover:text-on-surface"
                  aria-label={`Remove ${attachment.name}`}
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              </span>
            ))}
          </div>
        )}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget)) return;
            setIsDragActive(false);
          }}
          onDrop={handleDrop}
          className={cn(
            "flex items-end gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm",
            "border-outline-variant/30",
            "focus-within:border-primary/40 focus-within:shadow-md transition-all duration-200",
            isDragActive && "border-primary bg-primary-fixed/15 shadow-md"
          )}
        >
          <div className="flex shrink-0 items-center gap-1 pb-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-on-surface"
              title="Attach files"
            >
              <span className="material-symbols-outlined text-[18px]">attach_file</span>
            </button>
            <button
              type="button"
              onClick={() => directoryInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-on-surface"
              title="Attach folder"
            >
              <span className="material-symbols-outlined text-[18px]">folder</span>
            </button>
          </div>
          <textarea
            ref={ref}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled}
            placeholder="Message Claude Cowork or paste/drop files…"
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-on-surface",
              "placeholder:text-on-surface/35 outline-none",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          />
          {isBusy ? (
            <button
              type="button"
              onClick={onAbort}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-on-surface/80 text-white transition-colors hover:bg-on-surface"
              title="Stop"
            >
              <span className="material-symbols-outlined text-[16px]">stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => (value.trim() || attachments.length > 0) && onSend(value.trim(), sendMode)}
              disabled={disabled || isUploading || (!value.trim() && attachments.length === 0)}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-150",
                value.trim() || attachments.length > 0
                  ? "bg-primary text-white hover:bg-primary/85"
                  : "bg-on-surface/10 text-on-surface/30 cursor-not-allowed"
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
