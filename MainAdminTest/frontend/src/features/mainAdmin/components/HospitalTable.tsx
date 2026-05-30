import React, { useMemo, useState } from "react";

export type HospitalStatus = "ACTIVE" | "DISABLED";

export type HospitalRow = {
  id: string;
  name: string;
  location: string;
  status: HospitalStatus;
  createdAt: string; // YYYY-MM-DD
  assignedAdmins?: Array<{
    id: string;
    fullName: string;
    email: string;
    status: "ACTIVE" | "DISABLED";
  }>;
};

type Props = {
  hospitals: HospitalRow[];
  onToggleStatus: (hospitalId: string, nextStatus: HospitalStatus) => void;
  onView: (hospital: HospitalRow) => void;
};

const HospitalTable: React.FC<Props> = ({ hospitals, onToggleStatus, onView }) => {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return hospitals;
    return hospitals.filter(
      (h) =>
        h.id.toLowerCase().includes(s) ||
        h.name.toLowerCase().includes(s) ||
        h.location.toLowerCase().includes(s) ||
        h.status.toLowerCase().includes(s) ||
        (h.assignedAdmins?.some(admin =>
          admin.fullName.toLowerCase().includes(s) ||
          admin.email.toLowerCase().includes(s)
        ) || false)
    );
  }, [hospitals, q]);

  return (
    <div>
      <div style={styles.topRow}>
        <input
          style={styles.search}
          placeholder="Search hospital (id, name, location, status, admin name/email)..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Hospital ID</th>
              <th style={styles.th}>Hospital</th>
              <th style={styles.th}>Location</th>
              <th style={styles.th}>Assigned Admins</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Created</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={7}>
                  No hospitals found.
                </td>
              </tr>
            ) : (
              filtered.map((h) => {
                const nextStatus: HospitalStatus =
                  h.status === "ACTIVE" ? "DISABLED" : "ACTIVE";

                return (
                  <tr key={h.id}>
                    <td style={styles.tdMono}>{h.id}</td>
                    <td style={styles.td}>{h.name}</td>
                    <td style={styles.td}>{h.location}</td>
                    <td style={styles.td}>
                      {h.assignedAdmins && h.assignedAdmins.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xxs)' }}>
                          {h.assignedAdmins.map((admin, index) => (
                            <div key={admin.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xxs)' }}>
                              <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: admin.status === 'ACTIVE' ? 'var(--success)' : 'var(--error)'
                              }} />
                              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                                {admin.fullName}
                              </span>
                              {h.assignedAdmins && h.assignedAdmins.length > 1 && index === 0 && (
                                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                                  (+{h.assignedAdmins.length - 1} more)
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          No admins assigned to this hospital
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...(h.status === "ACTIVE" ? styles.active : styles.disabled),
                        }}
                      >
                        {h.status === "ACTIVE" ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td style={styles.td}>{h.createdAt}</td>
                    <td style={styles.td}>
                      <button
                        style={styles.smallBtn}
                        onClick={() => onView(h)}
                      >
                        View
                      </button>

                      <button
                        style={{
                          ...styles.smallBtn,
                          marginLeft: "var(--space-xs)",
                          borderColor: h.status === "ACTIVE" ? "var(--error)" : "var(--success)",
                          backgroundColor: h.status === "ACTIVE" ? "rgba(208, 2, 27, 0.1)" : "rgba(126, 211, 33, 0.1)",
                          color: h.status === "ACTIVE" ? "var(--error)" : "var(--success)",
                        }}
                        onClick={() => onToggleStatus(h.id, nextStatus)}
                      >
                        {h.status === "ACTIVE" ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  topRow: { display: "flex", justifyContent: "space-between", marginBottom: "var(--space-sm)" },
  search: {
    width: "100%",
    maxWidth: 420,
    padding: "var(--space-sm) var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid rgba(74, 144, 226, 0.2)",
    outline: "none",
    background: "var(--surface)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-base)",
    fontFamily: "var(--font-family)",
  },
  tableWrap: { width: "100%", overflowX: "auto" },
  table: { 
    width: "100%", 
    borderCollapse: "collapse",
    background: "var(--surface)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
    boxShadow: "var(--shadow-sm)",
  },
  th: {
    textAlign: "left",
    padding: "var(--space-sm) var(--space-sm)",
    borderBottom: "1px solid rgba(74, 144, 226, 0.1)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-semibold)",
    background: "var(--gradient-primary)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "white",
  },
  td: { 
    padding: "var(--space-sm) var(--space-sm)", 
    borderBottom: "1px solid rgba(74, 144, 226, 0.1)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-base)",
  },
  tdMono: {
    padding: "var(--space-sm) var(--space-sm)",
    borderBottom: "1px solid rgba(74, 144, 226, 0.1)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
  },
  smallBtn: {
    border: "1px solid var(--primary)",
    background: "var(--surface)",
    borderRadius: "var(--radius-sm)",
    padding: "var(--space-xs) var(--space-sm)",
    cursor: "pointer",
    fontWeight: "var(--font-weight-medium)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
    transition: "all 0.2s ease",
  },
  badge: {
    padding: "var(--space-xs) var(--space-sm)",
    borderRadius: "var(--radius-xl)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-semibold)",
    border: "1px solid transparent",
    display: "inline-block",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  active: { 
    background: "rgba(126, 211, 33, 0.1)", 
    borderColor: "rgba(126, 211, 33, 0.2)", 
    color: "var(--success)" 
  },
  disabled: { 
    background: "rgba(208, 2, 27, 0.1)", 
    borderColor: "rgba(208, 2, 27, 0.2)", 
    color: "var(--error)" 
  },
};

export default HospitalTable;