import React, { useMemo, useRef, useState, useEffect } from "react";
import { GalleryHorizontalEnd, Home, UserCheck, Settings, Menu, Building, X, UserPlus } from "lucide-react";
import './MainAdminDashboard.css';
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase/firebase";

import CreateHospitalForm, { type CreateHospitalPayload } from "../components/CreateHospitalForm";
import HospitalTable, { type HospitalRow, type HospitalStatus } from "../components/HospitalTable";

import CreateHospitalAdminForm, {
  type CreateHospitalAdminPayload,
} from "../components/CreateHospitalAdminForm";
import HospitalAdminsTable, { type HospitalAdminRow } from "../components/HospitalAdminsTable";

import type { SidebarItemKey } from "../components/Sidebar";
import type { AdminSettings } from "../components/AdminSettingsPanel";
import SettingsGeneral from "../components/SettingsGeneral";
import SettingsDesign from "../components/SettingsDesign";
import SettingsAdminAccounts from "../components/SettingsAdminAccounts";
import VisualMedicalDashboard from "../components/VisualMedicalDashboard";

function makeHospitalId(code: string) {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const c = code.trim().toUpperCase().slice(0, 4) || "HSP";
  return `HSP-${c}-${year}-${rand}`;
}

type FirestoreHospitalDoc = {
  hospitalId: string;
  hospitalCode: string;
  districtCode: string;
  name: string;
  location: string;
  country?: string;
  status: HospitalStatus;
  maxAdmins?: number;
  createdAtISO: string;
};

type FirestoreHospitalAdminDoc = {
  adminId: string;
  userId: string;
  hospitalId: string;
  hospitalName: string;
  fullName: string;
  email: string;
  emailLower: string;
  phone: string;
  phoneNorm: string;
  status: "ACTIVE" | "DISABLED";
  createdAtISO: string;
};

type FirestoreUserDoc = {
  userId: string;
  role: "HOSPITAL_ADMIN";
  fullName: string;
  email: string;
  emailLower: string;
  phone: string;
  phoneNorm: string;
  hospitalId: string;
  hospitalName: string;
  password: string;
  status: "ACTIVE" | "DISABLED";
  createdAtISO: string;
};

function normalizePhone(p: string) {
  return p.replace(/\s+/g, "").trim();
}

function districtToCode(location: string) {
  const l = location.trim().toLowerCase();

  if (l.includes("maseru")) return "MSU";
  if (l.includes("leribe")) return "LER";
  if (l.includes("berea")) return "BER";
  if (l.includes("mafeteng")) return "MFT";
  if (l.includes("mohale")) return "MHK";
  if (l.includes("quthing")) return "QTG";
  if (l.includes("qacha")) return "QNK";
  if (l.includes("thaba")) return "TTK";
  if (l.includes("mokhotlong")) return "MKH";
  if (l.includes("butha")) return "BBT";

  return "OTH";
}

const SETTINGS_STORAGE_KEY = "main-admin-settings.v1";
const SETTINGS_DOC_PATH = ["app_settings", "main_admin"] as const;

const defaultSettings: AdminSettings = {
  maxAdminsPerHospital: 2,
  allowedCountryCodes: ["+266", "+27", "+33"],
  design: {
    theme: "Default",
    density: "Comfortable",
    showSidebarLabels: true,
    useRoundedCards: true,
    showHospitalLogo: true,
    logoUrl: "",
    logoPath: "",
  },
};

type DashboardCssVars = React.CSSProperties & Record<`--${string}`, string>;
type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => Promise<void> | void;
} | null;

function mergeAdminSettings(next?: Partial<AdminSettings> | null): AdminSettings {
  return {
    ...defaultSettings,
    ...(next || {}),
    design: {
      ...defaultSettings.design,
      ...(next?.design || {}),
    },
    allowedCountryCodes:
      next?.allowedCountryCodes && next.allowedCountryCodes.length > 0
        ? next.allowedCountryCodes
        : defaultSettings.allowedCountryCodes,
  };
}

