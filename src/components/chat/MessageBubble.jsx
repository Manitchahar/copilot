import { cn } from "../ui/cn";
import MarkdownContent from "./MarkdownContent";
import ToolEventCard from "../tools/ToolEventCard";
import ToolGroupSummary from "../tools/ToolGroupSummary";
import SubagentCard from "../agents/SubagentCard";
import SkillBadge from "../agents/SkillBadge";

function BlockRenderer({ block, isStreaming }) {
  switch (block.type) {
    case "text":
      return <MarkdownContent content={block.content} isStreaming={isStreaming} />;
    case "tool":
      return <ToolEventCard tool={block} />;
    case "tool-group":
      return <ToolGroupSummary tools={block.tools} />;
    case "subagent":
      return <SubagentCard block={block} />;
    case "skill":
      return <SkillBadge block={block} />;
    default:
      return null;
  }
}

export default function MessageBubble({ message, isFirstInGroup, isLastInGroup }) {
  const { role, blocks, _streaming, _aborted } = message;
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
        isFirstInGroup ? "mt-6" : "mt-1"
      )}
    >
      {/* Avatar — assistant only, first in group */}
      {!isUser && (
        <div className="mr-3 mt-1 w-7 shrink-0">
          {isFirstInGroup && (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
              <span className="material-symbols-outlined text-[14px] text-white">
                auto_awesome
              </span>
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          "max-w-[48rem]",
          isUser
            ? "rounded-2xl bg-surface-container-high/60 px-5 py-3 text-on-surface"
            : "text-on-surface",
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
          <p className="mt-2 text-sm italic text-secondary">⏹ Generation stopped</p>
        )}
      </div>
    </div>
  );
}
