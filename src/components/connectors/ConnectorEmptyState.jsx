import { Button } from "@/components/ui/button";

export default function ConnectorEmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className="material-symbols-outlined text-[32px] text-secondary/40">{icon}</span>
      <p className="mt-3 text-sm font-medium text-on-surface">{title}</p>
      <p className="mt-1 max-w-[280px] text-xs text-secondary">{description}</p>
      {onAction && (
        <Button size="sm" className="mt-4 rounded-full" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
