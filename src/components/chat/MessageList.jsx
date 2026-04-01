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
        className="custom-scrollbar h-full overflow-y-auto"
      >
        <div className="mx-auto max-w-[48rem] px-4 pb-6 pt-4">
          {messages.length === 0 && (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
                <span className="material-symbols-outlined text-xl text-white">
                  auto_awesome
                </span>
              </div>
              <p className="text-lg font-medium text-on-surface/50">
                How can I help you today?
              </p>
            </div>
          )}

          {groups.map((group, i) => (
            <MessageGroup key={group[0].id || i} messages={group} />
          ))}

          {isTyping && (
            <div className="mt-6 flex items-start">
              <div className="mr-3 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
                <span className="material-symbols-outlined text-[14px] text-white">
                  auto_awesome
                </span>
              </div>
              <div className="pt-1">
                <TypingIndicator />
              </div>
            </div>
          )}

          {pendingRequests?.map((req) => renderPendingRequest(req))}

          <div ref={sentinelRef} className="h-1" />
        </div>
      </div>

      <ScrollPill visible={showPill} onClick={scrollToBottom} />
    </div>
  );
}
