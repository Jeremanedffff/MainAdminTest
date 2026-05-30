import React, { useMemo, useState, useEffect } from "react";
import './PharmacistDashboard.css';
import {
  loadPrescriptionsByHospital,
  updatePrescriptionStatus,
  addDispenseLog,
  loadDispenseLogsByHospital,
  findPrescriptionByPatientId,
  loadPatientsByHospital,
  loadPatientVisitHistory,
  type Prescription,
  type DispenseLog,
  type PatientRow,
  type PatientVisit,
} from "../hospitalAdmin/hospitalAdminFirestore";

type Props = {
  pharmacistId: string;
  hospitalId: string;
};

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date) {
  // Monday start
  const dd = new Date(d);
  const day = dd.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1) - day;
  dd.setDate(dd.getDate() + diff);
  dd.setHours(0, 0, 0, 0);
  return dd;
}

function isSameDay(a: Date, b: Date) {
  return toISODate(a) === toISODate(b);
}

function inSameWeek(iso: string, now: Date) {
  const d = new Date(iso);
  const w0 = startOfWeek(now).getTime();
  const w1 = w0 + 7 * 24 * 60 * 60 * 1000;
  const t = d.getTime();
  return t >= w0 && t < w1;
}

function inSameMonth(iso: string, now: Date) {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function inSameYear(iso: string, now: Date) {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear();
}

export default function PharmacistDashboard({ pharmacistId, hospitalId }: Props) {
  const ui: Record<string, React.CSSProperties> = {
    page: { padding: 18 },
    top: {
      background: "white",
      border: "1px solid #e5eaf2",
      borderRadius: 14,
      padding: 16,
      boxShadow: "0 8px 26px rgba(15,23,42,0.06)",
      display: "flex",
      justifyContent: "space-between",
      gap: 16,
      alignItems: "center",
      flexWrap: "wrap",
      marginBottom: 14,
    },
    h1: { fontSize: 22, fontWeight: 1000, color: "#000000" },
    sub: { marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 },

    tabs: { display: "flex", gap: 10, flexWrap: "wrap" },
    tab: {
      border: "1px solid #e5eaf2",
      background: "white",
      borderRadius: 12,
      padding: "8px 12px",
      cursor: "pointer",
      fontWeight: 1000,
    },
    tabActive: {
      border: "1px solid #dbe6ff",
      background: "#eef5ff",
      borderRadius: 12,
      padding: "8px 12px",
      cursor: "pointer",
      fontWeight: 1000,
    },

    section: {
      background: "white",
      border: "1px solid #e5eaf2",
      borderRadius: 14,
      padding: 16,
      boxShadow: "0 8px 26px rgba(15,23,42,0.06)",
    },
    sectionTitle: { fontSize: 18, fontWeight: 1000, color: "#000000" },
    sectionSub: { marginTop: 6, opacity: 0.75, fontWeight: 800, fontSize: 13 },

    searchRow: {
      display: "flex",
      gap: 12,
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      marginBottom: 10,
    },
    search: {
      flex: 1,
      minWidth: 260,
      border: "1px solid #cfd7e3",
      borderRadius: 12,
      padding: "10px 14px",
      fontSize: 14,
      outline: "none",
    },
    badges: { display: "flex", gap: 8, flexWrap: "wrap" },
    badge: {
      border: "1px solid #e5eaf2",
      background: "#f8fafc",
      borderRadius: 999,
      padding: "6px 10px",
      fontWeight: 900,
      fontSize: 12,
      opacity: 0.85,
    },

    tableWrap: {
      background: "white",
      border: "1px solid #e5eaf2",
      borderRadius: 14,
      overflow: "hidden",
      marginTop: 12,
    },
    table: { width: "100%", borderCollapse: "collapse" },
    th: {
      padding: "12px 16px",
      textAlign: "left",
      fontWeight: 1000,
      fontSize: 12,
      background: "#f8fafc",
      borderBottom: "1px solid #e5eaf2",
      opacity: 0.8,
    },
    thRight: {
      padding: "12px 16px",
      textAlign: "right",
      fontWeight: 1000,
      fontSize: 12,
      background: "#f8fafc",
      borderBottom: "1px solid #e5eaf2",
      opacity: 0.8,
    },
    td: {
      padding: "14px 16px",
      borderBottom: "1px solid #f1f5f9",
      fontSize: 13,
      verticalAlign: "top",
    },
    tdRight: {
      padding: "14px 16px",
      borderBottom: "1px solid #f1f5f9",
      fontSize: 13,
      verticalAlign: "top",
      textAlign: "right",
    },
    tdMono: {
      padding: "14px 16px",
      borderBottom: "1px solid #f1f5f9",
      fontSize: 12,
      fontFamily: "monospace",
      verticalAlign: "top",
    },
    cellMain: { fontWeight: 1000, marginBottom: 2 },
    cellSub: { opacity: 0.7, fontSize: 11 },

    pillPaid: {
      padding: "4px 10px",
      fontWeight: 1000,
      fontSize: 12,
      background: "#eafff3",
      border: "1px solid #b7f7d1",
      color: "#000000",
      borderRadius: 999,
    },
    pillNotPaid: {
      padding: "4px 10px",
      fontWeight: 1000,
      fontSize: 12,
      background: "#fff1f2",
      border: "1px solid #fecdd3",
      color: "#000000",
      borderRadius: 999,
    },
    pillPending: {
      padding: "4px 10px",
      fontWeight: 1000,
      fontSize: 12,
      background: "#fff7ed",
      border: "1px solid #fed7aa",
      color: "#000000",
      borderRadius: 999,
    },
    pillPreparing: {
      padding: "4px 10px",
      fontWeight: 1000,
      fontSize: 12,
      background: "#f0fdf4",
      border: "1px solid #bbf7d0",
      color: "#000000",
      borderRadius: 999,
    },
    pillDispensed: {
      padding: "4px 10px",
      fontWeight: 1000,
      fontSize: 12,
      background: "#eef5ff",
      border: "1px solid #dbe6ff",
      color: "#000000",
      borderRadius: 999,
    },

    actionCol: { display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" },
    btn: {
      border: "1px solid #cfd7e3",
      background: "white",
      borderRadius: 10,
      padding: "8px 10px",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
    },
    btnGreen: {
      border: "1px solid #b7f7d1",
      background: "#eafff3",
      borderRadius: 10,
      padding: "8px 10px",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
      color: "#000000",
    },
    btnDisabled: {
      border: "1px solid #e5eaf2",
      background: "#f8fafc",
      borderRadius: 10,
      padding: "8px 10px",
      cursor: "not-allowed",
      fontWeight: 900,
      fontSize: 12,
      opacity: 0.6,
    },

    cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginTop: 12 },
    card: {
      background: "white",
      border: "1px solid #e5eaf2",
      borderRadius: 14,
      padding: 14,
      textAlign: "center",
    },
    cardLabel: { fontSize: 12, fontWeight: 900, opacity: 0.7, marginBottom: 4 },
    cardValue: { fontSize: 24, fontWeight: 1000, color: "#000000" },

    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    },
    modal: {
      width: "100%",
      maxWidth: 820,
      background: "white",
      borderRadius: 16,
      padding: 16,
      boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      maxHeight: "90vh",
      overflowY: "auto",
    },
    modalTitle: { fontSize: 18, fontWeight: 1000, color: "#000000" },
    modalSub: { marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 900 },
    close: {
      border: "1px solid #e5eaf2",
      background: "white",
      borderRadius: 10,
      padding: "6px 10px",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
    },
    noteBox: {
      border: "1px solid #eef2f7",
      borderRadius: 14,
      padding: 12,
      background: "#fbfdff",
    },
    infoTitle: { fontWeight: 1000, color: "#000000" },
    infoLine: { marginTop: 8, opacity: 0.85, fontWeight: 900 },
    itemBox: {
      border: "1px solid #eef2f7",
      borderRadius: 14,
      padding: 12,
      background: "#fbfdff",
    },
    error: {
      background: "#fef2f2",
      border: "1px solid #fecaca",
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      color: "#dc2626",
      fontWeight: 600,
    },
    success: {
      background: "#f0fdf4",
      border: "1px solid #bbf7d0",
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      color: "#16a34a",
      fontWeight: 600,
    },
    loading: {
      textAlign: "center",
      padding: 40,
      fontSize: 16,
      color: "#64748b",
      fontWeight: 600,
    },
    grid2: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
      marginTop: 16,
    },
    infoBox: {
      border: "1px solid #eef2f7",
      borderRadius: 14,
      padding: 12,
      background: "#fbfdff",
    },
    modalHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
  };

  const [tab, setTab] = useState<"queue" | "dispensed" | "activity" | "patients">("queue");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [patientIdSearch, setPatientIdSearch] = useState("");
  const [searchedPrescription, setSearchedPrescription] = useState<Prescription | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [dispenseLogs, setDispenseLogs] = useState<DispenseLog[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
  const [patientVisitHistory, setPatientVisitHistory] = useState<PatientVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load prescriptions and dispense logs on component mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        const [prescriptionsData, logsData, patientsData] = await Promise.all([
          loadPrescriptionsByHospital(hospitalId),
          loadDispenseLogsByHospital(hospitalId),
          loadPatientsByHospital(hospitalId),
        ]);

        setPrescriptions(prescriptionsData);
        setDispenseLogs(logsData);
        setPatients(patientsData);
      } catch (e: any) {
        console.error("LOAD PHARMACY DATA ERROR:", e);
        setError(e?.message || "Failed to load pharmacy data.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [hospitalId]);

  const searchPrescriptionByPatientId = async () => {
    if (!patientIdSearch.trim()) {
      setSearchedPrescription(null);
      return;
    }

    try {
      const prescription = await findPrescriptionByPatientId(patientIdSearch.trim());
      setSearchedPrescription(prescription);
      setError("");
    } catch (e: any) {
      console.error("SEARCH PRESCRIPTION ERROR:", e);
      setError(e?.message || "Failed to find prescription.");
      setSearchedPrescription(null);
    }
  };

  const loadPatientVisits = async (patientId: string) => {
    try {
      const visits = await loadPatientVisitHistory(patientId);
      setPatientVisitHistory(visits);
    } catch (e: any) {
      console.error("LOAD VISIT HISTORY ERROR:", e);
      setError(e?.message || "Failed to load visit history.");
      setPatientVisitHistory([]);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prescriptions;

    return prescriptions.filter((p) => {
      const joined = [
        p.id,
        p.patientId,
        p.patientName,
        p.doctorName,
        p.status,
        p.paymentStatus,
        p.receiptNo || "",
      ]
        .join(" ")
        .toLowerCase();
      return joined.includes(q);
    });
  }, [prescriptions, query]);

  const pending = useMemo(() => filtered.filter((p) => p.status === "PENDING" || p.status === "PREPARING"), [filtered]);
  const dispensed = useMemo(() => filtered.filter((p) => p.status === "DISPENSED"), [filtered]);

  const stats = useMemo(() => {
    const now = new Date();
    const day = dispenseLogs.filter((l) => isSameDay(new Date(l.whenISO), now)).length;
    const week = dispenseLogs.filter((l) => inSameWeek(l.whenISO, now)).length;
    const month = dispenseLogs.filter((l) => inSameMonth(l.whenISO, now)).length;
    const year = dispenseLogs.filter((l) => inSameYear(l.whenISO, now)).length;
    return { day, week, month, year };
  }, [dispenseLogs]);

  const markDispensed = async (rxId: string) => {
    const rx = prescriptions.find((p) => p.id === rxId);
    if (!rx) return;

    if (rx.paymentStatus !== "PAID") {
      alert("Cannot dispense: payment is NOT PAID.");
      return;
    }

    if (rx.status === "DISPENSED") return;

    try {
      await updatePrescriptionStatus(rxId, "DISPENSED", pharmacistId, `Pharmacist ${pharmacistId}`);
      await addDispenseLog({
        prescriptionId: rxId,
        patientId: rx.patientId,
        pharmacistId,
        pharmacistName: `Pharmacist ${pharmacistId}`,
        hospitalId,
      });

      setPrescriptions((prev) =>
        prev.map((p) => (p.id === rxId ? { ...p, status: "DISPENSED" } : p))
      );

      setDispenseLogs((prev) => [
        {
          id: `LOG-${Date.now()}`,
          prescriptionId: rxId,
          patientId: rx.patientId,
          whenISO: new Date().toISOString(),
          pharmacistId,
          pharmacistName: `Pharmacist ${pharmacistId}`,
          hospitalId,
        },
        ...prev,
      ]);

      setSelected((s) => (s?.id === rxId ? { ...s, status: "DISPENSED" } : s));
      setSuccess("Prescription dispensed successfully!");
    } catch (e: any) {
      console.error("DISPENSE ERROR:", e);
      setError(e?.message || "Failed to dispense prescription.");
    }
  };

  const header = (
    <div style={ui.top}>
      <div>
        <div style={ui.h1}>Pharmacy Dashboard</div>
        <div style={ui.sub}>
          Hospital: <b>{hospitalId || "—"}</b> • Pharmacist ID: <b>{pharmacistId}</b>
        </div>
      </div>

      <div style={ui.tabs}>
        <button
          style={tab === "queue" ? ui.tabActive : ui.tab}
          onClick={() => setTab("queue")}
        >
          Dispense Queue
        </button>
        <button
          style={tab === "dispensed" ? ui.tabActive : ui.tab}
          onClick={() => setTab("dispensed")}
        >
          Dispensed
        </button>
        <button
          style={tab === "activity" ? ui.tabActive : ui.tab}
          onClick={() => setTab("activity")}
        >
          Activity
        </button>
        <button
          style={tab === "patients" ? ui.tabActive : ui.tab}
          onClick={() => setTab("patients")}
        >
          Patients
        </button>
      </div>
    </div>
  );

  const searchBar = (
    <div style={ui.searchRow}>
      <input
        style={ui.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by RX id, patient id, name, doctor, status, receipt..."
      />
      <div style={ui.badges}>
        <span style={ui.badge}>Pending: <b>{pending.length}</b></span>
        <span style={ui.badge}>Dispensed: <b>{dispensed.length}</b></span>
      </div>
    </div>
  );

  const patientIdSearchBox = (
    <div style={{ ...ui.searchRow, marginTop: 16 }}>
      <input
        style={ui.search}
        value={patientIdSearch}
        onChange={(e) => setPatientIdSearch(e.target.value)}
        placeholder="Search prescription by Patient ID..."
      />
      <button
        style={{ ...ui.btn, background: "#10b981" }}
        onClick={searchPrescriptionByPatientId}
      >
        Find Prescription
      </button>
    </div>
  );

  const Table = ({ rows }: { rows: Prescription[] }) => {
    return (
      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr>
              <th style={ui.th}>RX</th>
              <th style={ui.th}>Patient</th>
              <th style={ui.th}>Doctor</th>
              <th style={ui.th}>Payment</th>
              <th style={ui.th}>Status</th>
              <th style={ui.th}>Created</th>
              <th style={ui.thRight}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={ui.td} colSpan={7}>
                  No records found.
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const payPill =
                  p.paymentStatus === "PAID" ? ui.pillPaid : ui.pillNotPaid;
                const statusPill =
                  p.status === "PENDING" ? ui.pillPending : 
                  p.status === "PREPARING" ? ui.pillPreparing : 
                  ui.pillDispensed;

                return (
                  <tr key={p.id}>
                    <td style={ui.tdMono}>{p.id}</td>

                    <td style={ui.td}>
                      <div style={ui.cellMain}>{p.patientName}</div>
                      <div style={ui.cellSub}>{p.patientId}</div>
                    </td>

                    <td style={ui.td}>
                      <div style={ui.cellMain}>{p.doctorName}</div>
                    </td>

                    <td style={ui.td}>
                      <span style={payPill}>
                        {p.paymentStatus === "PAID" ? "Paid" : "Not Paid"}
                      </span>
                      <div style={ui.cellSub}>
                        {p.receiptNo ? `Receipt: ${p.receiptNo}` : "Receipt: —"}
                      </div>
                    </td>

                    <td style={ui.td}>
                      <span style={statusPill}>
                        {p.status === "PENDING" ? "Pending" : 
                         p.status === "PREPARING" ? "Preparing" : 
                         "Dispensed"}
                      </span>
                    </td>

                    <td style={ui.td}>{p.createdAtISO.slice(0, 10)}</td>

                    <td style={ui.tdRight}>
                      <div style={ui.actionCol}>
                        <button style={ui.btn} onClick={() => setSelected(p)}>
                          View
                        </button>

                        {p.status === "PENDING" || p.status === "PREPARING" ? (
                          <button
                            style={
                              p.paymentStatus === "PAID" ? ui.btnGreen : ui.btnDisabled
                            }
                            disabled={p.paymentStatus !== "PAID"}
                            onClick={() => markDispensed(p.id)}
                          >
                            Dispense
                          </button>
                        ) : (
                          <span style={ui.btnDisabled}>Dispensed</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const activity = (
    <div style={ui.section}>
      <div style={ui.sectionTitle}>Activity Summary</div>
      <div style={ui.sectionSub}>
        Shows dispensing actions by time period (today, week, month, year).
      </div>

      <div style={ui.cards}>
        <div style={ui.card}>
          <div style={ui.cardLabel}>Today</div>
          <div style={ui.cardValue}>{stats.day}</div>
        </div>
        <div style={ui.card}>
          <div style={ui.cardLabel}>This Week</div>
          <div style={ui.cardValue}>{stats.week}</div>
        </div>
        <div style={ui.card}>
          <div style={ui.cardLabel}>This Month</div>
          <div style={ui.cardValue}>{stats.month}</div>
        </div>
        <div style={ui.card}>
          <div style={ui.cardLabel}>This Year</div>
          <div style={ui.cardValue}>{stats.year}</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={ui.sectionTitle}>Recent Dispense Actions</div>
        <div style={ui.sectionSub}>Latest actions appear first.</div>

        <div style={ui.tableWrap}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>When</th>
                <th style={ui.th}>Prescription</th>
                <th style={ui.th}>Patient</th>
              </tr>
            </thead>
            <tbody>
              {dispenseLogs.length === 0 ? (
                <tr>
                  <td style={ui.td} colSpan={3}>
                    No activity yet.
                  </td>
                </tr>
              ) : (
                dispenseLogs.slice(0, 10).map((l) => (
                  <tr key={l.id}>
                    <td style={ui.td}>{l.whenISO.replace("T", " ").slice(0, 16)}</td>
                    <td style={ui.tdMono}>{l.prescriptionId}</td>
                    <td style={ui.tdMono}>{l.patientId}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const detailsModal =
    selected && (
      <div style={ui.overlay} onClick={() => setSelected(null)}>
        <div style={ui.modal} onClick={(e) => e.stopPropagation()}>
          <div style={ui.modalHeader}>
            <div>
              <div style={ui.modalTitle}>Prescription Details</div>
              <div style={ui.modalSub}>
                {selected.id} • {selected.patientName} ({selected.patientId})
              </div>
            </div>
            <button style={ui.close} onClick={() => setSelected(null)}>
              ✕
            </button>
          </div>

          <div style={ui.grid2}>
            <div style={ui.infoBox}>
              <div style={ui.infoTitle}>Payment</div>
              <div style={{ marginTop: 6 }}>
                <span
                  style={selected.paymentStatus === "PAID" ? ui.pillPaid : ui.pillNotPaid}
                >
                  {selected.paymentStatus === "PAID" ? "Paid (M15.00)" : "Not Paid"}
                </span>
              </div>
              <div style={ui.infoLine}>Receipt: {selected.receiptNo || "—"}</div>
              <div style={ui.infoLine}>Created: {selected.createdAtISO.slice(0, 10)}</div>
              <div style={ui.infoLine}>Doctor: {selected.doctorName}</div>
            </div>

            <div style={ui.infoBox}>
              <div style={ui.infoTitle}>Status</div>
              <div style={{ marginTop: 6 }}>
                <span style={selected.status === "PENDING" ? ui.pillPending : 
                       selected.status === "PREPARING" ? ui.pillPreparing : 
                       ui.pillDispensed}>
                  {selected.status === "PENDING" ? "Pending" : 
                   selected.status === "PREPARING" ? "Preparing" : 
                   "Dispensed"}
                </span>
              </div>

              <div style={ui.infoLine}>
                Action:{" "}
                {selected.status === "PENDING" || selected.status === "PREPARING" ? (
                  <button
                    style={selected.paymentStatus === "PAID" ? ui.btnGreen : ui.btnDisabled}
                    onClick={() => markDispensed(selected.id)}
                    disabled={selected.paymentStatus !== "PAID"}
                  >
                    Dispense
                  </button>
                ) : (
                  <span style={ui.btnDisabled}>Dispensed</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={ui.sectionTitle}>Medication Items</div>
            <div style={ui.sectionSub}>As prescribed by doctor.</div>

            <div style={ui.tableWrap}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>Drug</th>
                    <th style={ui.th}>Dosage</th>
                    <th style={ui.th}>Frequency</th>
                    <th style={ui.th}>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((it, idx) => (
                    <tr key={idx}>
                      <td style={ui.td}>{it.drugName}</td>
                      <td style={ui.td}>{it.dosage}</td>
                      <td style={ui.td}>{it.frequency}</td>
                      <td style={ui.td}>{it.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected.notes ? (
              <div style={ui.noteBox}>
                <div style={{ fontWeight: 1000, marginBottom: 6 }}>Doctor Notes</div>
                <div style={{ fontWeight: 800, opacity: 0.9 }}>{selected.notes}</div>
              </div>
            ) : null}

            {selected.linkedNoteId ? (
              <div style={ui.noteBox}>
                <div style={{ fontWeight: 1000, marginBottom: 6 }}>Linked Clinical Note</div>
                <div style={{ fontWeight: 900 }}>{selected.linkedNoteTitle || selected.linkedNoteId}</div>
                {selected.linkedNoteCreatedAtISO ? (
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    {selected.linkedNoteCreatedAtISO.replace("T", " ").slice(0, 16)}
                  </div>
                ) : null}
                {selected.linkedNoteText ? (
                  <div style={{ fontWeight: 800, opacity: 0.9, marginTop: 8, whiteSpace: "pre-wrap" }}>
                    {selected.linkedNoteText}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );

  return (
    <div className="pharmacist-dashboard" style={ui.page}>
      {error && <div style={ui.error}>{error}</div>}
      {success && <div style={ui.success}>{success}</div>}
      
      {loading ? (
        <div style={ui.loading}>Loading pharmacy data...</div>
      ) : (
        <>
          {header}
          {patientIdSearchBox}
          {searchedPrescription && (
            <div style={{ ...ui.section, marginTop: 16 }}>
              <div style={ui.sectionTitle}>Found Prescription</div>
              <div style={ui.sectionSub}>
                Patient ID: <b>{searchedPrescription.patientId}</b>
              </div>
              <div style={ui.noteBox}>
                <div><b>RX:</b> {searchedPrescription.id}</div>
                <div><b>Patient:</b> {searchedPrescription.patientName}</div>
                <div><b>Doctor:</b> {searchedPrescription.doctorName}</div>
                <div><b>Status:</b> {searchedPrescription.status}</div>
                <div><b>Payment:</b> {searchedPrescription.paymentStatus}</div>
                {searchedPrescription.notes && (
                  <div style={{ marginTop: 8 }}>
                    <b>Notes:</b> {searchedPrescription.notes}
                  </div>
                )}
                {searchedPrescription.linkedNoteId && (
                  <div style={{ marginTop: 8 }}>
                    <b>Linked clinical note:</b> {searchedPrescription.linkedNoteTitle || searchedPrescription.linkedNoteId}
                    {searchedPrescription.linkedNoteText && (
                      <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                        {searchedPrescription.linkedNoteText}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <b>Medications:</b>
                  <ul style={{ margin: "8px 0 0 20px", paddingLeft: 20 }}>
                    {searchedPrescription.items.map((item, idx) => (
                      <li key={idx} style={{ marginBottom: 4 }}>
                        {item.drugName} - {item.dosage} - {item.frequency} - {item.days} days
                      </li>
                    ))}
                  </ul>
                </div>
                {searchedPrescription.status === "PENDING" || searchedPrescription.status === "PREPARING" && searchedPrescription.paymentStatus === "PAID" && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      style={{ ...ui.btnGreen, width: "100%" }}
                      onClick={() => markDispensed(searchedPrescription.id)}
                    >
                      Dispense This Prescription
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === "queue" && (
            <>
              {searchBar}
              <Table rows={pending} />
            </>
          )}
          {tab === "dispensed" && (
            <>
              {searchBar}
              <div style={ui.sectionSub}>Completed dispensing history.</div>
              <div style={{ marginTop: 12 }}>
                <Table rows={dispensed} />
              </div>
            </>
          )}
          {tab === "activity" && activity}
          {tab === "patients" && (
            <div style={ui.section}>
              <div style={ui.sectionTitle}>Patient Search</div>
              <div style={ui.sectionSub}>Search and view patient information</div>

              <div style={ui.searchRow}>
                <input
                  style={ui.search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search patients by ID, name, or phone..."
                />
              </div>

              {loading ? (
                <div style={ui.loading}>Loading patients...</div>
              ) : (
                <div style={ui.tableWrap}>
                  <table style={ui.table}>
                    <thead>
                      <tr>
                        <th style={ui.th}>Patient ID</th>
                        <th style={ui.th}>Name</th>
                        <th style={ui.th}>Contact</th>
                        <th style={ui.th}>Age/Sex</th>
                        <th style={ui.thRight}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patients
                        .filter((p) => {
                          const q = query.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            p.id.toLowerCase().includes(q) ||
                            p.fullName.toLowerCase().includes(q) ||
                            p.phone.includes(q)
                          );
                        })
                        .map((patient) => (
                          <tr key={patient.id}>
                            <td style={ui.tdMono}>{patient.id}</td>
                            <td style={ui.td}>
                              <div style={ui.cellMain}>{patient.fullName}</div>
                            </td>
                            <td style={ui.td}>
                              <div style={ui.cellMain}>{patient.phone}</div>
                              {patient.email && (
                                <div style={ui.cellSub}>{patient.email}</div>
                              )}
                            </td>
                            <td style={ui.td}>
                              {patient.age} years • {patient.sex}
                            </td>
                            <td style={ui.tdRight}>
                              <div style={ui.actionCol}>
                                <button
                                  style={ui.btn}
                                  onClick={() => {
                                    setSelectedPatient(patient);
                                    loadPatientVisits(patient.id);
                                  }}
                                >
                                  View Details
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedPatient && (
                <div style={{ ...ui.section, marginTop: 16 }}>
                  <div style={ui.sectionTitle}>Patient Details</div>
                  <div style={ui.sectionSub}>
                    {selectedPatient.fullName} ({selectedPatient.id})
                  </div>

                  <div style={ui.grid2}>
                    <div style={ui.infoBox}>
                      <div style={ui.infoTitle}>Personal Information</div>
                      <div style={ui.infoLine}>
                        <b>Name:</b> {selectedPatient.fullName}
                      </div>
                      <div style={ui.infoLine}>
                        <b>ID:</b> {selectedPatient.id}
                      </div>
                      <div style={ui.infoLine}>
                        <b>Age:</b> {selectedPatient.age} years
                      </div>
                      <div style={ui.infoLine}>
                        <b>Sex:</b> {selectedPatient.sex}
                      </div>
                      <div style={ui.infoLine}>
                        <b>Phone:</b> {selectedPatient.phone}
                      </div>
                      {selectedPatient.email && (
                        <div style={ui.infoLine}>
                          <b>Email:</b> {selectedPatient.email}
                        </div>
                      )}
                    </div>

                    <div style={ui.infoBox}>
                      <div style={ui.infoTitle}>Current Prescriptions</div>
                      {prescriptions
                        .filter(p => p.patientId === selectedPatient.id)
                        .slice(0, 3)
                        .map((prescription) => (
                          <div key={prescription.id} style={{ marginBottom: 8, padding: 8, border: "1px solid #e5eaf2", borderRadius: 8 }}>
                            <div style={ui.infoLine}>
                              <b>RX:</b> {prescription.id}
                            </div>
                            <div style={ui.infoLine}>
                              <b>Doctor:</b> {prescription.doctorName}
                            </div>
                            <div style={ui.infoLine}>
                              <b>Status:</b> {prescription.status}
                            </div>
                            <div style={ui.infoLine}>
                              <b>Payment:</b> 
                              <span style={{
                                ...prescription.paymentStatus === "PAID" ? ui.pillPaid : ui.pillNotPaid,
                                marginLeft: 4
                              }}>
                                {prescription.paymentStatus === "PAID" ? "Paid" : "Not Paid"}
                              </span>
                            </div>
                            {prescription.receiptNo && (
                              <div style={ui.infoLine}>
                                <b>Receipt:</b> {prescription.receiptNo}
                              </div>
                            )}
                          </div>
                        ))}
                      {prescriptions.filter(p => p.patientId === selectedPatient.id).length === 0 && (
                        <div style={ui.infoLine}>No active prescriptions</div>
                      )}
                    </div>
                  </div>

                  <div style={ui.grid2}>
                    <div style={ui.infoBox}>
                      <div style={ui.infoTitle}>Visit History</div>
                      {patientVisitHistory.length === 0 ? (
                        <div style={ui.infoLine}>No visits recorded</div>
                      ) : (
                        patientVisitHistory.slice(0, 5).map((visit) => (
                          <div key={visit.id} style={{ marginBottom: 8 }}>
                            <div style={ui.infoLine}>
                              <b>Date:</b> {visit.visitDate}
                            </div>
                            <div style={ui.infoLine}>
                              <b>Time:</b> {visit.visitTimeISO.slice(11, 16)}
                            </div>
                            <div style={ui.infoLine}>
                              <b>Receptionist:</b> {visit.receptionistName}
                            </div>
                            {visit.purpose && (
                              <div style={ui.infoLine}>
                                <b>Purpose:</b> {visit.purpose}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <div style={ui.infoBox}>
                      <div style={ui.infoTitle}>Payment Summary</div>
                      {(() => {
                        const patientPrescriptions = prescriptions.filter(p => p.patientId === selectedPatient.id);
                        const paidCount = patientPrescriptions.filter(p => p.paymentStatus === "PAID").length;
                        const unpaidCount = patientPrescriptions.filter(p => p.paymentStatus === "NOT_PAID").length;
                        
                        return (
                          <>
                            <div style={ui.infoLine}>
                              <b>Total Prescriptions:</b> {patientPrescriptions.length}
                            </div>
                            <div style={ui.infoLine}>
                              <b>Paid:</b> {paidCount}
                            </div>
                            <div style={ui.infoLine}>
                              <b>Pending Payment:</b> {unpaidCount}
                            </div>
                            {unpaidCount > 0 && (
                              <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>
                                Patient has {unpaidCount} unpaid prescription{unpaidCount > 1 ? 's' : ''}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <button
                      style={ui.btn}
                      onClick={() => {
                        setSelectedPatient(null);
                        setPatientVisitHistory([]);
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {detailsModal}
        </>
      )}
    </div>
  );
}
