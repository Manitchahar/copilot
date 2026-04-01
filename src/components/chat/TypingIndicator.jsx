export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-3">
      <span className="typing-dot" style={{ animationDelay: "0ms" }} />
      <span className="typing-dot" style={{ animationDelay: "150ms" }} />
      <span className="typing-dot" style={{ animationDelay: "300ms" }} />
    </div>
  );
}
