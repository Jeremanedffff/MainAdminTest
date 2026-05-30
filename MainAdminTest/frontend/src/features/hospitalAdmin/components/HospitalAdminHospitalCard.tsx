import React from "react";
import { Pencil } from "lucide-react";
import type { HospitalRow } from "../../mainAdmin/components/HospitalTable";

type Props = {
  hospital: HospitalRow;
  onEdit: () => void;
};

const HospitalAdminHospitalCard: React.FC<Props> = ({ hospital, onEdit }) => {
  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>{hospital.name}</div>
          <div style={styles.sub}>
            Hospital ID: <b>{hospital.id}</b> | Location: <b>{hospital.location}</b>
          </div>
          <div style={styles.sub}>
            Created: <b>{hospital.createdAt}</b>
          </div>
        </div>

        <div style={styles.right}>
          <span style={styles.badge}>{hospital.status === "ACTIVE" ? "Active" : "Disabled"}</span>
          <button style={styles.btn} onClick={onEdit}>
            <span style={styles.btnContent}>
              <Pencil size={14} />
              Edit Hospital Info
            </span>
          </button>
        </div>
      </div>

      <div style={styles.note}>
        Hospital Admin cannot delete or disable hospitals. Only updates hospital information.
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  title: { fontSize: 20, fontWeight: 900, color: "#0f172a" },
  sub: { marginTop: 6, fontSize: 13, opacity: 0.8, fontWeight: 700 },
  right: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    background: "#e8fff1",
    color: "#067647",
    border: "1px solid #bfe8d1",
    whiteSpace: "nowrap",
  },
  btn: {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  btnContent: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  note: { marginTop: 12, fontSize: 12, opacity: 0.75, fontWeight: 800 },
};

export default HospitalAdminHospitalCard;
