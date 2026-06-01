import React, { useEffect, useMemo, useState } from "react";
import {
  loadActiveHospitals,
  registerPatientFirestore,
  type HospitalOption,
} from "./authFirestoreDb";
import { digitsOnlyInput, lettersOnlyInput, validateMeaningfulLetters } from "../../utils/formValidation";
import "./LoginPage.css";
import {
  ArrowLeft,
  BadgePlus,
  Building2,
  HeartHandshake,
  Lock,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";

type Props = {
  onBackToLogin: () => void;
  onRegistered: (user: { role: "PATIENT"; userId: string; fullName?: string }) => void;
};

const LESOTHO_COUNTRY_CODE = "+266";

const RegisterPatient: React.FC<Props> = ({ onBackToLogin, onRegistered }) => {
  const [fullName, setFullName] = useState("");
  const [sex, setSex] = useState<"MALE" | "FEMALE">("FEMALE");
  const [age, setAge] = useState<number>(18);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("1234");
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [hospitalId, setHospitalId] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [isCompact, setIsCompact] = useState(false);
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoadingHospitals(true);
      setErr("");

      try {
        const rows = await loadActiveHospitals();
        setHospitals(rows);

        if (rows.length > 0) setHospitalId(rows[0].hospitalId);
      } catch (e: any) {
        console.error("LOAD HOSPITAL OPTIONS ERROR:", e);
        setErr(e?.message || "Failed to load hospitals.");
      } finally {
        setLoadingHospitals(false);
      }
    };

    run();
  }, []);

  useEffect(() => {
    const updateLayout = () => {
      setIsCompact(window.innerWidth <= 1040);
      setIsPhone(window.innerWidth <= 640);
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  const selectedHospital = useMemo(() => {
    return hospitals.find((h) => h.hospitalId === hospitalId) || null;
  }, [hospitals, hospitalId]);

  const idPreview = useMemo(() => {
    if (!selectedHospital) return "DST-HSP-0001";
    return `${selectedHospital.districtCode}-${selectedHospital.hospitalCode}-0001`;
  }, [selectedHospital]);

  const submit = async () => {
    setErr("");
    setLoading(true);

    const name = fullName.trim();
    const ph = phone.trim();
    const digits = ph.replace(/\D/g, "");
    const normalizedPhone = `${LESOTHO_COUNTRY_CODE} ${digits}`.trim();

    const nameWarning = validateMeaningfulLetters(name, "Full name", { minWords: 2 });

    if (nameWarning) {
      setErr(nameWarning);
      setLoading(false);
      return;
    }

    if (!ph) {
      setErr("Phone is required.");
      setLoading(false);
      return;
    }

    if (ph.startsWith("+")) {
      setErr("Enter the Lesotho phone number without +266.");
      setLoading(false);
      return;
    }

    if (digits.length === 0) {
      setErr("Phone is required.");
      setLoading(false);
      return;
    }

    if (digits.length !== 8) {
      setErr("Invalid phone number for Lesotho. Enter exactly 8 digits after +266.");
      setLoading(false);
      return;
    }

    if (!Number.isFinite(age) || age < 0 || age > 130) {
      setErr("Age is invalid.");
      setLoading(false);
      return;
    }

    if (!selectedHospital) {
      setErr("Please select a hospital.");
      setLoading(false);
      return;
    }

    try {
      const user = await registerPatientFirestore({
        fullName: name,
        sex,
        age,
        phone: normalizedPhone,
        email: email.trim(),
        password,
        hospitalId: selectedHospital.hospitalId,
        hospitalName: selectedHospital.name,
        hospitalCode: selectedHospital.hospitalCode,
        districtCode: selectedHospital.districtCode,
      });

      onRegistered({
        role: "PATIENT",
        userId: user.userId,
        fullName: user.fullName,
      });
    } catch (e: any) {
      console.error("PATIENT REGISTER ERROR:", e);
      setErr(e?.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell register-shell" style={styles.page}>
      <div className="login-stage" style={{ ...styles.container, ...(isCompact ? styles.containerCompact : {}) }}>
        <div style={{ ...styles.leftPanel, ...(isCompact ? styles.leftPanelCompact : {}) }}>
          <div style={styles.heroBadge}>
            <BadgePlus size={16} />
            New Patient Enrollment
          </div>
          <div style={styles.logo}>Patient Registration</div>
          <div style={styles.sub}>
            Choose a hospital, create your patient profile, and receive a meaningful hospital-linked Patient ID.
          </div>

          <div style={styles.infoGrid}>
            <div style={styles.infoCard}>
              <Building2 size={26} />
              <div style={styles.infoTitle}>Hospital Linked</div>
              <div style={styles.infoText}>Each patient account stays connected to the selected hospital and district.</div>
            </div>
            <div style={styles.infoCard}>
              <HeartHandshake size={26} />
              <div style={styles.infoTitle}>Patient Friendly</div>
              <div style={styles.infoText}>Simple registration for first-time patients and returning care journeys.</div>
            </div>
            <div style={styles.infoCard}>
              <MapPin size={26} />
              <div style={styles.infoTitle}>Meaningful IDs</div>
              <div style={styles.infoText}>Examples: <b>MSU-QMMH-0001</b>, <b>LER-MTB-0001</b>.</div>
            </div>
          </div>

          <div style={styles.previewBox}>
            <div style={styles.previewLabel}>Patient ID Preview</div>
            <div style={styles.previewValue}>{idPreview}</div>
          </div>
        </div>

        <div className="login-card register-card" style={{ ...styles.card, ...(isCompact ? styles.cardCompact : {}), ...(isPhone ? styles.cardPhone : {}) }}>
          {err ? <div style={styles.error}>{err}</div> : null}

          <label style={styles.label}>
            Hospital
            {loadingHospitals ? (
              <div style={styles.loadingBox}>Loading hospitals...</div>
            ) : (
              <select
                style={styles.input}
                value={hospitalId}
                onChange={(e) => setHospitalId(e.target.value)}
                disabled={loading || hospitals.length === 0}
              >
                {hospitals.length === 0 ? (
                  <option value="">No active hospitals found</option>
                ) : (
                  hospitals.map((h) => (
                    <option key={h.hospitalId} value={h.hospitalId}>
                      {h.name} ({h.location}) - {h.districtCode}-{h.hospitalCode}
                    </option>
                  ))
                )}
              </select>
            )}
          </label>

          <label style={styles.label}>
            Full Name
            <div style={styles.inputWrap}>
              <UserRound size={18} style={styles.fieldIcon} />
              <input
                style={styles.inputInset}
                value={fullName}
                onChange={(e) => setFullName(lettersOnlyInput(e.target.value))}
                placeholder="Enter full name"
              />
            </div>
          </label>

          <div style={{ ...styles.grid2, ...(isPhone ? styles.grid2Phone : {}) }}>
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

          <label style={styles.label}>
            Phone
            <div style={styles.inputWrap}>
              <Phone size={18} style={styles.fieldIcon} />
              <input
                style={styles.inputInset}
                value={phone}
                onChange={(e) => setPhone(digitsOnlyInput(e.target.value))}
                placeholder="e.g. 56560000"
                maxLength={8}
              />
            </div>
          </label>

          <div style={styles.phoneHint}>
            Lesotho only: <b>{LESOTHO_COUNTRY_CODE}</b>. Enter the 8-digit phone number without the country code.
          </div>

          <label style={styles.label}>
            Email (optional)
            <div style={styles.inputWrap}>
              <Mail size={18} style={styles.fieldIcon} />
              <input
                style={styles.inputInset}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
              />
            </div>
          </label>

          <label style={styles.label}>
            Password
            <div style={styles.inputWrap}>
              <Lock size={18} style={styles.fieldIcon} />
              <input
                style={styles.inputInset}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create password"
              />
            </div>
          </label>

          <button style={styles.primaryBtn} onClick={submit} disabled={loading || loadingHospitals}>
            {loading ? "Registering..." : "Register & Go to Dashboard"}
          </button>

          <button style={styles.secondaryBtn} onClick={onBackToLogin} disabled={loading}>
            <ArrowLeft size={16} />
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 12% 16%, rgba(37, 211, 102, 0.16), transparent 22%), radial-gradient(circle at 84% 22%, rgba(74, 144, 226, 0.2), transparent 24%), linear-gradient(135deg, #eef7fb 0%, #dfeefa 48%, #d9f6f0 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "'Trebuchet MS', 'Segoe UI', Roboto, system-ui, sans-serif",
  },
  container: {
    width: "100%",
    maxWidth: 1180,
    display: "grid",
    gridTemplateColumns: "0.95fr 1.05fr",
    borderRadius: 28,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.7)",
    boxShadow: "0 34px 90px rgba(30, 41, 59, 0.18)",
    background: "rgba(255,255,255,0.2)",
  },
  containerCompact: {
    gridTemplateColumns: "1fr",
  },
  leftPanel: {
    background: "linear-gradient(160deg, #12355c 0%, #0d4f76 46%, #0e7c86 100%)",
    color: "white",
    padding: 40,
    display: "grid",
    alignContent: "start",
    gap: 18,
  },
  leftPanelCompact: {
    padding: 28,
  },
  card: {
    width: "100%",
    background: "rgba(247, 252, 255, 0.92)",
    padding: 32,
  },
  cardCompact: {
    padding: 26,
  },
  cardPhone: {
    padding: 20,
  },
  logo: { fontSize: 31, fontWeight: 900, color: "white", letterSpacing: "-0.03em" },
  sub: { fontSize: 15, color: "rgba(255,255,255,0.82)", fontWeight: 700, lineHeight: 1.7 },
  heroBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    width: "fit-content",
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.22)",
    color: "white",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  infoGrid: {
    display: "grid",
    gap: 14,
    marginTop: 8,
  },
  infoCard: {
    borderRadius: 20,
    padding: 18,
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.18)",
    display: "grid",
    gap: 10,
    boxShadow: "0 18px 36px rgba(4, 18, 37, 0.18)",
    backdropFilter: "blur(12px)",
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: 800,
  },
  infoText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.76)",
    lineHeight: 1.6,
    fontWeight: 600,
  },
  error: {
    marginBottom: 12,
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#b42318",
    borderRadius: 12,
    padding: 12,
    fontWeight: 700,
  },
  label: { display: "grid", gap: 8, marginTop: 12, fontWeight: 900, color: "#16324f" },
  input: {
    border: "1px solid #d6e4f0",
    borderRadius: 16,
    padding: "14px 14px",
    outline: "none",
    fontWeight: 800,
    color: "#16324f",
    background: "white",
    boxShadow: "0 10px 24px rgba(116, 142, 170, 0.08)",
  },
  inputWrap: {
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr)",
    alignItems: "center",
    borderRadius: 16,
    border: "1px solid #d6e4f0",
    background: "white",
    boxShadow: "0 10px 24px rgba(116, 142, 170, 0.08)",
  },
  inputInset: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#16324f",
    padding: "14px 14px 14px 0",
    fontWeight: 800,
    fontSize: 14,
  },
  fieldIcon: {
    justifySelf: "center",
    color: "#2f7fc9",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  grid2Phone: {
    gridTemplateColumns: "1fr",
  },
  loadingBox: {
    border: "1px solid #d6e4f0",
    borderRadius: 16,
    padding: "14px 14px",
    background: "#f8fafc",
    fontWeight: 800,
  },
  previewBox: {
    marginTop: 8,
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 18px 36px rgba(4, 18, 37, 0.18)",
  },
  previewLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  previewValue: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: 1000,
    color: "white",
    letterSpacing: 0.5,
  },
  primaryBtn: {
    marginTop: 14,
    width: "100%",
    border: "none",
    background: "linear-gradient(135deg, #1678d8, #1eb7a6)",
    color: "white",
    borderRadius: 16,
    padding: "15px 14px",
    cursor: "pointer",
    fontWeight: 800,
    boxShadow: "0 16px 28px rgba(22, 120, 216, 0.24)",
  },
  secondaryBtn: {
    marginTop: 10,
    width: "100%",
    border: "1px solid #d6e4f0",
    background: "white",
    color: "#16324f",
    borderRadius: 16,
    padding: "14px 14px",
    cursor: "pointer",
    fontWeight: 1000,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  phoneHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#475569",
    fontWeight: 800,
    lineHeight: 1.4,
  },
};

export default RegisterPatient;
