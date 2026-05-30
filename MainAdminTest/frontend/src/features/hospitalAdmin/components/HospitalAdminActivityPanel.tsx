import React, { useMemo, useState } from "react";

export type ActivityScope = "TODAY" | "WEEK" | "MONTH" | "YEAR";

export type ActivityType =
  | "HOSPITAL_UPDATED"
  | "WORKER_CREATED"
  | "WORKER_UPDATED"
  | "WORKER_DELETED"
  | "PATIENT_UPDATED"
  | "PATIENT_DELETED";

export type ActivityItem = {
  id: string;
  hospitalId: string;
  type: ActivityType;
  title: string;
  details: string;
  createdAtISO: string; // "2026-03-04T12:34:00.000Z"
};

type Props = {
  hospitalId: string;
  items: ActivityItem[];
};

function startOfToday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date) {
  // Week starts Monday
  const x = startOfToday(d);
  const day = x.getDay(); // Sun=0, Mon=1, ...
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d: Date) {
  const x = startOfToday(d);
  x.setDate(1);
  return x;
}

function startOfYear(d: Date) {
  const x = startOfToday(d);
  x.setMonth(0, 1);
  return x;
}

function withinScope(iso: string, scope: ActivityScope) {
  const now = new Date();
  const t = new Date(iso);

  let start: Date;
  if (scope === "TODAY") start = startOfToday(now);
  else if (scope === "WEEK") start = startOfWeek(now);
  else if (scope === "MONTH") start = startOfMonth(now);
  else start = startOfYear(now);

  return t.getTime() >= start.getTime() && t.getTime() <= now.getTime();
}

function niceTime(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

const badgeStyle = (type: ActivityType): React.CSSProperties => {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  };

  if (type.includes("DELETED")) return { ...base, background: "#fff1f2", color: "#be123c", borderColor: "#fecdd3" };
  if (type.includes("UPDATED")) return { ...base, background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" };
  return { ...base, background: "#ecfdf5", color: "#067647", borderColor: "#bbf7d0" };
};

const labelType = (t: ActivityType) => {
  if (t === "HOSPITAL_UPDATED") return "Hospital";
  if (t.startsWith("WORKER_")) return "Worker";
  return "Patient";
};

const HospitalAdminActivityPanel: React.FC<Props> = ({ hospitalId, items }) => {
  const [scope, setScope] = useState<ActivityScope>("TODAY");

  const filtered = useMemo(() => {
    return items
      .filter((x) => x.hospitalId === hospitalId)
      .filter((x) => withinScope(x.createdAtISO, scope))
      .sort((a, b) => new Date(b.createdAtISO).getTime() - new Date(a.createdAtISO).getTime());
  }, [items, hospitalId, scope]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const created = filtered.filter((x) => x.type.endsWith("CREATED")).length;
    const updated = filtered.filter((x) => x.type.endsWith("UPDATED")).length;
    const deleted = filtered.filter((x) => x.type.endsWith("DELETED")).length;

    const workers = filtered.filter((x) => x.type.startsWith("WORKER_")).length;
    const patients = filtered.filter((x) => x.type.startsWith("PATIENT_")).length;

    return { total, created, updated, deleted, workers, patients };
  }, [filtered]);

  return (
    <div style={styles.wrap}>
      <div style={styles.headRow}>
        <div>
          <div style={styles.title}>Recent Activity</div>
          <div style={styles.sub}>Shows actions depending on selected period.</div>
        </div>

        <div style={styles.filters}>
          <button style={{ ...styles.filterBtn, ...(scope === "TODAY" ? styles.filterActive : {}) }} onClick={() => setScope("TODAY")}>
            Today
          </button>
          <button style={{ ...styles.filterBtn, ...(scope === "WEEK" ? styles.filterActive : {}) }} onClick={() => setScope("WEEK")}>
            This Week
          </button>
          <button style={{ ...styles.filterBtn, ...(scope === "MONTH" ? styles.filterActive : {}) }} onClick={() => setScope("MONTH")}>
            This Month
          </button>
          <button style={{ ...styles.filterBtn, ...(scope === "YEAR" ? styles.filterActive : {}) }} onClick={() => setScope("YEAR")}>
            This Year
          </button>
        </div>
      </div>

      <div style={styles.summaryRow}>
        <div style={styles.summaryPill}><b>{summary.total}</b> actions</div>
        <div style={styles.summaryPill}><b>{summary.created}</b> created</div>
        <div style={styles.summaryPill}><b>{summary.updated}</b> updated</div>
        <div style={styles.summaryPill}><b>{summary.deleted}</b> deleted</div>
        <div style={styles.summaryPill}><b>{summary.workers}</b> worker events</div>
        <div style={styles.summaryPill}><b>{summary.patients}</b> patient events</div>
      </div>

      <div style={styles.list}>
        {filtered.length === 0 ? (
          <div style={styles.empty}>No actions for this period.</div>
        ) : (
          filtered.map((x) => (
            <div key={x.id} style={styles.item}>
              <div style={styles.left}>
                <span style={badgeStyle(x.type)}>{labelType(x.type)}</span>
              </div>
              <div style={styles.mid}>
                <div style={styles.itemTitle}>{x.title}</div>
                <div style={styles.itemDetails}>{x.details}</div>
              </div>
              <div style={styles.right}>{niceTime(x.createdAtISO)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    border: "1px solid #e5eaf2",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 8px 26px rgba(15,23,42,0.06)",
    background: "white",
  },
  headRow: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" },
  title: { fontSize: 18, fontWeight: 900, color: "#0f172a" },
  sub: { marginTop: 6, opacity: 0.75, fontWeight: 700, fontSize: 13 },

  filters: { display: "flex", gap: 8, flexWrap: "wrap" },
  filterBtn: {
    border: "1px solid #e5eaf2",
    background: "white",
    borderRadius: 999,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
  },
  filterActive: { borderColor: "#1f7ae0", boxShadow: "0 8px 24px rgba(31,122,224,0.15)" },

  summaryRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, marginBottom: 12 },
  summaryPill: {
    background: "#f8fafc",
    border: "1px solid #e5eaf2",
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 800,
    fontSize: 13,
  },

  list: { display: "grid", gap: 10 },
  item: {
    display: "grid",
    gridTemplateColumns: "90px 1fr 150px",
    gap: 12,
    alignItems: "start",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #eef2f7",
    background: "#ffffff",
  },
  left: { display: "flex", alignItems: "center", justifyContent: "flex-start" },
  mid: { minWidth: 0 },
  right: { textAlign: "right", fontWeight: 900, opacity: 0.75, fontSize: 12, whiteSpace: "nowrap" },

  itemTitle: { fontWeight: 900, color: "#0f172a" },
  itemDetails: { marginTop: 4, opacity: 0.8, fontWeight: 700, fontSize: 13, wordBreak: "break-word", overflowWrap: "anywhere" },
  empty: { padding: 14, fontWeight: 800, opacity: 0.7 },
};

export default HospitalAdminActivityPanel;