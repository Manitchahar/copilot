## Executive Summary

Your current app is a **minimal Copilot SDK terminal shell** with lightweight local command passthrough (`/git`, `/gh`) and permission controls, not a full Copilot CLI-equivalent command platform.[^1][^2][^3]  
The official Copilot CLI supports a much broader command surface (session management, model/mode controls, fleet/delegate flows, skills lifecycle, MCP lifecycle, plugin management, context introspection, ACP server mode, and rich permission flags) via both slash commands and CLI options.[^4][^5][^6]  
To reach “Codex CLI / Claude Code parity” in practice, the fastest route is to keep your current SDK loop and add a **command router + capability modules** for `/skills`, `/mcp`, `/tasks`, `/model`, `/session`, `/context`, `/usage`, `/plugin`, and `/fleet`, backed by persistent config/state.[^1][^4][^5]  
For your stated goal (“all / commands + SKILL.md + MCP server integration”), the highest-leverage milestones are: (1) command compatibility layer, (2) skills registry/runtime, (3) MCP registry + tool exposure policy, (4) ACP server support for GUI/editor integrations.[^4][^5][^6][^7]

---

## Query Type Assessment

This request is a **technical deep-dive + implementation-process hybrid**: you want feature-complete command and platform capabilities (not just conceptual explanation), compared against your current code and translated into an actionable implementation map.[^1][^2][^4]

---

## Architecture/System Overview

### Current app architecture (observed)

```text
┌──────────────────────────────────────────────────────────┐
│ hello.py interactive loop                               │
│  - reads config.yaml                                    │
│  - creates CopilotClient + session                      │
│  - streams assistant deltas/finals                      │
│  - permission callback                                  │
│  - parses slash-like local commands                     │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│ run_backend_command()                                   │
│  supports: /help, /git..., /gh...                       │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│ backend.py RepoBackend                                  │
│  - repo discovery                                       │
│  - subprocess wrapper                                   │
│  - git/gh passthrough methods                           │
└──────────────────────────────────────────────────────────┘
```

This design is clean but intentionally narrow: there is no built-in command registry for dozens of slash commands, no task orchestration view, no MCP config lifecycle, and no skills lifecycle operations yet.[^1][^2][^4]

### Target architecture (recommended)

```text
┌────────────────────────────────────────────────────────────┐
│ UI Layer (Terminal + Web GUI)                             │
│  Prompt input, timeline, task panel, command palette      │
└──────────────┬─────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────┐
│ Command Router (/...)                                     │
│  parse -> validate -> dispatch -> structured response      │
└──────┬────────────┬──────────────┬──────────────┬─────────┘
       │            │              │              │
       ▼            ▼              ▼              ▼
┌────────────┐ ┌────────────┐ ┌─────────────┐ ┌──────────────┐
│Session/Mode│ │Skills Svc  │ │MCP Svc      │ │Task/Fleet Svc│
│/Model Svc  │ │(SKILL.md)  │ │(mcp-config) │ │(bg agents)   │
└────────────┘ └────────────┘ └─────────────┘ └──────────────┘
       │            │              │              │
       └────────────┴───────┬──────┴──────────────┘
                             ▼
                   ┌─────────────────┐
                   │ Copilot SDK/API │
                   └─────────────────┘
```

---

## Current Code Capability Inventory (what you already have)

### 1) Core interactive Copilot session loop
- Initializes `CopilotClient`, starts/stops lifecycle safely, creates session with model + streaming + permission handler.[^1]
- Handles streaming chunk events, final assistant messages, idle synchronization, and retry/timeout behavior.[^1]

### 2) Config-driven safety and UX
- `config.yaml` controls model, timeout, retries, streaming, prompts, dangerous token denylist, and approval policy.[^3]
- Permission callback auto-approves read-only or allowlisted tools, blocks dangerous command patterns, and supports explicit user approval prompts.[^1][^3]

### 3) Minimal slash command backend passthrough
- `run_backend_command()` currently recognizes `/help`, `/git ...`, `/gh ...` only.[^1]
- `RepoBackend` wraps subprocess execution and exposes repository/CLI operations (`run_git`, `run_gh`, plus convenience methods).[^2]

**Important correction:** this is **not** equivalent to Copilot CLI’s slash-command platform yet; it is a minimal custom command shim.[^1][^4]

---

## Copilot CLI Command Surface You Want (and what’s missing)

The official command reference includes broad slash categories and options beyond your current implementation, including:

