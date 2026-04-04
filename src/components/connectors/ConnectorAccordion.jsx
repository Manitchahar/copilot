import { useState, useRef, useEffect } from "react";
import { cn } from "../ui/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ConnectorAccordion({
  id,
  icon,
  label,
  count,
  countLabel,
  onAdd,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyRef = useRef(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) setBodyHeight(bodyRef.current.scrollHeight);
  }, [children, open]);

  const headerId = `accordion-header-${id}`;
  const panelId = `accordion-panel-${id}`;

  return (
    <div className="rounded-[1rem] border border-outline-variant/20 bg-surface-container-low overflow-hidden">
      <h3>
        <button
          id={headerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="flex w-full cursor-pointer items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-container-high/50"
        >
          <span className={cn("material-symbols-outlined text-sm text-on-surface/40 transition-transform duration-200", open && "rotate-180")}>
            expand_more
          </span>
          <span className="material-symbols-outlined text-[18px] text-secondary">{icon}</span>
          <span className="font-label text-sm font-semibold uppercase tracking-wide text-on-surface">{label}</span>
          <span className="sr-only">, {count} {count === 1 ? "item" : "items"}</span>
          {count > 0 && (
            <Badge variant="secondary" className="h-auto px-2 py-0.5 text-[11px]">
              {countLabel || count}
            </Badge>
          )}
          <span className="flex-1" />
          {onAdd && (
            <Button variant="link" size="xs" onClick={(e) => { e.stopPropagation(); if (!open) setOpen(true); onAdd(); }} className="h-auto p-0" aria-label={`Add ${label}`}>
              + Add
            </Button>
          )}
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        style={{ maxHeight: open ? `${bodyHeight + 20}px` : "0px" }}
        className="overflow-hidden transition-all duration-200 ease-out"
      >
        <div ref={bodyRef} className="border-t border-outline-variant/10 px-5 pb-4 pt-3">
          {children}
        </div>
      </div>
    </div>
  );
}
