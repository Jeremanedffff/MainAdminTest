import React from "react";

export type PatientRow = {
  id: string; // patientId
  hospitalId: string;
  fullName: string;
  sex: "MALE" | "FEMALE";
  age: number;
  phone: string;
  email: string;
  status: "ACTIVE" | "DISABLED";
  registeredBy: "SELF" | "RECEPTIONIST" | "ADMIN";
  createdAt: string;
};

type Props = {
  patients: PatientRow[];
  onEdit: (p: PatientRow) => void;
  onDelete: (patientId: string) => void;
};

const HospitalAdminPatientsTable: React.FC<Props> = ({ patients, onEdit, onDelete }) => {
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Patient ID</th>
          <th style={styles.th}>Full Name</th>
          <th style={styles.th}>Sex</th>
          <th style={styles.th}>Age</th>
          <th style={styles.th}>Phone</th>
          <th style={styles.th}>Email</th>
          <th style={styles.th}>Status</th>
          <th style={styles.th}>Registered</th>
          <th style={styles.th}>Created</th>
          <th style={{ ...styles.th, textAlign: "right" }}>Actions</th>
        </tr>
      </thead>

      <tbody>
        {patients.length === 0 ? (
          <tr>
            <td style={styles.empty} colSpan={10}>
              No patients found.
            </td>
          </tr>
        ) : (
          patients.map((p) => (
            <tr key={p.id} style={styles.tr}>
              <td style={styles.id}>{p.id}</td>
              <td style={styles.cellWrap}>{p.fullName}</td>
              <td style={styles.cell}>{p.sex}</td>
              <td style={styles.cell}>{p.age}</td>
              <td style={styles.cell}>{p.phone}</td>
              <td style={styles.cellWrap}>{p.email || "-"}</td>

              <td style={styles.cell}>
                <span style={{ ...styles.badge, ...(p.status === "ACTIVE" ? styles.badgeGreen : styles.badgeRed) }}>
                  {p.status === "ACTIVE" ? "Active" : "Disabled"}
                </span>
              </td>

              <td style={styles.cell}>{p.registeredBy}</td>
              <td style={styles.cell}>{p.createdAt}</td>

              <td style={{ ...styles.cell, textAlign: "right" }}>
                <div style={styles.actions}>
                  <button style={styles.smallBtn} onClick={() => onEdit(p)}>
                    Edit
                  </button>
                  <button style={styles.deleteBtn} onClick={() => onDelete(p.id)}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
};

const styles: Record<string, React.CSSProperties> = {
  table: { width: "100%", borderCollapse: "collapse", tableLayout: "auto" },
  th: {
    textAlign: "left",
    fontSize: 13,
    opacity: 0.7,
    padding: "12px 10px",
    borderBottom: "1px solid #e5eaf2",
    whiteSpace: "nowrap",
  },
  tr: { borderBottom: "1px solid #eef2f7" },
  cell: { padding: "14px 10px", verticalAlign: "top", whiteSpace: "nowrap" },
  cellWrap: {
    padding: "14px 10px",
    verticalAlign: "top",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    lineHeight: 1.35,
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
    fontWeight: 900,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  },
  badgeGreen: { background: "#e8fff1", color: "#067647", borderColor: "#bfe8d1" },
  badgeRed: { background: "#ffecec", color: "#b42318", borderColor: "#ffd3d3" },
  actions: { display: "inline-flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" },
  smallBtn: {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: "8px 12px",
    borderRadius: 10,
    fontWeight: 900,
    cursor: "pointer",
  },
  deleteBtn: {
    border: "1px solid #fb7185",
    background: "#fff1f2",
    color: "#be123c",
    padding: "8px 12px",
    borderRadius: 10,
    fontWeight: 900,
    cursor: "pointer",
  },
  empty: { padding: 16, fontWeight: 800, opacity: 0.7 },
};

export default HospitalAdminPatientsTable;