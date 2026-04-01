import { cn } from "../ui/cn";

export default function PermissionCard({ request, onApprove, onDeny }) {
  const { request_id, payload } = request;
  const toolName = payload?.tool_name || "Unknown tool";
  const command = payload?.full_command_text || payload?.command || "";

  return (
    <div className="my-3 rounded-xl border border-amber-300/40 bg-amber-50/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-amber-600">shield</span>
        <span className="text-[13px] font-semibold text-on-surface">
          Permission needed
        </span>
      </div>

      <div className="mb-3 space-y-1.5">
        <p className="text-[13px] text-on-surface/60">Tool: <span className="font-medium text-on-surface/80">{toolName}</span></p>
        {command && (
          <pre className="rounded-lg bg-[#1e1e1e] p-3 font-mono text-[12px] text-[#e5e5e0]/80">
            {command}
          </pre>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onApprove(request_id)}
          className="flex items-center gap-1.5 rounded-full bg-green-600 px-4 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-green-700"
        >
          <span className="material-symbols-outlined text-[14px]">check</span>
          Allow
        </button>
        <button
          onClick={() => onDeny(request_id)}
          className="flex items-center gap-1.5 rounded-full border border-outline-variant/40 px-4 py-1.5 text-[12px] font-medium text-on-surface/60 transition-colors hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
          Deny
        </button>
      </div>
    </div>
  );
}
