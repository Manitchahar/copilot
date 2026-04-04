import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function JsonEditor({ value, onChange, error }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative">
      <Textarea
        aria-label="JSON configuration editor"
        aria-describedby={error ? "json-editor-error" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="min-h-[200px] bg-[#1e1e1e] p-4 font-mono leading-relaxed text-[#d4d4d4] border-transparent resize-y"
      />
      <Button variant="ghost" size="xs" onClick={handleCopy} className="absolute right-2 top-2 bg-white/10 text-white/60 hover:bg-white/20 hover:text-white/80">
        {copied ? "Copied!" : "Copy"}
      </Button>
      {error && (
        <p id="json-editor-error" role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">error</span>
          {error}
        </p>
      )}
    </div>
  );
}
