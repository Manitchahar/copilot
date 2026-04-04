import { useState } from "react";
import useConnectorConfig from "../../hooks/useConnectorConfig";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import ConnectorAccordion from "./ConnectorAccordion";
import ConnectorItemCard from "./ConnectorItemCard";
import ConnectorEmptyState from "./ConnectorEmptyState";
import ConnectorFormSheet from "./ConnectorFormSheet";
import SkillsSection from "./SkillsSection";
import ProviderForm from "./ProviderForm";

export default function ConnectorsPanel() {
  const {
    draft,
    loading,
    saving,
    error,
    dirty,
    lastSaved,
    save,
    reset,
    addMcpServer,
    removeMcpServer,
    addCustomAgent,
    removeCustomAgent,
    updateSkillDirectories,
    updateDisabledSkills,
    setDraft,
  } = useConnectorConfig();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetFormType, setSheetFormType] = useState(null);
  const [editData, setEditData] = useState(null);

  function openSheet(formType, data = null) {
    setSheetFormType(formType);
    setEditData(data);
    setSheetOpen(true);
  }

  function handleSave(values) {
    if (sheetFormType === "mcp-local" || sheetFormType === "mcp-remote") {
      const { name, ...config } = values;
      if (editData?.name && editData.name !== name) removeMcpServer(editData.name);
      addMcpServer(name, config);
    } else if (sheetFormType === "custom-agent") {
      if (editData?.name) removeCustomAgent(editData.name);
      addCustomAgent(values);
    }
    setSheetOpen(false);
  }

  function duplicateMcp(name, server) {
    const newName = `${name}-copy`;
    addMcpServer(newName, { ...server });
  }

  function duplicateAgent(agent) {
    addCustomAgent({ ...agent, name: `${agent.name}-copy` });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-[24px] text-muted-foreground">
          progress_activity
        </span>
        <span className="ml-2 text-sm text-muted-foreground">Loading configuration…</span>
      </div>
    );
  }

  const mcpServers = draft?.mcp_servers || {};
  const mcpEntries = Object.entries(mcpServers);
  const agents = draft?.custom_agents || [];
  const existingMcpNames = Object.keys(mcpServers);
  const existingAgentNames = agents.map((a) => a.name);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Connectors</h1>
          <p className="text-sm text-muted-foreground">
            Configure MCP servers, agents, skills, and providers
          </p>
        </div>
        {lastSaved && !dirty && (
          <p className="text-xs text-muted-foreground">
            Saved {new Date(lastSaved).toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Dirty bar */}
      {dirty && (
        <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
          <span className="material-symbols-outlined text-[18px] text-amber-600">warning</span>
          <span className="flex-1 text-sm text-amber-800">Unsaved changes</span>
          <Button variant="ghost" size="xs" onClick={reset}>
            Discard
          </Button>
          <Button size="xs" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}

      {/* Error bar */}
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Main scroll area */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-6">
          {/* MCP Servers */}
          <ConnectorAccordion
            id="mcp-servers"
            icon="dns"
            label="MCP Servers"
            count={mcpEntries.length}
            onAdd={() => openSheet("mcp-local")}
            defaultOpen
          >
            {mcpEntries.length === 0 ? (
              <ConnectorEmptyState
                icon="dns"
                title="No MCP servers configured"
                description="Add an MCP server to extend your AI assistant with custom tools and data sources."
                actionLabel="Add MCP Server"
                onAction={() => openSheet("mcp-local")}
              />
            ) : (
              <div className="space-y-2">
                {mcpEntries.map(([name, server]) => (
                  <ConnectorItemCard
                    key={name}
                    name={name}
                    subtitle={server.type === "remote" ? server.url : server.command}
                    meta={server.type === "remote" ? "Remote (SSE)" : "Local (stdio)"}
                    status="configured"
                    onEdit={() =>
                      openSheet(server.type === "remote" ? "mcp-remote" : "mcp-local", {
                        name,
                        ...server,
                      })
                    }
                    onDuplicate={() => duplicateMcp(name, server)}
                    onDelete={() => removeMcpServer(name)}
                  />
                ))}
              </div>
            )}
          </ConnectorAccordion>

          {/* Custom Agents */}
          <ConnectorAccordion
            id="custom-agents"
            icon="smart_toy"
            label="Custom Agents"
            count={agents.length}
            onAdd={() => openSheet("custom-agent")}
          >
            {agents.length === 0 ? (
              <ConnectorEmptyState
                icon="smart_toy"
                title="No custom agents configured"
                description="Define custom agents with their own prompts, tools, and behavior."
                actionLabel="Add Custom Agent"
                onAction={() => openSheet("custom-agent")}
              />
            ) : (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <ConnectorItemCard
                    key={agent.name}
                    name={agent.display_name || agent.name}
                    subtitle={agent.description}
                    meta={agent.name}
                    status="configured"
                    onEdit={() => openSheet("custom-agent", agent)}
                    onDuplicate={() => duplicateAgent(agent)}
                    onDelete={() => removeCustomAgent(agent.name)}
                  />
                ))}
              </div>
            )}
          </ConnectorAccordion>

          {/* Skills */}
          <ConnectorAccordion
            id="skills"
            icon="bolt"
            label="Skills"
            count={
              (draft?.skill_directories?.length || 0) + (draft?.disabled_skills?.length || 0)
            }
            countLabel={
              (draft?.skill_directories?.length || 0) + (draft?.disabled_skills?.length || 0) > 0
                ? `${draft?.skill_directories?.length || 0} dirs`
                : undefined
            }
          >
            <SkillsSection
              skillDirectories={draft?.skill_directories}
              disabledSkills={draft?.disabled_skills}
              onChangeDirectories={updateSkillDirectories}
              onChangeDisabledSkills={updateDisabledSkills}
            />
          </ConnectorAccordion>

          {/* Provider */}
          <ConnectorAccordion id="provider" icon="key" label="Provider" count={draft?.provider?.type ? 1 : 0}>
            <ProviderForm
              values={draft?.provider || {}}
              onChange={(val) => setDraft((prev) => ({ ...prev, provider: val }))}
              errors={[]}
            />
          </ConnectorAccordion>
        </div>
      </ScrollArea>

      {/* Form sheet */}
      <ConnectorFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        formType={sheetFormType}
        editData={editData}
        existingNames={
          sheetFormType?.startsWith("mcp") ? existingMcpNames : existingAgentNames
        }
        onSave={handleSave}
      />
    </div>
  );
}
