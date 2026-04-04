import { useState, useEffect } from "react";
import { getConnectorConfig, saveConnectorConfig } from "../api";

export default function useConnectorConfig() {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getConnectorConfig();
      setConfig(data);
      setDraft(structuredClone(data));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const dirty = JSON.stringify(config) !== JSON.stringify(draft);

  // Section updaters — these update the draft only
  function updateMcpServers(servers) {
    setDraft(prev => ({ ...prev, mcp_servers: servers }));
  }
  function addMcpServer(name, serverConfig) {
    setDraft(prev => ({
      ...prev,
      mcp_servers: { ...prev.mcp_servers, [name]: serverConfig },
    }));
  }
  function removeMcpServer(name) {
    setDraft(prev => {
      const { [name]: _, ...rest } = prev.mcp_servers;
      return { ...prev, mcp_servers: rest };
    });
  }
  function updateSkillDirectories(dirs) {
    setDraft(prev => ({ ...prev, skill_directories: dirs }));
  }
  function updateDisabledSkills(skills) {
    setDraft(prev => ({ ...prev, disabled_skills: skills }));
  }
  function updateCustomAgents(agents) {
    setDraft(prev => ({ ...prev, custom_agents: agents }));
  }
  function addCustomAgent(agent) {
    setDraft(prev => ({
      ...prev,
      custom_agents: [...(prev.custom_agents || []), agent],
    }));
  }
  function removeCustomAgent(name) {
    setDraft(prev => ({
      ...prev,
      custom_agents: (prev.custom_agents || []).filter(a => a.name !== name),
    }));
  }
  function updateCustomAgent(oldName, agent) {
    setDraft(prev => ({
      ...prev,
      custom_agents: (prev.custom_agents || []).map(a =>
        a.name === oldName ? agent : a
      ),
    }));
  }
  function updateMcpServer(oldName, newName, config) {
    setDraft(prev => {
      const servers = { ...prev.mcp_servers };
      if (oldName !== newName) delete servers[oldName];
      servers[newName] = config;
      return { ...prev, mcp_servers: servers };
    });
  }
  function updateProvider(provider) {
    setDraft(prev => ({ ...prev, provider: provider }));
  }
  function clearProvider() {
    setDraft(prev => {
      const { provider, ...rest } = prev;
      return rest;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveConnectorConfig(draft);
      setConfig(structuredClone(draft));
      setLastSaved(Date.now());
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDraft(structuredClone(config));
    setError(null);
  }

  return {
    config, draft, loading, saving, error, dirty, lastSaved,
    load, save, reset,
    updateMcpServers, addMcpServer, removeMcpServer, updateMcpServer,
    updateSkillDirectories, updateDisabledSkills,
    updateCustomAgents, addCustomAgent, removeCustomAgent, updateCustomAgent,
    updateProvider, clearProvider,
    setDraft,
  };
}
