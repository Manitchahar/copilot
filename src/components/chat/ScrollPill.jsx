import { cn } from "../ui/cn";

export default function ScrollPill({ visible, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "absolute bottom-20 left-1/2 -translate-x-1/2 z-10",
        "flex items-center gap-1.5 rounded-full px-4 py-2",
        "bg-surface-container-highest text-on-surface shadow-lg",
        "font-body text-xs font-medium",
        "transition-all duration-200",
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0 pointer-events-none"
      )}
    >
      <span className="material-symbols-outlined text-base">arrow_downward</span>
      New messages
    </button>
  );
}
