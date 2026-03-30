import { useState, useEffect, useCallback } from "react";
import { Save, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { readConfig, writeConfig, executeCommand } from "../api/client";
import { configSchema } from "../lib/schemas";
import type { ConfigData } from "../api/types";
import Card from "./ui/Card";
import Button from "./ui/Button";

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center border-b border-border last:border-0 py-2 gap-4">
      <label className="text-sm text-text-secondary shrink-0">{label}</label>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      className="bg-bg-input border border-border rounded px-2 py-1 text-right text-sm text-text-primary w-48"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      className="bg-bg-input border border-border rounded px-2 py-1 text-right text-sm text-text-primary w-28 tabular-nums"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="bg-bg-input border border-border rounded px-2 py-1 text-right text-sm text-text-primary w-36"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function CheckboxInput({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className="accent-accent w-4 h-4"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export default function SettingsPage() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [original, setOriginal] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readConfig();
      setConfig(data);
      setOriginal(data);
    } catch (err) {
      toast.error(
        `Failed to load config: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const isDirty =
    config !== null &&
    original !== null &&
    JSON.stringify(config) !== JSON.stringify(original);

  function update<S extends keyof ConfigData>(
    section: S,
    key: keyof ConfigData[S],
    value: ConfigData[S][keyof ConfigData[S]],
  ) {
    if (!config) return;
    setConfig({
      ...config,
      [section]: { ...config[section], [key]: value },
    });
  }

  async function handleSave() {
    if (!config) return;

    // Validate with Zod
    const result = configSchema.safeParse(config);
    if (!result.success) {
      const firstError = result.error.issues[0];
      toast.error(`Validation error: ${firstError.path.join(".")} - ${firstError.message}`);
      return;
    }

    setSaving(true);
    try {
      const res = await writeConfig(config);
      if (res.success) {
        setOriginal(config);
        toast.success("Configuration saved. Restarting service...");
        await executeCommand("restart");
        toast.success("Service restarted.");
      } else {
        toast.error(`Save failed: ${res.error ?? "Unknown error"}`);
      }
    } catch (err) {
      toast.error(
        `Save failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card title="Settings">
        <div className="text-text-secondary text-sm py-8 text-center">
          Loading configuration...
        </div>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card title="Settings">
        <div className="text-error text-sm py-8 text-center">
          Failed to load configuration.
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Primary Settings */}
      <Card title="Primary Settings">
        <FieldRow label="Target System ID">
          <NumberInput
            value={config.mavlink.target_system}
            onChange={(v) => update("mavlink", "target_system", v)}
            min={1}
            max={255}
          />
        </FieldRow>
        <FieldRow label="MAVLink Connection">
          <TextInput
            value={config.mavlink.connection}
            onChange={(v) => update("mavlink", "connection", v)}
          />
        </FieldRow>
        <FieldRow label="Dish GPS Mode">
          <SelectInput
            value={config.starlink.gps_mode}
            onChange={(v) => update("starlink", "gps_mode", v)}
            options={[
              { value: "disable", label: "Disable" },
              { value: "enable", label: "Enable" },
              { value: "auto", label: "Auto" },
            ]}
          />
        </FieldRow>
      </Card>

      {/* Advanced Settings */}
      <Card title="Advanced Settings">
        <details>
          <summary className="text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors py-1">
            Show advanced configuration
          </summary>

          <div className="mt-3 space-y-4">
            {/* MAVLink IDs */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-text-secondary font-semibold mb-1">
                MAVLink IDs
              </h3>
              <FieldRow label="Target Component">
                <NumberInput
                  value={config.mavlink.target_component}
                  onChange={(v) => update("mavlink", "target_component", v)}
                  min={1}
                  max={255}
                />
              </FieldRow>
              <FieldRow label="Source System">
                <NumberInput
                  value={config.mavlink.source_system}
                  onChange={(v) => update("mavlink", "source_system", v)}
                  min={1}
                  max={255}
                />
              </FieldRow>
              <FieldRow label="Source Component">
                <NumberInput
                  value={config.mavlink.source_component}
                  onChange={(v) => update("mavlink", "source_component", v)}
                  min={1}
                  max={255}
                />
              </FieldRow>
            </div>

            {/* Thresholds */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-text-secondary font-semibold mb-1">
                Thresholds
              </h3>
              <FieldRow label="Uncertainty Limit (m)">
                <NumberInput
                  value={config.thresholds.uncertainty_limit}
                  onChange={(v) =>
                    update("thresholds", "uncertainty_limit", v)
                  }
                  min={0}
                  step={0.5}
                />
              </FieldRow>
              <FieldRow label="Stale Timeout (s)">
                <NumberInput
                  value={config.thresholds.stale_timeout}
                  onChange={(v) => update("thresholds", "stale_timeout", v)}
                  min={0}
                  step={0.5}
                />
              </FieldRow>
            </div>

            {/* Send Rates */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-text-secondary font-semibold mb-1">
                Send Rates
              </h3>
              <FieldRow label="Send Interval (s)">
                <NumberInput
                  value={config.rates.send_interval}
                  onChange={(v) => update("rates", "send_interval", v)}
                  min={0.1}
                  step={0.1}
                />
              </FieldRow>
              <FieldRow label="Poll Interval (s)">
                <NumberInput
                  value={config.rates.poll_interval}
                  onChange={(v) => update("rates", "poll_interval", v)}
                  min={0.1}
                  step={0.1}
                />
              </FieldRow>
            </div>

            {/* Logging */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-text-secondary font-semibold mb-1">
                Logging
              </h3>
              <FieldRow label="CSV Logging">
                <CheckboxInput
                  checked={config.logging.csv_enabled}
                  onChange={(v) => update("logging", "csv_enabled", v)}
                />
              </FieldRow>
              <FieldRow label="Max Log Size (MB)">
                <NumberInput
                  value={config.logging.max_log_size_mb}
                  onChange={(v) => update("logging", "max_log_size_mb", v)}
                  min={1}
                />
              </FieldRow>
            </div>

            {/* Dish Address */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-text-secondary font-semibold mb-1">
                Starlink
              </h3>
              <FieldRow label="Dish Address">
                <TextInput
                  value={config.starlink.dish_address}
                  onChange={(v) => update("starlink", "dish_address", v)}
                />
              </FieldRow>
            </div>
          </div>
        </details>
      </Card>

      {/* Save */}
      <div className="flex justify-end gap-2">
        <Button variant="primary" onClick={handleSave} disabled={!isDirty} loading={saving}>
          <Save size={14} />
          Save &amp; Restart
        </Button>
        <Button variant="secondary" onClick={loadConfig} disabled={saving}>
          <RotateCw size={14} />
          Reset
        </Button>
      </div>
    </div>
  );
}
