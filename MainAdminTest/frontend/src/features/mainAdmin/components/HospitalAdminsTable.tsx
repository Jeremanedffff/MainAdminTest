import React, { useMemo, useState } from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";

export type HospitalAdminRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  hospitalId: string;
  hospitalName: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
};

type Props = {
  admins: HospitalAdminRow[];
  onToggleStatus: (adminId: string) => void;
  onEdit: (admin: HospitalAdminRow) => void;
  onView: (admin: HospitalAdminRow) => void;
  onDelete: (id: string) => void;
};

const HospitalAdminsTable: React.FC<Props> = ({
  admins,
  onToggleStatus,
  onEdit,
  onView,
  onDelete,
}) => {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return admins;
    return admins.filter((a) => {
      return (
        a.id.toLowerCase().includes(s) ||
        a.fullName.toLowerCase().includes(s) ||
        a.email.toLowerCase().includes(s) ||
        a.phone.toLowerCase().includes(s) ||
        a.hospitalName.toLowerCase().includes(s) ||
        a.status.toLowerCase().includes(s) ||
        a.createdAt.toLowerCase().includes(s)
      );
    });
  }, [admins, q]);

  return (
    <div>
      <input
        style={styles.search}
        placeholder="Search admin (id, name, email, hospital, status)..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div style={{ marginTop: 12 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Admin ID</th>
              <th style={styles.th}>Full Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Phone</th>
              <th style={styles.th}>Hospital</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Created</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td style={styles.empty} colSpan={8}>
                  No admins found.
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id} style={styles.tr}>
                  <td style={styles.id}>{a.id}</td>
                  <td style={styles.cell}>{a.fullName}</td>
                  <td style={styles.wrapCell}>{a.email}</td>
                  <td style={styles.cell}>{a.phone}</td>
                  <td style={styles.wrapCell}>{a.hospitalName}</td>
                  <td style={styles.cell}>
                    <span
                      style={{
                        ...styles.badge,
                        ...(a.status === "ACTIVE" ? styles.badgeGreen : styles.badgeRed),
                      }}
                    >
                      {a.status === "ACTIVE" ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td style={styles.cell}>{a.createdAt}</td>
                  <td style={{ ...styles.cell, textAlign: "right" }}>
                    <div style={styles.actions}>
                      <button style={styles.viewBtn} onClick={() => onView(a)}>
                        <span style={styles.btnContent}>
                          <Eye size={14} />
                          View
                        </span>
                      </button>

                      <button style={styles.editBtn} onClick={() => onEdit(a)}>
                        <span style={styles.btnContent}>
                          <Pencil size={14} />
                          Edit
                        </span>
                      </button>

                      <button style={styles.deleteBtn} onClick={() => onDelete(a.id)}>
                        <span style={styles.btnContent}>
                          <Trash2 size={14} />
                          Delete
                        </span>
                      </button>

                      <button
                        style={a.status === "ACTIVE" ? styles.disableBtn : styles.enableBtn}
                        onClick={() => onToggleStatus(a.id)}
                      >
                        {a.status === "ACTIVE" ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  search: {
    width: "100%",
    maxWidth: 520,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #cfd7e3",
    outline: "none",
    fontSize: 14,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "auto",
  },
  th: {
    textAlign: "left",
    fontSize: 13,
    opacity: 0.7,
    padding: "12px 10px",
    borderBottom: "1px solid #e5eaf2",
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: "1px solid #eef2f7",
  },
  cell: {
    padding: "14px 10px",
    verticalAlign: "top",
    fontSize: 14,
    color: "#000000",
    whiteSpace: "nowrap",
  },
  wrapCell: {
    padding: "14px 10px",
    verticalAlign: "top",
    fontSize: 14,
    color: "#000000",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    lineHeight: 1.35,
    maxWidth: 240,
  },
  id: {
    padding: "14px 10px",
    verticalAlign: "top",
    fontSize: 12,
    color: "#1f7ae0",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    whiteSpace: "nowrap",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  },
  badgeGreen: {
    background: "#e8fff1",
    color: "#067647",
    borderColor: "#bfe8d1",
  },
  badgeRed: {
    background: "#ffecec",
    color: "#b42318",
    borderColor: "#ffd3d3",
  },
  actions: {
    display: "inline-flex",
    gap: 8,
    justifyContent: "flex-end",
    alignItems: "center",
    flexWrap: "wrap",
  },
  btnContent: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    lineHeight: 1,
    color: "inherit",
  },
  viewBtn: {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: "8px 10px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 12,
  },
  editBtn: {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: "8px 10px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 12,
    color: "#1f7ae0",
  },
  deleteBtn: {
    border: "1px solid #fca5a5",
    background: "#fff5f5",
    color: "#b91c1c",
    padding: "8px 10px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 12,
  },
  disableBtn: {
    border: "1px solid #fca5a5",
    background: "#fff5f5",
    color: "#b91c1c",
    padding: "8px 10px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 12,
  },
  enableBtn: {
    border: "1px solid #86efac",
    background: "#f0fdf4",
    color: "#15803d",
    padding: "8px 10px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 12,
  },
  empty: {
    padding: 16,
    fontWeight: 700,
    opacity: 0.7,
  },
};

export default HospitalAdminsTable;
