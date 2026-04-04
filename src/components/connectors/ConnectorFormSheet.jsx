import { useState, useCallback, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "../ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import JsonEditor from "./JsonEditor";
import McpServerForm from "./McpServerForm";
import CustomAgentForm from "./CustomAgentForm";
import {
  validateMcpLocal,
  validateMcpRemote,
  validateCustomAgent,
} from "../../lib/connectorValidation";

const FORM_META = {
  "mcp-local": {
    title: "MCP Server (Local)",
    subtitle: "Configure a local MCP server that communicates over stdio.",
    icon: "terminal",
  },
  "mcp-remote": {
    title: "MCP Server (Remote)",
    subtitle: "Connect to a remote MCP server over SSE or HTTP.",
    icon: "cloud",
  },
  "custom-agent": {
    title: "Custom Agent",
    subtitle: "Define a custom agent with its own prompt and tools.",
    icon: "smart_toy",
  },
};

function defaultValues(formType) {
  if (formType === "custom-agent") {
    return {
      name: "",
      display_name: "",
      description: "",
      prompt: "",
      tools: [],
      mcp_servers: [],
      infer: true,
    };
  }
  const mode = formType === "mcp-remote" ? "remote" : "local";
  return mode === "local"
    ? { name: "", command: "", args: [], env: {}, cwd: "", timeout: null, tools: [], _mode: "local" }
    : { name: "", url: "", headers: {}, timeout: null, tools: [], _mode: "remote" };
}

function cleanForSerialize(values) {
  const out = { ...values };
  delete out._mode;
  // Strip empty optional fields
  if (!out.cwd) delete out.cwd;
  if (out.timeout == null) delete out.timeout;
  if (out.tools?.length === 0) delete out.tools;
  if (out.mcp_servers?.length === 0) delete out.mcp_servers;
  if (out.args?.length === 0) delete out.args;
  if (out.env && Object.keys(out.env).length === 0) delete out.env;
  if (out.headers && Object.keys(out.headers).length === 0) delete out.headers;
  return out;
}

function validate(values, formType, mode, existingNames) {
  if (formType === "custom-agent") {
    return validateCustomAgent(values, existingNames);
  }
  return mode === "remote"
    ? validateMcpRemote(values, existingNames)
    : validateMcpLocal(values, existingNames);
}

export default function ConnectorFormSheet({
  open,
  onOpenChange,
  formType,
  editData,
  existingNames = [],
  onSave,
}) {
  const isEditing = !!editData;
  const meta = FORM_META[formType] || FORM_META["mcp-local"];
  const isMcp = formType?.startsWith("mcp-");

  const [values, setValues] = useState(() =>
    editData
      ? { ...editData, _mode: formType === "mcp-remote" ? "remote" : "local" }
      : defaultValues(formType)
  );
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState(null);

  // Reset when sheet opens with new data
  useEffect(() => {
    if (open) {
      const initial = editData
        ? { ...editData, _mode: formType === "mcp-remote" ? "remote" : "local" }
        : defaultValues(formType);
      setValues(initial);
      setErrors([]);
      setSaving(false);
      setTab("visual");
      setJsonText(JSON.stringify(cleanForSerialize(initial), null, 2));
      setJsonError(null);
    }
  }, [open, editData, formType]);

  // Sync visual → JSON when switching to JSON tab
  const handleTabChange = useCallback(
    (newTab) => {
      if (newTab === "json") {
        setJsonText(JSON.stringify(cleanForSerialize(values), null, 2));
        setJsonError(null);
      } else if (newTab === "visual") {
        // Parse JSON back into values
        try {
          const parsed = JSON.parse(jsonText);
          setValues({
            ...parsed,
            _mode: values._mode,
          });
          setJsonError(null);
        } catch {
          // If invalid JSON, keep visual values as-is
        }
      }
      setTab(newTab);
    },
    [values, jsonText]
  );

  const mode = values._mode || (formType === "mcp-remote" ? "remote" : "local");

  function handleValuesChange(newValues) {
    // Handle mode switch from McpServerForm
    if (newValues._mode && newValues._mode !== mode) {
      setValues(newValues);
      setErrors([]);
      return;
    }
    setValues(newValues);
  }

  async function handleSave() {
    // If on JSON tab, parse first
    let finalValues = values;
    if (tab === "json") {
      try {
        const parsed = JSON.parse(jsonText);
        finalValues = { ...parsed, _mode: mode };
        setValues(finalValues);
        setJsonError(null);
      } catch {
        setJsonError("Invalid JSON — fix syntax errors before saving.");
        return;
      }
    }

    // Filter out own name from existing names when editing
    const names = isEditing
      ? existingNames.filter((n) => n !== editData?.name)
      : existingNames;

    const errs = validate(finalValues, formType, mode, names);
    setErrors(errs);
    if (errs.length > 0) return;

    setSaving(true);
    try {
      await onSave(cleanForSerialize(finalValues));
      onOpenChange(false);
    } catch {
      // allow parent to handle errors
    } finally {
      setSaving(false);
    }
  }

  const title = isEditing ? `Edit ${meta.title}` : `Add ${meta.title}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-lg w-full flex flex-col gap-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-muted-foreground">
              {meta.icon}
            </span>
            {title}
          </SheetTitle>
          <SheetDescription>{meta.subtitle}</SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={handleTabChange}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="mx-6 mb-2">
            <TabsTrigger value="visual" className="gap-1.5">
              <span className="material-symbols-outlined text-[16px]">
                tune
              </span>
              Visual
            </TabsTrigger>
            <TabsTrigger value="json" className="gap-1.5">
              <span className="material-symbols-outlined text-[16px]">
                data_object
              </span>
              JSON
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visual" className="flex-1 min-h-0">
            <ScrollArea className="h-full px-6">
              {isMcp && (
                <McpServerForm
                  values={values}
                  onChange={handleValuesChange}
                  errors={errors}
                  mode={mode}
                />
              )}
              {formType === "custom-agent" && (
                <CustomAgentForm
                  values={values}
                  onChange={handleValuesChange}
                  errors={errors}
                />
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="json" className="flex-1 min-h-0 px-6">
            <JsonEditor
              value={jsonText}
              onChange={(text) => {
                setJsonText(text);
                setJsonError(null);
              }}
              error={jsonError}
            />
          </TabsContent>
        </Tabs>

        {/* Validation summary */}
        {errors.length > 0 && tab === "visual" && (
          <div className="mx-6 mb-2 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <span className="material-symbols-outlined text-[16px]">
              error
            </span>
            {errors.length === 1
              ? "Fix the error above to continue"
              : `Fix the ${errors.length} errors above to continue`}
          </div>
        )}

        <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[16px]">
                  progress_activity
                </span>
                Saving…
              </>
            ) : isEditing ? (
              "Update"
            ) : (
              "Add"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
