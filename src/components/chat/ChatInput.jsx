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
    <div className="border-t border-outline-variant/30 bg-background p-4">
      <div
        className={cn(
          "flex items-end gap-3 rounded-2xl border px-4 py-3",
          "border-outline-variant/40 bg-surface-container-low",
          "focus-within:border-primary/50 transition-colors"
        )}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask Claude Cowork anything…"
          rows={1}
          className={cn(
            "flex-1 resize-none bg-transparent font-body text-[15px] text-on-surface",
            "placeholder:text-outline outline-none",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        />
        {isBusy ? (
          <button
            type="button"
            onClick={onAbort}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              "bg-error text-on-error transition-colors hover:bg-error/80"
            )}
            title="Cancel"
          >
            <span className="material-symbols-outlined text-lg">stop</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => value.trim() && onSend(value.trim())}
            disabled={disabled || !value.trim()}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              "bg-primary text-on-primary transition-colors",
              "hover:bg-primary/80 disabled:opacity-30 disabled:cursor-not-allowed"
            )}
            title="Send"
          >
            <span className="material-symbols-outlined text-lg">arrow_upward</span>
          </button>
        )}
      </div>
    </div>
  );
}