- **Agent/session operations**: `/agent`, `/delegate`, `/fleet`, `/tasks`, `/session`, `/resume`, `/compact`, `/share`, `/context`, `/usage`.[^4]
- **Workspace and tooling**: `/ide`, `/lsp`, `/diff`, `/review`, `/pr`, `/terminal-setup`.[^5]
- **Skills and extensibility**: `/skills [list|info|add|remove|reload]`.[^8]
- **MCP lifecycle**: `/mcp [show|add|edit|delete|disable|enable]`.[^4]
- **Permissions/trust controls**: `/allow-all`, `/add-dir`, `/list-dirs`, `/cwd`, `/reset-allowed-tools`.[^5]
- **Models/modes**: `/model`, `/experimental`, plan/autopilot/fleet workflows.[^5][^9]
- **Platform-level options**: `--acp`, `--additional-mcp-config`, `--enable-all-github-mcp-tools`, fine-grained tool allow/deny rules.[^4][^6]

Your current router lacks almost all of this surface.[^1]

---

## SKILL.md Features: Required Implementation for Parity

### What official skills support provides
- Skills are directory-based bundles with required `SKILL.md` metadata and optional resources/scripts.[^8]
- Supported roots include repo-level (e.g., `.github/skills`) and personal-level (`~/.copilot/skills`).[^8]
- CLI supports runtime management (`/skills list`, `info`, `add`, `remove`, `reload`).[^8]
- Skill selection is relevance-based, and can be explicitly invoked in prompts.[^8]

### What your repo already contains
- A project skill exists at `.github/skills/copilot-sdk-python/SKILL.md` and accompanying instruction files.[^10][^11]
- The skill prescribes robust SDK lifecycle/event handling patterns very consistent with your current `hello.py` architecture.[^10][^1]

### Gap
- Skill **content exists**, but there is no **skills runtime lifecycle** in your app yet (discover/list/enable/disable/reload/info/invoke orchestration surfaces).[^1][^8]

---

## MCP Integration Features: Required Implementation for Parity

### Official behavior to replicate
- Copilot supports MCP configuration management and can run with built-in GitHub MCP plus additional servers.[^5][^7]
- MCP server definitions are JSON-based under `mcpServers` with `type`, `tools`, and transport-specific fields (`command/args/env` for local; `url/headers` for remote).[^7]
- CLI exposes command-line/session flags to add/disable MCP servers and to expand GitHub MCP tool availability.[^4]
- Copilot coding agent can autonomously use enabled MCP tools; explicit tool allowlisting is recommended for safety.[^7]

### Gap
- Your app has no first-class MCP config parser/validator, no `/mcp` command set, no tool policy model for MCP namespaces, and no UI for server enablement state.[^1][^7]

---

## GitHub CLI Features in Your Context

You asked for “all GitHub CLI features.” Two layers matter:

1) **Raw `gh` passthrough** (you already have): any valid `gh ...` command can run through your `/gh` route because args are forwarded to subprocess.[^1][^2]
2) **Copilot-native GitHub workflows via MCP and slash UX** (you do not yet have): richer PR/review/task workflows exposed as first-class commands, plus fleet/delegate/task controls and GitHub MCP tool selection flags.[^4][^5][^6]

So you have broad *command execution coverage* via `/gh`, but not full *Copilot CLI feature ergonomics* and orchestration semantics.

---

## Key Repositories Summary

