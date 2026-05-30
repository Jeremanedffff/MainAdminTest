import React, { useEffect, useState } from "react";
import { digitsOnlyInput, lettersOnlyInput, validateMeaningfulLetters, validateNumericText } from "../../../utils/formValidation";
import type { WorkerRole } from "../hospitalAdminFirestore";

type WorkerFormValue = {
  id?: string;
  role: WorkerRole;
  fullName: string;
  email: string;
  phone: string;
  status: "ACTIVE" | "DISABLED";
};

type Props = {
  mode: "create" | "edit";
  hospitalId: string;
  hospitalName: string;
  initialValue?: WorkerFormValue;
  onCancel: () => void;
  onSubmit: (payload: {
    hospitalId: string;
    hospitalName: string;
    role: WorkerRole;
    fullName: string;
    email: string;
    phone: string;
    status: "ACTIVE" | "DISABLED";
    password: string;
  }) => Promise<void> | void;
  saving?: boolean;
};

const HospitalAdminCreateWorkerForm: React.FC<Props> = ({
  mode,
  hospitalId,
  hospitalName,
  initialValue,
  onCancel,
  onSubmit,
  saving = false,
}) => {
  const [role, setRole] = useState<WorkerRole>("DOCTOR");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "DISABLED">("ACTIVE");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initialValue) return;
    setRole(initialValue.role);
    setFullName(initialValue.fullName);
    setEmail(initialValue.email);
    setPhone(digitsOnlyInput(initialValue.phone));
    setStatus(initialValue.status);
    setPassword("");
  }, [initialValue]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const nameWarning = validateMeaningfulLetters(fullName, "Full name", { minWords: 2 });
    const phoneWarning = validateNumericText(phone, "Phone", { minLength: 6 });

    if (nameWarning) return setError(nameWarning);
    if (!email.trim()) return setError("Email is required.");
    if (phoneWarning) return setError(phoneWarning);
    if (mode === "create" && password.trim().length < 4) {
      return setError("Password must be at least 4 characters.");
    }

    try {
      await onSubmit({
        hospitalId,
        hospitalName,
        role,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: digitsOnlyInput(phone),
        status,
        password: password.trim(),
      });
    } catch (e: any) {
      setError(e?.message || "Failed to save worker.");
    }
  };

  return (
    <form onSubmit={submit} style={styles.form}>
      <div style={styles.infoBox}>
        <div style={styles.infoTitle}>Hospital</div>
        <div style={styles.infoText}>{hospitalName}</div>
      </div>

      <label style={styles.label}>
        Role
        <select style={styles.input} value={role} onChange={(e) => setRole(e.target.value as WorkerRole)} disabled={saving}>
          <option value="DOCTOR">DOCTOR</option>
          <option value="PHARMACIST">PHARMACIST</option>
          <option value="RECEPTIONIST">RECEPTIONIST</option>
          <option value="LAB_STAFF">LAB STAFF</option>
        </select>
      </label>

      <label style={styles.label}>
        Full Name
        <input style={styles.input} value={fullName} onChange={(e) => setFullName(lettersOnlyInput(e.target.value))} disabled={saving} />
      </label>

      <label style={styles.label}>
        Email
        <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
      </label>

      <label style={styles.label}>
        Phone
        <input style={styles.input} value={phone} onChange={(e) => setPhone(digitsOnlyInput(e.target.value))} disabled={saving} />
      </label>

      <label style={styles.label}>
        Status
        <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value as any)} disabled={saving}>
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
        </select>
      </label>

      <label style={styles.label}>
        {mode === "create" ? "Password" : "New Password (optional)"}
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={saving}
          placeholder={mode === "create" ? "Enter worker password" : "Leave blank to keep current password"}
        />
      </label>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.actions}>
        <button type="button" style={styles.btnGhost} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" style={styles.btnPrimary} disabled={saving}>
          {saving ? "Saving..." : mode === "create" ? "Create Worker" : "Update Worker"}
        </button>
      </div>
    </form>
  );
};

const styles: Record<string, React.CSSProperties> = {
  form: { display: "grid", gap: 12 },
  infoBox: {
    background: "#f8fafc",
    border: "1px solid #e5eaf2",
    borderRadius: 12,
    padding: 12,
  },
  infoTitle: { fontSize: 12, opacity: 0.75, fontWeight: 800 },
  infoText: { marginTop: 4, fontWeight: 1000, color: "#0f172a" },
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
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 },
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
    color: "#0f172a",
    fontWeight: 800,
  },
};

export default HospitalAdminCreateWorkerForm;
