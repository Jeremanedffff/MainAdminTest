import React, { useMemo, useState, useEffect } from "react";
import { digitsOnlyInput, lettersOnlyInput, validateMeaningfulLetters, validateNumericText } from "../../../utils/formValidation";
import type { HospitalRow } from "./HospitalTable";
import type { HospitalAdminRow } from "./HospitalAdminsTable";

export type HospitalAdminStatus = "ACTIVE" | "DISABLED";

export type CreateHospitalAdminPayload = Omit<HospitalAdminRow, "createdAt"> & {
  password: string;
};

type Props = {
  hospitals: HospitalRow[];
  existingAdmins: HospitalAdminRow[];
  maxAdminsPerHospital: number;
  allowedCountryCodes: string[];
  onCancel: () => void;
  onCreate: (admin: CreateHospitalAdminPayload) => void | Promise<void>;
  saving?: boolean;
  initialData?: HospitalAdminRow;
  isEditMode?: boolean;
};

const COUNTRY_CODE_META: Record<string, { country: string; flag: string }> = {
  "+1": { country: "United States/Canada", flag: "🇺🇸" },
  "+27": { country: "South Africa", flag: "🇿🇦" },
  "+33": { country: "France", flag: "🇫🇷" },
  "+44": { country: "United Kingdom", flag: "🇬🇧" },
  "+266": { country: "Lesotho", flag: "🇱🇸" },
};

