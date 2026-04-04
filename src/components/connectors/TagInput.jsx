import { useState, useRef } from "react";
import { cn } from "../ui/cn";
import { Badge } from "@/components/ui/badge";

export default function TagInput({
  value = [],
  onChange,
  placeholder = "Type and press Enter…",
  error,
  id,
  "aria-describedby": ariaDescribedBy,
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  function addTag(text) {
    const trimmed = text.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  }

  function removeTag(index) {
    onChange(value.filter((_, i) => i !== index));
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if ((e.key === "Enter" || e.key === "Tab" || e.key === ",") && input.trim()) {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value.length - 1);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-lg border px-3 py-2 transition-colors focus-within:ring-1",
        error
          ? "border-destructive focus-within:border-destructive focus-within:ring-destructive/20"
          : "border-input focus-within:border-ring focus-within:ring-ring/20"
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, i) => (
        <Badge key={`${tag}-${i}`} variant="secondary" className="h-auto gap-1 py-1 pr-1.5 animate-in fade-in-0 zoom-in-95 duration-150">
          {tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="text-muted-foreground hover:text-destructive rounded-full"
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </Badge>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        aria-describedby={ariaDescribedBy}
      />
    </div>
  );
}
