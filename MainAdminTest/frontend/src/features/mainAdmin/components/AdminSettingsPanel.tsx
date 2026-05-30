import React, { useState } from "react";

export type DesignTheme = "Default" | "Ocean" | "Midnight";
export type DesignDensity = "Comfortable" | "Compact";

export type AdminSettings = {
  maxAdminsPerHospital: number;
  allowedCountryCodes: string[];
  design: {
    theme: DesignTheme;
    density: DesignDensity;
    showSidebarLabels: boolean;
    useRoundedCards: boolean;
    showHospitalLogo: boolean;
    logoUrl: string;
    logoPath: string;
  };
};

type Props = {
  settings: AdminSettings;
  onSave: (next: AdminSettings) => void | Promise<void>;
};

const DEFAULT_CODES = ["+266", "+27", "+33", "+1", "+44"];

const COUNTRY_CODE_META: Record<string, { country: string; flag: string }> = {
  "+1": { country: "United States/Canada", flag: "🇺🇸" },
  "+27": { country: "South Africa", flag: "🇿🇦" },
  "+33": { country: "France", flag: "🇫🇷" },
  "+44": { country: "United Kingdom", flag: "🇬🇧" },
  "+266": { country: "Lesotho", flag: "🇱🇸" },
};

function formatCountryCodeLabel(code: string) {
  const meta = COUNTRY_CODE_META[code];
  if (!meta) return `${code} (Custom)`;
  return `${meta.flag} ${meta.country} (${code})`;
}

const AdminSettingsPanel: React.FC<Props> = ({ settings, onSave }) => {
  const [maxAdminsPerHospital, setMaxAdminsPerHospital] = useState<number>(
    settings.maxAdminsPerHospital
  );
  const [codes, setCodes] = useState<string>(
    (settings.allowedCountryCodes?.length ? settings.allowedCountryCodes : DEFAULT_CODES).join(", ")
  );

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const previewCodes = codes
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => (c.startsWith("+") ? c : `+${c}`));

  const handleSave = () => {
    setMsg(null);
    setErr(null);

    const max = Number(maxAdminsPerHospital);
    if (!Number.isFinite(max) || max < 1 || max > 50) {
      setErr("Max admins per hospital must be between 1 and 50.");
      return;
    }

    const parsedCodes = codes
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => (c.startsWith("+") ? c : `+${c}`));

    if (parsedCodes.length === 0) {
      setErr("Please provide at least one country code (e.g. +266).");
      return;
    }

    onSave({
      ...settings,
      maxAdminsPerHospital: max,
      allowedCountryCodes: parsedCodes,
    });

    setMsg("Settings saved.");
    setTimeout(() => setMsg(null), 2500);
  };

  return (
    <div style={styles.panel}>
      <h2 style={styles.title}>General Settings</h2>
      <p style={styles.sub}>
        Main Admin controls rules that apply to all hospitals (example: admin limits).
      </p>

      <div style={styles.row}>
        <label style={styles.label}>Max hospital admins per hospital</label>
        <input
          style={styles.input}
          type="number"
          min={1}
          max={50}
          value={maxAdminsPerHospital}
          onChange={(e) => setMaxAdminsPerHospital(Number(e.target.value))}
          placeholder="e.g. 2"
        />
        <div style={styles.hint}>
          Example: If set to <b>2</b>, a hospital can only have <b>2</b> hospital admins.
        </div>
      </div>

      <div style={styles.row}>
        <label style={styles.label}>Allowed country codes (comma-separated)</label>
        <input
          style={styles.input}
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
          placeholder="+266, +27, +33"
        />
        <div style={styles.hint}>
          These codes appear in the phone dropdown when creating admins.
        </div>
        {previewCodes.length > 0 && (
          <div style={styles.previewWrap}>
            {previewCodes.map((code) => (
              <span key={code} style={styles.previewChip}>
                {formatCountryCodeLabel(code)}
              </span>
            ))}
          </div>
        )}
      </div>

      {err && <div style={styles.error}>{err}</div>}
      {msg && <div style={styles.success}>{msg}</div>}

      <div style={styles.actions}>
        <button style={styles.btnPrimary} onClick={handleSave}>
          Save Settings
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    border: "1px solid #e5eaf2",
    borderRadius: 14,
    padding: 16,
    background: "white",
    boxShadow: "0 8px 26px rgba(15, 23, 42, 0.06)",
  },
  title: { margin: 0, fontSize: 22 },
  sub: { margin: "6px 0 14px 0", opacity: 0.75 },
  row: { display: "grid", gap: 6, marginBottom: 12 },
  label: { fontWeight: 800, fontSize: 13 },
  input: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #cfd7e3",
    outline: "none",
    fontSize: 14,
  },
  hint: { fontSize: 12, opacity: 0.75 },
  previewWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  previewChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 10px",
    borderRadius: 999,
    background: "#f8fafc",
    border: "1px solid #dbe5f0",
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
  },
  actions: { display: "flex", justifyContent: "flex-end", marginTop: 8 },
  btnPrimary: {
    border: "none",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    background: "#0f172a",
    color: "white",
    fontWeight: 900,
  },
  error: {
    background: "#fff1f2",
    border: "1px solid #ffd3d3",
    color: "#b42318",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 700,
    marginTop: 4,
  },
  success: {
    background: "#ecfdf3",
    border: "1px solid #bfe8d1",
    color: "#067647",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 700,
    marginTop: 4,
  },
};

export default AdminSettingsPanel;
