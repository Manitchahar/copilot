export default function MCPStatusPanel({ mcpStatus }) {
  if (!mcpStatus.loaded && mcpStatus.servers.length === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="material-symbols-outlined text-[14px]">hub</span>
        MCP Servers
      </h4>
      {mcpStatus.loaded ? (
        mcpStatus.servers.length > 0 ? (
          <ul className="space-y-1">
            {mcpStatus.servers.map((name) => (
              <li
                key={name}
                className="flex items-center gap-2 text-xs text-on-surface"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Connected</p>
        )
      ) : (
        <p className="text-xs text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
