import React from "react";
import { Building2, GalleryHorizontalEnd, Home, Settings, UserCog } from "lucide-react";

export type SidebarItemKey =
  | "dashboard"
  | "visualDashboard"
  | "hospitals"
  | "hospitalAdmins"
  | "settings.general"
  | "settings.design"
  | "settings.adminAccounts";

type Props = {
  active: SidebarItemKey;
  onNavigate: (key: SidebarItemKey) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  collapsed: boolean;
};

const Sidebar: React.FC<Props> = ({
  active,
  onNavigate,
  settingsOpen,
  setSettingsOpen,
  collapsed,
}) => {
  return (
    <aside style={{ ...styles.sidebar, ...(collapsed ? styles.sidebarCollapsed : {}) }}>
      <div style={styles.brand}>
        <div style={styles.logo}>HS</div>

        {!collapsed && (
          <div>
            <div style={styles.brandTitle}>Health-Sphere</div>
            <div style={styles.brandSub}>Main Admin</div>
          </div>
        )}
      </div>

      <nav style={styles.nav}>
        <button
          style={{ ...styles.item, ...(active === "dashboard" ? styles.itemActive : {}) }}
          onClick={() => onNavigate("dashboard")}
          title={collapsed ? "Dashboard" : undefined}
        >
          <span style={styles.icon}>
            <Home size={18} />
          </span>
          {!collapsed && <span>Dashboard</span>}
        </button>

        <button
          style={{ ...styles.item, ...(active === "visualDashboard" ? styles.itemActive : {}) }}
          onClick={() => onNavigate("visualDashboard")}
          title={collapsed ? "Visual Dashboard" : undefined}
        >
          <span style={styles.icon}>
            <GalleryHorizontalEnd size={18} />
          </span>
          {!collapsed && <span>Visual Dashboard</span>}
        </button>

        <button
          style={{ ...styles.item, ...(active === "hospitals" ? styles.itemActive : {}) }}
          onClick={() => onNavigate("hospitals")}
          title={collapsed ? "Hospitals" : undefined}
        >
          <span style={styles.icon}>
            <Building2 size={18} />
          </span>
          {!collapsed && <span>Hospitals</span>}
        </button>

        <button
          style={{ ...styles.item, ...(active === "hospitalAdmins" ? styles.itemActive : {}) }}
          onClick={() => onNavigate("hospitalAdmins")}
          title={collapsed ? "Hospital Admins" : undefined}
        >
          <span style={styles.icon}>
            <UserCog size={18} />
          </span>
          {!collapsed && <span>Hospital Admins</span>}
        </button>

        <button
          style={{
            ...styles.item,
            ...(active.startsWith("settings.") ? styles.itemActive : {}),
          }}
          onClick={() => setSettingsOpen(!settingsOpen)}
          title={collapsed ? "Settings" : undefined}
        >
          <span style={styles.icon}>
            <Settings size={18} />
          </span>

          {!collapsed && (
            <>
              <span style={{ flex: 1, textAlign: "left" }}>Settings</span>
              <span style={styles.chev}>{settingsOpen ? "v" : ">"}</span>
            </>
          )}
        </button>

        {!collapsed && settingsOpen && (
          <div style={styles.subMenu}>
            <button
              style={{
                ...styles.subItem,
                ...(active === "settings.general" ? styles.subItemActive : {}),
              }}
              onClick={() => onNavigate("settings.general")}
            >
              General Settings
            </button>

            <button
              style={{
                ...styles.subItem,
                ...(active === "settings.design" ? styles.subItemActive : {}),
              }}
              onClick={() => onNavigate("settings.design")}
            >
              Design Settings
            </button>

            <button
              style={{
                ...styles.subItem,
                ...(active === "settings.adminAccounts" ? styles.subItemActive : {}),
              }}
              onClick={() => onNavigate("settings.adminAccounts")}
            >
              Admin Accounts
            </button>
          </div>
        )}
      </nav>

      {!collapsed && (
        <div style={styles.footer}>
          <div style={styles.small}>Signed in as</div>
          <div style={styles.user}>Main Admin</div>
        </div>
      )}
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 260,
    minHeight: "100vh",
    background: "#0f172a",
    color: "white",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    transition: "width 0.2s ease",
  },
  sidebarCollapsed: {
    width: 78,
  },
  brand: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    padding: "10px 10px 14px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: "rgba(255,255,255,0.12)",
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    flexShrink: 0,
  },
  brandTitle: { fontWeight: 900, letterSpacing: 0.2 },
  brandSub: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  nav: { display: "grid", gap: 6, marginTop: 10 },
  item: {
    width: "100%",
    display: "flex",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    color: "white",
    fontWeight: 800,
    textAlign: "left",
  },
  itemActive: {
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.18)",
  },
  icon: {
    width: 28,
    height: 28,
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    borderRadius: 8,
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.92)",
    flexShrink: 0,
  },
  chev: { opacity: 0.8 },
  subMenu: {
    marginLeft: 10,
    borderLeft: "2px solid rgba(255,255,255,0.10)",
    paddingLeft: 10,
    display: "grid",
    gap: 6,
    marginBottom: 6,
  },
  subItem: {
    width: "100%",
    padding: "9px 10px",
    borderRadius: 10,
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.06)",
    background: "transparent",
    color: "rgba(255,255,255,0.86)",
    fontWeight: 800,
    textAlign: "left",
    fontSize: 13,
  },
  subItemActive: {
    background: "rgba(31,122,224,0.35)",
    border: "1px solid rgba(31,122,224,0.55)",
    color: "white",
  },
  footer: {
    marginTop: "auto",
    padding: 12,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  small: { fontSize: 12, opacity: 0.75 },
  user: { fontWeight: 900, marginTop: 4 },
};

export default Sidebar;
