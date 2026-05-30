import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Baby,
  ClipboardList,
  FlaskConical,
  GalleryHorizontalEnd,
  HeartPulse,
  Hospital,
  Maximize2,
  Pill,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebase/firebase";
import "./VisualMedicalDashboard.css";

type PersonMode = "adult" | "child";
type ScreenKey = "network" | "patients" | "clinical" | "body";

type PatientDoc = {
  patientId?: string;
  fullName?: string;
  sex?: "MALE" | "FEMALE";
  age?: number;
  hospitalId?: string;
  hospitalName?: string;
  status?: "ACTIVE" | "DISABLED";
  createdAtISO?: string;
};

type LabRequestDoc = {
  patientId?: string;
  patientName?: string;
  hospitalId?: string;
  status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  priority?: "ROUTINE" | "URGENT" | "STAT";
  results?: { status?: "NORMAL" | "ABNORMAL" | "CRITICAL"; testName?: string }[];
  requestTimeISO?: string;
};

type PrescriptionDoc = {
  patientId?: string;
  hospitalId?: string;
  status?: "PENDING" | "DISPENSED" | "PREPARING";
  items?: { drugName?: string }[];
  createdAtISO?: string;
};

type VisitDoc = {
  patientId?: string;
  hospitalId?: string;
  status?: "ACTIVE" | "CANCELLED";
  visitTimeISO?: string;
};

type NoteDoc = {
  patientId?: string;
  hospitalId?: string;
  title?: string;
  note?: string;
  createdAtISO?: string;
};

type VisualData = {
  patients: PatientDoc[];
  labRequests: LabRequestDoc[];
  prescriptions: PrescriptionDoc[];
  visits: VisitDoc[];
  notes: NoteDoc[];
};

type Props = {
  hospitals: { id: string; name: string; status: string }[];
  admins: { id: string; hospitalId: string; status: string }[];
};

