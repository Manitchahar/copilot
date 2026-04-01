import { cn } from "../ui/cn";

export default function PermissionCard({ request, onApprove, onDeny }) {
  const { request_id, payload } = request;
  const toolName = payload?.tool_name || "Unknown tool";
  const command = payload?.full_command_text || payload?.command || "";

  return (
    <div className="my-2 rounded-xl border border-warning/30 bg-warning/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-lg text-warning">shield</span>
        <span className="font-label text-[13px] font-semibold text-on-surface">
          Permission required
        </span>
      </div>

      <div className="mb-3 space-y-1">
        <p className="font-label text-xs text-on-surface/60">Tool: {toolName}</p>
        {command && (
          <pre className="rounded-lg bg-on-surface/5 p-2 font-mono text-xs text-on-surface/80">
            {command}
          </pre>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onApprove(request_id)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-1.5",
            "bg-tertiary text-on-tertiary font-label text-xs font-medium",
            "hover:bg-tertiary/80 transition-colors"
          )}
        >
          <span className="material-symbols-outlined text-sm">check</span>
          Approve
        </button>
        <button
          onClick={() => onDeny(request_id)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-1.5",
            "bg-error-container text-on-error-container font-label text-xs font-medium",
            "hover:bg-error-container/80 transition-colors"
          )}
        >
          <span className="material-symbols-outlined text-sm">close</span>
          Deny
        </button>
      </div>
    </div>
  );
}
