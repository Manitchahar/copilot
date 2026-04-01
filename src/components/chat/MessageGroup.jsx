import MessageBubble from "./MessageBubble";

export default function MessageGroup({ messages }) {
  return (
    <div className="space-y-0">
      {messages.map((msg, i) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isFirstInGroup={i === 0}
          isLastInGroup={i === messages.length - 1}
        />
      ))}
    </div>
  );
}
