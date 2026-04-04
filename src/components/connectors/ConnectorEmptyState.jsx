import { Button } from "@/components/ui/button";

export default function ConnectorEmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/[0.06]">
        <span className="material-symbols-outlined text-[24px] text-primary/40">{icon}</span>
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-[280px] text-xs text-muted-foreground">{description}</p>
      {onAction && (
        <Button size="sm" className="mt-4 rounded-full" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
