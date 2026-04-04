import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { Separator } from "../ui/separator";
import { hasError } from "../../lib/connectorValidation";
import TagInput from "./TagInput";

export default function CustomAgentForm({ values, onChange, errors }) {
  const set = (field) => (e) =>
    onChange({ ...values, [field]: e?.target ? e.target.value : e });

  const descLen = values.description?.length || 0;

  return (
    <div className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="agent-name">Name</Label>
        <Input
          id="agent-name"
          value={values.name || ""}
          onChange={set("name")}
          placeholder="code-reviewer"
          aria-invalid={!!hasError(errors, "name")}
        />
        <p className="text-xs text-muted-foreground">
          lowercase letters, numbers, and hyphens
        </p>
        {hasError(errors, "name") && (
          <p className="text-sm text-destructive">{hasError(errors, "name")}</p>
        )}
      </div>

      {/* Display Name */}
      <div className="space-y-2">
        <Label htmlFor="agent-display-name">Display Name</Label>
        <Input
          id="agent-display-name"
          value={values.display_name || ""}
          onChange={set("display_name")}
          placeholder="Code Reviewer"
          aria-invalid={!!hasError(errors, "display_name")}
        />
        {hasError(errors, "display_name") && (
          <p className="text-sm text-destructive">
            {hasError(errors, "display_name")}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="agent-description">Description</Label>
        <Textarea
          id="agent-description"
          value={values.description || ""}
          onChange={set("description")}
          placeholder="What does this agent do?"
          maxLength={200}
          rows={2}
          aria-invalid={!!hasError(errors, "description")}
        />
        <div className="flex items-center justify-between">
          {hasError(errors, "description") ? (
            <p className="text-sm text-destructive">
              {hasError(errors, "description")}
            </p>
          ) : (
            <span />
          )}
          <span
            className={`text-xs tabular-nums ${
              descLen >= 200 ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {descLen}/200
          </span>
        </div>
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <Label htmlFor="agent-prompt">System Prompt</Label>
        <Textarea
          id="agent-prompt"
          value={values.prompt || ""}
          onChange={set("prompt")}
          placeholder="You are a helpful assistant that…"
          rows={4}
          className="min-h-[6rem]"
          aria-invalid={!!hasError(errors, "prompt")}
        />
        {hasError(errors, "prompt") && (
          <p className="text-sm text-destructive">
            {hasError(errors, "prompt")}
          </p>
        )}
      </div>

      {/* Advanced section */}
      <Separator />
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-muted-foreground">
            tune
          </span>
          Advanced
        </h3>
        <p className="text-xs text-muted-foreground">
          Optional tools, servers, and behavior settings.
        </p>
      </div>

      {/* Tools */}
      <div className="space-y-2">
        <Label htmlFor="agent-tools">Tools</Label>
        <TagInput
          id="agent-tools"
          value={values.tools || []}
          onChange={(v) => onChange({ ...values, tools: v })}
          placeholder="tool-name"
        />
        {hasError(errors, "tools") && (
          <p className="text-sm text-destructive">
            {hasError(errors, "tools")}
          </p>
        )}
      </div>

      {/* MCP Servers */}
      <div className="space-y-2">
        <Label htmlFor="agent-mcp-servers">MCP Servers</Label>
        <TagInput
          id="agent-mcp-servers"
          value={values.mcp_servers || []}
          onChange={(v) => onChange({ ...values, mcp_servers: v })}
          placeholder="server-name"
        />
      </div>

      {/* Infer toggle */}
      <div className="flex items-center justify-between rounded-lg border border-input px-4 py-3">
        <div className="space-y-0.5">
          <Label htmlFor="agent-infer" className="cursor-pointer">
            Allow inference
          </Label>
          <p className="text-xs text-muted-foreground">
            Let the agent make inference calls on its own.
          </p>
        </div>
        <Switch
          id="agent-infer"
          checked={values.infer ?? true}
          onCheckedChange={(checked) => onChange({ ...values, infer: checked })}
        />
      </div>
    </div>
  );
}
