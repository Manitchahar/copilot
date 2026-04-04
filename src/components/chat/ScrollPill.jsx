import { memo } from "react";
import { cn } from "../ui/cn";

export default memo(function ScrollPill({ visible, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "absolute bottom-4 left-1/2 -translate-x-1/2 z-10",
        "flex items-center gap-1.5 rounded-full px-4 py-2",
        "bg-foreground/80 text-white shadow-lg backdrop-blur-sm",
        "text-xs font-medium",
        "transition-all duration-200",
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0 pointer-events-none"
      )}
    >
      <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
      New messages
    </button>
  );
});
