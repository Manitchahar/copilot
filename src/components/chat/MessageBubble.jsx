import { cn } from "../ui/cn";
import MarkdownContent from "./MarkdownContent";
import ToolEventCard from "../tools/ToolEventCard";
import ToolGroupSummary from "../tools/ToolGroupSummary";
import { useRelativeTime } from "../../hooks/useRelativeTime";

function BlockRenderer({ block, isStreaming }) {
  switch (block.type) {
    case "text":
      return <MarkdownContent content={block.content} isStreaming={isStreaming} />;
    case "tool":
      return <ToolEventCard tool={block} />;
    case "tool-group":
      return <ToolGroupSummary tools={block.tools} />;
    default:
      return null;
  }
}

export default function MessageBubble({ message, isFirstInGroup, isLastInGroup }) {
  const { role, blocks, timestamp, _streaming, _aborted } = message;
  const isUser = role === "user";
  const relTime = useRelativeTime(timestamp);

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
        isFirstInGroup ? (isUser ? "mt-4" : "mt-4") : "mt-1"
      )}
    >
      {/* Avatar area (assistant only, first in group) */}
      {!isUser && (
        <div className="mr-3 w-8 shrink-0">
          {isFirstInGroup && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <span className="material-symbols-outlined text-base text-primary">
                smart_toy
              </span>
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-surface-container-high text-on-surface"
            : "bg-surface-container-low text-on-surface",
          isFirstInGroup && !isUser && "rounded-tl-md",
          isFirstInGroup && isUser && "rounded-tr-md"
        )}
      >
        {blocks.map((block, i) => (
          <BlockRenderer
            key={`${message.id}-b${i}`}
            block={block}
            isStreaming={_streaming && i === blocks.length - 1 && block.type === "text"}
          />
        ))}

        {_aborted && (
          <p className="mt-1 font-label text-xs italic text-error/70">Cancelled</p>
        )}

        {isLastInGroup && (
          <p className="mt-1 text-right font-label text-[11px] text-on-surface/40" title={timestamp ? new Date(timestamp).toLocaleString() : ""}>
            {relTime}
          </p>
        )}
      </div>
    </div>
  );
}
