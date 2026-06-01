import React, { useEffect, useMemo, useState } from "react";
import { digitsOnlyInput, lettersOnlyInput, validateMeaningfulLetters, validateNumericText } from "../../../utils/formValidation";

type PatientFormValue = {
  id?: string;
  fullName: string;
  sex: "MALE" | "FEMALE";
  age: number;
  phone: string;
  email?: string;
  status: "ACTIVE" | "DISABLED";
  registrationDetails?: {
    registrationCheckId?: string;
    healthCareNumber?: string;
    registrationLocation?: string;
    registrationDate?: string;
    registrationTime?: string;
  };
  address?: {
    streetAddress?: string;
    streetAddressLine2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
};

type Props = {
  mode: "create" | "edit";
  hospitalId: string;
  hospitalName: string;
  hospitalCode: string;
  districtCode: string;
  initialValue?: PatientFormValue;
  onCancel: () => void;
  onSubmit: (payload: {
    hospitalId: string;
    hospitalName: string;
    hospitalCode: string;
    districtCode: string;
    fullName: string;
    sex: "MALE" | "FEMALE";
    age: number;
    phone: string;
    email?: string;
    status: "ACTIVE" | "DISABLED";
    password: string;
    registrationDetails: {
      registrationCheckId: string;
      healthCareNumber: string;
      registrationLocation: string;
      registrationDate: string;
      registrationTime: string;
    };
    address: {
      streetAddress: string;
      streetAddressLine2: string;
      city: string;
      region: string;
      postalCode: string;
      country: string;
    };
  }) => Promise<void> | void;
  saving?: boolean;
};

const HospitalAdminPatientForm: React.FC<Props> = ({
  mode,
  hospitalId,
  hospitalName,
  hospitalCode,
  districtCode,
  initialValue,
  onCancel,
  onSubmit,
  saving = false,
}) => {
  const [registrationCheckId, setRegistrationCheckId] = useState("");
  const [healthCareNumber, setHealthCareNumber] = useState("");
  const [registrationLocation, setRegistrationLocation] = useState("");
  const [registrationDate, setRegistrationDate] = useState(new Date().toISOString().slice(0, 10));
  const [registrationTime, setRegistrationTime] = useState(new Date().toTimeString().slice(0, 5));
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sex, setSex] = useState<"MALE" | "FEMALE">("FEMALE");
  const [age, setAge] = useState<number>(18);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [streetAddressLine2, setStreetAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("Lesotho");
  const [status, setStatus] = useState<"ACTIVE" | "DISABLED">("ACTIVE");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initialValue) return;

    const nameParts = initialValue.fullName.trim().split(/\s+/);
    setFirstName(nameParts[0] || "");
    setLastName(nameParts.slice(1).join(" "));
    setSex(initialValue.sex);
    setAge(initialValue.age);
    setPhone(digitsOnlyInput(initialValue.phone));
    setEmail(initialValue.email || "");
    setStatus(initialValue.status);
    setRegistrationCheckId(initialValue.registrationDetails?.registrationCheckId || "");
    setHealthCareNumber(initialValue.registrationDetails?.healthCareNumber || "");
    setRegistrationLocation(initialValue.registrationDetails?.registrationLocation || "");
    setRegistrationDate(initialValue.registrationDetails?.registrationDate || new Date().toISOString().slice(0, 10));
    setRegistrationTime(initialValue.registrationDetails?.registrationTime || new Date().toTimeString().slice(0, 5));
    setStreetAddress(initialValue.address?.streetAddress || "");
    setStreetAddressLine2(initialValue.address?.streetAddressLine2 || "");
    setCity(initialValue.address?.city || "");
    setRegion(initialValue.address?.region || "");
    setPostalCode(initialValue.address?.postalCode || "");
    setCountry(initialValue.address?.country || "Lesotho");
    setPassword("");
  }, [initialValue]);

  const registrationProgress = useMemo(() => {
    const trackedFields = [
      registrationCheckId,
      healthCareNumber,
      registrationLocation,
      registrationDate,
      registrationTime,
      firstName,
      lastName,
      sex,
      String(age || ""),
      phone,
      streetAddress,
      city,
      region,
      country,
      status,
      mode === "create" ? password : "edit-mode",
    ];
    const completed = trackedFields.filter((value) => String(value || "").trim()).length;

    return Math.round((completed / trackedFields.length) * 100);
  }, [
    registrationCheckId,
    healthCareNumber,
    registrationLocation,
    registrationDate,
    registrationTime,
    firstName,
    lastName,
    sex,
    age,
    phone,
    streetAddress,
    city,
    region,
    country,
    status,
    password,
    mode,
  ]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const nameWarning = validateMeaningfulLetters(fullName, "Full name", { minWords: 2 });
    const phoneWarning = validateNumericText(phone, "Phone", { minLength: 6 });
    const locationWarning = registrationLocation.trim()
      ? validateMeaningfulLetters(registrationLocation, "Registration location", { minWords: 1 })
      : "";
    const cityWarning = city.trim() ? validateMeaningfulLetters(city, "City", { minWords: 1 }) : "";
    const regionWarning = region.trim() ? validateMeaningfulLetters(region, "Region", { minWords: 1 }) : "";

    if (nameWarning) return setError(nameWarning);
    if (locationWarning) return setError(locationWarning);
    if (cityWarning) return setError(cityWarning);
    if (regionWarning) return setError(regionWarning);
    if (phoneWarning) return setError(phoneWarning);
    if (!Number.isFinite(age) || age < 0 || age > 130) return setError("Age is invalid.");
    if (mode === "create" && password.trim().length < 4) {
      return setError("Password must be at least 4 characters.");
    }

    try {
      await onSubmit({
        hospitalId,
        hospitalName,
        hospitalCode,
        districtCode,
        fullName,
        sex,
        age,
        phone: digitsOnlyInput(phone),
        email: email.trim(),
        status,
        password: password.trim(),
        registrationDetails: {
          registrationCheckId: registrationCheckId.trim(),
          healthCareNumber: healthCareNumber.trim(),
          registrationLocation: registrationLocation.trim(),
          registrationDate,
          registrationTime,
        },
        address: {
          streetAddress: streetAddress.trim(),
          streetAddressLine2: streetAddressLine2.trim(),
          city: city.trim(),
          region: region.trim(),
          postalCode: postalCode.trim(),
          country,
        },
      });
    } catch (e: any) {
      setError(e?.message || "Failed to save patient.");
    }
  };

  return (
    <form className="animated-form-surface" onSubmit={submit} style={styles.form}>
      <div style={styles.topLine}>
        <span>Patient Information</span>
        <span>{registrationProgress}%</span>
      </div>
      <h2 style={styles.title}>Hospital Registration Form</h2>
      <div style={styles.help}>Patients are required to register their information on this form.</div>
      <div style={styles.hospitalPill}>
        Hospital: {hospitalName} - {districtCode}-{hospitalCode}
      </div>
      <hr style={styles.rule} />

      <div style={styles.grid2}>
        <label style={styles.label}>
          Registration Check ID
          <input
            style={{ ...styles.input, background: "#e2edf0" }}
            value={mode === "create" ? `Auto-generated as REG-${districtCode}-${hospitalCode}-YYYYMMDD-001` : registrationCheckId}
            readOnly
            disabled={saving}
          />
        </label>
        <label style={styles.label}>
          Health Care Number*
          <input style={styles.input} value={healthCareNumber} onChange={(e) => setHealthCareNumber(digitsOnlyInput(e.target.value))} disabled={saving} />
        </label>
      </div>

      <label style={styles.label}>
        Registration Location ex: ER, Clinic, etc
        <input style={styles.input} value={registrationLocation} onChange={(e) => setRegistrationLocation(lettersOnlyInput(e.target.value))} disabled={saving} />
      </label>

      <div style={styles.grid2}>
        <label style={styles.label}>
          Registration Date*
          <input type="date" style={styles.input} value={registrationDate} onChange={(e) => setRegistrationDate(e.target.value)} disabled={saving} />
        </label>
        <label style={styles.label}>
          Registration Time*
          <input type="time" style={styles.input} value={registrationTime} onChange={(e) => setRegistrationTime(e.target.value)} disabled={saving} />
        </label>
      </div>

      <div style={styles.groupTitle}>Patient Name</div>
      <div style={styles.grid2}>
        <input style={styles.input} value={firstName} onChange={(e) => setFirstName(lettersOnlyInput(e.target.value))} placeholder="First" disabled={saving} />
        <input style={styles.input} value={lastName} onChange={(e) => setLastName(lettersOnlyInput(e.target.value))} placeholder="Last" disabled={saving} />
      </div>

      <div style={styles.groupTitle}>Address</div>
      <input style={styles.input} value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} placeholder="Street Address" disabled={saving} />
      <input
        style={styles.input}
        value={streetAddressLine2}
        onChange={(e) => setStreetAddressLine2(e.target.value)}
        placeholder="Street Address Line 2"
        disabled={saving}
      />

      <div style={styles.gridAddress}>
        <input style={styles.input} value={city} onChange={(e) => setCity(lettersOnlyInput(e.target.value))} placeholder="City" disabled={saving} />
        <input style={styles.input} value={region} onChange={(e) => setRegion(lettersOnlyInput(e.target.value))} placeholder="Region" disabled={saving} />
        <input style={styles.input} value={postalCode} onChange={(e) => setPostalCode(digitsOnlyInput(e.target.value))} placeholder="Postal / Zip Code" disabled={saving} />
        <select style={styles.input} value={country} onChange={(e) => setCountry(e.target.value)} disabled={saving}>
          <option value="Lesotho">Lesotho</option>
          <option value="South Africa">South Africa</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div style={styles.gridAddress}>
        <label style={styles.label}>
          Sex*
          <select style={styles.input} value={sex} onChange={(e) => setSex(e.target.value as any)} disabled={saving}>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
        </label>
        <label style={styles.label}>
          Age*
          <input style={styles.input} type="number" value={age} min={0} max={130} onChange={(e) => setAge(Number(digitsOnlyInput(e.target.value)))} disabled={saving} />
        </label>
        <label style={styles.label}>
          Phone Number*
          <input style={styles.input} value={phone} onChange={(e) => setPhone(digitsOnlyInput(e.target.value))} disabled={saving} />
        </label>
        <label style={styles.label}>
          Email
          <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
        </label>
        <label style={styles.label}>
          Status
          <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value as any)} disabled={saving}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DISABLED">DISABLED</option>
          </select>
        </label>
        <label style={styles.label}>
          {mode === "create" ? "Password*" : "New Password (optional)"}
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={saving}
            placeholder={mode === "create" ? "Enter patient password" : "Leave blank to keep current password"}
          />
        </label>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.actions}>
        <button type="button" style={styles.btnGhost} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" style={styles.btnPrimary} disabled={saving}>
          {saving ? "Saving..." : mode === "create" ? "Create Patient" : "Update Patient"}
        </button>
      </div>
    </form>
  );
};

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: "grid",
    gap: 16,
    width: "100%",
    borderTop: "5px solid #97d6d5",
    background: "#f8fbfc",
    borderRadius: 12,
    padding: "22px 24px 26px",
    border: "1px solid #c8e9e8",
    boxSizing: "border-box",
  },
  topLine: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    color: "#2f9fe8",
    fontSize: 14,
    fontWeight: 900,
  },
  title: {
    color: "#2f9fe8",
    fontSize: 32,
    lineHeight: 1.1,
    fontWeight: 650,
    margin: 0,
  },
  help: {
    width: "fit-content",
    maxWidth: "100%",
    color: "#2f9fe8",
    background: "#e8f6ff",
    fontSize: 15,
    fontWeight: 700,
    padding: "3px 6px",
  },
  hospitalPill: {
    width: "fit-content",
    maxWidth: "100%",
    border: "1px solid #b7e5e4",
    background: "#eefafa",
    borderRadius: 999,
    padding: "8px 12px",
    color: "#256f9f",
    fontWeight: 900,
    boxSizing: "border-box",
  },
  rule: {
    height: 2,
    background: "#97d6d5",
    border: "none",
    margin: "10px 0 4px",
  },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 },
  gridAddress: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 },
  groupTitle: { color: "#2f9fe8", fontSize: 14, fontWeight: 800, marginTop: 2 },
  label: { display: "grid", gap: 7, color: "#2f9fe8", fontSize: 15, fontWeight: 800 },
  input: {
    width: "100%",
    minHeight: 44,
    border: "2px solid #a7dddf",
    borderRadius: 7,
    background: "#eef6f7",
    color: "#0f172a",
    padding: "0 12px",
    boxSizing: "border-box",
    fontSize: 15,
    fontWeight: 800,
    outline: "none",
  },
  error: {
    background: "#fff1f2",
    border: "1px solid #ffd3d3",
    color: "#b42318",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 700,
  },
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, flexWrap: "wrap" },
  btnPrimary: {
    border: "none",
    minHeight: 46,
    padding: "0 18px",
    borderRadius: 10,
    cursor: "pointer",
    background: "linear-gradient(135deg, #1f7ae0, #35b7a5)",
    color: "white",
    fontWeight: 900,
  },
  btnGhost: {
    border: "1px solid #cfd7e3",
    minHeight: 46,
    padding: "0 18px",
    borderRadius: 10,
    cursor: "pointer",
    background: "white",
    color: "#0f172a",
    fontWeight: 800,
  },
};

export default HospitalAdminPatientForm;
