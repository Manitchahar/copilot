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
    navigator.clipboard.writeText(extractText(children)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [children]);

  return (
    <div className="group relative my-4 overflow-hidden rounded-xl bg-code shadow-sm">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
        <span className="font-mono text-xs text-white/40">
          {language || "plaintext"}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1",
            "text-xs text-white/40 hover:text-white/70 hover:bg-white/5",
            "transition-all duration-150"
          )}
        >
          <span className="material-symbols-outlined text-[14px]">
            {copied ? "check" : "content_copy"}
          </span>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="text-code-foreground">{children}</code>
      </pre>
    </div>
  );
}
