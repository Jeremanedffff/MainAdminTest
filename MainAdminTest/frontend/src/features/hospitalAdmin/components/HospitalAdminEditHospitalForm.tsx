import React, { useState } from "react";

export type UpdateHospitalPayload = {
  name: string;
  location: string;
};

type Props = {
  initial: UpdateHospitalPayload;
  onCancel: () => void;
  onSave: (payload: UpdateHospitalPayload) => void;
};

const HospitalAdminEditHospitalForm: React.FC<Props> = ({ initial, onCancel, onSave }) => {
  const [name, setName] = useState(initial.name);
  const [location, setLocation] = useState(initial.location);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const l = location.trim();
    if (!n || !l) return;
    onSave({ name: n, location: l });
  };

  return (
    <form onSubmit={submit} style={styles.form}>
      <label style={styles.label}>
        Hospital Name
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label style={styles.label}>
        Location
        <input style={styles.input} value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>

      <div style={styles.row}>
        <button type="button" style={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" style={styles.save}>
          Save Changes
        </button>
      </div>
    </form>
  );
};

const styles: Record<string, React.CSSProperties> = {
  form: { display: "grid", gap: 12 },
  label: { display: "grid", gap: 6, fontWeight: 900, color: "#0f172a" },
  input: {
    border: "1px solid #cfd7e3",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    fontWeight: 800,
  },
  row: { display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 6 },
  cancel: {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  save: {
    border: "none",
    background: "#1f7ae0",
    color: "white",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
};

export default HospitalAdminEditHospitalForm;