const MainAdminDashboard = () => {
  const [active, setActive] = useState<SidebarItemKey>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuBtnHover, setMenuBtnHover] = useState(false);
  const [primaryBtnHover, setPrimaryBtnHover] = useState(false);
  const [secondaryBtnHover, setSecondaryBtnHover] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const [hospitals, setHospitals] = useState<HospitalRow[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(true);

  const [admins, setAdmins] = useState<HospitalAdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [savingHospital, setSavingHospital] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<HospitalAdminRow | null>(null);
  const [viewingAdmin, setViewingAdmin] = useState<HospitalAdminRow | null>(null);
  const [viewingHospital, setViewingHospital] = useState<HospitalRow | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const [settings, setSettings] = useState<AdminSettings>(() => {
    if (typeof window === "undefined") {
      return defaultSettings;
    }

    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return defaultSettings;

      const parsed = JSON.parse(raw) as Partial<AdminSettings>;

      return mergeAdminSettings(parsed);
    } catch {
      return defaultSettings;
    }
  });
  const settingsDocRef = useMemo(() => doc(db, ...SETTINGS_DOC_PATH), []);

  const [showCreateHospital, setShowCreateHospital] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);

  const loadHospitals = async () => {
    setHospitalsLoading(true);
    try {
      const snap = await getDocs(collection(db, "hospitals"));
      const rows: HospitalRow[] = snap.docs
        .map((d) => {
          const data = d.data() as FirestoreHospitalDoc;
          const hospitalId = data.hospitalId || d.id;
          return {
            id: hospitalId,
            name: data.name || "",
            location: data.location || "",
            status: (data.status || "ACTIVE") as HospitalStatus,
            createdAt: (data.createdAtISO || "").slice(0, 10),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      setHospitals(rows);
    } finally {
      setHospitalsLoading(false);
    }
  };

  const loadAdmins = async () => {
    setAdminsLoading(true);
    try {
      const snap = await getDocs(collection(db, "hospital_admins"));
      const rows: HospitalAdminRow[] = snap.docs
        .map((d) => {
          const data = d.data() as FirestoreHospitalAdminDoc;
          return {
            id: data.adminId || d.id,
            fullName: data.fullName || "",
            email: data.email || "",
            phone: data.phone || "",
            hospitalId: data.hospitalId || "",
            hospitalName: data.hospitalName || "",
            status: data.status || "ACTIVE",
            createdAt: (data.createdAtISO || "").slice(0, 10),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      setAdmins(rows);
    } finally {
      setAdminsLoading(false);
    }
  };

  useEffect(() => {
    loadHospitals().catch((e) => {
      console.error("LOAD HOSPITALS ERROR:", e);
      setError(e?.message || "Failed to load hospitals.");
    });
  }, []);

  useEffect(() => {
    loadAdmins().catch((e) => {
      console.error("LOAD ADMINS ERROR:", e);
      setError(e?.message || "Failed to load hospital admins.");
    });
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuOpen) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      if (buttonRef.current && buttonRef.current.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      settingsDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          void setDoc(settingsDocRef, defaultSettings, { merge: true });
          return;
        }

        const remoteSettings = mergeAdminSettings(snapshot.data() as Partial<AdminSettings>);
        setSettings(remoteSettings);
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(remoteSettings));
      },
      (snapshotError) => {
        console.error("LOAD SETTINGS ERROR:", snapshotError);
        setError((prev) => prev || "Failed to load shared admin settings.");
      }
    );

    return () => unsubscribe();
  }, [settingsDocRef]);

  // Create hospitals array with assigned admins for the table
  const hospitalsWithAdmins = useMemo(() => {
    return hospitals.map(hospital => {
      const assignedAdmins = admins
        .filter(admin => admin.hospitalId === hospital.id && admin.status === "ACTIVE") // Only show active admins
        .map(admin => ({
          id: admin.id,
          fullName: admin.fullName,
          email: admin.email,
          status: admin.status
        }));
      
      return {
        ...hospital,
        assignedAdmins
      };
    });
  }, [hospitals, admins]);

  const stats = useMemo(() => {
    const total = hospitals.length;
    const activeCount = hospitals.filter((h) => h.status === "ACTIVE").length;
    return { total, activeCount };
  }, [hospitals]);

  const viewingHospitalWithAdmins = useMemo(() => {
    if (!viewingHospital) return null;
    
    const assignedAdmins = admins
      .filter(admin => {
        // Primary match by hospital ID
        if (admin.hospitalId === viewingHospital.id && admin.status === "ACTIVE") {
          return true;
        }
        // Fallback: match by hospital name (for legacy data)
        if (admin.hospitalName === viewingHospital.name && admin.status === "ACTIVE") {
          return true;
        }
        return false;
      })
      .map(admin => ({
        id: admin.id,
        fullName: admin.fullName,
        email: admin.email,
        status: admin.status
      }));
    
    return {
      ...viewingHospital,
      assignedAdmins
    };
  }, [viewingHospital, admins]);

  const handleCreateHospital = async (payload: CreateHospitalPayload) => {
    setSavingHospital(true);
    setError(null);
    
    // Format the code and name for duplicate checking
    const formattedCode = payload.code.trim().toUpperCase();
    const formattedName = payload.name.trim().toLowerCase();

    // Check for duplicates
    const exists = hospitals.some(
      (h) =>
        h.name.toLowerCase() === formattedName ||
        h.id.split("-")[1]?.toLowerCase() === formattedCode.toLowerCase()
    );

    if (exists) {
      setError("This hospital is already registered.");
      setSavingHospital(false);
      return;
    }

    try {
      const createdAtISO = new Date().toISOString();
      const hospitalId = makeHospitalId(payload.code);

      const hospitalDoc: FirestoreHospitalDoc = {
        hospitalId,
        hospitalCode: formattedCode,
        districtCode: districtToCode(payload.location),
        name: payload.name,
        location: payload.location,
        country: "Lesotho",
        status: payload.status,
        maxAdmins: settings.maxAdminsPerHospital,
        createdAtISO,
      };

      await setDoc(doc(db, "hospitals", hospitalId), hospitalDoc);

      await loadHospitals();
      setShowCreateHospital(false);
      setActive("hospitals");
    } catch (e: any) {
      console.error("CREATE HOSPITAL ERROR:", e);
      setError(e?.message || "Failed to save hospital to Firestore.");
      throw e;
    } finally {
      setSavingHospital(false);
    }
  };

  const handleToggleHospitalStatus = async (hospitalId: string, nextStatus: HospitalStatus) => {
    setError(null);

    try {
      await updateDoc(doc(db, "hospitals", hospitalId), {
        status: nextStatus,
      });

      setHospitals((prev) =>
        prev.map((h) => (h.id === hospitalId ? { ...h, status: nextStatus } : h))
      );

      // When disabling a hospital, also disable all associated admins
      if (nextStatus === "DISABLED") {
        const adminsToUpdate = admins.filter((a) => a.hospitalId === hospitalId);
        for (const admin of adminsToUpdate) {
          await updateDoc(doc(db, "hospital_admins", admin.id), {
            status: "DISABLED",
          });
        }
        // Update local state to reflect admin status changes
        setAdmins((prev) =>
          prev.map((a) => 
            a.hospitalId === hospitalId ? { ...a, status: "DISABLED" } : a
          )
        );
      }
      // When enabling a hospital, also enable all associated admins
      else if (nextStatus === "ACTIVE") {
        const adminsToUpdate = admins.filter((a) => a.hospitalId === hospitalId);
        for (const admin of adminsToUpdate) {
          await updateDoc(doc(db, "hospital_admins", admin.id), {
            status: "ACTIVE",
          });
        }
        // Update local state to reflect admin status changes
        setAdmins((prev) =>
          prev.map((a) => 
            a.hospitalId === hospitalId ? { ...a, status: "ACTIVE" } : a
          )
        );
      }
    } catch (e: any) {
      console.error("TOGGLE HOSPITAL STATUS ERROR:", e);
      setError(e?.message || "Failed to update hospital status.");
    }
  };

  const handleCreateAdmin = async (admin: CreateHospitalAdminPayload) => {
    setSavingAdmin(true);
    setError(null);

    try {
      // Check admin limit before saving
      const activeAdmins = admins.filter(
        (a) => a.hospitalId === admin.hospitalId && a.status === "ACTIVE"
      );

      if (activeAdmins.length >= settings.maxAdminsPerHospital && !editingAdmin) {
        throw new Error(`Hospital admin limit of ${settings.maxAdminsPerHospital} reached.`);
      }

      const createdAtISO = new Date().toISOString();
      const emailLower = admin.email.trim().toLowerCase();
      const phoneNorm = normalizePhone(admin.phone);

      const adminDoc: FirestoreHospitalAdminDoc = {
        adminId: admin.id,
        userId: admin.id,
        hospitalId: admin.hospitalId,
        hospitalName: admin.hospitalName,
        fullName: admin.fullName,
        email: admin.email,
        emailLower,
        phone: admin.phone,
        phoneNorm,
        status: admin.status,
        createdAtISO,
      };

      const userDoc: FirestoreUserDoc = {
        userId: admin.id,
        role: "HOSPITAL_ADMIN",
        fullName: admin.fullName,
        email: admin.email,
        emailLower,
        phone: admin.phone,
        phoneNorm,
        hospitalId: admin.hospitalId,
        hospitalName: admin.hospitalName,
        password: admin.password,
        status: admin.status,
        createdAtISO,
      };

      await setDoc(doc(db, "hospital_admins", admin.id), adminDoc);
      await setDoc(doc(db, "users", admin.id), userDoc);

      await loadAdmins();
      setShowCreateAdmin(false);
      setEditingAdmin(null);
      setActive("hospitalAdmins");
    } catch (e: any) {
      console.error("CREATE HOSPITAL ADMIN ERROR:", e);
      setError(e?.message || "Failed to save hospital admin to Firestore.");
      throw e;
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    setConfirmState({
      title: "Delete Admin",
      message: "Are you sure you want to delete this admin?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "hospital_admins", adminId));
          await deleteDoc(doc(db, "users", adminId));

          setAdmins((prev) => prev.filter((a) => a.id !== adminId));
        } catch (e) {
          console.error("DELETE ADMIN ERROR:", e);
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  const handleUpdateAdmin = async (admin: CreateHospitalAdminPayload) => {
    setSavingAdmin(true);
    setError(null);

    try {
      await updateDoc(doc(db, "hospital_admins", admin.id), {
        fullName: admin.fullName,
        email: admin.email,
        phone: admin.phone,
        hospitalId: admin.hospitalId,
        hospitalName: admin.hospitalName,
        status: admin.status,
      });

      await updateDoc(doc(db, "users", admin.id), {
        fullName: admin.fullName,
        email: admin.email,
        phone: admin.phone,
        hospitalId: admin.hospitalId,
        hospitalName: admin.hospitalName,
        status: admin.status,
      });

      await loadAdmins();
      setEditingAdmin(null);
    } catch (e) {
      console.error("UPDATE ADMIN ERROR:", e);
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleToggleAdminStatus = async (adminId: string) => {
    setError(null);
    
    try {
      const admin = admins.find(a => a.id === adminId);
      if (!admin) return;
      
      const newStatus = admin.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
      
      await updateDoc(doc(db, "hospital_admins", adminId), {
        status: newStatus,
      });

      await updateDoc(doc(db, "users", adminId), {
        status: newStatus,
      });

      setAdmins((prev) =>
        prev.map((a) => (a.id === adminId ? { ...a, status: newStatus } : a))
      );
    } catch (e: any) {
      console.error("TOGGLE ADMIN STATUS ERROR:", e);
      setError(e?.message || "Failed to update admin status.");
    }
  };

  const contentTitle = useMemo(() => {
    switch (active) {
      case "dashboard":
        return "Dashboard";
      case "visualDashboard":
        return "Visual Dashboard";
      case "hospitals":
        return "Hospitals";
      case "hospitalAdmins":
        return "Hospital Admins";
      case "settings.general":
        return "General Settings";
      case "settings.design":
        return "Design Settings";
      case "settings.adminAccounts":
        return "Admin Accounts";
      default:
        return "Dashboard";
    }
  }, [active]);

  const handleSaveSettings = async (next: AdminSettings) => {
    const mergedSettings = mergeAdminSettings(next);

    setSettings(mergedSettings);
    setError(null);

    try {
      await setDoc(settingsDocRef, mergedSettings, { merge: true });
    } catch (saveError: any) {
      console.error("SAVE SETTINGS ERROR:", saveError);
      setError(saveError?.message || "Failed to save shared admin settings.");
    }
  };

  const dashboardTheme = useMemo<DashboardCssVars>(() => {
    const themeMap = {
      Default: {
        primary: "#4a90e2",
        primaryDark: "#2563eb",
        primarySoft: "rgba(74, 144, 226, 0.12)",
        textPrimary: "#0f172a",
        textSecondary: "#475569",
        surface: "#ffffff",
        bgMain: "#f8fbff",
        gradientBg: "linear-gradient(180deg, #f5f9ff 0%, #edf4ff 100%)",
      },
      Ocean: {
        primary: "#0f766e",
        primaryDark: "#115e59",
        primarySoft: "rgba(15, 118, 110, 0.12)",
        textPrimary: "#0f172a",
        textSecondary: "#486581",
        surface: "#fdfefe",
        bgMain: "#f0fdfa",
        gradientBg: "linear-gradient(180deg, #ecfeff 0%, #f0fdfa 100%)",
      },
      Midnight: {
        primary: "#1d4ed8",
        primaryDark: "#1e3a8a",
        primarySoft: "rgba(29, 78, 216, 0.16)",
        textPrimary: "#e5eefb",
        textSecondary: "#bfd1f3",
        surface: "#0f172a",
        bgMain: "#111827",
        gradientBg: "linear-gradient(180deg, #0f172a 0%, #172554 100%)",
      },
    } as const;

    const densityMap = {
      Comfortable: {
        spaceXs: "6px",
        spaceSm: "12px",
        spaceMd: "18px",
        spaceLg: "24px",
      },
      Compact: {
        spaceXs: "4px",
        spaceSm: "8px",
        spaceMd: "14px",
        spaceLg: "18px",
      },
    } as const;

    const theme = themeMap[settings.design.theme];
    const density = densityMap[settings.design.density];
    const radiusBase = settings.design.useRoundedCards ? "18px" : "10px";
    const radiusSm = settings.design.useRoundedCards ? "12px" : "8px";

    return {
      "--primary": theme.primary,
      "--primary-dark": theme.primaryDark,
      "--primary-soft": theme.primarySoft,
      "--gradient-primary": `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark} 100%)`,
      "--gradient-bg": theme.gradientBg,
      "--surface": theme.surface,
      "--bg-main": theme.bgMain,
      "--text-primary": theme.textPrimary,
      "--text-secondary": theme.textSecondary,
      "--success": "#16a34a",
      "--error": "#dc2626",
      "--shadow-sm": "0 8px 20px rgba(15, 23, 42, 0.08)",
      "--shadow-md": "0 14px 30px rgba(15, 23, 42, 0.12)",
      "--shadow-lg": "0 22px 50px rgba(15, 23, 42, 0.18)",
      "--radius-sm": radiusSm,
      "--radius-md": settings.design.useRoundedCards ? "14px" : "10px",
      "--radius-lg": radiusBase,
      "--radius-xl": settings.design.useRoundedCards ? "999px" : "14px",
      "--space-xs": density.spaceXs,
      "--space-sm": density.spaceSm,
      "--space-md": density.spaceMd,
      "--space-lg": density.spaceLg,
      "--font-size-sm": "13px",
      "--font-size-base": "14px",
      "--font-size-xl": "24px",
      "--font-weight-medium": "500",
      "--font-weight-semibold": "600",
      "--font-weight-bold": "800",
      "--font-family": "\"Segoe UI\", Tahoma, Geneva, Verdana, sans-serif",
    };
  }, [settings]);

  const go = (key: SidebarItemKey) => {
    setActive(key);
    setMenuOpen(false);
  };

  return (
    <div className="main-admin-dashboard" style={{ ...layout.page, ...dashboardTheme }}>
      <main style={layout.main}>
        <div className="main-admin-heroBar" style={layout.topBar}>
          <div style={layout.topLeft}>
            <button
              ref={buttonRef}
              className="main-admin-menuBtn"
              style={{
                ...layout.menuBtn,
                ...(menuBtnHover ? layout.menuBtnHover : {}),
              }}
              onClick={() => setMenuOpen(!menuOpen)}
              onMouseEnter={() => setMenuBtnHover(true)}
              onMouseLeave={() => setMenuBtnHover(false)}
              aria-label="Open main admin menu"
            >
              <Menu
                size={22}
                style={{
                  color: 'currentColor',
                  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: menuOpen ? 'rotate(90deg)' : 'rotate(0deg)'
                }}
              />
            </button>

            {menuOpen && (
              <div
                ref={menuRef}
                style={layout.menu}
              >
                {settings.design.showSidebarLabels && (
                  <div style={layout.menuTitle}>Main Admin Menu</div>
                )}

                <button
                  style={{ ...layout.menuItem, ...(active === "dashboard" ? layout.menuItemActive : {}) }}
                  onClick={() => go("dashboard")}
                  title="Dashboard"
                >
                  <Home size={18} className={`icon ${active === "dashboard" ? "icon-active" : ""}`} />
                  {settings.design.showSidebarLabels && "Dashboard"}
                </button>

                <button
                  style={{ ...layout.menuItem, ...(active === "visualDashboard" ? layout.menuItemActive : {}) }}
                  onClick={() => go("visualDashboard")}
                  title="Visual Dashboard"
                >
                  <GalleryHorizontalEnd size={18} className={`icon ${active === "visualDashboard" ? "icon-active" : ""}`} />
                  {settings.design.showSidebarLabels && "Visual Dashboard"}
                </button>

                <button
                  style={{ ...layout.menuItem, ...(active === "hospitals" ? layout.menuItemActive : {}) }}
                  onClick={() => go("hospitals")}
                  title="Hospitals"
                >
                  <Building size={18} className={`icon ${active === "hospitals" ? "icon-active" : ""}`} />
                  {settings.design.showSidebarLabels && "Hospitals"}
                </button>

                <button
                  style={{ ...layout.menuItem, ...(active === "hospitalAdmins" ? layout.menuItemActive : {}) }}
                  onClick={() => go("hospitalAdmins")}
                  title="Hospital Admins"
                >
                  <UserCheck size={18} className={`icon ${active === "hospitalAdmins" ? "icon-active" : ""}`} />
                  {settings.design.showSidebarLabels && "Hospital Admins"}
                </button>

                <button
                  style={{ ...layout.menuItem, ...(active.startsWith("settings.") ? layout.menuItemActive : {}) }}
                  onClick={() => setSettingsOpen((v) => !v)}
                  title="Settings"
                >
                  <Settings size={18} className={`icon ${active.startsWith("settings.") ? "icon-active" : ""}`} />
                  {settings.design.showSidebarLabels && "Settings"}
                  {settings.design.showSidebarLabels && <span style={{ marginLeft: "auto", opacity: 0.8 }}>
                    {settingsOpen ? "▾" : "▸"}
                  </span>}
                </button>

                {settingsOpen && (
                  <div style={layout.subMenu}>
                    <button
                      style={{ ...layout.subItem, ...(active === "settings.general" ? layout.subItemActive : {}) }}
                      onClick={() => go("settings.general")}
                    >
                      General Settings
                    </button>

                    <button
                      style={{ ...layout.subItem, ...(active === "settings.design" ? layout.subItemActive : {}) }}
                      onClick={() => go("settings.design")}
                    >
                      Design Settings
                    </button>

                    <button
                      style={{ ...layout.subItem, ...(active === "settings.adminAccounts" ? layout.subItemActive : {}) }}
                      onClick={() => go("settings.adminAccounts")}
                    >
                      Admin Accounts
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="main-admin-titleBlock" style={layout.titleBlock}>
            {settings.design.showHospitalLogo && (
              settings.design.logoUrl ? (
                <img
                  src={settings.design.logoUrl}
                  alt="Hospital logo"
                  style={layout.brandImage}
                />
              ) : (
                <div style={layout.brandBadge}>HS</div>
              )
            )}
            <div className="main-admin-titleText">
              <div style={layout.title}>{contentTitle}</div>
              <div style={layout.sub}>Health-Sphere • Main Admin Panel</div>
            </div>
          </div>
        </div>

        <div className="main-admin-actions" style={layout.actions}>
          <button 
            className="main-admin-actionBtn main-admin-actionPrimary"
            style={{
              ...layout.primaryBtn,
              ...(primaryBtnHover ? layout.primaryBtnHover : {})
            }}
            onClick={() => setShowCreateHospital(true)}
            onMouseEnter={() => setPrimaryBtnHover(true)}
            onMouseLeave={() => setPrimaryBtnHover(false)}
          >
            <Building size={18} />
            <span>Register Hospital</span>
          </button>
          <button 
            className="main-admin-actionBtn main-admin-actionSecondary"
            style={{
              ...layout.secondaryBtn,
              ...(secondaryBtnHover ? layout.secondaryBtnHover : {})
            }}
            onClick={() => setShowCreateAdmin(true)}
            onMouseEnter={() => setSecondaryBtnHover(true)}
            onMouseLeave={() => setSecondaryBtnHover(false)}
          >
            <UserPlus size={18} />
            <span>Create Hospital Admin</span>
          </button>
        </div>

        {error ? <div style={layout.errorBox}>{error}</div> : null}

        {active === "dashboard" && (
          <>
            <div style={layout.cards}>
              <div style={layout.card}>
                <div style={layout.cardLabel}>Total Hospitals</div>
                <div style={layout.cardValue}>{stats.total}</div>
              </div>
              <div style={layout.card}>
                <div style={layout.cardLabel}>Active Hospitals</div>
                <div style={layout.cardValue}>{stats.activeCount}</div>
              </div>
              <div style={layout.card}>
                <div style={layout.cardLabel}>Hospital Admins</div>
                <div style={layout.cardValue}>{admins.length}</div>
              </div>
            </div>

                      </>
        )}

        {active === "visualDashboard" && (
          <VisualMedicalDashboard hospitals={hospitals} admins={admins} />
        )}

        {active === "hospitals" && (
          <div style={layout.section}>
            <div style={layout.sectionTitle}>Hospitals</div>
            <div style={layout.sectionSub}>Enable/Disable hospitals.</div>

            {hospitalsLoading ? (
              <div style={layout.loadingBox}>Loading hospitals from Firestore...</div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <HospitalTable hospitals={hospitalsWithAdmins} onToggleStatus={handleToggleHospitalStatus} onView={setViewingHospital} />
              </div>
            )}
          </div>
        )}

        {active === "hospitalAdmins" && (
          <div style={layout.section}>
            <div style={layout.sectionTitle}>Hospital Admins</div>
            <div style={layout.sectionSub}>
              Limit per hospital: <b>{settings.maxAdminsPerHospital}</b>
            </div>

            {adminsLoading ? (
              <div style={layout.loadingBox}>Loading hospital admins...</div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <HospitalAdminsTable 
                  admins={admins} 
                  onToggleStatus={handleToggleAdminStatus} 
                  onEdit={setEditingAdmin}
                  onView={setViewingAdmin}
                  onDelete={handleDeleteAdmin}
                />
              </div>
            )}
          </div>
        )}

        {active === "settings.general" && <SettingsGeneral settings={settings} onSave={handleSaveSettings} />}
        {active === "settings.design" && <SettingsDesign settings={settings} onSave={handleSaveSettings} />}
        {active === "settings.adminAccounts" && <SettingsAdminAccounts />}

        {showCreateHospital && (
          <div style={layout.overlay} onClick={() => !savingHospital && setShowCreateHospital(false)}>
            <div style={layout.modal} onClick={(e) => e.stopPropagation()}>
              <div style={layout.modalHeader}>
                <h2 style={{ margin: 0 }}>Register Hospital</h2>
                <button style={layout.closeBtn} onClick={() => !savingHospital && setShowCreateHospital(false)}>
                  <X size={16} />
                </button>
              </div>

              <CreateHospitalForm
                hospitals={hospitals.map(h => ({ name: h.name, code: h.id.split('-')[1] || '' }))}
                onCancel={() => setShowCreateHospital(false)}
                onCreate={handleCreateHospital}
                saving={savingHospital}
              />
            </div>
          </div>
        )}

        {showCreateAdmin && (
          <div style={layout.overlay} onClick={() => !savingAdmin && setShowCreateAdmin(false)}>
            <div style={layout.modal} onClick={(e) => e.stopPropagation()}>
              <div style={layout.modalHeader}>
                <h2 style={{ margin: 0 }}>Create Hospital Admin</h2>
                <button style={layout.closeBtn} onClick={() => !savingAdmin && setShowCreateAdmin(false)}>
                  <X size={16} />
                </button>
              </div>

              <CreateHospitalAdminForm
                hospitals={hospitals.filter((h) => h.status === "ACTIVE")}
                existingAdmins={admins}
                maxAdminsPerHospital={settings.maxAdminsPerHospital}
                allowedCountryCodes={settings.allowedCountryCodes}
                onCancel={() => setShowCreateAdmin(false)}
                onCreate={handleCreateAdmin}
                saving={savingAdmin}
              />
            </div>
          </div>
        )}

        {editingAdmin && (
          <div style={layout.overlay} onClick={() => !savingAdmin && setEditingAdmin(null)}>
            <div style={layout.modal} onClick={(e) => e.stopPropagation()}>
              <div style={layout.modalHeader}>
                <h2 style={{ margin: 0 }}>Edit Hospital Admin</h2>
                <button style={layout.closeBtn} onClick={() => !savingAdmin && setEditingAdmin(null)}>
                  <X size={16} />
                </button>
              </div>

              <CreateHospitalAdminForm
                hospitals={hospitals.filter((h) => h.status === "ACTIVE")}
                existingAdmins={admins}
                maxAdminsPerHospital={settings.maxAdminsPerHospital}
                allowedCountryCodes={settings.allowedCountryCodes}
                onCancel={() => setEditingAdmin(null)}
                onCreate={handleUpdateAdmin}
                saving={savingAdmin}
                initialData={editingAdmin}
                isEditMode={true}
              />
            </div>
          </div>
        )}

        {viewingAdmin && (
          <div style={layout.overlay} onClick={() => setViewingAdmin(null)}>
            <div style={layout.modal} onClick={(e) => e.stopPropagation()}>
              <div style={layout.modalHeader}>
                <h2 style={{ margin: 0 }}>View Hospital Admin</h2>
                <button style={layout.closeBtn} onClick={() => setViewingAdmin(null)}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ padding: "16px 0" }}>
                <div style={{ marginBottom: 16 }}>
                  <strong>Admin ID:</strong>
                  <div style={{ marginTop: 4, padding: 8, background: "#f8fafc", borderRadius: 6, fontSize: 12, fontFamily: "monospace" }}>
                    {viewingAdmin.id}
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <strong>Full Name:</strong>
                  <div style={{ marginTop: 4, padding: 8, background: "#f8fafc", borderRadius: 6 }}>
                    {viewingAdmin.fullName}
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <strong>Email:</strong>
                  <div style={{ marginTop: 4, padding: 8, background: "#f8fafc", borderRadius: 6 }}>
                    {viewingAdmin.email}
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <strong>Phone:</strong>
                  <div style={{ marginTop: 4, padding: 8, background: "#f8fafc", borderRadius: 6 }}>
                    {viewingAdmin.phone}
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <strong>Hospital:</strong>
                  <div style={{ marginTop: 4, padding: 8, background: "#f8fafc", borderRadius: 6 }}>
                    {viewingAdmin.hospitalName}
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <strong>Status:</strong>
                  <div style={{ marginTop: 4 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 800,
                        border: "1px solid transparent",
                        whiteSpace: "nowrap",
                        ...(viewingAdmin.status === "ACTIVE" 
                          ? { background: "#e8fff1", color: "#067647", borderColor: "#bfe8d1" }
                          : { background: "#ffecec", color: "#b42318", borderColor: "#ffd3d3" })
                      }}
                    >
                      {viewingAdmin.status === "ACTIVE" ? "Active" : "Disabled"}
                    </span>
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <strong>Created:</strong>
                  <div style={{ marginTop: 4, padding: 8, background: "#f8fafc", borderRadius: 6 }}>
                    {viewingAdmin.createdAt}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {viewingHospitalWithAdmins && (
          <div style={layout.overlay} onClick={() => setViewingHospital(null)}>
            <div style={layout.modal} onClick={(e) => e.stopPropagation()}>
              <div style={layout.modalHeader}>
                <h2 style={{ margin: 0, color: "var(--text-primary)", fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)" }}>View Hospital</h2>
                <button style={layout.closeBtn} onClick={() => setViewingHospital(null)}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ padding: "var(--space-md) 0", color: "var(--text-primary)" }}>
                <div style={{ marginBottom: "var(--space-md)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Hospital ID:</strong>
                  <div style={{ 
                    marginTop: "var(--space-xs)", 
                    padding: "var(--space-sm)", 
                    background: "var(--bg-main)", 
                    borderRadius: "var(--radius-sm)", 
                    fontSize: "var(--font-size-sm)", 
                    fontFamily: "monospace", 
                    color: "var(--text-primary)" 
                  }}>
                    {viewingHospitalWithAdmins.id}
                  </div>
                </div>
                <div style={{ marginBottom: "var(--space-md)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Hospital Name:</strong>
                  <div style={{ 
                    marginTop: "var(--space-xs)", 
                    padding: "var(--space-sm)", 
                    background: "var(--bg-main)", 
                    borderRadius: "var(--radius-sm)", 
                    color: "var(--text-primary)" 
                  }}>
                    {viewingHospitalWithAdmins.name}
                  </div>
                </div>
                <div style={{ marginBottom: "var(--space-md)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Location:</strong>
                  <div style={{ 
                    marginTop: "var(--space-xs)", 
                    padding: "var(--space-sm)", 
                    background: "var(--bg-main)", 
                    borderRadius: "var(--radius-sm)", 
                    color: "var(--text-primary)" 
                  }}>
                    {viewingHospitalWithAdmins.location}
                  </div>
                </div>
                <div style={{ marginBottom: "var(--space-md)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Status:</strong>
                  <div style={{ marginTop: "var(--space-xs)" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "var(--space-xs) var(--space-sm)",
                        borderRadius: "var(--radius-xl)",
                        fontSize: "var(--font-size-sm)",
                        fontWeight: "var(--font-weight-semibold)",
                        border: "1px solid transparent",
                        whiteSpace: "nowrap",
                        ...(viewingHospitalWithAdmins.status === "ACTIVE" 
                          ? { background: "rgba(126, 211, 33, 0.1)", color: "var(--success)", borderColor: "rgba(126, 211, 33, 0.2)" }
                          : { background: "rgba(208, 2, 27, 0.1)", color: "var(--error)", borderColor: "rgba(208, 2, 27, 0.2)" })
                      }}
                    >
                      {viewingHospitalWithAdmins.status === "ACTIVE" ? "Active" : "Disabled"}
                    </span>
                  </div>
                </div>
                <div style={{ marginBottom: "var(--space-md)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Created:</strong>
                  <div style={{ 
                    marginTop: "var(--space-xs)", 
                    padding: "var(--space-sm)", 
                    background: "var(--bg-main)", 
                    borderRadius: "var(--radius-sm)", 
                    color: "var(--text-primary)" 
                  }}>
                    {viewingHospitalWithAdmins.createdAt}
                  </div>
                </div>
                <div style={{ marginBottom: "var(--space-md)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Assigned Admins:</strong>
                  <div style={{ marginTop: "var(--space-xs)" }}>
                    {viewingHospitalWithAdmins.assignedAdmins && viewingHospitalWithAdmins.assignedAdmins.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                        {viewingHospitalWithAdmins.assignedAdmins.map((admin) => (
                          <div key={admin.id} style={{ 
                            padding: "var(--space-sm)", 
                            background: "var(--bg-main)", 
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid rgba(74, 144, 226, 0.1)",
                            color: "var(--text-primary)"
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                              <span style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--text-primary)" }}>{admin.fullName}</span>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "var(--space-xs) var(--space-xs)",
                                  borderRadius: "var(--radius-xl)",
                                  fontSize: "var(--font-size-sm)",
                                  fontWeight: "var(--font-weight-semibold)",
                                  border: "1px solid transparent",
                                  ...(admin.status === "ACTIVE" 
                                    ? { background: "rgba(126, 211, 33, 0.1)", color: "var(--success)", borderColor: "rgba(126, 211, 33, 0.2)" }
                                    : { background: "rgba(208, 2, 27, 0.1)", color: "var(--error)", borderColor: "rgba(208, 2, 27, 0.2)" })
                                }}
                              >
                                {admin.status === "ACTIVE" ? "Active" : "Disabled"}
                              </span>
                            </div>
                            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-primary)", marginBottom: 'var(--space-xs)' }}>
                              {admin.email}
                            </div>
                            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
                              ID: {admin.id}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ 
                        padding: "var(--space-md)", 
                        background: "var(--bg-main)", 
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(74, 144, 226, 0.1)",
                        textAlign: "center",
                        color: "var(--text-secondary)"
                      }}>
                        No admins assigned to this hospital
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {confirmState && (
          <div style={layout.overlay} onClick={() => setConfirmState(null)}>
            <div style={layout.confirmModal} onClick={(e) => e.stopPropagation()}>
              <div style={layout.confirmTitle}>{confirmState.title}</div>
              <div style={layout.confirmText}>{confirmState.message}</div>
              <div style={layout.confirmActions}>
                <button style={layout.confirmCancelBtn} onClick={() => setConfirmState(null)}>
                  Cancel
                </button>
                <button
                  style={layout.confirmDeleteBtn}
                  onClick={() => {
                    void confirmState.onConfirm();
                  }}
                >
                  Yes, Continue
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const layout: Record<string, React.CSSProperties> = {
  page: { 
    minHeight: "100vh", 
    color: "var(--text-primary)",
    fontFamily: "var(--font-family)"
  },
  main: { 
    padding: "var(--space-lg)", 
    color: "var(--text-primary)"
  },
  topBar: {
    background: "var(--surface)",
    border: "1px solid rgba(74, 144, 226, 0.1)",
    borderRadius: "var(--radius-lg)",
    padding: "var(--space-md)",
    color: "var(--text-primary)",
    boxShadow: "var(--shadow-sm)",
    display: "flex",
    justifyContent: "space-between",
    gap: "var(--space-md)",
    flexWrap: "wrap",
    alignItems: "center",
  },
  topLeft: { display: "flex", alignItems: "center", gap: "var(--space-sm)" },
  titleBlock: {
    display: "grid",
    gap: "var(--space-xs)",
  },
  brandBadge: {
    width: 42,
    height: 42,
    borderRadius: "var(--radius-md)",
    background: "var(--gradient-primary)",
    color: "white",
    display: "grid",
    placeItems: "center",
    fontWeight: "var(--font-weight-bold)",
    boxShadow: "var(--shadow-sm)",
  },
  brandImage: {
    width: 42,
    height: 42,
    borderRadius: "var(--radius-md)",
    objectFit: "cover",
    background: "white",
    border: "1px solid rgba(74, 144, 226, 0.15)",
    boxShadow: "var(--shadow-sm)",
  },
  title: {
    fontSize: "var(--font-size-xl)",
    fontWeight: "var(--font-weight-bold)",
    color: "var(--text-primary)",
    marginBottom: "var(--space-xs)",
  },
  sub: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    fontWeight: "var(--font-weight-medium)",
  },
  icon: {
    width: "20px",
    height: "20px",
    color: "var(--text-secondary)",
    transition: "color 0.2s ease",
  },
  iconActive: {
    color: "var(--primary)",
  },
  menuBtn: {
    border: "1px solid var(--primary)",
    background: "var(--surface)",
    borderRadius: "12px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "18px",
    color: "var(--text-primary)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    boxShadow: "var(--shadow-sm)",
    position: "relative",
    overflow: "hidden",
  },
  menuBtnHover: {
    background: "var(--primary)",
    border: "1px solid var(--primary-dark)",
    transform: "translateY(-2px)",
    boxShadow: "var(--shadow-md)",
    color: "white",
  },
  menuBtnActive: {
    background: "var(--primary-dark)",
    border: "1px solid var(--primary-dark)",
    transform: "translateY(-1px) scale(0.95)",
    boxShadow: "var(--shadow-sm)",
    color: "white",
  },
  menu: {
    position: "absolute",
    top: 46,
    left: 0,
    width: 260,
    background: "var(--surface)",
    color: "var(--text-primary)",
    borderRadius: "var(--radius-lg)",
    border: "1px solid rgba(74, 144, 226, 0.2)",
    boxShadow: "var(--shadow-lg)",
    padding: "var(--space-sm)",
    zIndex: 10000,
  },
  menuCompact: {
    width: 72,
  },
  menuTitle: {
    fontWeight: 900,
    padding: "8px 10px",
    borderBottom: "1px solid rgba(74, 144, 226, 0.1)",
    marginBottom: 8,
  },
  menuItem: {
    width: "100%",
    display: "flex",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    cursor: "pointer",
    border: "none",
    textAlign: "left",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-size-base)",
    transition: "all 0.2s ease",
    color: "var(--text-primary)",
  },
  menuItemActive: {
    background: "var(--primary)",
    color: "white",
  },
  menuItemHover: {
    background: "rgba(74, 144, 226, 0.1)",
  },
  subMenu: {
    marginTop: "var(--space-xs)",
    paddingLeft: "var(--space-md)",
    borderLeft: "2px solid rgba(74, 144, 226, 0.2)",
  },
  subItem: {
    width: "100%",
    display: "flex",
    padding: "var(--space-sm) var(--space-md)",
    cursor: "pointer",
    border: "none",
    textAlign: "left",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-size-sm)",
    transition: "all 0.2s ease",
    color: "var(--text-secondary)",
  },
  subItemActive: {
    background: "rgba(74, 144, 226, 0.2)",
    color: "var(--text-primary)",
  },
  sidebar: {
    background: "var(--surface)",
    borderRadius: "var(--radius-lg)",
    padding: "var(--space-md)",
    boxShadow: "var(--shadow-sm)",
    border: "1px solid rgba(74, 144, 226, 0.1)",
    marginBottom: "var(--space-md)",
  },
  sidebarItem: {
    display: "block",
    width: "100%",
    padding: "var(--space-md)",
    color: "var(--text-primary)",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--font-size-base)",
    fontWeight: "var(--font-weight-medium)",
    transition: "all 0.2s ease",
    border: "1px solid transparent",
  },
  sidebarItemActive: {
    background: "var(--gradient-primary)",
    color: "white",
    borderColor: "transparent",
  },
  sidebarItemHover: {
    background: "rgba(74, 144, 226, 0.1)",
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "var(--space-md)",
    marginBottom: "var(--space-md)",
  },
  card: {
    background: "var(--surface)",
    border: "1px solid rgba(74, 144, 226, 0.1)",
    borderRadius: "var(--radius-lg)",
    padding: "var(--space-md)",
    color: "var(--text-primary)",
    boxShadow: "var(--shadow-sm)",
  },
  cardLabel: { 
    fontSize: "var(--font-size-sm)", 
    color: "var(--text-secondary)", 
    marginBottom: "var(--space-sm)" 
  },
  cardValue: { 
    fontSize: "28px", 
    fontWeight: "var(--font-weight-bold)",
    color: "var(--text-primary)"
  },
  section: {
    background: "var(--surface)",
    border: "1px solid rgba(74, 144, 226, 0.1)",
    borderRadius: "var(--radius-lg)",
    padding: "var(--space-md)",
    color: "var(--text-primary)",
    boxShadow: "var(--shadow-sm)",
    marginBottom: "var(--space-md)",
  },
  sectionTitle: { 
    fontSize: "var(--font-size-xl)", 
    fontWeight: "var(--font-weight-bold)",
    color: "var(--text-primary)"
  },
  sectionSub: { 
    marginTop: "var(--space-xs)", 
    color: "var(--text-secondary)", 
    fontWeight: "var(--font-weight-semibold)", 
    fontSize: "var(--font-size-sm)" 
  },
  loadingBox: {
    marginTop: "var(--space-sm)",
    background: "var(--surface)",
    border: "1px solid rgba(74, 144, 226, 0.1)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-md)",
    fontWeight: "var(--font-weight-semibold)",
    color: "var(--text-secondary)",
  },
  errorBox: {
    marginBottom: "var(--space-md)",
    background: "rgba(208, 2, 27, 0.05)",
    border: "1px solid rgba(208, 2, 27, 0.2)",
    color: "var(--error)",
    padding: "var(--space-sm) var(--space-md)",
    borderRadius: "var(--radius-md)",
    fontWeight: "var(--font-weight-semibold)",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "156px 24px 24px",
    zIndex: 1200,
    overflowY: "auto",
  },
  modal: {
    width: "100%",
    maxWidth: 980,
    maxHeight: "calc(100dvh - 180px)",
    background: "var(--surface)",
    borderRadius: "var(--radius-lg)",
    padding: "18px 22px 0",
    boxShadow: "var(--shadow-lg)",
    color: "var(--text-primary)",
    border: "1px solid rgba(74, 144, 226, 0.1)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  confirmModal: {
    width: "100%",
    maxWidth: 440,
    background: "var(--surface)",
    borderRadius: "var(--radius-lg)",
    padding: "var(--space-md)",
    boxShadow: "var(--shadow-lg)",
    color: "var(--text-primary)",
    border: "1px solid rgba(74, 144, 226, 0.1)",
  },
  confirmTitle: {
    fontSize: "20px",
    fontWeight: "var(--font-weight-bold)",
    marginBottom: "var(--space-xs)",
    color: "var(--text-primary)",
  },
  confirmText: {
    fontSize: "var(--font-size-base)",
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    fontWeight: "var(--font-weight-semibold)",
    marginBottom: "var(--space-md)",
  },
  confirmActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "var(--space-sm)",
    flexWrap: "wrap",
  },
  confirmCancelBtn: {
    border: "1px solid rgba(74, 144, 226, 0.2)",
    background: "var(--surface)",
    color: "var(--text-primary)",
    borderRadius: "var(--radius-md)",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "var(--font-weight-semibold)",
  },
  confirmDeleteBtn: {
    border: "none",
    background: "var(--error)",
    color: "white",
    borderRadius: "var(--radius-md)",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "var(--font-weight-semibold)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottom: "1px solid rgba(74, 144, 226, 0.1)",
    flexShrink: 0,
  },
  closeBtn: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: "var(--font-size-xl)",
    color: "var(--text-secondary)",
    padding: "var(--space-xs)",
    borderRadius: "var(--radius-sm)",
    transition: "all 0.2s ease",
  },
  actions: {
    display: "flex",
    gap: "var(--space-sm)",
    marginBottom: "var(--space-md)",
    flexWrap: "wrap",
  },
  primaryBtn: {
    background: "var(--gradient-primary)",
    color: "white",
    border: "none",
    padding: "var(--space-sm) var(--space-md)",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--font-size-base)",
    fontWeight: "var(--font-weight-semibold)",
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: "var(--shadow-sm)",
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-xs)",
  },
  primaryBtnHover: {
    background: "var(--primary-dark)",
    transform: "translateY(-1px)",
    boxShadow: "var(--shadow-md)",
  },
  secondaryBtn: {
    background: "var(--surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--primary)",
    padding: "var(--space-sm) var(--space-md)",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--font-size-base)",
    fontWeight: "var(--font-weight-semibold)",
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: "var(--shadow-sm)",
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-xs)",
  },
  secondaryBtnHover: {
    background: "var(--primary)",
    color: "white",
    transform: "translateY(-1px)",
    boxShadow: "var(--shadow-md)",
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "var(--space-md)",
    marginBottom: "var(--space-md)",
  },
};

export default MainAdminDashboard;
