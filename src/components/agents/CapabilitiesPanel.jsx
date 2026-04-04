import { memo } from "react";

function CapabilityChip({ label, tone = "default" }) {
  const toneClass =
    tone === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-border/20 bg-background text-muted-foreground";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

export default memo(function CapabilitiesPanel({ runtime = {}, mcpStatus, loadedSkills = [] }) {
  const builtIn = [
    "Shell",
    "Files",
    "Search",
    "Ask User",
    "Approvals",
  ];
  if (runtime.tool_events !== false) builtIn.push("Tool Stream");
  if (runtime.streaming !== false) builtIn.push("Streaming");

  const mcpServers = Array.from(
    new Set([...(runtime.mcp_servers || []), ...(mcpStatus?.servers || [])])
  );
  const customAgents = runtime.custom_agents || [];
  const skills = Array.from(
    new Set([...(runtime.skill_directories || []), ...loadedSkills])
  );

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        Capabilities
      </h3>

      <div className="space-y-3 rounded-[1rem] border border-border/20 bg-background/70 p-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Built in
          </p>
          <div className="flex flex-wrap gap-2">
            {builtIn.map((item) => (
              <CapabilityChip key={item} label={item} tone="active" />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            MCP
          </p>
          {mcpServers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {mcpServers.map((server) => (
                <CapabilityChip key={server} label={server} tone="active" />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No MCP servers attached to this session.</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Agents & Skills
          </p>
          <div className="flex flex-wrap gap-2">
            {customAgents.map((agent) => (
              <CapabilityChip key={agent} label={`Agent: ${agent}`} />
            ))}
            {skills.map((skill) => (
              <CapabilityChip key={skill} label={`Skill: ${skill}`} />
            ))}
            {customAgents.length === 0 && skills.length === 0 && (
              <p className="text-xs text-muted-foreground">No custom agents or loaded skills in this session.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
