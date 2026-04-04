import { useState } from "react";
import { cn } from "../ui/cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function ConnectorItemCard({ name, subtitle, meta, status = "configured", onEdit, onDuplicate, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  const statusDot = { active: "bg-emerald-600", configured: "bg-outline-variant", error: "bg-red-600" }[status] || "bg-outline-variant";
  const statusLabel = { active: "Connected", configured: "Configured", error: "Error" }[status] || status;

  if (confirming) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-on-surface">Remove "{name}"?</p>
        <p className="mt-1 text-xs text-secondary">This connector will be removed. Active sessions won't be affected.</p>
        <div className="mt-3 flex gap-2 justify-end">
          <Button variant="ghost" size="xs" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="destructive" size="xs" onClick={() => { onDelete(); setConfirming(false); }}>Remove</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative rounded-xl border border-outline-variant/10 bg-surface p-4 shadow-sm transition-all hover:shadow-md cursor-pointer" onClick={onEdit}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", statusDot)} aria-hidden="true" />
        <span className="sr-only">{statusLabel}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-on-surface">{name}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-secondary">{subtitle}</p>}
          {meta && <p className="mt-0.5 text-xs text-secondary/70">{meta}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="opacity-0 transition-opacity group-hover:opacity-100" aria-label={`Actions for ${name}`} onClick={(e) => e.stopPropagation()}>
              <span className="material-symbols-outlined text-[18px]">more_vert</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={onEdit}>
              <span className="material-symbols-outlined text-[16px]">edit</span> Edit
            </DropdownMenuItem>
            {onDuplicate && (
              <DropdownMenuItem onClick={onDuplicate}>
                <span className="material-symbols-outlined text-[16px]">content_copy</span> Duplicate
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirming(true)}>
              <span className="material-symbols-outlined text-[16px]">delete</span> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