const screenOrder: { key: ScreenKey; title: string; icon: React.ReactNode }[] = [
  { key: "network", title: "Hospital Network", icon: <Hospital size={18} /> },
  { key: "patients", title: "Patient Flow", icon: <Users size={18} /> },
  { key: "clinical", title: "Clinical Signals", icon: <Stethoscope size={18} /> },
  { key: "body", title: "Health Body View", icon: <HeartPulse size={18} /> },
];

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<T, number>>((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

function latestDate(values: (string | undefined)[]) {
  return values.filter(Boolean).sort().at(-1)?.slice(0, 10) || "No recent data";
}

function calculatePopulationHealthScore(population: PatientDoc[], data: VisualData) {
  if (population.length === 0) return 92;

  const patientIds = new Set(population.map((patient) => patient.patientId).filter(Boolean));
  const labs = data.labRequests.filter((item) => item.patientId && patientIds.has(item.patientId));
  const prescriptions = data.prescriptions.filter((item) => item.patientId && patientIds.has(item.patientId));
  const notes = data.notes.filter((item) => item.patientId && patientIds.has(item.patientId));
  const visits = data.visits.filter((item) => item.patientId && patientIds.has(item.patientId));

  const criticalLabs = labs.flatMap((lab) => lab.results || []).filter((result) => result.status === "CRITICAL").length;
  const abnormalLabs = labs.flatMap((lab) => lab.results || []).filter((result) => result.status === "ABNORMAL").length;
  const pendingLabs = labs.filter((lab) => lab.status === "PENDING" || lab.status === "IN_PROGRESS").length;
  const openMeds = prescriptions.filter((item) => item.status !== "DISPENSED").length;
  const activeVisits = visits.filter((item) => item.status === "ACTIVE").length;
  const riskNotes = notes.filter((item) => /urgent|critical|severe|risk|pain|fever/i.test(`${item.title || ""} ${item.note || ""}`)).length;

  const riskLoad =
    criticalLabs * 7 +
    abnormalLabs * 3 +
    pendingLabs * 2 +
    openMeds * 1.5 +
    riskNotes * 2.5 -
    activeVisits * 0.5;

  return Math.max(38, Math.min(98, Math.round(96 - (riskLoad / Math.max(population.length, 1)) * 8)));
}

function statusFromScore(score: number) {
  if (score >= 82) return { label: "Good", tone: "good" };
  if (score >= 62) return { label: "Watch", tone: "watch" };
  return { label: "Needs Care", tone: "risk" };
}

const VisualMedicalDashboard: React.FC<Props> = ({ hospitals, admins }) => {
  const [selectedScreen, setSelectedScreen] = useState<ScreenKey>("body");
  const [personMode, setPersonMode] = useState<PersonMode>("adult");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VisualData>({
    patients: [],
    labRequests: [],
    prescriptions: [],
    visits: [],
    notes: [],
  });

  useEffect(() => {
    let alive = true;

    const loadVisualData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [patientSnap, labSnap, prescriptionSnap, visitSnap, noteSnap] = await Promise.all([
          getDocs(collection(db, "patients")),
          getDocs(collection(db, "lab_requests")),
          getDocs(collection(db, "prescriptions")),
          getDocs(collection(db, "patient_visits")),
          getDocs(collection(db, "patient_notes")),
        ]);

        if (!alive) return;

        setData({
          patients: patientSnap.docs.map((docSnap) => ({ patientId: docSnap.id, ...docSnap.data() } as PatientDoc)),
          labRequests: labSnap.docs.map((docSnap) => docSnap.data() as LabRequestDoc),
          prescriptions: prescriptionSnap.docs.map((docSnap) => docSnap.data() as PrescriptionDoc),
          visits: visitSnap.docs.map((docSnap) => docSnap.data() as VisitDoc),
          notes: noteSnap.docs.map((docSnap) => docSnap.data() as NoteDoc),
        });
      } catch (loadError: any) {
        if (!alive) return;
        setError(loadError?.message || "Failed to load visual dashboard data.");
      } finally {
        if (alive) setLoading(false);
      }
    };

    void loadVisualData();

    return () => {
      alive = false;
    };
  }, []);

  const bodyPopulation = useMemo(
    () =>
      data.patients.filter((patient) =>
        personMode === "child" ? Number(patient.age || 0) < 18 : Number(patient.age || 0) >= 18
      ),
    [data.patients, personMode]
  );

  const metrics = useMemo(() => {
    const activeHospitals = hospitals.filter((hospital) => hospital.status === "ACTIVE").length;
    const activePatients = data.patients.filter((patient) => patient.status !== "DISABLED").length;
    const adults = data.patients.filter((patient) => Number(patient.age || 0) >= 18).length;
    const children = data.patients.filter((patient) => Number(patient.age || 0) < 18).length;
    const pendingLabs = data.labRequests.filter((request) => request.status === "PENDING" || request.status === "IN_PROGRESS").length;
    const completedLabs = data.labRequests.filter((request) => request.status === "COMPLETED").length;
    const urgentLabs = data.labRequests.filter((request) => request.priority === "URGENT" || request.priority === "STAT").length;
    const prescriptionsOpen = data.prescriptions.filter((item) => item.status !== "DISPENSED").length;
    const recentClinicalDate = latestDate([
      ...data.labRequests.map((item) => item.requestTimeISO),
      ...data.prescriptions.map((item) => item.createdAtISO),
      ...data.visits.map((item) => item.visitTimeISO),
      ...data.notes.map((item) => item.createdAtISO),
    ]);
    const hospitalPatientCounts = data.patients.reduce<Record<string, number>>((acc, patient) => {
      const key = patient.hospitalName || patient.hospitalId || "Unknown hospital";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const patientStatuses = countBy(data.patients.map((patient) => patient.status || "ACTIVE"));

    return {
      activeHospitals,
      activePatients,
      adults,
      children,
      pendingLabs,
      completedLabs,
      urgentLabs,
      prescriptionsOpen,
      recentClinicalDate,
      hospitalPatientCounts,
      patientStatuses,
      assignedAdmins: admins.filter((admin) => admin.status === "ACTIVE").length,
    };
  }, [admins, data, hospitals]);

  const healthScore = calculatePopulationHealthScore(bodyPopulation, data);
  const healthStatus = statusFromScore(healthScore);

  const panelMap: Record<ScreenKey, React.ReactNode> = {
    network: (
      <NetworkPanel
        hospitals={hospitals}
        activeHospitals={metrics.activeHospitals}
        assignedAdmins={metrics.assignedAdmins}
        hospitalPatientCounts={metrics.hospitalPatientCounts}
      />
    ),
    patients: (
      <PatientPanel
        total={data.patients.length}
        active={metrics.activePatients}
        adults={metrics.adults}
        children={metrics.children}
        statuses={metrics.patientStatuses}
      />
    ),
    clinical: (
      <ClinicalPanel
        pendingLabs={metrics.pendingLabs}
        completedLabs={metrics.completedLabs}
        urgentLabs={metrics.urgentLabs}
        prescriptionsOpen={metrics.prescriptionsOpen}
        recentClinicalDate={metrics.recentClinicalDate}
      />
    ),
    body: (
      <BodyPanel
        personMode={personMode}
        setPersonMode={setPersonMode}
        population={bodyPopulation}
        data={data}
        healthScore={healthScore}
        healthStatus={healthStatus}
      />
    ),
  };

  return (
    <section className="visual-dashboard" aria-label="Visual medical dashboard mode">
      <div className="visual-toolbar">
        <div>
          <div className="visual-kicker">Optional dashboard mode</div>
          <h2>Visual Medical Dashboard</h2>
        </div>
        <div className="visual-mode-control" aria-label="Body type switch">
          <button className={personMode === "adult" ? "active" : ""} onClick={() => setPersonMode("adult")} type="button">
            <UserRound size={16} />
            Adult
          </button>
          <button className={personMode === "child" ? "active" : ""} onClick={() => setPersonMode("child")} type="button">
            <Baby size={16} />
            Child
          </button>
        </div>
      </div>

      {error ? <div className="visual-error">{error}</div> : null}
      {loading ? <div className="visual-loading">Loading dashboard data from Firestore...</div> : null}

      <div className="visual-screen-grid">
        {screenOrder.map((screen) => (
          <button
            key={screen.key}
            type="button"
            className={`visual-screen-card ${selectedScreen === screen.key ? "selected" : ""}`}
            onClick={() => setSelectedScreen(screen.key)}
          >
            <div className="screen-card-head">
              <span>{screen.icon}</span>
              <Maximize2 size={15} />
            </div>
            <strong>{screen.title}</strong>
            <div className="mini-dashboard">{miniPanel(screen.key, metrics, healthScore, healthStatus.label)}</div>
          </button>
        ))}
      </div>

      <div className="visual-expanded-panel">
        <div className="expanded-heading">
          <span>
            <GalleryHorizontalEnd size={18} />
            {screenOrder.find((screen) => screen.key === selectedScreen)?.title}
          </span>
        </div>
        {panelMap[selectedScreen]}
      </div>
    </section>
  );
};

function miniPanel(
  key: ScreenKey,
  metrics: MetricsLike,
  healthScore: number,
  healthLabel: string
) {
  if (key === "network") {
    return (
      <>
        <span>{metrics.activeHospitals} active hospitals</span>
        <div className="mini-bars"><i style={{ height: "58%" }} /><i style={{ height: "84%" }} /><i style={{ height: "42%" }} /></div>
      </>
    );
  }

  if (key === "patients") {
    return (
      <>
        <span>{metrics.activePatients} active patients</span>
        <div className="mini-line" />
      </>
    );
  }

  if (key === "clinical") {
    return (
      <>
        <span>{metrics.pendingLabs} pending labs</span>
        <div className="mini-pills"><i /><i /><i /></div>
      </>
    );
  }

  return (
    <>
      <span>{healthLabel} health</span>
      <div className="mini-score">{healthScore}%</div>
    </>
  );
}

type MetricsLike = {
  activeHospitals: number;
  activePatients: number;
  pendingLabs: number;
};

const NetworkPanel: React.FC<{
  hospitals: Props["hospitals"];
  activeHospitals: number;
  assignedAdmins: number;
  hospitalPatientCounts: Record<string, number>;
}> = ({ hospitals, activeHospitals, assignedAdmins, hospitalPatientCounts }) => {
  const topHospitals = Object.entries(hospitalPatientCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="visual-panel-grid">
      <MetricTile icon={<Hospital size={19} />} label="Hospitals" value={hospitals.length} helper={`${activeHospitals} active`} />
      <MetricTile icon={<Users size={19} />} label="Assigned admins" value={assignedAdmins} helper="Active accounts" />
      <div className="visual-wide-block">
        {topHospitals.length ? (
          topHospitals.map(([name, count]) => <ProgressRow key={name} label={name} value={count} max={Math.max(...topHospitals.map((item) => item[1]))} />)
        ) : (
          <div className="empty-note">No patient distribution is available yet.</div>
        )}
      </div>
    </div>
  );
};

const PatientPanel: React.FC<{
  total: number;
  active: number;
  adults: number;
  children: number;
  statuses: Record<string, number>;
}> = ({ total, active, adults, children, statuses }) => (
  <div className="visual-panel-grid">
    <MetricTile icon={<Users size={19} />} label="Total patients" value={total} helper={`${active} active`} />
    <MetricTile icon={<UserRound size={19} />} label="Adults" value={adults} helper="18 years and older" />
    <MetricTile icon={<Baby size={19} />} label="Children" value={children} helper="Under 18 years" />
    <div className="visual-wide-block two-columns">
      {Object.entries(statuses).map(([status, count]) => (
        <ProgressRow key={status} label={status} value={count} max={Math.max(total, 1)} />
      ))}
    </div>
  </div>
);

const ClinicalPanel: React.FC<{
  pendingLabs: number;
  completedLabs: number;
  urgentLabs: number;
  prescriptionsOpen: number;
  recentClinicalDate: string;
}> = ({ pendingLabs, completedLabs, urgentLabs, prescriptionsOpen, recentClinicalDate }) => (
  <div className="visual-panel-grid">
    <MetricTile icon={<FlaskConical size={19} />} label="Pending labs" value={pendingLabs} helper={`${urgentLabs} urgent or stat`} />
    <MetricTile icon={<ClipboardList size={19} />} label="Completed labs" value={completedLabs} helper="Recorded results" />
    <MetricTile icon={<Pill size={19} />} label="Open prescriptions" value={prescriptionsOpen} helper="Pending or preparing" />
    <MetricTile icon={<Activity size={19} />} label="Latest clinical data" value={recentClinicalDate} helper="Across notes, visits, labs" />
  </div>
);

const BodyPanel: React.FC<{
  personMode: PersonMode;
  setPersonMode: (mode: PersonMode) => void;
  population: PatientDoc[];
  data: VisualData;
  healthScore: number;
  healthStatus: { label: string; tone: string };
}> = ({ personMode, setPersonMode, population, data, healthScore, healthStatus }) => {
  const patientIds = new Set(population.map((patient) => patient.patientId).filter(Boolean));
  const labs = data.labRequests.filter((item) => item.patientId && patientIds.has(item.patientId));
  const prescriptions = data.prescriptions.filter((item) => item.patientId && patientIds.has(item.patientId));
  const notes = data.notes.filter((item) => item.patientId && patientIds.has(item.patientId));
  const abnormalResults = labs.flatMap((lab) => lab.results || []).filter((result) => result.status === "ABNORMAL" || result.status === "CRITICAL").length;
  const pendingLabs = labs.filter((lab) => lab.status === "PENDING" || lab.status === "IN_PROGRESS").length;
  const openPrescriptions = prescriptions.filter((item) => item.status !== "DISPENSED").length;
  const title = personMode === "child" ? "Children Health Overview" : "Adult Health Overview";
  const subtitle = personMode === "child" ? "Overall view for patients under 18" : "Overall view for grown adult patients";

  return (
    <div className="body-panel">
      <div className="body-controls">
        <div className="body-overview-title">
          <span>{subtitle}</span>
          <strong>{title}</strong>
        </div>
        <div className="body-toggle">
          <button className={personMode === "adult" ? "active" : ""} onClick={() => setPersonMode("adult")} type="button">
            <UserRound size={16} />
            Adult
          </button>
          <button className={personMode === "child" ? "active" : ""} onClick={() => setPersonMode("child")} type="button">
            <Baby size={16} />
            Child
          </button>
        </div>
      </div>

      <div className="body-view">
        <div className={`human-body ${personMode} ${healthStatus.tone}`}>
          <div className="orbit-dot one" />
          <div className="orbit-dot two" />
          <div className="orbit-dot three" />
          <div className="pulse-ring" />
          <div className="pulse-ring second" />
          <div className="body-stage" aria-hidden="true">
            <div className="body-platform" />
            <div className="human-turntable">
              <div className="human-model">
                <div className="model-shadow" />
                <div className="model-head">
                  <span className="face-plane" />
                </div>
                <div className="model-neck" />
                <div className="model-shoulders" />
                <div className="model-arm left">
                  <span />
                </div>
                <div className="model-arm right">
                  <span />
                </div>
                <div className="model-torso">
                  <span className="rib-line left" />
                  <span className="rib-line right" />
                  <span className="organ heart"><HeartPulse size={24} /></span>
                  <span className="organ lungs" />
                  <span className="core-line" />
                </div>
                <div className="model-pelvis" />
                <div className="model-leg left">
                  <span />
                </div>
                <div className="model-leg right">
                  <span />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="body-summary">
          <div className={`health-score ${healthStatus.tone}`}>{healthScore}%</div>
          <h3>{healthStatus.label}</h3>
          <p>{population.length} {personMode === "child" ? "children" : "adults"} included in this overview</p>
          <div className="signal-grid">
            <MetricSignal label="Pending labs" value={pendingLabs} />
            <MetricSignal label="Open medicine" value={openPrescriptions} />
            <MetricSignal label="Lab alerts" value={abnormalResults} />
            <MetricSignal label="Care notes" value={notes.length} />
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricSignal: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="metric-signal">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const MetricTile: React.FC<{ icon: React.ReactNode; label: string; value: string | number; helper: string }> = ({ icon, label, value, helper }) => (
  <div className="metric-tile">
    <div className="metric-icon">{icon}</div>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{helper}</small>
  </div>
);

const ProgressRow: React.FC<{ label: string; value: number; max: number }> = ({ label, value, max }) => (
  <div className="progress-row">
    <div><span>{label}</span><b>{value}</b></div>
    <i><em style={{ width: `${Math.max(8, Math.round((value / Math.max(max, 1)) * 100))}%` }} /></i>
  </div>
);

export default VisualMedicalDashboard;
