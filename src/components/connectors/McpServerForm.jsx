import { cn } from "../ui/cn";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import TagInput from "./TagInput";
import KeyValueInput from "./KeyValueInput";
import { hasError } from "../../lib/connectorValidation";

const FIELDS = {
  local: ["name", "command", "args", "env", "cwd", "timeout", "tools"],
  remote: ["name", "url", "headers", "timeout", "tools"],
};

const SHARED_FIELDS = ["name", "timeout", "tools"];

function FieldGroup({ children }) {
  return <div className="space-y-2">{children}</div>;
}

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1 text-sm text-destructive">
      <span className="material-symbols-outlined text-[14px]">error</span>
      {message}
    </p>
  );
}

function OptionalTag() {
  return (
    <span className="text-muted-foreground text-xs ml-1 font-normal">
      (optional)
    </span>
  );
}

export default function McpServerForm({ values, onChange, errors, mode }) {
  function set(field, val) {
    onChange({ ...values, [field]: val });
  }

  function handleModeSwitch(newMode) {
    if (newMode === mode) return;
    const preserved = {};
    for (const key of SHARED_FIELDS) {
      if (values[key] !== undefined) preserved[key] = values[key];
    }
    onChange({ ...preserved, _mode: newMode });
  }

  return (
    <div className="space-y-6 pb-4">
      {/* Sub-type toggle */}
      <Tabs value={mode} onValueChange={handleModeSwitch}>
        <TabsList className="w-full">
          <TabsTrigger value="local" className="flex-1 gap-1.5">
            <span className="material-symbols-outlined text-[16px]">
              terminal
            </span>
            Local (stdio)
          </TabsTrigger>
          <TabsTrigger value="remote" className="flex-1 gap-1.5">
            <span className="material-symbols-outlined text-[16px]">
              cloud
            </span>
            Remote (SSE)
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Name */}
      <FieldGroup>
        <Label htmlFor="mcp-name">Name</Label>
        <Input
          id="mcp-name"
          value={values.name || ""}
          onChange={(e) => set("name", e.target.value)}
          placeholder="my-mcp-server"
          aria-invalid={!!hasError(errors, "name")}
          aria-describedby="mcp-name-error"
        />
        <FieldError message={hasError(errors, "name")} />
      </FieldGroup>

      {/* Mode-specific fields */}
      {mode === "local" ? (
        <>
          {/* Command */}
          <FieldGroup>
            <Label htmlFor="mcp-command">Command</Label>
            <Input
              id="mcp-command"
              value={values.command || ""}
              onChange={(e) => set("command", e.target.value)}
              placeholder="npx, python, node…"
              aria-invalid={!!hasError(errors, "command")}
              aria-describedby="mcp-command-error"
            />
            <FieldError message={hasError(errors, "command")} />
          </FieldGroup>

          {/* Args */}
          <FieldGroup>
            <Label htmlFor="mcp-args">Arguments</Label>
            <TagInput
              id="mcp-args"
              value={values.args || []}
              onChange={(v) => set("args", v)}
              placeholder='e.g. "-m", "server"'
              error={hasError(errors, "args")}
              aria-describedby="mcp-args-error"
            />
            <FieldError message={hasError(errors, "args")} />
          </FieldGroup>

          {/* Env */}
          <FieldGroup>
            <Label>
              Environment Variables <OptionalTag />
            </Label>
            <KeyValueInput
              value={values.env || {}}
              onChange={(v) => set("env", v)}
              error={hasError(errors, "env")}
              addLabel="+ Add variable"
            />
            <FieldError message={hasError(errors, "env")} />
          </FieldGroup>
        </>
      ) : (
        <>
          {/* URL */}
          <FieldGroup>
            <Label htmlFor="mcp-url">URL</Label>
            <Input
              id="mcp-url"
              value={values.url || ""}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://example.com/sse"
              aria-invalid={!!hasError(errors, "url")}
              aria-describedby="mcp-url-error"
            />
            <FieldError message={hasError(errors, "url")} />
          </FieldGroup>

          {/* Headers */}
          <FieldGroup>
            <Label>
              Headers <OptionalTag />
            </Label>
            <KeyValueInput
              value={values.headers || {}}
              onChange={(v) => set("headers", v)}
              keyPlaceholder="Header-Name"
              valuePlaceholder="value"
              error={hasError(errors, "headers")}
              addLabel="+ Add header"
            />
            <FieldError message={hasError(errors, "headers")} />
          </FieldGroup>
        </>
      )}

      {/* Advanced section */}
      <div className="space-y-1 pt-2">
        <Separator />
        <p className="pt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Advanced
        </p>
      </div>

      {/* CWD — local only */}
      {mode === "local" && (
        <FieldGroup>
          <Label htmlFor="mcp-cwd">
            Working Directory <OptionalTag />
          </Label>
          <Input
            id="mcp-cwd"
            value={values.cwd || ""}
            onChange={(e) => set("cwd", e.target.value)}
            placeholder="/path/to/project"
            aria-invalid={!!hasError(errors, "cwd")}
          />
          <FieldError message={hasError(errors, "cwd")} />
        </FieldGroup>
      )}

      {/* Timeout */}
      <FieldGroup>
        <Label htmlFor="mcp-timeout">
          Timeout (seconds) <OptionalTag />
        </Label>
        <Input
          id="mcp-timeout"
          type="number"
          min={1}
          max={600}
          value={values.timeout ?? ""}
          onChange={(e) =>
            set("timeout", e.target.value ? Number(e.target.value) : null)
          }
          placeholder="30"
          aria-invalid={!!hasError(errors, "timeout")}
        />
        <FieldError message={hasError(errors, "timeout")} />
      </FieldGroup>

      {/* Tools filter */}
      <FieldGroup>
        <Label htmlFor="mcp-tools">
          Tools Filter <OptionalTag />
        </Label>
        <TagInput
          id="mcp-tools"
          value={values.tools || []}
          onChange={(v) => set("tools", v)}
          placeholder="Limit exposed tools…"
          error={hasError(errors, "tools")}
        />
        <p className="text-xs text-muted-foreground">
          Leave empty to expose all tools from this server.
        </p>
      </FieldGroup>
    </div>
  );
}
