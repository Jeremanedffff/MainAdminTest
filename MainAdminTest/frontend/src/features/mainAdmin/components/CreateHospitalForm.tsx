import React, { useMemo, useState } from "react";
import { lettersOnlyInput, validateMeaningfulLetters } from "../../../utils/formValidation";

export type HospitalStatus = "ACTIVE" | "DISABLED";

export type CreateHospitalPayload = {
  name: string;
  location: string;
  code: string; // e.g. MSR
  status: HospitalStatus;
};

type ExistingHospital = {
  name: string;
  code: string;
};

type Props = {
  onCancel: () => void;
  onCreate: (payload: CreateHospitalPayload) => void | Promise<void>;
  saving?: boolean;
  hospitals: ExistingHospital[]; // ✅ added
};

function makeHospitalId(code: string) {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const c = code.trim().toUpperCase().slice(0, 3) || "HSP";
  return `HSP-${c}-${year}-${rand}`;
}

const CreateHospitalForm: React.FC<Props> = ({
  onCancel,
  onCreate,
  saving = false,
  hospitals, // ✅ receive hospitals
}) => {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<HospitalStatus>("ACTIVE");
  const [error, setError] = useState<string | null>(null);

  const previewId = useMemo(() => {
    if (!code.trim()) return "HSP-XXX-YYYY-0000";
    return makeHospitalId(code);
  }, [code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nameWarning = validateMeaningfulLetters(name, "Hospital name");
    const locationWarning = validateMeaningfulLetters(location, "Hospital location");

    if (nameWarning) return setError(nameWarning);
    if (locationWarning) return setError(locationWarning);
    if (!code.trim()) return setError("Hospital code is required (e.g. MSR).");
    if (!/^[A-Za-z]{2,3}$/.test(code.trim())) return setError("Hospital code must contain letters only, 2 to 3 characters.");

    const formattedCode = code.trim().toUpperCase().slice(0, 3);
    const formattedName = name.trim().toLowerCase();

    // ✅ CHECK IF HOSPITAL ALREADY EXISTS
    const exists = hospitals.some(
      (h) =>
        h.code.toUpperCase() === formattedCode ||
        h.name.toLowerCase() === formattedName
    );

    if (exists) {
      return setError("This hospital is already registered.");
    }

    try {
      await onCreate({
        name: name.trim(),
        location: location.trim(),
        code: formattedCode,
        status,
      });

      // reset form
      setName("");
      setLocation("");
      setCode("");
      setStatus("ACTIVE");
    } catch (e: any) {
      setError(e?.message || "Failed to save hospital.");
    }
  };

  return (
    <form onSubmit={submit} style={styles.form}>
      <div style={styles.row}>
        <label style={styles.label}>Hospital Name</label>
        <input
          style={styles.input}
          value={name}
          onChange={(e) => setName(lettersOnlyInput(e.target.value))}
          placeholder="e.g. Queen Mamohato Memorial Hospital"
          disabled={saving}
        />
      </div>

      <div style={styles.row}>
        <label style={styles.label}>Location</label>
        <input
          style={styles.input}
          value={location}
          onChange={(e) => setLocation(lettersOnlyInput(e.target.value))}
          placeholder="e.g. Maseru"
          disabled={saving}
        />
      </div>

      <div style={styles.row}>
        <label style={styles.label}>Hospital Code</label>
        <input
          style={styles.input}
          value={code}
          onChange={(e) => setCode(lettersOnlyInput(e.target.value).replace(/\s/g, "").slice(0, 3).toUpperCase())}
          placeholder="e.g. MSR (used in the ID)"
          disabled={saving}
        />
        <div style={styles.hint}>
          Example generated hospital ID: <b>{previewId}</b>
        </div>
      </div>

      <div style={styles.row}>
        <label style={styles.label}>Status</label>
        <select
          style={styles.input}
          value={status}
          onChange={(e) => setStatus(e.target.value as HospitalStatus)}
          disabled={saving}
        >
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
        </select>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.actions}>
        <button
          type="button"
          style={styles.btnGhost}
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" style={styles.btnPrimary} disabled={saving}>
          {saving ? "Saving..." : "Save Hospital"}
        </button>
      </div>
    </form>
  );
};

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: "grid",
    gap: 10,
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    padding: "0 2px 0",
    scrollbarGutter: "stable",
  },
  row: { display: "grid", gap: 6 },
  label: { fontWeight: 800, fontSize: 13, color: "#000000" },
  input: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #cfd7e3",
    outline: "none",
    fontSize: 14,
  },
  hint: { fontSize: 12, opacity: 0.75 },
  error: {
    background: "#fff1f2",
    border: "1px solid #ffd3d3",
    color: "#b42318",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 700,
  },
  actions: {
    position: "sticky",
    bottom: 0,
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 2,
    padding: "14px 0 16px",
    background: "linear-gradient(180deg, rgba(255,255,255,0.82), #ffffff 28%)",
    borderTop: "1px solid #e5eaf2",
    flexWrap: "wrap",
  },
  btnPrimary: {
    border: "none",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    background: "#1f7ae0",
    color: "white",
    fontWeight: 800,
  },
  btnGhost: {
    border: "1px solid #cfd7e3",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    background: "white",
    color: "#000000",
    fontWeight: 800,
  },
};

export default CreateHospitalForm;
