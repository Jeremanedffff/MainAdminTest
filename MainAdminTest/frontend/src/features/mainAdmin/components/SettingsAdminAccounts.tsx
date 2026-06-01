import React, { useState } from "react";
import { Plus, Key, Shield, Activity, Eye, EyeOff, User, Trash2, RefreshCw, Check, CircleX } from "lucide-react";
import { lettersOnlyInput, validateMeaningfulLetters } from "../../../utils/formValidation";

interface AdminAccount {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "VIEWER";
  createdAt: string;
  lastLogin?: string;
  status: "ACTIVE" | "INACTIVE";
}

interface ActivityLog {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  timestamp: string;
  details: string;
}

const SettingsAdminAccounts = () => {
  const [activeTab, setActiveTab] = useState<"accounts" | "roles" | "logs">("accounts");
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminAccount | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [adminFormError, setAdminFormError] = useState("");
  
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  const [newAdmin, setNewAdmin] = useState({
    name: "",
    email: "",
    role: "ADMIN" as "SUPER_ADMIN" | "ADMIN" | "VIEWER",
    password: ""
  });

  const handleAddAdmin = () => {
    const nameWarning = validateMeaningfulLetters(newAdmin.name, "Admin name", { minWords: 2 });
    if (nameWarning) {
      setAdminFormError(nameWarning);
      return;
    }

    if (newAdmin.name && newAdmin.email && newAdmin.password) {
      setAdminFormError("");
      const admin: AdminAccount = {
        id: Date.now().toString(),
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
        createdAt: new Date().toISOString(),
        status: "ACTIVE"
      };
      
      setAdminAccounts([...adminAccounts, admin]);
      
      const log: ActivityLog = {
        id: Date.now().toString(),
        adminId: "1",
        adminName: "Authenticated admin",
        action: "CREATE_ADMIN",
        timestamp: new Date().toISOString(),
        details: `Created new admin account: ${newAdmin.email}`
      };
      setActivityLogs([log, ...activityLogs]);
      
      setNewAdmin({ name: "", email: "", role: "ADMIN", password: "" });
      setShowAddAdmin(false);
    } else {
      setAdminFormError("Name, email, and password are required.");
    }
  };

  const handleResetPassword = (admin: AdminAccount) => {
    setSelectedAdmin(admin);
    setShowPasswordReset(true);
  };

  const confirmPasswordReset = () => {
    if (selectedAdmin) {
      const log: ActivityLog = {
        id: Date.now().toString(),
        adminId: "1",
        adminName: "Authenticated admin",
        action: "PASSWORD_RESET",
        timestamp: new Date().toISOString(),
        details: `Password reset for ${selectedAdmin.email}`
      };
      setActivityLogs([log, ...activityLogs]);
      setShowPasswordReset(false);
      setSelectedAdmin(null);
    }
  };

  const handleDeleteAdmin = (adminId: string) => {
    const admin = adminAccounts.find(a => a.id === adminId);
    if (admin) {
      setAdminAccounts(adminAccounts.filter(a => a.id !== adminId));
      const log: ActivityLog = {
        id: Date.now().toString(),
        adminId: "1",
        adminName: "Authenticated admin", 
        action: "DELETE_ADMIN",
        timestamp: new Date().toISOString(),
        details: `Deleted admin account: ${admin.email}`
      };
      setActivityLogs([log, ...activityLogs]);
    }
  };

  const handleRoleChange = (adminId: string, newRole: "SUPER_ADMIN" | "ADMIN" | "VIEWER") => {
    const admin = adminAccounts.find(a => a.id === adminId);
    if (admin) {
      setAdminAccounts(adminAccounts.map(a => 
        a.id === adminId ? { ...a, role: newRole } : a
      ));
      const log: ActivityLog = {
        id: Date.now().toString(),
        adminId: "1",
        adminName: "Authenticated admin",
        action: "ROLE_CHANGE",
        timestamp: new Date().toISOString(),
        details: `Changed role for ${admin.email} from ${admin.role} to ${newRole}`
      };
      setActivityLogs([log, ...activityLogs]);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Admin Accounts</h2>
        <p style={styles.sub}>
          This page is for managing system-level admins (Main Admin accounts).
        </p>

        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(activeTab === "accounts" ? styles.tabActive : {}) }}
            onClick={() => setActiveTab("accounts")}
          >
            <User size={16} style={{ marginRight: 6 }} />
            Accounts
          </button>
          <button
            style={{ ...styles.tab, ...(activeTab === "roles" ? styles.tabActive : {}) }}
            onClick={() => setActiveTab("roles")}
          >
            <Shield size={16} style={{ marginRight: 6 }} />
            Roles
          </button>
          <button
            style={{ ...styles.tab, ...(activeTab === "logs" ? styles.tabActive : {}) }}
            onClick={() => setActiveTab("logs")}
          >
            <Activity size={16} style={{ marginRight: 6 }} />
            Activity Logs
          </button>
        </div>

        {activeTab === "accounts" && (
          <div>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}>Admin Accounts</h3>
              <button
                style={styles.btnAdd}
                onClick={() => setShowAddAdmin(true)}
              >
                <Plus size={16} style={{ marginRight: 6 }} />
                Add Admin
              </button>
            </div>

            <div style={styles.accountsList}>
              {adminAccounts.map((admin) => (
                <div key={admin.id} style={styles.accountCard}>
                  <div style={styles.accountInfo}>
                    <div style={styles.accountName}>{admin.name}</div>
                    <div style={styles.accountEmail}>{admin.email}</div>
                    <div style={styles.accountMeta}>
                      <span style={{ ...styles.roleBadge, ...styles[admin.role] }}>
                        {admin.role.replace("_", " ")}
                      </span>
                      <span style={styles.statusBadge}>
                        {admin.status}
                      </span>
                      <span style={styles.createdDate}>
                        Created {new Date(admin.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div style={styles.accountActions}>
                    <button
                      style={styles.btnAction}
                      onClick={() => handleResetPassword(admin)}
                      title="Reset Password"
                    >
                      <Key size={14} />
                    </button>
                    <button
                      style={styles.btnAction}
                      onClick={() => handleRoleChange(admin.id, "SUPER_ADMIN")}
                      title="Change Role"
                    >
                      <Shield size={14} />
                    </button>
                    <button
                      style={styles.btnAction}
                      onClick={() => handleDeleteAdmin(admin.id)}
                      title="Delete Admin"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "roles" && (
          <div>
            <h3 style={styles.sectionTitle}>Role Management</h3>
            <div style={styles.rolesGrid}>
              <div style={styles.roleCard}>
                <div style={styles.roleHeader}>
                  <Shield size={20} style={styles.roleIcon} />
                  <div>
                    <div style={styles.roleName}>Super Admin</div>
                    <div style={styles.roleDesc}>Full system access</div>
                  </div>
                </div>
                <div style={styles.rolePermissions}>
                  <div style={styles.permission}><Check size={14} />Manage all admin accounts</div>
                  <div style={styles.permission}><Check size={14} />System settings</div>
                  <div style={styles.permission}><Check size={14} />Hospital management</div>
                  <div style={styles.permission}><Check size={14} />Full access to all features</div>
                </div>
              </div>

              <div style={styles.roleCard}>
                <div style={styles.roleHeader}>
                  <Shield size={20} style={styles.roleIcon} />
                  <div>
                    <div style={styles.roleName}>Admin</div>
                    <div style={styles.roleDesc}>Hospital management</div>
                  </div>
                </div>
                <div style={styles.rolePermissions}>
                  <div style={styles.permission}><Check size={14} />Manage hospital settings</div>
                  <div style={styles.permission}><Check size={14} />View reports and analytics</div>
                  <div style={styles.permission}><Check size={14} />Manage staff accounts</div>
                  <div style={styles.permission}><CircleX size={14} />Cannot manage other admins</div>
                </div>
              </div>

              <div style={styles.roleCard}>
                <div style={styles.roleHeader}>
                  <Shield size={20} style={styles.roleIcon} />
                  <div>
                    <div style={styles.roleName}>Viewer</div>
                    <div style={styles.roleDesc}>Read-only access</div>
                  </div>
                </div>
                <div style={styles.rolePermissions}>
                  <div style={styles.permission}><Check size={14} />View dashboard and reports</div>
                  <div style={styles.permission}><Check size={14} />View hospital data</div>
                  <div style={styles.permission}><CircleX size={14} />Cannot make changes</div>
                  <div style={styles.permission}><CircleX size={14} />No access to settings</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "logs" && (
          <div>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}>Activity Logs</h3>
              <button style={styles.btnRefresh}>
                <RefreshCw size={14} style={{ marginRight: 4 }} />
                Refresh
              </button>
            </div>

            <div style={styles.logsList}>
              {activityLogs.map((log) => (
                <div key={log.id} style={styles.logEntry}>
                  <div style={styles.logHeader}>
                    <span style={styles.logAction}>{log.action}</span>
                    <span style={styles.logTime}>
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div style={styles.logDetails}>
                    <strong>{log.adminName}</strong>: {log.details}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Admin Modal */}
      {showAddAdmin && (
        <div style={styles.overlay}>
          <div className="animated-form-surface" style={styles.modal}>
            <h3 style={styles.modalTitle}>Add New Admin</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Name</label>
              <input
                type="text"
                style={styles.input}
                value={newAdmin.name}
                onChange={(e) => setNewAdmin({ ...newAdmin, name: lettersOnlyInput(e.target.value) })}
                placeholder="Enter admin name"
              />
            </div>
            {adminFormError ? <div style={styles.formError}>{adminFormError}</div> : null}
            <div style={styles.formGroup}>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                style={styles.input}
                value={newAdmin.email}
                onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                placeholder="Enter email address"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Role</label>
              <select
                style={styles.input}
                value={newAdmin.role}
                onChange={(e) => setNewAdmin({ ...newAdmin, role: e.target.value as any })}
              >
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="ADMIN">Admin</option>
                <option value="VIEWER">Viewer</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Password</label>
              <div style={styles.passwordInput}>
                <input
                  type={showPassword ? "text" : "password"}
                  style={{ ...styles.input, flex: 1 }}
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  style={styles.passwordToggle}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div style={styles.modalActions}>
              <button
                style={styles.btnCancel}
                onClick={() => setShowAddAdmin(false)}
              >
                Cancel
              </button>
              <button
                style={styles.btnPrimary}
                onClick={handleAddAdmin}
              >
                Add Admin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordReset && selectedAdmin && (
        <div style={styles.overlay}>
          <div className="animated-form-surface" style={styles.modal}>
            <h3 style={styles.modalTitle}>Reset Password</h3>
            <p style={styles.modalText}>
              Are you sure you want to reset the password for <strong>{selectedAdmin.email}</strong>?
            </p>
            <p style={styles.modalText}>
              A temporary password will be generated and sent to their email.
            </p>
            <div style={styles.modalActions}>
              <button
                style={styles.btnCancel}
                onClick={() => setShowPasswordReset(false)}
              >
                Cancel
              </button>
              <button
                onClick={confirmPasswordReset}
              >
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 24,
    maxWidth: 1100,
    margin: "0 auto",
  },
  card: {
    border: "1px solid #e5eaf2",
    borderRadius: 14,
    padding: 24,
    background: "white",
    boxShadow: "0 8px 26px rgba(15, 23, 42, 0.06)",
  },
  title: { margin: 0, fontSize: 24, fontWeight: 700, color: "#1e293b" },
  sub: { margin: "6px 0 20px 0", opacity: 0.75, fontSize: 14 },
  note: {
    background: "#f8fafc",
    border: "1px solid #e5eaf2",
    borderRadius: 12,
    padding: 12,
    fontWeight: 700,
    opacity: 0.85,
  },
  tabs: {
    display: "flex",
    gap: 8,
    borderBottom: "1px solid #e5eaf2",
    marginBottom: 24,
  },
  tab: {
    padding: "12px 16px",
    border: "none",
    background: "none",
    cursor: "pointer",
    borderRadius: "8px 8px 0 0",
    fontSize: 14,
    fontWeight: 500,
    color: "#64748b",
    display: "flex",
    alignItems: "center",
    transition: "all 0.2s ease",
  },
  tabActive: {
    background: "var(--primary, #4a90e2)",
    color: "white",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "#1e293b",
  },
  btnAdd: {
    padding: "8px 16px",
    background: "var(--primary, #4a90e2)",
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    transition: "all 0.2s ease",
  },
  accountsList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  accountCard: {
    border: "1px solid #e5eaf2",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    transition: "all 0.2s ease",
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: 600,
    color: "#1e293b",
    marginBottom: 4,
  },
  accountEmail: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 8,
  },
  accountMeta: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  roleBadge: {
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
  },
  SUPER_ADMIN: {
    background: "#fef3c7",
    color: "#92400e",
  },
  ADMIN: {
    background: "#dbeafe",
    color: "#1e40af",
  },
  VIEWER: {
    background: "#f3f4f6",
    color: "#374151",
  },
  statusBadge: {
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    background: "#dcfce7",
    color: "#166534",
  },
  createdDate: {
    fontSize: 12,
    color: "#94a3b8",
  },
  accountActions: {
    display: "flex",
    gap: 8,
  },
  btnAction: {
    padding: "8px",
    border: "1px solid #e5eaf2",
    background: "white",
    borderRadius: 6,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
    color: "#64748b",
  },
  rolesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 16,
  },
  roleCard: {
    border: "1px solid #e5eaf2",
    borderRadius: 12,
    padding: 20,
    background: "white",
  },
  roleHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  roleIcon: {
    color: "var(--primary, #4a90e2)",
  },
  roleName: {
    fontSize: 18,
    fontWeight: 600,
    color: "#1e293b",
    marginBottom: 2,
  },
  roleDesc: {
    fontSize: 14,
    color: "#64748b",
  },
  rolePermissions: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  permission: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    color: "#374151",
    fontWeight: 600,
    lineHeight: 1.35,
  },
  btnRefresh: {
    padding: "8px 12px",
    border: "1px solid #e5eaf2",
    background: "white",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    transition: "all 0.2s ease",
  },
  logsList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: 400,
    overflowY: "auto",
  },
  logEntry: {
    border: "1px solid #e5eaf2",
    borderRadius: 8,
    padding: 12,
    background: "#f8fafc",
  },
  logHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  logAction: {
    padding: "2px 6px",
    background: "var(--primary, #4a90e2)",
    color: "white",
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
  },
  logTime: {
    fontSize: 12,
    color: "#94a3b8",
  },
  logDetails: {
    fontSize: 14,
    color: "#374151",
  },
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "white",
    borderRadius: 12,
    padding: 24,
    width: "90%",
    maxWidth: 480,
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
  },
  modalTitle: {
    margin: "0 0 20px 0",
    fontSize: 20,
    fontWeight: 600,
    color: "#1e293b",
  },
  modalText: {
    margin: "0 0 16px 0",
    fontSize: 14,
    color: "#374151",
    lineHeight: 1.5,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 14,
    fontWeight: 500,
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
    transition: "border-color 0.2s ease",
  },
  formError: {
    background: "#fff1f2",
    border: "1px solid #ffd3d3",
    color: "#b42318",
    padding: "10px 12px",
    borderRadius: 8,
    fontWeight: 700,
    marginBottom: 12,
  },
  passwordInput: {
    display: "flex",
    gap: 8,
  },
  passwordToggle: {
    padding: "10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    background: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#64748b",
  },
  modalActions: {
    display: "flex",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 24,
  },
  btnCancel: {
    padding: "10px 16px",
    border: "1px solid #d1d5db",
    background: "white",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    color: "#374151",
  },
  btnPrimary: {
    padding: "10px 16px",
    background: "var(--primary, #4a90e2)",
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  },
};

export default SettingsAdminAccounts;

