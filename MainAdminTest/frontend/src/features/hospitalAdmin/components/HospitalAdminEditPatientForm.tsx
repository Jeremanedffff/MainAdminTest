import React, { useState } from "react";
import { digitsOnlyInput, lettersOnlyInput, validateMeaningfulLetters, validateNumericText } from "../../../utils/formValidation";
import type { PatientRow } from "./HospitalAdminPatientsTable";

export type UpdatePatientPayload = {
  fullName: string;
  sex: "MALE" | "FEMALE";
  age: number;
  phone: string;
  email: string;
  status: "ACTIVE" | "DISABLED";
};

type Props = {
  patient: PatientRow;
  onCancel: () => void;
  onSave: (payload: UpdatePatientPayload) => void;
};

const HospitalAdminEditPatientForm: React.FC<Props> = ({ patient, onCancel, onSave }) => {
  const [fullName, setFullName] = useState(patient.fullName);
  const [sex, setSex] = useState<"MALE" | "FEMALE">(patient.sex);
  const [age, setAge] = useState<number>(patient.age);
  const [phone, setPhone] = useState(digitsOnlyInput(patient.phone));
  const [email, setEmail] = useState(patient.email || "");
  const [status, setStatus] = useState<"ACTIVE" | "DISABLED">(patient.status);
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    const n = fullName.trim();
    const p = phone.trim();
    const em = email.trim();
    const nameWarning = validateMeaningfulLetters(n, "Full name", { minWords: 2 });
    const phoneWarning = validateNumericText(p, "Phone", { minLength: 6 });

    setError("");
    if (nameWarning) return setError(nameWarning);
    if (!Number.isFinite(age) || age < 0 || age > 130) return setError("Age is invalid.");
    if (phoneWarning) return setError(phoneWarning);

    onSave({
      fullName: n,
      sex,
      age,
      phone: digitsOnlyInput(p),
      email: em,
      status,
    });
  };

  return (
    <form onSubmit={submit} style={styles.form}>
      <label style={styles.label}>
        Full Name
        <input style={styles.input} value={fullName} onChange={(e) => setFullName(lettersOnlyInput(e.target.value))} />
      </label>

      <div style={styles.grid2}>
        <label style={styles.label}>
          Sex
          <select style={styles.input} value={sex} onChange={(e) => setSex(e.target.value as any)}>
            <option value="MALE">MALE</option>
            <option value="FEMALE">FEMALE</option>
          </select>
        </label>

        <label style={styles.label}>
          Age
          <input
            style={styles.input}
            type="number"
            min={0}
            max={130}
            value={age}
            onChange={(e) => setAge(Number(digitsOnlyInput(e.target.value)))}
          />
        </label>
      </div>

      <div style={styles.grid2}>
        <label style={styles.label}>
          Phone
          <input style={styles.input} value={phone} onChange={(e) => setPhone(digitsOnlyInput(e.target.value))} />
        </label>

        <label style={styles.label}>
          Email (optional)
          <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>

      <label style={styles.label}>
        Status
        <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
        </select>
      </label>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.row}>
        <button type="button" style={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" style={styles.save}>
          Save Patient
        </button>
      </div>
    </form>
  );
};

const styles: Record<string, React.CSSProperties> = {
  form: { display: "grid", gap: 12 },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  label: { display: "grid", gap: 6, fontWeight: 900, color: "#0f172a" },
  input: {
    border: "1px solid #cfd7e3",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    fontWeight: 800,
  },
  error: {
    background: "#fff1f2",
    border: "1px solid #ffd3d3",
    color: "#b42318",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 700,
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

export default HospitalAdminEditPatientForm;
