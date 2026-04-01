import { useCallback } from "react";
import { useAutoResize } from "../../hooks/useAutoResize";
import { cn } from "../ui/cn";

export default function ChatInput({ value, onChange, onSend, disabled, onAbort, isBusy }) {
  const { ref, resize } = useAutoResize(6);

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
        if (!disabled && value.trim()) {
          onSend(value.trim());
        }
      }
      if (e.key === "Escape") {
        onChange("");
        resize();
      }
    },
    [disabled, value, onSend, onChange, resize]
  );

  return (
    <div className="border-t border-outline-variant/20 bg-[#f3f3ee] px-4 py-4">
      <div className="mx-auto max-w-[48rem]">
        <div
          className={cn(
            "flex items-end gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm",
            "border-outline-variant/30",
            "focus-within:border-primary/40 focus-within:shadow-md transition-all duration-200"
          )}
        >
          <textarea
            ref={ref}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Message Claude Cowork…"
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
              onClick={() => value.trim() && onSend(value.trim())}
              disabled={disabled || !value.trim()}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-150",
                value.trim()
                  ? "bg-primary text-white hover:bg-primary/85"
                  : "bg-on-surface/10 text-on-surface/30 cursor-not-allowed"
              )}
              title="Send"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
