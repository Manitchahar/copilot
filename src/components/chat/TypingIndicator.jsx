export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <span className="typing-dot" style={{ animationDelay: "0ms" }} />
      <span className="typing-dot" style={{ animationDelay: "200ms" }} />
      <span className="typing-dot" style={{ animationDelay: "400ms" }} />
    </div>
  );
}