function makeAdminId() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ADMIN-${rand}`;
}

function formatCountryCodeLabel(code: string) {
  const meta = COUNTRY_CODE_META[code];
  if (!meta) return code;
  return `${meta.flag} ${meta.country} (${code})`;
}

const CreateHospitalAdminForm: React.FC<Props> = ({
  hospitals,
  existingAdmins,
  maxAdminsPerHospital,
  allowedCountryCodes,
  onCancel,
  onCreate,
  saving = false,
  initialData,
  isEditMode = false,
}) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState(allowedCountryCodes[0] || "+266");
  const [phone, setPhone] = useState("");
  const [hospitalId, setHospitalId] = useState("");
  const [status, setStatus] = useState<HospitalAdminStatus>("ACTIVE");
  const [password, setPassword] = useState("1234");
  const [confirmPassword, setConfirmPassword] = useState("1234");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFullName(initialData.fullName);
      setEmail(initialData.email);
      
      // Extract country code and phone number
      const phoneParts = initialData.phone.split(' ');
      if (phoneParts.length > 1) {
        setCountryCode(phoneParts[0]);
        setPhone(phoneParts.slice(1).join(' '));
      } else {
        setPhone(initialData.phone);
      }
      
      setHospitalId(initialData.hospitalId);
      setStatus(initialData.status);
      
      // For edit mode, we don't need to show password fields
      if (isEditMode) {
        setPassword("");
        setConfirmPassword("");
      }
    }
  }, [initialData, isEditMode]);

  const selectedHospital = useMemo(
    () => hospitals.find((h) => h.id === hospitalId) || null,
    [hospitals, hospitalId]
  );

  const adminCountForHospital = useMemo(() => {
    if (!hospitalId) return 0;
    return existingAdmins.filter((a) => 
      a.hospitalId === hospitalId && 
      a.status === "ACTIVE" && 
      (!isEditMode || a.id !== initialData?.id)
    ).length;
  }, [existingAdmins, hospitalId, isEditMode, initialData?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanPassword = password.trim();
    const nameWarning = validateMeaningfulLetters(cleanName, "Full name", { minWords: 2 });
    const phoneWarning = validateNumericText(cleanPhone, "Phone number", {
      minLength: countryCode === "+266" ? 8 : 6,
      maxLength: countryCode === "+266" ? 8 : undefined,
    });

    if (nameWarning) return setError(nameWarning);
    if (!cleanEmail) return setError("Email is required.");
    if (phoneWarning) return setError(phoneWarning);
    if (!hospitalId) return setError("Please select a hospital.");
    if (!selectedHospital) return setError("Selected hospital is invalid.");
    
    if (!isEditMode) {
      if (!cleanPassword) return setError("Password is required.");
      if (cleanPassword.length < 4) return setError("Password must be at least 4 characters.");
      if (cleanPassword !== confirmPassword.trim()) return setError("Passwords do not match.");
    }

    if (adminCountForHospital >= maxAdminsPerHospital && !isEditMode) {
      return setError(
        `This hospital already reached the limit of ${maxAdminsPerHospital} active admins.`
      );
    }

    // Skip duplicate checks in edit mode if email/phone haven't changed
    if (!isEditMode) {
      const duplicateEmail = existingAdmins.some(
        (a) => a.email.trim().toLowerCase() === cleanEmail
      );
      if (duplicateEmail) {
        return setError("An admin with this email already exists.");
      }

      const duplicatePhone = existingAdmins.some(
        (a) => a.phone.replace(/\s+/g, "") === `${countryCode}${cleanPhone}`.replace(/\s+/g, "")
      );
      if (duplicatePhone) {
        return setError("An admin with this phone already exists.");
      }
    }

    try {
      await onCreate({
        id: initialData?.id || makeAdminId(),
        fullName: cleanName,
        email: cleanEmail,
        phone: `${countryCode} ${cleanPhone}`,
        hospitalId: selectedHospital.id,
        hospitalName: selectedHospital.name,
        status,
        password: isEditMode ? "" : cleanPassword,
      });

      if (!isEditMode) {
        setFullName("");
        setEmail("");
        setCountryCode(allowedCountryCodes[0] || "+266");
        setPhone("");
        setHospitalId("");
        setStatus("ACTIVE");
        setPassword("1234");
        setConfirmPassword("1234");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to save hospital admin.");
    }
  };

  return (
    <form className="animated-form-surface" onSubmit={submit} style={styles.form}>
      <div style={styles.row}>
        <label style={styles.label}>Full Name</label>
        <input
          style={styles.input}
          value={fullName}
          onChange={(e) => setFullName(lettersOnlyInput(e.target.value))}
          placeholder="Enter admin full name"
          disabled={saving}
        />
      </div>

      <div style={styles.row}>
        <label style={styles.label}>Email</label>
        <input
          style={styles.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter admin email address"
          disabled={saving}
        />
      </div>

      <div style={styles.grid2}>
        <div style={styles.row}>
          <label style={styles.label}>Country Code</label>
          <select
            style={styles.input}
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            disabled={saving}
          >
            {allowedCountryCodes.map((code) => (
              <option key={code} value={code}>
                {formatCountryCodeLabel(code)}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Phone Number</label>
          <input
            style={styles.input}
            value={phone}
            onChange={(e) => setPhone(digitsOnlyInput(e.target.value))}
            placeholder={countryCode === "+266" ? "Enter 8-digit phone number" : "Enter phone number"}
            maxLength={countryCode === "+266" ? 8 : undefined}
            disabled={saving}
          />
        </div>
      </div>

      <div style={styles.row}>
        <label style={styles.label}>Hospital</label>
        <select
          style={styles.input}
          value={hospitalId}
          onChange={(e) => setHospitalId(e.target.value)}
          disabled={saving}
        >
          <option value="">Select hospital</option>
          {hospitals.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} ({h.location})
            </option>
          ))}
        </select>
        {hospitalId ? (
          <div style={styles.hint}>
            Active admins in this hospital: <b>{adminCountForHospital}</b> / <b>{maxAdminsPerHospital}</b>
          </div>
        ) : null}
        
        {adminCountForHospital >= maxAdminsPerHospital && !isEditMode && (
          <div style={{ color: "red", fontWeight: 700, marginTop: 8 }}>
            This hospital already reached maximum admins.
          </div>
        )}
      </div>

      {!isEditMode && (
        <div style={styles.grid2}>
          <div style={styles.row}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
            />
          </div>

          <div style={styles.row}>
            <label style={styles.label}>Confirm Password</label>
            <input
              style={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      )}

      <div style={styles.row}>
        <label style={styles.label}>Status</label>
        <select
          style={styles.input}
          value={status}
          onChange={(e) => setStatus(e.target.value as HospitalAdminStatus)}
          disabled={saving}
        >
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
        </select>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.actions}>
        <button type="button" style={styles.btnGhost} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button 
          type="submit" 
          style={styles.btnPrimary} 
          disabled={saving || (adminCountForHospital >= maxAdminsPerHospital && !isEditMode)}
        >
          {saving ? "Saving..." : isEditMode ? "Update Hospital Admin" : "Save Hospital Admin"}
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
  row: { display: "grid", gap: 5 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 },
  label: { fontWeight: 900, fontSize: 13, color: "#000000", lineHeight: 1.15 },
  input: {
    width: "100%",
    minHeight: 46,
    padding: "9px 14px",
    borderRadius: 8,
    border: "1px solid #cfd7e3",
    outline: "none",
    fontSize: 15,
    fontWeight: 750,
    boxSizing: "border-box",
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
    gap: 12,
    marginTop: 2,
    padding: "14px 0 16px",
    background: "linear-gradient(180deg, rgba(255,255,255,0.82), #ffffff 28%)",
    borderTop: "1px solid #e5eaf2",
    flexWrap: "wrap",
  },
  btnPrimary: {
    border: "none",
    minHeight: 46,
    padding: "0 20px",
    borderRadius: 8,
    cursor: "pointer",
    background: "#10b981",
    color: "white",
    fontWeight: 900,
    fontSize: 15,
  },
  btnGhost: {
    border: "1px solid #cfd7e3",
    minHeight: 46,
    padding: "0 20px",
    borderRadius: 8,
    cursor: "pointer",
    background: "white",
    color: "#000000",
    fontWeight: 900,
    fontSize: 15,
  },
};

export default CreateHospitalAdminForm;
