import React, { useEffect, useMemo, useState } from "react";
import './HospitalAdminDashboard.css';
import {
  Activity,
  Building2,
  ClipboardList,
  FlaskConical,
  HeartPulse,
  Pill,
  ShieldCheck,
  Stethoscope,
  UserCog,
  Users,
} from "lucide-react";
import {
  createPatientByAdminFirestore,
  createWorkerFirestore,
  deletePatientFirestore,
  deleteWorkerFirestore,
  loadAdminProfile,
  loadHospitalById,
  loadPatientsByHospital,
  loadWorkersByHospital,
  searchPatientsAcrossHospitals,
  updateHospitalInfo,
  updatePatientFirestore,
  updateWorkerFirestore,
  type AdminUserProfile,
  type HospitalInfo,
  type PatientRow,
  type PatientAddress,
  type PatientRegistrationDetails,
  type WorkerRow,
} from "../hospitalAdminFirestore";
import HospitalAdminCreateWorkerForm from "../components/HospitalAdminCreateWorkerForm";
import HospitalAdminPatientForm from "../components/HospitalAdminPatientForm";
import { changeUserPasswordFirestore } from "../../auth/authFirestoreDb";

type Tab = "overview" | "hospital" | "workers" | "patients" | "security";

type Props = {
  adminId: string;
};

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => Promise<void> | void;
} | null;