| Repository | Purpose | Why relevant |
|---|---|---|
| [github/copilot-cli](https://github.com/github/copilot-cli) | Official GitHub Copilot CLI product/docs | Source of canonical command surface, modes, flags, and extensibility expectations.[^12][^4] |
| [github/github-mcp-server](https://github.com/github/github-mcp-server) | GitHub MCP tool server | Baseline MCP capability model used by Copilot CLI (built-in MCP context).[^13][^6] |
| [agentclientprotocol/spec](https://github.com/agentclientprotocol/spec) | ACP protocol spec | Needed if you want IDE/web GUI integrations over ACP-compatible transport.[^6] |

---

## Implementation Blueprint (practical, phased)

### Phase 1 — Command compatibility layer (`/` router)
Implement a structured command router and register categories:
- Core: `/help`, `/model`, `/clear`, `/new`, `/exit`, `/usage`, `/context`, `/compact`
- Session: `/session`, `/resume`, `/rename`, `/share`
- Execution: `/tasks`, `/fleet`, `/delegate`
- Extensibility: `/skills`, `/mcp`, `/plugin`
- Workspace: `/cwd`, `/add-dir`, `/list-dirs`, `/reset-allowed-tools`

Back each with typed handlers returning standardized result objects (status, payload, suggested next actions).

### Phase 2 — Skills subsystem
- Discover skills from `.github/skills`, `~/.copilot/skills`, and optional custom dirs.[^8]
- Parse/validate `SKILL.md` frontmatter (`name`, `description`, optional metadata).[^8]
- Implement `/skills list|info|add|remove|reload` semantics + enable/disable toggles.
- Inject skill instructions contextually per prompt/task.

### Phase 3 — MCP subsystem
- Build `mcp-config.json` manager with schema validation (`mcpServers` map + server fields).[^7]
- Add `/mcp show|add|edit|delete|disable|enable` command handlers.[^4]
- Implement tool allowlist policy per MCP server (`tools`), with safe defaults and clear warnings.[^7]
- Add support for one-session overrides akin to `--additional-mcp-config`.[^4]

### Phase 4 — Task/Fleet orchestration
- Add background task registry (`task_id`, status, logs, result summary).
- Surface `/tasks` control plane and `/fleet` decomposition/execution UX.
- Preserve your existing permission model but support per-task policy snapshots.

### Phase 5 — ACP/Web GUI integration
- Expose your agent via ACP-compatible endpoint/process mode to integrate with external GUI/editor frontends.[^6]
- Keep terminal and web GUIs as thin clients over shared command/task backplane.

---

## Recommended Command Parity Matrix (Must-have)

| Feature Group | Current app | Target parity status |
|---|---|---|
| `/git`, `/gh` passthrough | Partial (present) | Keep + harden output parsing[^1][^2] |
| Session control (`/session`, `/resume`, `/rename`) | Missing | Implement |
| Model/mode control (`/model`, autopilot/plan/fleet) | Missing | Implement |
| Task mgmt (`/tasks`) | Missing | Implement |
| Skills lifecycle (`/skills ...`) | Missing | Implement urgently |
| MCP lifecycle (`/mcp ...`) | Missing | Implement urgently |
| Permissions/trust commands | Minimal | Expand to directory/tool/url scope |
| Context/usage introspection | Missing | Implement |
| ACP server mode | Missing | Implement for GUI/editor ecosystem |

---

## Security and Reliability Notes

- Keep your denylist, but move from substring tokens toward **typed permission rules** (tool-kind + argument patterns), similar to Copilot CLI’s allow/deny model.[^3][^4]
- For MCP, default to read-only tool allowlists and explicit opt-in for mutating tools.[^7]
- Preserve deterministic lifecycle cleanup (session disconnect + client stop), which your code already does correctly.[^1]

---

## Confidence Assessment

### High confidence
- Current app capabilities and boundaries from `hello.py`, `backend.py`, `config.yaml`.[^1][^2][^3]
- Official Copilot CLI command/option landscape and skills/MCP capabilities from GitHub docs.[^4][^5][^7][^8]
- Existence and scope of your local skill assets (`SKILL.md`, agent profile).[^10][^11]

### Medium confidence / inferred
- Exact internal UX/behavior parity versus Codex CLI and Claude Code (not directly source-verified in this run). Inference is based on your statement and Copilot CLI public feature set.[^4][^5]
- The precise set of “all GitHub CLI features” you want surfaced as first-class commands versus passthrough `/gh`.

---

## Footnotes

[^1]: `/mnt/legion/copilot/hello.py:271-337,381-448`
[^2]: `/mnt/legion/copilot/backend.py:49-152`
[^3]: `/mnt/legion/copilot/config.yaml:1-25`
[^4]: GitHub Docs — Copilot CLI command reference: `/en/copilot/reference/copilot-cli-reference/cli-command-reference` (slash commands, options, tool permissions, env vars) — https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
[^5]: GitHub Docs — Using Copilot CLI: `/en/copilot/how-tos/use-copilot-agents/use-copilot-cli` (interactive usage, tips, custom instructions, custom agents, MCP and context commands) — https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli
[^6]: GitHub Docs — Copilot CLI ACP server: `/en/copilot/reference/copilot-cli-reference/acp-server` (`--acp`, stdio/TCP, integration model) — https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server
[^7]: GitHub Docs — Extending coding agent with MCP: `/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp` (MCP schema, safety notes, examples) — https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp
[^8]: GitHub Docs — Creating agent skills for Copilot CLI: `/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills` (SKILL.md format, directories, `/skills` commands) — https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills
[^9]: GitHub Copilot CLI README/help output from `fetch_copilot_cli_documentation` in-session (modes, shortcuts, command groupings).
[^10]: `/mnt/legion/copilot/.github/skills/copilot-sdk-python/SKILL.md:1-120`
[^11]: `/mnt/legion/copilot/.github/agents/copilot-sdk-python.agent.md:1-33`
[^12]: [github/copilot-cli](https://github.com/github/copilot-cli)
[^13]: [github/github-mcp-server](https://github.com/github/github-mcp-server)
