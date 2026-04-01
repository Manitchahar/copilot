import { useSmartScroll } from "../../hooks/useSmartScroll";
import MessageGroup from "./MessageGroup";
import TypingIndicator from "./TypingIndicator";
import ScrollPill from "./ScrollPill";

function groupMessages(messages) {
  const groups = [];
  let current = [];

  for (const msg of messages) {
    if (current.length === 0 || current[0].role === msg.role) {
      current.push(msg);
    } else {
      groups.push(current);
      current = [msg];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export default function MessageList({ messages, isTyping, pendingRequests, renderPendingRequest }) {
  const { containerRef, sentinelRef, showPill, scrollToBottom } = useSmartScroll([
    messages,
    isTyping,
  ]);

  const groups = groupMessages(messages);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="custom-scrollbar h-full overflow-y-auto px-8 pb-4 pt-6"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="material-symbols-outlined mb-3 text-5xl text-primary/30">
              chat_bubble
            </span>
            <p className="font-headline text-lg text-on-surface/40">
              Start a conversation
            </p>
          </div>
        )}

        {groups.map((group, i) => (
          <MessageGroup key={group[0].id || i} messages={group} />
        ))}

        {isTyping && (
          <div className="mt-4 flex items-start">
            <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <span className="material-symbols-outlined text-base text-primary">
                smart_toy
              </span>
            </div>
            <div className="rounded-2xl rounded-tl-md bg-surface-container-low px-4 py-1">
              <TypingIndicator />
            </div>
          </div>
        )}

        {pendingRequests?.map((req) => renderPendingRequest(req))}

        <div ref={sentinelRef} className="h-1" />
      </div>

      <ScrollPill visible={showPill} onClick={scrollToBottom} />
    </div>
  );
}
