import { useState } from "react";
import { cn } from "../ui/cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function ConnectorItemCard({ name, subtitle, meta, status = "configured", onEdit, onDuplicate, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  const statusDot = { active: "bg-emerald-600", configured: "bg-muted-foreground", error: "bg-red-600" }[status] || "bg-muted-foreground";
  const statusLabel = { active: "Connected", configured: "Configured", error: "Error" }[status] || status;

  if (confirming) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-foreground">Remove "{name}"?</p>
        <p className="mt-1 text-xs text-muted-foreground">This connector will be removed. Active sessions won't be affected.</p>
        <div className="mt-3 flex gap-2 justify-end">
          <Button variant="ghost" size="xs" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="destructive" size="xs" onClick={() => { onDelete(); setConfirming(false); }}>Remove</Button>
        </div>
      </div>
    );
  }

  return (
    <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); }}} className="group relative rounded-xl border border-border/10 bg-background p-4 shadow-sm transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-md cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onEdit}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", statusDot)} aria-hidden="true" />
        <span className="sr-only">{statusLabel}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{name}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
          {meta && <p className="mt-0.5 text-xs text-muted-foreground/70">{meta}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100" aria-label={`Actions for ${name}`} onClick={(e) => e.stopPropagation()}>
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
