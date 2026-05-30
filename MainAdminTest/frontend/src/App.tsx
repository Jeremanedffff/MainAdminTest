import React, { useEffect, useMemo, useState } from "react";
import { Building2, LogOut, ShieldPlus } from "lucide-react";

import LoginPage from "./features/auth/LoginPage";

import MainAdminDashboard from "./features/mainAdmin/pages/MainAdminDashboard";
import HospitalAdminDashboard from "./features/hospitalAdmin/pages/HospitalAdminDashboard";

import PatientDashboard from "./features/patient/PatientDashboard";
import DoctorDashboard from "./features/doctor/DoctorDashboard";
import PharmacistDashboard from "./features/pharmacist/PharmacistDashboard";
import ReceptionDashboard from "./features/reception/ReceptionDashboard";
import LabDashboard from "./features/laboratory/LabDashboard";

const LS_SESSION = "hs_session_v1";

export type UserRole =
  | "MAIN_ADMIN"
  | "HOSPITAL_ADMIN"
  | "DOCTOR"
  | "PHARMACIST"
  | "RECEPTIONIST"
  | "LAB_STAFF"
  | "PATIENT";

export type SessionUser = {
  role: UserRole;
  userId: string;
  hospitalId?: string;
  fullName?: string;
};

export default function App() {
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_SESSION);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SessionUser;
      if (parsed?.role && parsed?.userId) {
        setSession(parsed);
      }
    } catch {
      localStorage.removeItem(LS_SESSION);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      localStorage.removeItem(LS_SESSION);
      return;
    }
    localStorage.setItem(LS_SESSION, JSON.stringify(session));
  }, [session]);

  const handleLogin = (payload: SessionUser) => {
    setSession(payload);
  };

  const handleLogout = () => {
    setSession(null);
  };

  const header = useMemo(() => {
    if (!session) return null;

    return (
      <div style={styles.topBar}>
        <div style={styles.brandWrap}>
          <div style={styles.brandIcon}>
            <Building2 size={18} />
          </div>
          <div>
            <div style={styles.brandTitle}>Health-Sphere</div>
            <div style={styles.brandMeta}>
              <span style={styles.metaPill}>
                <ShieldPlus size={14} />
                Logged in as <b>{session.role}</b>
              </span>
              <span style={styles.metaPill}>
                ID: <b>{session.userId}</b>
              </span>
              {session.hospitalId ? (
                <span style={styles.metaPill}>
                  Hospital: <b>{session.hospitalId}</b>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <button style={styles.logoutBtn} onClick={handleLogout}>
          <LogOut size={16} />
          Logout
        </button>
      </div>
    );
  }, [session]);

  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 700px at 30% 15%, rgba(46, 233, 166, 0.14), transparent 60%), radial-gradient(900px 700px at 75% 25%, rgba(57, 182, 255, 0.12), transparent 62%), radial-gradient(650px 520px at 60% 80%, rgba(255, 204, 102, 0.06), transparent 60%), linear-gradient(180deg, #07121f, #0b1b2e)",
        color: "rgba(255, 255, 255, 0.92)",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      {header}

      {session.role === "MAIN_ADMIN" && <MainAdminDashboard />}

      {session.role === "HOSPITAL_ADMIN" && <HospitalAdminDashboard adminId={session.userId} />}

      {session.role === "DOCTOR" && (
        <DoctorDashboard doctorId={session.userId} hospitalId={session.hospitalId || ""} />
      )}

      {session.role === "PHARMACIST" && (
        <PharmacistDashboard pharmacistId={session.userId} hospitalId={session.hospitalId || ""} />
      )}

      {session.role === "RECEPTIONIST" && (
        <ReceptionDashboard receptionistId={session.userId} hospitalId={session.hospitalId || ""} />
      )}

      {session.role === "LAB_STAFF" && (
        <LabDashboard staffId={session.userId} hospitalId={session.hospitalId || ""} />
      )}

      {session.role === "PATIENT" && <PatientDashboard patientId={session.userId} />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  topBar: {
    position: "sticky",
    top: 0,
    zIndex: 999,
    background: "linear-gradient(160deg, #12355c 0%, #0d4f76 46%, #0e7c86 100%)",
    color: "white",
    padding: "14px 18px",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 14px 30px rgba(30, 41, 59, 0.16)",
    flexWrap: "wrap",
  },
  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "0 10px 24px rgba(4, 18, 37, 0.14)",
    flexShrink: 0,
  },
  brandTitle: {
    fontWeight: 900,
    fontSize: 18,
    letterSpacing: "-0.02em",
  },
  brandMeta: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 4,
    fontSize: 12,
    fontWeight: 700,
  },
  metaPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.16)",
  },
  logoutBtn: {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.12)",
    color: "white",
    padding: "10px 14px",
    borderRadius: 14,
    cursor: "pointer",
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 10px 24px rgba(4, 18, 37, 0.14)",
  },
};
