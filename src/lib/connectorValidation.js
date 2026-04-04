const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const URL_RE = /^https?:\/\/.+/;
const PATH_RE = /^([/~.]|[A-Za-z]:)/;

function err(field, message) {
  return { field, message };
}

export function validateMcpLocal(values, existingNames = []) {
  const errors = [];
  if (!values.name?.trim()) errors.push(err("name", "Name is required"));
  else if (/\s/.test(values.name)) errors.push(err("name", "Name must not contain spaces"));
  else if (existingNames.includes(values.name)) errors.push(err("name", `A server named "${values.name}" already exists`));
  if (!values.command?.trim()) errors.push(err("command", "Command is required"));
  if (values.args?.some((a) => !a.trim())) errors.push(err("args", "Empty arguments are not allowed"));
  if (values.env) {
    for (const key of Object.keys(values.env)) {
      if (!ENV_KEY_RE.test(key)) errors.push(err("env", `Invalid environment variable name: "${key}"`));
    }
  }
  if (values.cwd && !PATH_RE.test(values.cwd)) errors.push(err("cwd", "Must be a valid directory path"));
  if (values.timeout != null && (values.timeout < 1 || values.timeout > 600))
    errors.push(err("timeout", "Timeout must be between 1 and 600 seconds"));
  return errors;
}

export function validateMcpRemote(values, existingNames = []) {
  const errors = [];
  if (!values.name?.trim()) errors.push(err("name", "Name is required"));
  else if (/\s/.test(values.name)) errors.push(err("name", "Name must not contain spaces"));
  else if (existingNames.includes(values.name)) errors.push(err("name", `A server named "${values.name}" already exists`));
  if (!values.url?.trim()) errors.push(err("url", "URL is required"));
  else if (!URL_RE.test(values.url)) errors.push(err("url", "Must be a valid HTTP or HTTPS URL"));
  if (values.timeout != null && (values.timeout < 1 || values.timeout > 600))
    errors.push(err("timeout", "Timeout must be between 1 and 600 seconds"));
  return errors;
}

export function validateProvider(values) {
  const errors = [];
  if (!values.label?.trim()) errors.push(err("label", "Label is required"));
  if (!values.type) errors.push(err("type", "Select a provider type"));
  if ((values.type === "azure" || values.type === "custom") && !values.base_url?.trim())
    errors.push(err("base_url", `Base URL is required for ${values.type} providers`));
  else if (values.base_url && !URL_RE.test(values.base_url))
    errors.push(err("base_url", "Must be a valid URL"));
  if (!values.api_key?.trim()) errors.push(err("api_key", "API key is required"));
  if (values.type === "azure" && !values.azure_api_version?.trim())
    errors.push(err("azure_api_version", "API version is required for Azure"));
  return errors;
}

export function validateCustomAgent(values, existingNames = []) {
  const errors = [];
  if (!values.name?.trim()) errors.push(err("name", "Name is required"));
  else if (!KEBAB_RE.test(values.name)) errors.push(err("name", "Must be lowercase letters, numbers, and hyphens"));
  else if (existingNames.includes(values.name)) errors.push(err("name", `An agent named "${values.name}" already exists`));
  if (!values.display_name?.trim()) errors.push(err("display_name", "Display name is required"));
  if (!values.description?.trim()) errors.push(err("description", "Description is required"));
  else if (values.description.length > 200) errors.push(err("description", "Maximum 200 characters"));
  if (!values.prompt?.trim()) errors.push(err("prompt", "Prompt is required"));
  else if (values.prompt.trim().length < 10) errors.push(err("prompt", "Prompt must be at least 10 characters"));
  if (values.tools?.some((t) => !t.trim())) errors.push(err("tools", "Empty tool names are not allowed"));
  return errors;
}

export function hasError(errors, field) {
  return errors.find((e) => e.field === field)?.message || null;
}