const HospitalAdminDashboard: React.FC<Props> = ({ adminId }) => {
  const [tab, setTab] = useState<Tab>("overview");

  const [profile, setProfile] = useState<AdminUserProfile | null>(null);
  const [hospitalInfo, setHospitalInfo] = useState<HospitalInfo | null>(null);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [loadingPatients, setLoadingPatients] = useState(true);

  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);

  const [workerSearch, setWorkerSearch] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [crossHospitalSearch, setCrossHospitalSearch] = useState("");
  const [showCrossHospitalSearch, setShowCrossHospitalSearch] = useState(false);
  const [crossHospitalPatients, setCrossHospitalPatients] = useState<PatientRow[]>([]);
  const [loadingCrossHospital, setLoadingCrossHospital] = useState(false);

  const [showCreateWorker, setShowCreateWorker] = useState(false);
  const [showEditWorker, setShowEditWorker] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<WorkerRow | null>(null);
  const [savingWorker, setSavingWorker] = useState(false);

  const [showCreatePatient, setShowCreatePatient] = useState(false);
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
  const [savingPatient, setSavingPatient] = useState(false);

  const [savingHospital, setSavingHospital] = useState(false);
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalLocation, setHospitalLocation] = useState("");
  const [hospitalCountry, setHospitalCountry] = useState("Lesotho");
  const [hospitalLicenseNumber, setHospitalLicenseNumber] = useState("");
  const [hospitalDefaultRegistrationLocation, setHospitalDefaultRegistrationLocation] = useState("Reception");
  const [hospitalStatus, setHospitalStatus] = useState<"ACTIVE" | "DISABLED">("ACTIVE");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const [error, setError] = useState("");

  const loadAll = async (hospitalId: string) => {
    console.log("DEBUG: Loading data for hospital:", hospitalId);
    setLoadingWorkers(true);
    setLoadingPatients(true);

    try {
      const [workerRows, patientRows, hospitalRow] = await Promise.all([
        loadWorkersByHospital(hospitalId),
        loadPatientsByHospital(hospitalId),
        loadHospitalById(hospitalId),
      ]);

      console.log("DEBUG: Loaded data:", { 
        workers: workerRows.length, 
        patients: patientRows.length, 
        hospital: hospitalRow?.name,
        workerDetails: workerRows.map(w => ({ id: w.id, name: w.fullName, role: w.role, hospitalId: w.hospitalId })),
        patientDetails: patientRows.map(p => ({ id: p.id, name: p.fullName, hospitalId: p.hospitalId }))
      });

      setWorkers(workerRows);
      setPatients(patientRows);
      setHospitalInfo(hospitalRow);

      if (hospitalRow) {
        setHospitalName(hospitalRow.name);
        setHospitalLocation(hospitalRow.location);
        setHospitalCountry(hospitalRow.country);
        setHospitalLicenseNumber(hospitalRow.licenseNumber || "");
        setHospitalDefaultRegistrationLocation(hospitalRow.defaultRegistrationLocation || "Reception");
        setHospitalStatus(hospitalRow.status);
      }
    } catch (e: any) {
      console.error("LOAD HOSPITAL ADMIN DATA ERROR:", e);
      setError(e?.message || "Failed to load dashboard data.");
    } finally {
      setLoadingWorkers(false);
      setLoadingPatients(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      setLoadingProfile(true);
      setError("");

      try {
        const p = await loadAdminProfile(adminId);
        setProfile(p);

        if (p?.hospitalId) {
          await loadAll(p.hospitalId);
        }
      } catch (e: any) {
        console.error("LOAD ADMIN PROFILE ERROR:", e);
        setError(e?.message || "Failed to load hospital admin profile.");
      } finally {
        setLoadingProfile(false);
      }
    };

    run();
  }, [adminId]);

  const stats = useMemo(() => {
    return {
      totalWorkers: workers.length,
      doctors: workers.filter((w) => w.role === "DOCTOR").length,
      pharmacists: workers.filter((w) => w.role === "PHARMACIST").length,
      receptionists: workers.filter((w) => w.role === "RECEPTIONIST").length,
      labStaff: workers.filter((w) => w.role === "LAB_STAFF").length,
      totalPatients: patients.length,
      activePatients: patients.filter((p) => p.status === "ACTIVE").length,
    };
  }, [workers, patients]);

  const hospitalDisplayName = hospitalInfo?.name || profile?.hospitalName || profile?.hospitalId || "Hospital";

  const tabItems: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: "overview", label: "Overview", icon: <Activity size={18} /> },
    { key: "hospital", label: "Hospital", icon: <Building2 size={18} /> },
    { key: "workers", label: "Workers", icon: <UserCog size={18} /> },
    { key: "patients", label: "Patients", icon: <Users size={18} /> },
    { key: "security", label: "Security", icon: <ShieldCheck size={18} /> },
  ];

  const statCards = [
    { label: "Total Workers", value: stats.totalWorkers, helper: "All staff records", icon: <Users size={24} />, tone: "blue" },
    { label: "Doctors", value: stats.doctors, helper: "Clinical care team", icon: <Stethoscope size={24} />, tone: "teal" },
    { label: "Pharmacists", value: stats.pharmacists, helper: "Medicine operations", icon: <Pill size={24} />, tone: "green" },
    { label: "Receptionists", value: stats.receptionists, helper: "Front desk flow", icon: <ClipboardList size={24} />, tone: "amber" },
    { label: "Lab Staff", value: stats.labStaff, helper: "Diagnostics team", icon: <FlaskConical size={24} />, tone: "violet" },
    { label: "Patients", value: stats.totalPatients, helper: `${stats.activePatients} active profiles`, icon: <HeartPulse size={24} />, tone: "rose" },
  ];

  const filteredWorkers = useMemo(() => {
    const q = workerSearch.trim().toLowerCase();
    if (!q) return workers;

    return workers.filter((w) => {
      return (
        w.id.toLowerCase().includes(q) ||
        w.fullName.toLowerCase().includes(q) ||
        w.role.toLowerCase().includes(q)
      );
    });
  }, [workers, workerSearch]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;

    return patients.filter((p) => {
      return p.id.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q);
    });
  }, [patients, patientSearch]);

  const handleCreateWorker = async (payload: {
    hospitalId: string;
    hospitalName: string;
    role: "DOCTOR" | "PHARMACIST" | "RECEPTIONIST" | "LAB_STAFF";
    fullName: string;
    email: string;
    phone: string;
    status: "ACTIVE" | "DISABLED";
    password: string;
  }) => {
    setSavingWorker(true);
    setError("");

    try {
      await createWorkerFirestore(payload);
      const rows = await loadWorkersByHospital(payload.hospitalId);
      setWorkers(rows);
      setShowCreateWorker(false);
      setTab("workers");
    } catch (e: any) {
      console.error("CREATE WORKER ERROR:", e);
      setError(e?.message || "Failed to create worker.");
      throw e;
    } finally {
      setSavingWorker(false);
    }
  };

  const handleEditWorker = async (payload: {
    hospitalId: string;
    hospitalName: string;
    role: "DOCTOR" | "PHARMACIST" | "RECEPTIONIST" | "LAB_STAFF";
    fullName: string;
    email: string;
    phone: string;
    status: "ACTIVE" | "DISABLED";
    password: string;
  }) => {
    if (!profile?.hospitalId || !selectedWorker) return;

    setSavingWorker(true);
    setError("");

    try {
      await updateWorkerFirestore(profile.hospitalId, {
        workerId: selectedWorker.id,
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        role: payload.role,
        status: payload.status,
        password: payload.password,
      });

      const rows = await loadWorkersByHospital(profile.hospitalId);
      setWorkers(rows);
      setShowEditWorker(false);
      setSelectedWorker(null);
    } catch (e: any) {
      console.error("UPDATE WORKER ERROR:", e);
      setError(e?.message || "Failed to update worker.");
      throw e;
    } finally {
      setSavingWorker(false);
    }
  };

  const handleDeleteWorker = async (workerId: string) => {
    if (!profile?.hospitalId) return;

    setConfirmState({
      title: "Delete Worker",
      message: "Are you sure you want to delete this worker?",
      onConfirm: async () => {
        try {
          await deleteWorkerFirestore(workerId);
          const rows = await loadWorkersByHospital(profile.hospitalId!);
          setWorkers(rows);
        } catch (e: any) {
          console.error("DELETE WORKER ERROR:", e);
          setError(e?.message || "Failed to delete worker.");
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  const handleCreatePatient = async (payload: {
    hospitalId: string;
    hospitalName: string;
    hospitalCode: string;
    districtCode: string;
    fullName: string;
    sex: "MALE" | "FEMALE";
    age: number;
    phone: string;
    email?: string;
    status: "ACTIVE" | "DISABLED";
    password: string;
    registrationDetails: PatientRegistrationDetails;
    address: PatientAddress;
  }) => {
    setSavingPatient(true);
    setError("");

    try {
      await createPatientByAdminFirestore(payload);
      const rows = await loadPatientsByHospital(payload.hospitalId);
      setPatients(rows);
      setShowCreatePatient(false);
      setTab("patients");
    } catch (e: any) {
      console.error("CREATE PATIENT ERROR:", e);
      setError(e?.message || "Failed to create patient.");
      throw e;
    } finally {
      setSavingPatient(false);
    }
  };

  const handleEditPatient = async (payload: {
    hospitalId: string;
    hospitalName: string;
    hospitalCode: string;
    districtCode: string;
    fullName: string;
    sex: "MALE" | "FEMALE";
    age: number;
    phone: string;
    email?: string;
    status: "ACTIVE" | "DISABLED";
    password: string;
    registrationDetails: PatientRegistrationDetails;
    address: PatientAddress;
  }) => {
    if (!profile?.hospitalId || !selectedPatient) return;

    setSavingPatient(true);
    setError("");

    try {
      await updatePatientFirestore(profile.hospitalId, {
        patientId: selectedPatient.id,
        fullName: payload.fullName,
        sex: payload.sex,
        age: payload.age,
        phone: payload.phone,
        email: payload.email,
        status: payload.status,
        password: payload.password,
        registrationDetails: payload.registrationDetails,
        address: payload.address,
      });

      const rows = await loadPatientsByHospital(profile.hospitalId);
      setPatients(rows);
      setShowEditPatient(false);
      setSelectedPatient(null);
    } catch (e: any) {
      console.error("UPDATE PATIENT ERROR:", e);
      setError(e?.message || "Failed to update patient.");
      throw e;
    } finally {
      setSavingPatient(false);
    }
  };

  const handleDeletePatient = async (patientId: string) => {
    if (!profile?.hospitalId) return;

    setConfirmState({
      title: "Delete Patient",
      message: "Are you sure you want to delete this patient?",
      onConfirm: async () => {
        try {
          await deletePatientFirestore(patientId);
          const rows = await loadPatientsByHospital(profile.hospitalId!);
          setPatients(rows);
        } catch (e: any) {
          console.error("DELETE PATIENT ERROR:", e);
          setError(e?.message || "Failed to delete patient.");
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  const handleUpdateHospital = async () => {
    if (!profile?.hospitalId) return;

    setSavingHospital(true);
    setError("");

    try {
      await updateHospitalInfo(profile.hospitalId, {
        name: hospitalName,
        location: hospitalLocation,
        country: hospitalCountry,
        licenseNumber: hospitalLicenseNumber,
        defaultRegistrationLocation: hospitalDefaultRegistrationLocation,
        status: hospitalStatus,
      });

      const row = await loadHospitalById(profile.hospitalId);
      setHospitalInfo(row);
      if (row) {
        setHospitalName(row.name);
        setHospitalLocation(row.location);
        setHospitalCountry(row.country);
        setHospitalStatus(row.status);
      }
    } catch (e: any) {
      console.error("UPDATE HOSPITAL ERROR:", e);
      setError(e?.message || "Failed to update hospital.");
    } finally {
      setSavingHospital(false);
    }
  };

  const handleChangePassword = async () => {
    setError("");
    setPasswordSuccess("");

    if (!currentPassword.trim()) {
      setError("Current password is required.");
      return;
    }

    if (!newPassword.trim()) {
      setError("New password is required.");
      return;
    }

    if (newPassword.trim().length < 4) {
      setError("New password must be at least 4 characters.");
      return;
    }

    if (newPassword.trim() !== confirmNewPassword.trim()) {
      setError("New passwords do not match.");
      return;
    }

    setSavingPassword(true);

    try {
      await changeUserPasswordFirestore({
        userId: adminId,
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordSuccess("Password changed successfully.");
    } catch (e: any) {
      console.error("CHANGE PASSWORD ERROR:", e);
      setError(e?.message || "Failed to change password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleCrossHospitalSearch = async () => {
    if (!crossHospitalSearch.trim()) {
      setCrossHospitalPatients([]);
      return;
    }

    setLoadingCrossHospital(true);
    setError("");

    try {
      const results = await searchPatientsAcrossHospitals(crossHospitalSearch.trim());
      setCrossHospitalPatients(results);
    } catch (e: any) {
      console.error("CROSS-HOSPITAL SEARCH ERROR:", e);
      setError(e?.message || "Failed to search patients across hospitals.");
    } finally {
      setLoadingCrossHospital(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (crossHospitalSearch.trim()) {
        handleCrossHospitalSearch();
      } else {
        setCrossHospitalPatients([]);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [crossHospitalSearch]);

  if (loadingProfile) {
    return (
      <div style={styles.page}>
        <div style={styles.panel}>Loading hospital admin profile...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={styles.page}>
        <div style={styles.error}>Hospital admin profile not found in Firestore.</div>
      </div>
    );
  }

  return (
    <div className="hospital-admin-dashboard" style={styles.page}>
      <div className="hospital-admin-shell">
      <div className="hospital-admin-hero" style={styles.topCard}>
        <div className="hospital-admin-titleBlock">
          <div className="hospital-admin-mark">
            <Building2 size={28} />
          </div>
          <div>
          <div className="hospital-admin-eyebrow">Hospital operations</div>
          <div style={styles.h1}>Hospital Admin Dashboard</div>
          <div style={styles.sub}>
            Admin: <b>{profile.fullName}</b> - Hospital: <b>{hospitalDisplayName}</b>
          </div>
            <div className="hospital-admin-heroMeta">
              <span>{hospitalInfo?.location || "Location pending"}</span>
              <span>{hospitalInfo?.country || "Country pending"}</span>
              <span className={hospitalStatus === "ACTIVE" ? "status-pill active" : "status-pill disabled"}>{hospitalStatus}</span>
            </div>
          </div>
        </div>

        <div className="hospital-admin-tabs" style={styles.tabs}>
          {tabItems.map((item) => (
            <button
              key={item.key}
              className={tab === item.key ? "hospital-admin-tab active" : "hospital-admin-tab"}
              style={tab === item.key ? styles.tabActive : styles.tab}
              onClick={() => setTab(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {passwordSuccess ? <div style={styles.success}>{passwordSuccess}</div> : null}

      {tab === "overview" && (
        <div className="hospital-admin-overview">
          <div className="hospital-admin-summaryCard">
            <div>
              <div className="hospital-admin-eyebrow">Current facility</div>
              <h2>{hospitalDisplayName}</h2>
              <p>{hospitalInfo?.location || "No location set"} - {hospitalInfo?.country || "No country set"}</p>
            </div>
            <div className="hospital-admin-summaryGrid">
              <span><b>{stats.totalWorkers}</b> workers</span>
              <span><b>{stats.totalPatients}</b> patients</span>
              <span><b>{stats.activePatients}</b> active patients</span>
            </div>
          </div>

          <div style={styles.cards}>
            {statCards.map((card) => (
              <div key={card.label} className={`hospital-admin-statCard tone-${card.tone}`} style={styles.card}>
                <div className="hospital-admin-statIcon">{card.icon}</div>
                <div>
                  <div style={styles.cardLabel}>{card.label}</div>
                  <div style={styles.cardValue}>{card.value}</div>
                  <div className="hospital-admin-cardHelper">{card.helper}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "hospital" && (
        <div className="hospital-admin-hospitalGrid">
        <div className="hospital-admin-profileCard">
          <div className="hospital-admin-profileIcon">
            <Building2 size={34} />
          </div>
          <div className="hospital-admin-eyebrow">Facility profile</div>
          <h2>{hospitalDisplayName}</h2>
          <p>{hospitalInfo?.location || "No location set"} - {hospitalInfo?.country || "No country set"}</p>
          <div className={hospitalStatus === "ACTIVE" ? "status-pill active" : "status-pill disabled"}>{hospitalStatus}</div>
        </div>
        <div className="hospital-admin-formPanel" style={styles.panel}>
          <div style={styles.sectionTitle}>Update Hospital Information</div>
          <div style={styles.sectionSub}>Keep the facility profile accurate for staff, patients, and reports.</div>

          <div className="hospital-admin-formGrid" style={styles.form}>
            <label style={styles.label}>
              Hospital Name
              <input style={styles.input} value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} />
            </label>

            <label style={styles.label}>
              Location
              <input style={styles.input} value={hospitalLocation} onChange={(e) => setHospitalLocation(e.target.value)} />
            </label>

            <label style={styles.label}>
              Country
              <input style={styles.input} value={hospitalCountry} onChange={(e) => setHospitalCountry(e.target.value)} />
            </label>

            <label style={styles.label}>
              Licence Number
              <input style={styles.input} value={hospitalLicenseNumber} onChange={(e) => setHospitalLicenseNumber(e.target.value)} />
            </label>

            <label style={styles.label}>
              Default Registration Location
              <input style={styles.input} value={hospitalDefaultRegistrationLocation} onChange={(e) => setHospitalDefaultRegistrationLocation(e.target.value)} />
            </label>

            <label style={styles.label}>
              Status
              <select style={styles.input} value={hospitalStatus} onChange={(e) => setHospitalStatus(e.target.value as any)}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="DISABLED">DISABLED</option>
              </select>
            </label>

            <button style={styles.primaryBtn} onClick={handleUpdateHospital} disabled={savingHospital}>
              {savingHospital ? "Saving..." : "Update Hospital"}
            </button>
          </div>
        </div>
        </div>
      )}

      {tab === "workers" && (
        <div style={styles.panel}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>Workers</div>
              <div style={styles.sectionSub}>Create, read, update and delete hospital workers.</div>
            </div>

            <button style={styles.primaryBtn} onClick={() => setShowCreateWorker(true)}>
              + Add Worker
            </button>
          </div>

          <input
            style={styles.searchInput}
            value={workerSearch}
            onChange={(e) => setWorkerSearch(e.target.value)}
            placeholder="Search by worker ID, name, or role..."
          />

          {loadingWorkers ? (
            <div style={styles.loading}>Loading workers...</div>
          ) : filteredWorkers.length === 0 ? (
            <div style={styles.loading}>No workers found.</div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID</th>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}>Email</th>
                    <th style={styles.th}>Phone</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Created</th>
                    <th style={styles.thRight}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkers.map((w) => (
                    <tr key={w.id}>
                      <td style={styles.tdMono}>{w.id}</td>
                      <td style={styles.td}>{w.fullName}</td>
                      <td style={styles.td}>{w.role}</td>
                      <td style={styles.td}>{w.email}</td>
                      <td style={styles.td}>{w.phone}</td>
                      <td style={styles.td}>{w.status}</td>
                      <td style={styles.td}>{w.createdAt}</td>
                      <td style={styles.tdRight}>
                        <div style={styles.actionGroup}>
                          <button
                            style={styles.editBtn}
                            onClick={() => {
                              setSelectedWorker(w);
                              setShowEditWorker(true);
                            }}
                          >
                            Edit
                          </button>
                          <button style={styles.deleteBtn} onClick={() => handleDeleteWorker(w.id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "patients" && (
        <div style={styles.panel}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>Patients</div>
              <div style={styles.sectionSub}>Create, read, update and delete patients in your hospital.</div>
            </div>

            <button style={styles.secondaryBtn} onClick={() => setShowCreatePatient(true)}>
              + Add Patient
            </button>
          </div>

          <div style={styles.searchSection}>
            <div style={styles.searchToggle}>
              <button
                style={!showCrossHospitalSearch ? styles.searchToggleActive : styles.searchToggleInactive}
                onClick={() => setShowCrossHospitalSearch(false)}
              >
                My Hospital Patients
              </button>
              <button
                style={showCrossHospitalSearch ? styles.searchToggleActive : styles.searchToggleInactive}
                onClick={() => setShowCrossHospitalSearch(true)}
              >
                Search All Hospitals
              </button>
            </div>

            {!showCrossHospitalSearch ? (
              <input
                style={styles.searchInput}
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Search by patient ID or patient name..."
              />
            ) : (
              <input
                style={styles.searchInput}
                value={crossHospitalSearch}
                onChange={(e) => setCrossHospitalSearch(e.target.value)}
                placeholder="Search patients across all hospitals by ID, name, phone, or hospital..."
              />
            )}
          </div>

          {!showCrossHospitalSearch && (
            <>
              {loadingPatients ? (
                <div style={styles.loading}>Loading patients...</div>
              ) : filteredPatients.length === 0 ? (
                <div style={styles.loading}>No patients found in your hospital.</div>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Patient ID</th>
                        <th style={styles.th}>Name</th>
                        <th style={styles.th}>Sex</th>
                        <th style={styles.th}>Age</th>
                        <th style={styles.th}>Phone</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Created</th>
                        <th style={styles.thRight}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPatients.map((p) => (
                        <tr key={p.id}>
                          <td style={styles.tdMono}>{p.id}</td>
                          <td style={styles.td}>{p.fullName}</td>
                          <td style={styles.td}>{p.sex}</td>
                          <td style={styles.td}>{p.age}</td>
                          <td style={styles.td}>{p.phone}</td>
                          <td style={styles.td}>{p.status}</td>
                          <td style={styles.td}>{p.createdAt}</td>
                          <td style={styles.tdRight}>
                            <div style={styles.actionGroup}>
                              <button
                                style={styles.editBtn}
                                onClick={() => {
                                  setSelectedPatient(p);
                                  setShowEditPatient(true);
                                }}
                              >
                                Edit
                              </button>
                              <button style={styles.deleteBtn} onClick={() => handleDeletePatient(p.id)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {showCrossHospitalSearch && (
            <>
              {loadingCrossHospital ? (
                <div style={styles.loading}>Searching across all hospitals...</div>
              ) : crossHospitalSearch.trim() && crossHospitalPatients.length === 0 ? (
                <div style={styles.loading}>No patients found across all hospitals.</div>
              ) : crossHospitalSearch.trim() && crossHospitalPatients.length > 0 ? (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Patient ID</th>
                        <th style={styles.th}>Name</th>
                        <th style={styles.th}>Sex</th>
                        <th style={styles.th}>Age</th>
                        <th style={styles.th}>Phone</th>
                        <th style={styles.th}>Hospital</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Created</th>
                        <th style={styles.thRight}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crossHospitalPatients.map((p) => (
                        <tr key={p.id}>
                          <td style={styles.tdMono}>{p.id}</td>
                          <td style={styles.td}>
                            <div>
                              <div>{p.fullName}</div>
                              {p.hospitalId !== profile?.hospitalId && (
                                <div style={{ fontSize: 11, opacity: 0.7, color: "#1f7ae0" }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <Building2 size={12} />
                                    {p.hospitalName}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={styles.td}>{p.sex}</td>
                          <td style={styles.td}>{p.age}</td>
                          <td style={styles.td}>{p.phone}</td>
                          <td style={styles.td}>
                            <span
                              style={{
                                ...styles.badge,
                                ...(p.hospitalId === profile?.hospitalId 
                                  ? styles.badgeGreen 
                                  : styles.badgeBlue)
                              }}
                            >
                              {p.hospitalId === profile?.hospitalId ? "My Hospital" : p.hospitalName}
                            </span>
                          </td>
                          <td style={styles.td}>{p.status}</td>
                          <td style={styles.td}>{p.createdAt}</td>
                          <td style={styles.tdRight}>
                            <div style={styles.actionGroup}>
                              {p.hospitalId === profile?.hospitalId ? (
                                <>
                                  <button
                                    style={styles.editBtn}
                                    onClick={() => {
                                      setSelectedPatient(p);
                                      setShowEditPatient(true);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button style={styles.deleteBtn} onClick={() => handleDeletePatient(p.id)}>
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <span style={{ fontSize: 12, opacity: 0.7, color: "#666" }}>
                                  View Only
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={styles.loading}>Enter a search term to find patients across all hospitals.</div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "security" && (
        <div style={styles.panel}>
          <div style={styles.sectionTitle}>Change Password</div>
          <div style={styles.sectionSub}>Update your own password anytime.</div>

          <div className="animated-form-surface" style={styles.form}>
            <label style={styles.label}>
              Current Password
              <input
                style={styles.input}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>

            <label style={styles.label}>
              New Password
              <input
                style={styles.input}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>

            <label style={styles.label}>
              Confirm New Password
              <input
                style={styles.input}
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </label>

            <button style={styles.primaryBtn} onClick={handleChangePassword} disabled={savingPassword}>
              {savingPassword ? "Saving..." : "Change Password"}
            </button>
          </div>
        </div>
      )}

      {showCreateWorker && profile && (
        <div style={styles.overlay} onClick={() => !savingWorker && setShowCreateWorker(false)}>
          <div className="animated-form-surface" style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0 }}>Create Worker</h2>
              <button style={styles.closeBtn} onClick={() => !savingWorker && setShowCreateWorker(false)}>
                ✕
              </button>
            </div>

            <HospitalAdminCreateWorkerForm
              mode="create"
              hospitalId={profile.hospitalId}
              hospitalName={hospitalInfo?.name || profile.hospitalName || profile.hospitalId}
              onCancel={() => setShowCreateWorker(false)}
              onSubmit={handleCreateWorker}
              saving={savingWorker}
            />
          </div>
        </div>
      )}

      {showEditWorker && profile && selectedWorker && (
        <div style={styles.overlay} onClick={() => !savingWorker && setShowEditWorker(false)}>
          <div className="animated-form-surface" style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0 }}>Edit Worker</h2>
              <button
                style={styles.closeBtn}
                onClick={() => {
                  if (!savingWorker) {
                    setShowEditWorker(false);
                    setSelectedWorker(null);
                  }
                }}
              >
                ✕
              </button>
            </div>

            <HospitalAdminCreateWorkerForm
              mode="edit"
              hospitalId={profile.hospitalId}
              hospitalName={hospitalInfo?.name || profile.hospitalName || profile.hospitalId}
              initialValue={{
                id: selectedWorker.id,
                role: selectedWorker.role,
                fullName: selectedWorker.fullName,
                email: selectedWorker.email,
                phone: selectedWorker.phone,
                status: selectedWorker.status,
              }}
              onCancel={() => {
                setShowEditWorker(false);
                setSelectedWorker(null);
              }}
              onSubmit={handleEditWorker}
              saving={savingWorker}
            />
          </div>
        </div>
      )}

      {showCreatePatient && profile && hospitalInfo && (
        <div style={styles.overlay} onClick={() => !savingPatient && setShowCreatePatient(false)}>
          <div className="animated-form-surface" style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0 }}>Create Patient</h2>
              <button style={styles.closeBtn} onClick={() => !savingPatient && setShowCreatePatient(false)}>
                ✕
              </button>
            </div>

            <HospitalAdminPatientForm
              mode="create"
              hospitalId={profile.hospitalId}
              hospitalName={hospitalInfo.name}
              hospitalCode={hospitalInfo.hospitalCode}
              districtCode={hospitalInfo.districtCode}
              onCancel={() => setShowCreatePatient(false)}
              onSubmit={handleCreatePatient}
              saving={savingPatient}
            />
          </div>
        </div>
      )}

      {showEditPatient && profile && hospitalInfo && selectedPatient && (
        <div style={styles.overlay} onClick={() => !savingPatient && setShowEditPatient(false)}>
          <div className="animated-form-surface" style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0 }}>Edit Patient</h2>
              <button
                style={styles.closeBtn}
                onClick={() => {
                  if (!savingPatient) {
                    setShowEditPatient(false);
                    setSelectedPatient(null);
                  }
                }}
              >
                ✕
              </button>
            </div>

            <HospitalAdminPatientForm
              mode="edit"
              hospitalId={profile.hospitalId}
              hospitalName={hospitalInfo.name}
              hospitalCode={hospitalInfo.hospitalCode}
              districtCode={hospitalInfo.districtCode}
              initialValue={{
                id: selectedPatient.id,
                fullName: selectedPatient.fullName,
                sex: selectedPatient.sex,
                age: selectedPatient.age,
                phone: selectedPatient.phone,
                email: selectedPatient.email || "",
                status: selectedPatient.status,
                registrationDetails: selectedPatient.registrationDetails,
                address: selectedPatient.address,
              }}
              onCancel={() => {
                setShowEditPatient(false);
                setSelectedPatient(null);
              }}
              onSubmit={handleEditPatient}
              saving={savingPatient}
            />
          </div>
        </div>
      )}

      {confirmState && (
        <div style={styles.overlay} onClick={() => setConfirmState(null)}>
          <div style={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.confirmTitle}>{confirmState.title}</div>
            <div style={styles.confirmText}>{confirmState.message}</div>
            <div style={styles.confirmActions}>
              <button style={styles.cancelBtnAlt} onClick={() => setConfirmState(null)}>
                Cancel
              </button>
              <button
                style={styles.confirmDeleteBtn}
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
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 18, minHeight: "100vh" },
  topCard: {
    background: "white",
    border: "1px solid #e5eaf2",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 8px 26px rgba(15,23,42,0.06)",
    marginBottom: 14,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    alignItems: "center",
  },
  h1: { fontSize: 22, fontWeight: 1000, color: "#000000" },
  sub: { marginTop: 4, fontSize: 13, opacity: 0.75, fontWeight: 800 },
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
  error: {
    marginBottom: 14,
    background: "#fff1f2",
    border: "1px solid #ffd3d3",
    color: "#b42318",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 700,
  },
  success: {
    marginBottom: 14,
    background: "#ecfdf3",
    border: "1px solid #abefc6",
    color: "#067647",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 700,
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  card: {
    background: "white",
    border: "1px solid #e5eaf2",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 8px 26px rgba(15,23,42,0.06)",
  },
  cardLabel: { fontSize: 13, opacity: 0.75, marginBottom: 8 },
  cardValue: { fontSize: 28, fontWeight: 900 },
  panel: {
    background: "white",
    border: "1px solid #e5eaf2",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 8px 26px rgba(15,23,42,0.06)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: 900 },
  sectionSub: { marginTop: 6, opacity: 0.75, fontWeight: 700, fontSize: 13 },
  primaryBtn: {
    border: "none",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    background: "linear-gradient(135deg, #1f7ae0, #4a90e2)",
    color: "white",
    fontWeight: 900,
    width: "fit-content",
  },
  secondaryBtn: {
    border: "none",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    background: "linear-gradient(135deg, #35b7a5, #4a90e2)",
    color: "white",
    fontWeight: 900,
    width: "fit-content",
  },
  searchSection: { marginBottom: 12 },
  searchToggle: {
    display: "flex",
    gap: 2,
    marginBottom: 12,
    background: "#f1f5f9",
    padding: 4,
    borderRadius: 12,
  },
  searchToggleActive: {
    border: "none",
    background: "white",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 900,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  searchToggleInactive: {
    border: "none",
    background: "transparent",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 900,
    color: "#64748b",
  },
  searchInput: {
    width: "100%",
    border: "1px solid #cfd7e3",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    fontWeight: 800,
    marginBottom: 12,
  },
  loading: {
    marginTop: 12,
    background: "#f8fafc",
    border: "1px solid #e5eaf2",
    borderRadius: 12,
    padding: 12,
    fontWeight: 800,
  },
  tableWrap: {
    width: "100%",
    overflow: "auto",
    border: "1px solid #eef2f7",
    borderRadius: 12,
    marginTop: 12,
  },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 980 },
  th: {
    textAlign: "left",
    padding: 12,
    fontSize: 12,
    opacity: 0.75,
    fontWeight: 1000,
    borderBottom: "1px solid #eef2f7",
    whiteSpace: "nowrap",
  },
  thRight: {
    textAlign: "right",
    padding: 12,
    fontSize: 12,
    opacity: 0.75,
    fontWeight: 1000,
    borderBottom: "1px solid #eef2f7",
    whiteSpace: "nowrap",
  },
  td: {
    padding: 12,
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
    fontWeight: 800,
    color: "#000000",
  },
  tdMono: {
    padding: 12,
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
    fontWeight: 1000,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  tdRight: {
    padding: 12,
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
    textAlign: "right",
  },
  actionGroup: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  editBtn: {
    border: "1px solid #bfd3ff",
    background: "#eef5ff",
    color: "#1d4ed8",
    borderRadius: 10,
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 1000,
  },
  deleteBtn: {
    border: "1px solid #fecdd3",
    background: "#fff1f2",
    color: "#9f1239",
    borderRadius: 10,
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 1000,
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
    background: "#ecfdf3",
    color: "#067647",
    borderColor: "#bfe8d1",
  },
  badgeBlue: {
    background: "#eff6ff",
    color: "#1d4ed8",
    borderColor: "#dbeafe",
  },
  badgeRed: {
    background: "#fff1f2",
    color: "#b42318",
    borderColor: "#ffd3d3",
  },
  form: { display: "grid", gap: 12, marginTop: 12, maxWidth: 520 },
  label: { display: "grid", gap: 6, fontWeight: 900, color: "#0f172a" },
  input: {
    border: "1px solid #cfd7e3",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    fontWeight: 800,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1200,
  },
  modal: {
    width: "100%",
    maxWidth: 980,
    maxHeight: "calc(100vh - 32px)",
    overflowY: "auto",
    background: "white",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    boxSizing: "border-box",
  },
  confirmModal: {
    width: "100%",
    maxWidth: 440,
    background: "white",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 1000,
    color: "#0f172a",
    marginBottom: 8,
  },
  confirmText: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "#475569",
    marginBottom: 20,
    fontWeight: 700,
  },
  confirmActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  cancelBtnAlt: {
    border: "1px solid #cfd7e3",
    background: "white",
    color: "#0f172a",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 900,
  },
  confirmDeleteBtn: {
    border: "none",
    background: "#dc2626",
    color: "white",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 900,
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 20,
    cursor: "pointer",
    padding: 4,
  },
};

export default HospitalAdminDashboard;
