import { useState } from "react";
import { cn } from "./cn";

export default function Collapsible({ title, defaultOpen = false, children, className }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-xl", className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="font-label text-[13px] font-semibold text-on-surface">{title}</span>
        <span className="material-symbols-outlined text-sm text-on-surface/40">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
