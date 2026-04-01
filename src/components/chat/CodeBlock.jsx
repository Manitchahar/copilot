import { useCallback, useState } from "react";
import { cn } from "../ui/cn";

function extractText(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node?.props?.children) return extractText(node.props.children);
  return "";
}

export default function CodeBlock({ language, children }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = extractText(children);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [children]);

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg bg-on-surface">
      <div className="flex items-center justify-between px-4 py-2 text-xs">
        <span className="font-label text-surface/60">
          {language || "text"}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1",
            "text-surface/60 hover:text-surface hover:bg-surface/10",
            "transition-colors font-label"
          )}
        >
          <span className="material-symbols-outlined text-sm">
            {copied ? "check" : "content_copy"}
          </span>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 pb-4 text-[13px] leading-relaxed text-surface">
        <code>{children}</code>
      </pre>
    </div>
  );
}
