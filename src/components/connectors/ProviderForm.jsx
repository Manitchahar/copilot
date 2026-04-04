import { useState } from "react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { hasError } from "../../lib/connectorValidation";

const PROVIDER_TYPES = [
  { value: "copilot", label: "Copilot" },
  { value: "azure", label: "Azure OpenAI" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "custom", label: "Custom" },
];

function needsBaseUrl(type) {
  return type === "azure" || type === "openai" || type === "custom";
}

function needsApiKey(type) {
  return type && type !== "copilot";
}

export default function ProviderForm({ values, onChange, errors }) {
  const [showKey, setShowKey] = useState(false);

  const set = (field) => (e) =>
    onChange({ ...values, [field]: e?.target ? e.target.value : e });

  const type = values.type || "";

  return (
    <div className="space-y-6">
      {/* Label */}
      <div className="space-y-2">
        <Label htmlFor="provider-label">Label</Label>
        <Input
          id="provider-label"
          value={values.label || ""}
          onChange={set("label")}
          placeholder="My Provider"
          aria-invalid={!!hasError(errors, "label")}
        />
        {hasError(errors, "label") && (
          <p className="text-sm text-destructive">
            {hasError(errors, "label")}
          </p>
        )}
      </div>

      {/* Type */}
      <div className="space-y-2">
        <Label htmlFor="provider-type">Provider Type</Label>
        <Select
          value={type}
          onValueChange={(v) => onChange({ ...values, type: v })}
        >
          <SelectTrigger id="provider-type" className="w-full">
            <SelectValue placeholder="Select a provider…" />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_TYPES.map((pt) => (
              <SelectItem key={pt.value} value={pt.value}>
                {pt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasError(errors, "type") && (
          <p className="text-sm text-destructive">
            {hasError(errors, "type")}
          </p>
        )}
      </div>

      {/* Copilot note */}
      {type === "copilot" && (
        <div className="flex items-start gap-2 rounded-lg border border-input bg-muted/50 px-4 py-3">
          <span className="material-symbols-outlined text-[18px] text-muted-foreground mt-0.5">
            info
          </span>
          <p className="text-sm text-muted-foreground">
            Uses default GitHub Copilot authentication. No additional
            configuration needed.
          </p>
        </div>
      )}

      {/* Base URL — azure, openai, custom */}
      {needsBaseUrl(type) && (
        <div className="space-y-2">
          <Label htmlFor="provider-base-url">
            Base URL
            {(type === "azure" || type === "custom") && (
              <span className="text-destructive ml-0.5">*</span>
            )}
          </Label>
          <Input
            id="provider-base-url"
            value={values.base_url || ""}
            onChange={set("base_url")}
            placeholder="https://api.example.com/v1"
            aria-invalid={!!hasError(errors, "base_url")}
          />
          {hasError(errors, "base_url") && (
            <p className="text-sm text-destructive">
              {hasError(errors, "base_url")}
            </p>
          )}
        </div>
      )}

      {/* API Key — all except copilot */}
      {needsApiKey(type) && (
        <div className="space-y-2">
          <Label htmlFor="provider-api-key">
            API Key
            <span className="text-destructive ml-0.5">*</span>
          </Label>
          <div className="relative">
            <Input
              id="provider-api-key"
              type={showKey ? "text" : "password"}
              value={values.api_key || ""}
              onChange={set("api_key")}
              placeholder="sk-…"
              className="pr-10"
              aria-invalid={!!hasError(errors, "api_key")}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              <span className="material-symbols-outlined text-[18px] text-muted-foreground">
                {showKey ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
          {hasError(errors, "api_key") && (
            <p className="text-sm text-destructive">
              {hasError(errors, "api_key")}
            </p>
          )}
        </div>
      )}

      {/* Azure API Version — azure only */}
      {type === "azure" && (
        <div className="space-y-2">
          <Label htmlFor="provider-azure-version">
            Azure API Version
            <span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input
            id="provider-azure-version"
            value={values.azure_api_version || ""}
            onChange={set("azure_api_version")}
            placeholder="2024-02-01"
            aria-invalid={!!hasError(errors, "azure_api_version")}
          />
          {hasError(errors, "azure_api_version") && (
            <p className="text-sm text-destructive">
              {hasError(errors, "azure_api_version")}
            </p>
          )}
        </div>
      )}

      {/* Model — all except copilot */}
      {needsApiKey(type) && (
        <div className="space-y-2">
          <Label htmlFor="provider-model">Model</Label>
          <Input
            id="provider-model"
            value={values.model || ""}
            onChange={set("model")}
            placeholder="gpt-4o"
          />
          <p className="text-xs text-muted-foreground">
            Optional model override. Leave blank to use the provider default.
          </p>
        </div>
      )}
    </div>
  );
}
