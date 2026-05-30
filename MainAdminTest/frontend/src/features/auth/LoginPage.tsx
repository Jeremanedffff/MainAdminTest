import React, { useState, useEffect } from "react";
import RegisterPatient from "./RegisterPatient";
import { loginFirestore, type DbUser } from "./authFirestoreDb";
import { User, Lock, Eye, EyeOff, Building2, HeartPulse, ShieldPlus, Activity, BrainCircuit, TrendingUp } from "lucide-react";
import "./LoginPage.css";

type SessionUser = {
  role:
    | "MAIN_ADMIN"
    | "HOSPITAL_ADMIN"
    | "DOCTOR"
    | "PHARMACIST"
    | "RECEPTIONIST"
    | "LAB_STAFF"
    | "PATIENT";
  userId: string;
  hospitalId?: string;
  fullName?: string;
};

type Props = {
  onLogin: (payload: SessionUser) => void;
};

const LoginPage: React.FC<Props> = ({ onLogin }) => {
  const [showRegister, setShowRegister] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<"id" | "pass" | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isPhone, setIsPhone] = useState(false);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const trendCards = [
    { label: "Patient flow", value: "+18%", note: "faster triage", icon: <TrendingUp size={20} /> },
    { label: "Clinical AI", value: "24/7", note: "history insights", icon: <BrainCircuit size={20} /> },
    { label: "Care signals", value: "Live", note: "department trends", icon: <Activity size={20} /> },
  ];

  useEffect(() => {
    setMounted(true); // entrance animation
  }, []);

  useEffect(() => {
    const updateLayout = () => {
      setIsCompact(window.innerWidth <= 980);
      setIsPhone(window.innerWidth <= 640);
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  const handleUserLogin = (user: DbUser) => {
    onLogin({
      role: user.role,
      userId: user.userId,
      hospitalId: user.hospitalId || "",
      fullName: user.fullName || "",
    });
  };

  const submit = async () => {
    setErr("");
    setLoading(true);

    try {
      if (!identifier.trim()) return setErr("Identifier is required.");
      if (!password.trim()) return setErr("Password is required.");

      const user = await loginFirestore(identifier.trim(), password.trim());
      if (!user) return setErr("User not found OR wrong password.");

      handleUserLogin(user);
    } catch (e: any) {
      setErr(e?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  if (showRegister) {
    return (
      <RegisterPatient
        onBackToLogin={() => setShowRegister(false)}
        onRegistered={(user) =>
          onLogin({
            role: user.role,
            userId: user.userId,
            fullName: user.fullName,
          })
        }
      />
    );
  }

  return (
    <div className="login-shell" style={styles.page}>
      <div
        className="login-stage"
        style={{
          ...styles.container,
          ...(isCompact ? styles.containerCompact : {}),
          transform: mounted ? "scale(1)" : "scale(0.95)",
          opacity: mounted ? 1 : 0,
        }}
      >
        {/* LEFT */}
        <div className="login-card" style={{ ...styles.card, ...(isCompact ? styles.cardCompact : {}), ...(isPhone ? styles.cardPhone : {}) }}>
          <div className="login-mark">
            <span className="login-markIcon"><HeartPulse size={20} /></span>
            <span style={{ ...styles.logo, ...(isPhone ? styles.logoPhone : {}) }}>Health-Sphere</span>
          </div>
          <div style={{ ...styles.sub, ...(isPhone ? styles.subPhone : {}) }}>Secure Login Portal</div>

          {err && <div style={styles.error}>{err}</div>}

          {/* ID */}
          <div
            style={{
              ...styles.inputWrapper,
              ...(focused === "id" ? styles.inputFocus : {}),
            }}
          >
            <User size={18} style={styles.icon} />
            <input
              style={styles.input}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="ID / Email / Phone"
              onFocus={() => setFocused("id")}
              onBlur={() => setFocused(null)}
            />
          </div>

          {/* PASSWORD */}
          <div
            style={{
              ...styles.inputWrapper,
              ...(focused === "pass" ? styles.inputFocus : {}),
            }}
          >
            <Lock size={18} style={styles.icon} />
            <input
              style={styles.input}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              onFocus={() => setFocused("pass")}
              onBlur={() => setFocused(null)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <span
              style={styles.eye}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </span>
          </div>

          <button
            className="login-primary"
            style={styles.primaryBtn}
            onClick={submit}
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <div style={{ ...styles.registerRow, ...(isPhone ? styles.registerRowPhone : {}) }}>
            <span style={styles.registerText}>To continue into the system, login or sign up as a new patient.</span>
            <button
              className="login-link"
              style={styles.linkBtn}
              onClick={() => setShowRegister(true)}
            >
              Sign up
            </button>
          </div>
        </div>

        {/* RIGHT */}
        <div className="trend-panel" style={{ ...styles.rightPanel, ...(isCompact ? styles.rightPanelCompact : {}) }}>
          <div style={styles.glowOrb} />
          <div style={styles.panelPattern} />
          <div className="ai-robot" aria-hidden="true">
            <div className="ai-robotHead">
              <span />
              <span />
            </div>
            <div className="ai-robotBody">
              <div className="ai-robotPulse" />
            </div>
          </div>
          <div style={styles.rightContent}>
            <div style={styles.heroBadge}>
              <Building2 size={16} />
              Health trends preview
            </div>
            <div style={styles.welcome}>Hospital intelligence before the login gate</div>
            <div style={styles.heroText}>
              View care trends at a glance. Login or sign up when you want to work with patient records,
              prescriptions, lab requests, and AI-supported clinical summaries.
            </div>

            <div className="trend-grid" style={{ ...styles.iconGrid, ...(isPhone ? styles.iconGridPhone : {}), ...(isCompact ? styles.iconGridCompact : {}) }}>
              {trendCards.map((item) => (
                <div className="trend-card" style={styles.iconCard} key={item.label}>
                  <div className="trend-icon">{item.icon}</div>
                  <div className="trend-value">{item.value}</div>
                  <div style={styles.iconTitle}>{item.label}</div>
                  <div style={styles.iconSub}>{item.note}</div>
                </div>
              ))}
            </div>

            <div style={styles.heroFooter}>
              <span style={styles.footerDot}></span>
              <ShieldPlus size={15} />
              Login required for protected tools
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "radial-gradient(circle at 12% 16%, rgba(37, 211, 102, 0.16), transparent 22%), radial-gradient(circle at 84% 22%, rgba(74, 144, 226, 0.2), transparent 24%), linear-gradient(135deg, #eef7fb 0%, #dfeefa 48%, #d9f6f0 100%)",
    fontFamily:
      "'Trebuchet MS', 'Segoe UI', Roboto, system-ui, sans-serif",
  },

  container: {
    display: "flex",
    width: "1060px",
    maxWidth: "95%",
    minHeight: "620px",
    borderRadius: 28,
    overflow: "hidden",
    transition: "all 0.6s ease",
    boxShadow: "0 34px 90px rgba(30, 41, 59, 0.18)",
    border: "1px solid rgba(255,255,255,0.7)",
  },
  containerCompact: {
    flexDirection: "column",
    minHeight: "auto",
  },

  card: {
    flex: 1,
    padding: 48,
    background: "rgba(247, 252, 255, 0.9)",
    backdropFilter: "blur(18px)",
    color: "#10233f",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  cardCompact: {
    padding: 28,
  },
  cardPhone: {
    padding: 22,
  },

  logo: {
    fontSize: 31,
    fontWeight: 900,
    marginBottom: 6,
    color: "#143b64",
    letterSpacing: "-0.03em",
  },
  logoPhone: {
    fontSize: 26,
  },

  sub: {
    fontSize: 14,
    color: "#5a708b",
    marginBottom: 24,
    fontWeight: 700,
  },
  subPhone: {
    fontSize: 13,
  },

  inputWrapper: {
    position: "relative",
    marginTop: 14,
    borderRadius: 16,
    transition: "all 0.3s ease",
    background: "white",
    border: "1px solid #d6e4f0",
    boxShadow: "0 10px 24px rgba(116, 142, 170, 0.08)",
  },

  inputFocus: {
    boxShadow: "0 0 0 4px rgba(74, 144, 226, 0.12), 0 14px 30px rgba(74, 144, 226, 0.14)",
    border: "1px solid #74a9e8",
  },

  icon: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    color: "#2f7fc9",
    opacity: 0.95,
  },

  eye: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    cursor: "pointer",
    color: "#2f7fc9",
  },

  input: {
    width: "100%",
    padding: "15px 42px 15px 40px",
    borderRadius: 16,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#16324f",
    fontSize: 14,
    fontWeight: 700,
  },

  primaryBtn: {
    marginTop: 24,
    padding: 15,
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    fontWeight: 800,
    background: "linear-gradient(135deg, #1678d8, #1eb7a6)",
    color: "white",
    transition: "all 0.3s ease",
    boxShadow: "0 16px 28px rgba(22, 120, 216, 0.24)",
  },

  registerRow: {
    marginTop: 18,
    display: "flex",
    justifyContent: "space-between",
  },
  registerRowPhone: {
    gap: 10,
    flexDirection: "column",
    alignItems: "flex-start",
  },

  registerText: { color: "#6b7d90", fontWeight: 700 },

  linkBtn: {
    background: "none",
    border: "none",
    color: "#1277d3",
    cursor: "pointer",
    fontWeight: 800,
  },

  error: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    background: "#fff1f2",
    color: "#b42318",
    border: "1px solid #fecdd3",
    fontWeight: 700,
  },

  rightPanel: {
    flex: 1,
    background: "linear-gradient(160deg, #12355c 0%, #0d4f76 46%, #0e7c86 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    padding: 40,
    overflow: "hidden",
  },
  rightPanelCompact: {
    minHeight: 360,
    padding: 28,
  },

  welcome: {
    fontSize: 36,
    lineHeight: 1.05,
    fontWeight: 900,
    color: "white",
    zIndex: 2,
  },

  glowOrb: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,255,255,0.2), transparent 62%)",
    filter: "blur(70px)",
    animation: "pulse 6s infinite alternate",
    top: -80,
    right: -40,
  },

  panelPattern: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
    backgroundSize: "34px 34px",
    opacity: 0.35,
  },

  rightContent: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    gap: 18,
    width: "100%",
    maxWidth: 420,
  },

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

  heroText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 15,
    lineHeight: 1.7,
    fontWeight: 600,
    maxWidth: 360,
  },

  iconGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
    marginTop: 8,
  },
  iconGridCompact: {
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  },
  iconGridPhone: {
    gridTemplateColumns: "1fr",
  },

  iconCard: {
    minHeight: 128,
    borderRadius: 20,
    padding: 16,
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "white",
    display: "grid",
    alignContent: "start",
    gap: 10,
    boxShadow: "0 18px 36px rgba(4, 18, 37, 0.18)",
    backdropFilter: "blur(12px)",
  },

  iconTitle: {
    fontSize: 14,
    fontWeight: 800,
  },

  iconSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.74)",
    lineHeight: 1.5,
    fontWeight: 600,
  },

  heroFooter: {
    marginTop: 6,
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    color: "rgba(255,255,255,0.86)",
    fontSize: 13,
    fontWeight: 700,
  },

  footerDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#87f3c3",
    boxShadow: "0 0 0 6px rgba(135,243,195,0.16)",
  },
};

export default LoginPage;
