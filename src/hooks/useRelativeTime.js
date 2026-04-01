import { useEffect, useState } from "react";

const INTERVALS = [
  { label: "just now", seconds: 60 },
  { label: "m ago", seconds: 3600, divisor: 60 },
  { label: "h ago", seconds: 86400, divisor: 3600 },
  { label: "d ago", seconds: 604800, divisor: 86400 },
];

export function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const now = Date.now();
  const ts = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
  const diff = Math.floor((now - ts) / 1000);

  if (diff < 60) return "just now";
  for (const { label, seconds, divisor } of INTERVALS) {
    if (diff < seconds && divisor) {
      const count = Math.floor(diff / divisor);
      return `${count}${label}`;
    }
  }
  return new Date(ts).toLocaleDateString();
}

export function useRelativeTime(timestamp, intervalMs = 30000) {
  const [text, setText] = useState(() => formatRelativeTime(timestamp));

  useEffect(() => {
    if (!timestamp) return;
    setText(formatRelativeTime(timestamp));
    const id = setInterval(() => setText(formatRelativeTime(timestamp)), intervalMs);
    return () => clearInterval(id);
  }, [timestamp, intervalMs]);

  return text;
}
