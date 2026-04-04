import { cn } from "../ui/cn";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SENSITIVE_KEYS = /TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL/i;

export default function KeyValueInput({
  value = {},
  onChange,
  keyPlaceholder = "KEY",
  valuePlaceholder = "VALUE",
  error,
  addLabel = "+ Add variable",
}) {
  const entries = Object.entries(value);

  function updateKey(oldKey, newKey) {
    const next = {};
    for (const [k, v] of entries) {
      next[k === oldKey ? newKey : k] = v;
    }
    onChange(next);
  }

  function updateValue(key, newVal) {
    onChange({ ...value, [key]: newVal });
  }

  function addRow() {
    let newKey = "";
    let i = 0;
    do { newKey = i === 0 ? "" : `KEY_${i}`; i++; } while (newKey in value);
    onChange({ ...value, [newKey]: "" });
  }

  function removeRow(key) {
    const { [key]: _, ...rest } = value;
    onChange(rest);
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, val], index) => (
        <div key={key} className="flex items-center gap-2">
          <Input aria-label={`Variable name ${index + 1}`} value={key} onChange={(e) => updateKey(key, e.target.value)} placeholder={keyPlaceholder} className="w-[40%]" />
          <Input aria-label={`Value for ${key || `variable ${index + 1}`}`} type={SENSITIVE_KEYS.test(key) ? "password" : "text"} value={val} onChange={(e) => updateValue(key, e.target.value)} placeholder={valuePlaceholder} className="flex-1" />
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeRow(key)} className="hover:text-destructive" aria-label={`Remove ${key}`}>
            <span className="material-symbols-outlined text-[18px]">close</span>
          </Button>
        </div>
      ))}
      <Button type="button" variant="link" size="xs" className="h-auto p-0" onClick={addRow}>
        {addLabel}
      </Button>
    </div>
  );
}
