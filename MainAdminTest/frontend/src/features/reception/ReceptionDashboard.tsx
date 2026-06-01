import { useState, useEffect, useMemo } from "react";
import './ReceptionDashboard.css';
import {
  loadPatientsByHospital,
  loadHospitalById,
  findPatientById,
  createPatientByAdminFirestore,
  getPatientAccount,
  createPatientAccount,
  updatePrescriptionPaymentStatus,
  addPatientVisit,
  loadTodayVisitsByHospital,
  type PatientRow,
  type PatientVisit,
  type Prescription,
  type PatientAccount,
  type HospitalInfo,
  loadPrescriptionsByHospital,
  testMpesaPayment,
} from "../hospitalAdmin/hospitalAdminFirestore";
import {
  BadgePlus,
  Banknote,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  Clock,
  CreditCard,
  Hospital,
  IdCard,
  PhoneCall,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Smartphone,
  UserCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { digitsOnlyInput, lettersOnlyInput, validateMeaningfulLetters, validateNumericText } from "../../utils/formValidation";

type Props = {
  receptionistId: string;
  hospitalId: string;
};

type Tab = "search" | "register" | "visits" | "payments" | "processing";
type PaymentMethod = "ACCOUNT_BALANCE" | "CASH" | "MPESA" | "ECOCASH";

function makeRegistrationDefaults(hospital?: HospitalInfo | null) {
  return {
    registrationCheckId: "",
    healthCareNumber: "",
    registrationLocation: hospital?.defaultRegistrationLocation || "Reception",
    registrationDate: new Date().toISOString().slice(0, 10),
    registrationTime: new Date().toTimeString().slice(0, 5),
    firstName: "",
    lastName: "",
    sex: "MALE" as "MALE" | "FEMALE",
    age: "",
    phone: "",
    email: "",
    streetAddress: "",
    streetAddressLine2: "",
    city: hospital?.location || "",
    region: hospital?.districtCode || "",
    postalCode: "",
    country: hospital?.country || "Lesotho",
  };
}

export default function ReceptionDashboard({ receptionistId, hospitalId }: Props) {
  const [tab, setTab] = useState<Tab>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
  const [externalPatientResult, setExternalPatientResult] = useState<PatientRow | null>(null);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [todayVisitRows, setTodayVisitRows] = useState<PatientVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("MPESA");
  const [paymentPhone, setPaymentPhone] = useState("");
  const [patientAccount, setPatientAccount] = useState<PatientAccount | null>(null);
  const [loadingPatientAccount, setLoadingPatientAccount] = useState(false);
  const [focusedPaymentPrescriptionId, setFocusedPaymentPrescriptionId] = useState("");
  const [focusedPaymentPatient, setFocusedPaymentPatient] = useState<PatientRow | null>(null);
  const [hospitalInfo, setHospitalInfo] = useState<HospitalInfo | null>(null);

  // Registration form state
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [formData, setFormData] = useState(() => makeRegistrationDefaults());

  // Today's visits tracking
  const [todayVisits, setTodayVisits] = useState<string[]>([]);

  const ui = {
    page: {
      padding: "32px 30px 56px",
      fontFamily: "var(--font-family)",
      background:
        "radial-gradient(circle at 12% 10%, rgba(20,184,166,0.14), transparent 28%), radial-gradient(circle at 86% 18%, rgba(59,130,246,0.16), transparent 26%), linear-gradient(180deg, #edf7ff 0%, #f7fbff 34%, #ffffff 100%)",
      minHeight: "calc(100vh - 112px)",
    },
    header: {
      marginBottom: 28,
      display: "grid",
      gridTemplateColumns: "minmax(280px, 0.82fr) minmax(560px, 1.18fr)",
      gap: 24,
      alignItems: "end",
    },
    heroTitle: {
      display: "flex",
      alignItems: "center",
      gap: 14,
    },
    heroIcon: {
      width: 62,
      height: 62,
      borderRadius: 16,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #1f7ae0, #35b7a5)",
      color: "white",
      boxShadow: "0 18px 34px rgba(31, 122, 224, 0.2)",
      flexShrink: 0,
    },
    h1: { fontSize: 40, lineHeight: 1.05, fontWeight: 950, margin: 0, color: "#16233a" },
    sub: { fontSize: 18, color: "#4b5563", marginTop: 14 },
    statGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      gap: 14,
      marginBottom: 18,
    },
    statCard: {
      background: "rgba(255,255,255,0.94)",
      border: "1px solid rgba(148, 163, 184, 0.24)",
      borderRadius: 16,
      padding: 18,
      display: "grid",
      gridTemplateColumns: "46px minmax(0, 1fr)",
      gap: 12,
      alignItems: "center",
      boxShadow: "0 16px 38px rgba(15, 23, 42, 0.07)",
    },
    statIcon: {
      width: 46,
      height: 46,
      borderRadius: 12,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#eff6ff",
      color: "#2563eb",
    },
    statIconGreen: {
      background: "#e8f6ff",
      color: "#256f9f",
    },
    statIconAmber: {
      background: "#eefafa",
      color: "#287dba",
    },
    statLabel: { fontSize: 12, color: "#64748b", fontWeight: 900, textTransform: "uppercase" as const },
    statValue: { marginTop: 4, fontSize: 26, color: "#0f172a", fontWeight: 1000 },
    tabs: {
      display: "grid",
      gridTemplateColumns: "repeat(5, minmax(150px, 1fr))",
      gap: 8,
      overflow: "visible" as const,
      maxWidth: "100%",
    },
    tab: {
      minHeight: 52,
      padding: "0 16px",
      border: "1px solid rgba(148, 163, 184, 0.28)",
      background: "rgba(255,255,255,0.68)",
      color: "#0f172a",
      cursor: "pointer",
      borderRadius: 14,
      fontSize: 14,
      fontWeight: 800,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      whiteSpace: "nowrap" as const,
    },
    tabActive: {
      minHeight: 52,
      padding: "0 16px",
      border: "1px solid rgba(64, 130, 214, 0.18)",
      background: "linear-gradient(135deg, #1f7ae0, #4a90e2)",
      color: "white",
      cursor: "pointer",
      borderRadius: 14,
      fontSize: 14,
      fontWeight: 800,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      whiteSpace: "nowrap" as const,
      boxShadow: "0 14px 28px rgba(57, 125, 211, 0.18)",
    },
    section: {
      background: "rgba(255,255,255,0.96)",
      borderRadius: 18,
      padding: 30,
      marginBottom: 18,
      border: "1px solid rgba(148, 163, 184, 0.28)",
      boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)",
    },
    paymentPanel: {
      marginTop: 18,
      border: "1px solid rgba(31, 122, 224, 0.18)",
      background: "linear-gradient(180deg, #ffffff 0%, #f5fbff 100%)",
      borderRadius: 20,
      padding: 26,
      boxShadow: "0 22px 54px rgba(31, 122, 224, 0.12)",
    },
    paymentHeader: {
      display: "grid",
      gridTemplateColumns: "minmax(240px, 1fr) auto",
      gap: 18,
      alignItems: "center",
      marginBottom: 18,
    },
    paymentTitle: { fontSize: 24, fontWeight: 1000, color: "#102a43", marginBottom: 6 },
    paymentSub: { fontSize: 14, color: "#5d7088", fontWeight: 800 },
    paymentBadge: {
      minHeight: 42,
      padding: "0 14px",
      borderRadius: 999,
      background: "#e8f6ff",
      color: "#256f9f",
      border: "1px solid #c8e9ff",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontWeight: 1000,
      whiteSpace: "nowrap" as const,
    },
    paymentMetrics: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 12,
      marginBottom: 18,
    },
    paymentMetric: {
      border: "1px solid #dbeafe",
      background: "#f8fbff",
      borderRadius: 14,
      padding: 14,
    },
    paymentMetricLabel: { fontSize: 12, color: "#5d7088", fontWeight: 900, textTransform: "uppercase" as const },
    paymentMetricValue: { marginTop: 6, fontSize: 20, color: "#102a43", fontWeight: 1000 },
    mpesaText: { color: "#dc2626", fontWeight: 1000 },
    mpesaBadge: {
      background: "#fee2e2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    },
    mpesaInput: {
      border: "1px solid #fecaca",
      color: "#b91c1c",
      background: "#fff5f5",
    },
    paymentCard: {
      border: "1px solid #cde7fb",
      background: "#ffffff",
      borderRadius: 16,
      padding: 18,
      boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
    },
    paymentFormGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 14,
      marginTop: 14,
    },
    paymentInput: {
      width: "100%",
      minHeight: 52,
      padding: "0 14px",
      border: "1px solid #cfe0f5",
      borderRadius: 12,
      background: "#ffffff",
      color: "#16324f",
      fontWeight: 900,
      boxSizing: "border-box" as const,
    },
    paymentActionRow: {
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: 12,
      marginTop: 18,
      flexWrap: "wrap" as const,
    },
    processingHero: {
      display: "grid",
      gridTemplateColumns: "minmax(260px, 1fr) repeat(3, minmax(150px, 0.22fr))",
      gap: 14,
      alignItems: "stretch",
      marginBottom: 18,
    },
    processingIntro: {
      border: "1px solid #cde7fb",
      background: "linear-gradient(135deg, #f7fbff 0%, #eefafa 100%)",
      borderRadius: 16,
      padding: 18,
      display: "flex",
      gap: 14,
      alignItems: "center",
    },
    processingIntroIcon: {
      width: 52,
      height: 52,
      borderRadius: 14,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #35b7a5, #4a90e2)",
      color: "white",
      flexShrink: 0,
    },
    queueStat: {
      border: "1px solid #dbeafe",
      background: "#ffffff",
      borderRadius: 16,
      padding: 16,
      boxShadow: "0 12px 26px rgba(15, 23, 42, 0.055)",
    },
    queueStatLabel: { fontSize: 12, color: "#64748b", fontWeight: 950, textTransform: "uppercase" as const },
    queueStatValue: { marginTop: 7, fontSize: 24, color: "#102a43", fontWeight: 1000 },
    queueList: {
      display: "grid",
      gap: 14,
    },
    queueCard: {
      border: "1px solid #d7e7f5",
      borderRadius: 16,
      padding: 18,
      background: "linear-gradient(180deg, #ffffff 0%, #f9fcff 100%)",
      boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(220px, auto)",
      gap: 16,
      alignItems: "center",
    },
    queueIdentity: {
      display: "grid",
      gridTemplateColumns: "52px minmax(0, 1fr)",
      gap: 14,
      alignItems: "center",
      minWidth: 0,
    },
    queueAvatar: {
      width: 52,
      height: 52,
      borderRadius: 14,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#1d4ed8",
      background: "#eff6ff",
      border: "1px solid #cfe0f5",
      flexShrink: 0,
    },
    queueName: { color: "#0f172a", fontSize: 18, fontWeight: 1000, lineHeight: 1.15 },
    queueMeta: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap" as const,
      marginTop: 8,
      color: "#53657a",
      fontSize: 13,
      fontWeight: 850,
    },
    queueChip: {
      minHeight: 28,
      padding: "0 10px",
      borderRadius: 999,
      background: "#f1f7ff",
      border: "1px solid #dbeafe",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      whiteSpace: "nowrap" as const,
    },
    queueActions: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 12,
      flexWrap: "wrap" as const,
    },
    currentPaymentPanel: {
      marginTop: 18,
      border: "1px solid rgba(53, 183, 165, 0.35)",
      background: "linear-gradient(180deg, #ffffff 0%, #f0fbfa 100%)",
      borderRadius: 18,
      padding: 22,
      boxShadow: "0 22px 54px rgba(20, 184, 166, 0.12)",
    },
    sectionHead: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
      marginBottom: 18,
      flexWrap: "wrap" as const,
    },
    sectionTitleRow: {
      display: "flex",
      alignItems: "center",
      gap: 12,
    },
    sectionIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#e0f2fe",
      color: "#0369a1",
      flexShrink: 0,
    },
    sectionTitle: { fontSize: 28, fontWeight: 950, marginBottom: 10, color: "#0f172a" },
    sectionSub: { fontSize: 18, fontWeight: 800, color: "#4b5563", marginBottom: 2 },
    search: { display: "grid", gridTemplateColumns: "minmax(240px, 1fr) auto", gap: 16, margin: "0 0 24px", alignItems: "end" },
    searchInput: {
      flex: 1,
      minHeight: 66,
      padding: "0 24px",
      border: "1px solid #dbe5f2",
      borderRadius: 12,
      fontSize: 20,
      background: "#ffffff",
      color: "#172033",
      boxShadow: "inset 0 1px 0 rgba(15, 23, 42, 0.03)",
    },
    searchBtn: {
      minHeight: 52,
      padding: "0 22px",
      background: "linear-gradient(135deg, #1f7ae0, #4a90e2)",
      color: "white",
      border: "1px solid rgba(64, 130, 214, 0.22)",
      borderRadius: 12,
      cursor: "pointer",
      fontSize: 14,
      fontWeight: 800,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      boxShadow: "0 12px 24px rgba(63, 134, 220, 0.22)",
      whiteSpace: "nowrap" as const,
    },
    patientCard: {
      border: "1px solid #dce6f2",
      borderRadius: 12,
      padding: "22px 24px",
      marginBottom: 18,
      background: "#ffffff",
      boxShadow: "0 10px 26px rgba(15, 23, 42, 0.045)",
      transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
    },
    patientAvatar: {
      width: 52,
      height: 52,
      borderRadius: 14,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#eff6ff",
      color: "#1d4ed8",
      flexShrink: 0,
    },
    patientIdentity: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      minWidth: 0,
    },
    badge: {
      minHeight: 46,
      padding: "0 18px",
      fontWeight: 900,
      fontSize: 16,
      borderRadius: 999,
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      whiteSpace: "nowrap" as const,
    },
    badgePaid: { background: "#d9fbe8", border: "1px solid #9ce8bd", color: "#064e3b" },
    badgeNotPaid: { background: "#fff1f2", border: "1px solid #fecdd3", color: "#9f1239" },
    loading: { textAlign: "center" as const, padding: 46, color: "#64748b", fontSize: 16, fontWeight: 800 },
    btn: {
      minHeight: 52,
      padding: "0 22px",
      border: "1px solid #cbd5e1",
      background: "#f8fafc",
      color: "#0f172a",
      borderRadius: 12,
      cursor: "pointer",
      fontSize: 14,
      fontWeight: 800,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      whiteSpace: "nowrap" as const,
    },
    btnGreen: {
      minHeight: 52,
      padding: "0 22px",
      border: "1px solid rgba(53, 183, 165, 0.38)",
      background: "linear-gradient(135deg, #35b7a5, #4a90e2)",
      color: "white",
      borderRadius: 12,
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer",
      transition: "all 0.2s",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      boxShadow: "0 12px 22px rgba(31, 122, 224, 0.2)",
      whiteSpace: "nowrap" as const,
    },
    btnMpesa: {
      minHeight: 52,
      padding: "0 22px",
      border: "1px solid #ef4444",
      background: "linear-gradient(135deg, #ef4444, #b91c1c)",
      color: "white",
      borderRadius: 12,
      fontSize: 14,
      fontWeight: 900,
      cursor: "pointer",
      transition: "all 0.2s",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      boxShadow: "0 12px 22px rgba(220, 38, 38, 0.22)",
      whiteSpace: "nowrap" as const,
    },
    btnDisabled: {
      border: "1px solid #cbd5e1",
      background: "#f1f5f9",
      color: "#64748b",
      cursor: "not-allowed",
      boxShadow: "none",
    },
    error: { background: "#b91c1c", color: "white", padding: "14px 18px", borderRadius: 12, marginBottom: 16, fontWeight: 800 },
    success: { background: "linear-gradient(135deg, #287dba, #35b7a5)", color: "white", padding: "14px 18px", borderRadius: 12, marginBottom: 16, fontWeight: 800 },
    fieldGrid: { display: "grid", gap: 14, marginTop: 18 },
    fieldRow2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 },
    fieldLabel: { display: "grid", gap: 7, fontSize: 13, fontWeight: 900, color: "#334155" },
    fieldInput: {
      width: "100%",
      minHeight: 50,
      padding: "0 14px",
      border: "1px solid #dbe5f2",
      borderRadius: 12,
      fontSize: 15,
      fontWeight: 800,
      boxSizing: "border-box" as const,
    },
    registrationFormShell: {
      marginTop: 18,
      maxWidth: 980,
      borderTop: "5px solid #97d6d5",
      background: "#f8fbfc",
      borderRadius: 12,
      padding: "24px 26px 28px",
      border: "1px solid #c8e9e8",
      boxShadow: "0 18px 44px rgba(15, 23, 42, 0.08)",
    },
    registrationTopLine: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      color: "#2f9fe8",
      fontSize: 14,
      fontWeight: 900,
      marginBottom: 12,
    },
    registrationTitle: {
      color: "#2f9fe8",
      fontSize: 34,
      lineHeight: 1.1,
      fontWeight: 650,
      margin: 0,
    },
    registrationHelp: {
      display: "inline-block",
      color: "#2f9fe8",
      background: "#e8f6ff",
      fontSize: 15,
      fontWeight: 700,
      marginTop: 10,
      padding: "3px 6px",
    },
    registrationRule: {
      height: 2,
      background: "#97d6d5",
      border: "none",
      margin: "34px 0 24px",
    },
    registrationLabel: {
      display: "grid",
      gap: 7,
      color: "#2f9fe8",
      fontSize: 15,
      fontWeight: 800,
    },
    registrationInput: {
      width: "100%",
      minHeight: 44,
      border: "2px solid #a7dddf",
      borderRadius: 7,
      background: "#eef6f7",
      color: "#0f172a",
      padding: "0 12px",
      boxSizing: "border-box" as const,
      fontSize: 15,
      fontWeight: 800,
      outline: "none",
    },
    registrationGrid2: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 22,
      marginBottom: 18,
    },
    registrationGridAddress: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 18,
      marginBottom: 16,
    },
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [patientsData, prescriptionsData, visitsData, hospitalData] = await Promise.all([
        loadPatientsByHospital(hospitalId),
        loadPrescriptionsByHospital(hospitalId),
        loadTodayVisitsByHospital(hospitalId),
        loadHospitalById(hospitalId),
      ]);
      setPatients(patientsData);
      setPrescriptions(prescriptionsData);
      setTodayVisitRows(visitsData);
      setHospitalInfo(hospitalData);
      if (hospitalData) {
        setFormData((current) => ({
          ...current,
          registrationLocation: current.registrationLocation || hospitalData.defaultRegistrationLocation || "Reception",
          city: current.city || hospitalData.location || "",
          region: current.region || hospitalData.districtCode || "",
          country: current.country || hospitalData.country || "Lesotho",
        }));
      }
      // Extract patient IDs from today's visits
      setTodayVisits(visitsData.map(visit => visit.patientId));
    } catch (e: any) {
      setError(e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const reloadPrescriptions = async () => {
    try {
      console.log("=== RELOADING PRESCRIPTIONS FUNCTION ===");
      console.log("Reloading prescriptions...");
      const prescriptionsData = await loadPrescriptionsByHospital(hospitalId);
      console.log("Loaded prescriptions from Firestore:", prescriptionsData);
      
      const paidPrescriptions = prescriptionsData.filter(p => p.paymentStatus === "PAID");
      const notPaidPrescriptions = prescriptionsData.filter(p => p.paymentStatus === "NOT_PAID");
      const preparingPrescriptions = prescriptionsData.filter(p => p.status === "PREPARING");
      
      console.log("Prescription Summary:");
      console.log("- Total prescriptions:", prescriptionsData.length);
      console.log("- Paid prescriptions:", paidPrescriptions.length, paidPrescriptions.map(p => p.id));
      console.log("- Not paid prescriptions:", notPaidPrescriptions.length, notPaidPrescriptions.map(p => p.id));
      console.log("- Preparing prescriptions:", preparingPrescriptions.length, preparingPrescriptions.map(p => p.id));
      
      setPrescriptions(prescriptionsData);
      console.log("Updated local prescriptions state");
      console.log("=== RELOAD PRESCRIPTIONS END ===");
    } catch (e: any) {
      console.error("âŒ Failed to reload prescriptions:", e);
    }
  };

  const processPayment = async (prescriptionId: string) => {
    const prescription = prescriptions.find((p) => p.id === prescriptionId);
    if (!prescription) {
      setError("Could not find this prescription. Please refresh and try again.");
      return;
    }

    setFocusedPaymentPrescriptionId(prescriptionId);
    setSelectedPrescriptionId(prescriptionId);
    setPaymentMethod("MPESA");
    setPaymentAmount("");
    setTab("processing");
    setError("");
    setSuccess("Opening payment panel...");

    const localPatient = patients.find((p) => p.id === prescription.patientId);
    const fallbackPatient: PatientRow = {
      id: prescription.patientId,
      hospitalId,
      hospitalName: prescription.hospitalName || hospitalDisplayName,
      hospitalCode: "",
      districtCode: "",
      fullName: prescription.patientName,
      sex: "MALE",
      age: 0,
      phone: "",
      status: "ACTIVE",
      registeredBy: "ADMIN",
      createdAt: prescription.createdAtISO,
    };

    const immediatePatient = localPatient || fallbackPatient;
    setSelectedPatient(immediatePatient);
    setFocusedPaymentPatient(immediatePatient);
    setPaymentPhone(immediatePatient.phone || "");

    let account = await getPatientAccount(immediatePatient.id, hospitalId).catch(() => null);
    if (!account) {
      account = await createPatientAccount(immediatePatient.id, hospitalId, immediatePatient.hospitalName).catch(() => null);
    }
    setPatientAccount(account);

    const foundPatient = localPatient || (await findPatientById(prescription.patientId).catch(() => null));
    if (foundPatient) {
      setSelectedPatient(foundPatient);
      setFocusedPaymentPatient(foundPatient);
      setPaymentPhone(foundPatient.phone || "");
      setSuccess("Patient loaded. Enter the amount and send the MPESA prompt to the phone.");
    } else {
      setSuccess("Payment panel opened. Enter the patient's MPESA phone number to send the prompt.");
    }
  };

  const filteredPatients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return patients;
    
    return patients.filter((p) =>
      p.id.toLowerCase().includes(q) ||
      p.fullName.toLowerCase().includes(q) ||
      p.phone.includes(q)
    );
  }, [patients, searchQuery]);

  const visiblePatients = useMemo(() => {
    if (!externalPatientResult) return filteredPatients;
    if (filteredPatients.some((p) => p.id === externalPatientResult.id)) return filteredPatients;
    return [externalPatientResult, ...filteredPatients];
  }, [filteredPatients, externalPatientResult]);

  const selectedPatientUnpaidPrescriptions = useMemo(() => {
    if (!selectedPatient) return [];
    return prescriptions.filter(
      (p) => p.patientId === selectedPatient.id && p.paymentStatus === "NOT_PAID"
    );
  }, [prescriptions, selectedPatient]);

  const selectedPaymentPrescription = useMemo(
    () => selectedPatientUnpaidPrescriptions.find((rx) => rx.id === selectedPrescriptionId) || selectedPatientUnpaidPrescriptions[0],
    [selectedPatientUnpaidPrescriptions, selectedPrescriptionId]
  );

  const selectedPatientAccountHasNoMoney =
    Boolean(selectedPatient) &&
    !loadingPatientAccount &&
    Number(patientAccount?.balance || 0) <= 0;

  const hospitalDisplayName = hospitalInfo?.name || `Hospital ${hospitalId}`;
  const hospitalCode = hospitalInfo?.hospitalCode || "";
  const districtCode = hospitalInfo?.districtCode || "";
  const hospitalLicenseNumber = hospitalInfo?.licenseNumber || "";

  const paidPrescriptionCount = useMemo(
    () => prescriptions.filter((p) => p.paymentStatus === "PAID").length,
    [prescriptions]
  );

  const pendingPaymentCount = useMemo(
    () => prescriptions.filter((p) => p.paymentStatus === "NOT_PAID").length,
    [prescriptions]
  );

  const registrationProgress = useMemo(() => {
    const trackedFields = [
      formData.registrationCheckId,
      formData.healthCareNumber,
      formData.registrationLocation,
      formData.registrationDate,
      formData.registrationTime,
      formData.firstName,
      formData.lastName,
      formData.sex,
      formData.age,
      formData.phone,
      formData.streetAddress,
      formData.city,
      formData.region,
      formData.country,
    ];
    const completed = trackedFields.filter((value) => String(value || "").trim()).length;

    return Math.round((completed / trackedFields.length) * 100);
  }, [formData]);

  const markVisit = async (patient: PatientRow) => {
    try {
      const patientId = patient.id;

      // Save visit to Firestore
      await addPatientVisit({
        patientId,
        patientName: patient.fullName,
        hospitalId,
        hospitalName: hospitalDisplayName,
        receptionistId,
        receptionistName: `Receptionist ${receptionistId}`,
        purpose: "General visit",
        notes: "",
      });

      // Update local state
      setTodayVisits(prev => [...prev, patientId]);
      setTodayVisitRows((prev) => [
        {
          id: `local-${Date.now()}`,
          patientId: patient.id,
          patientName: patient.fullName,
          hospitalId,
          hospitalName: hospitalDisplayName,
          receptionistId,
          receptionistName: `Receptionist ${receptionistId}`,
          visitDate: new Date().toISOString().slice(0, 10),
          visitTimeISO: new Date().toISOString(),
          purpose: "General visit",
          notes: "",
          status: "ACTIVE",
        },
        ...prev,
      ]);
      setSuccess("Patient visit marked successfully!");
    } catch (e: any) {
      setError(e?.message || "Failed to mark visit");
    }
  };

  const handleSearchPatient = async (queryOverride?: string) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) {
      setExternalPatientResult(null);
      return;
    }

    const localHit = patients.some((p) => p.id.toLowerCase() === q.toLowerCase());
    if (localHit) {
      setExternalPatientResult(null);
      return;
    }

    try {
      const found = await findPatientById(q);
      if (found) {
        setExternalPatientResult(found);
        setError("");
      } else {
        setExternalPatientResult(null);
      }
    } catch (e: any) {
      setExternalPatientResult(null);
      setError(e?.message || "Failed to search patient by ID");
    }
  };

  const registerPatient = async () => {
    setError("");
    setSuccess("");

    const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim();
    const nameWarning = validateMeaningfulLetters(fullName, "Patient name", { minWords: 2 });
    const phoneWarning = validateNumericText(formData.phone, "Phone number", { minLength: 6 });

    if (nameWarning) {
      setError(nameWarning);
      return;
    }

    if (!formData.age || parseInt(formData.age) < 0 || parseInt(formData.age) > 120) {
      setError("Please enter a valid age");
      return;
    }

    if (phoneWarning) {
      setError(phoneWarning);
      return;
    }

    if (!hospitalCode || !districtCode) {
      setError("This hospital is missing its hospital code or district code. Ask the hospital admin to update the hospital profile first.");
      return;
    }

    setLoading(true);
    try {
      const createdPatient = await createPatientByAdminFirestore({
        hospitalId,
        hospitalName: hospitalDisplayName,
        hospitalCode,
        districtCode,
        fullName,
        sex: formData.sex,
        age: parseInt(formData.age),
        phone: formData.phone.trim(),
        email: formData.email.trim() || undefined,
        password: "1234",
        registrationDetails: {
          registrationCheckId: formData.registrationCheckId.trim(),
          healthCareNumber: formData.healthCareNumber.trim(),
          registrationLocation: formData.registrationLocation.trim() || hospitalInfo?.defaultRegistrationLocation || "Reception",
          registrationDate: formData.registrationDate,
          registrationTime: formData.registrationTime,
          hospitalName: hospitalDisplayName,
          hospitalLicenseNumber,
        },
        address: {
          streetAddress: formData.streetAddress.trim(),
          streetAddressLine2: formData.streetAddressLine2.trim(),
          city: formData.city.trim(),
          region: formData.region.trim(),
          postalCode: formData.postalCode.trim(),
          country: formData.country,
        },
      });

      // Reset form
      setFormData(makeRegistrationDefaults(hospitalInfo));
      setShowRegisterForm(false);

      // Reload patients
      await loadData();
      setSuccess(
        `Patient registered successfully! Registration Check ID: ${createdPatient.registrationDetails?.registrationCheckId || "Generated"}`
      );
    } catch (e: any) {
      setError(e?.message || "Failed to register patient");
    } finally {
      setLoading(false);
    }
  };

  const hasVisitedToday = (patientId: string) => {
    return todayVisits.includes(patientId);
  };

  const handleSelectPatient = async (patient: PatientRow) => {
    setSelectedPatient(patient);
    setPaymentPhone(patient.phone || "");
    setError("");
    setSuccess("");
    setLoadingPatientAccount(true);
    try {
      let account = await getPatientAccount(patient.id, hospitalId);
      if (!account) {
      account = await createPatientAccount(patient.id, hospitalId, hospitalDisplayName);
      }
      setPatientAccount(account);
    } catch (e: any) {
      setPatientAccount(null);
      setError(e?.message || "Failed to load patient account");
    } finally {
      setLoadingPatientAccount(false);
    }
  };

  const paySelectedPrescription = async () => {
    if (!selectedPatient) {
      setError("Select a patient first.");
      return;
    }

    if (!selectedPrescriptionId) {
      setError("Select an unpaid prescription first.");
      return;
    }

    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount to charge.");
      return;
    }

    if (paymentMethod !== "MPESA") {
      setError("Use MPESA to push the payment prompt to the patient's phone.");
      return;
    }

    if (!paymentPhone.trim()) {
      setError("Enter the patient's MPESA phone number.");
      return;
    }

    setProcessingPayment(true);
    setError("");
    setSuccess("");

    try {
      const promptPhone = paymentPhone.trim() || selectedPatient.phone || "";
      setSuccess(`Sending MPESA prompt to ${promptPhone}. Ask the patient to check their phone and enter the MPESA PIN.`);

      const result = await testMpesaPayment(promptPhone, amount);

      if (!result.success) {
        throw new Error("MPESA did not accept the payment request.");
      }

      const receiptNo = result.transactionId || `MPESA-${Date.now()}`;
      await updatePrescriptionPaymentStatus(selectedPrescriptionId, "PAID", receiptNo);
      setPrescriptions((current) =>
        current.map((prescription) =>
          prescription.id === selectedPrescriptionId
            ? { ...prescription, paymentStatus: "PAID", receiptNo }
            : prescription
        )
      );
      setSuccess(
        `MPESA prompt sent to ${promptPhone}. Patient must approve with their MPESA PIN. Receipt: ${receiptNo}`
      );
      setPaymentAmount("");
      setSelectedPrescriptionId("");
      setFocusedPaymentPrescriptionId("");
    } catch (e: any) {
      setError(e?.message || "Failed to send MPESA payment prompt.");
    } finally {
      setProcessingPayment(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [receptionistId, hospitalId]);

  useEffect(() => {
    if (!selectedPatient) {
      setSelectedPrescriptionId("");
      return;
    }
    if (
      selectedPrescriptionId &&
      selectedPatientUnpaidPrescriptions.some((rx) => rx.id === selectedPrescriptionId)
    ) {
      return;
    }
    const firstUnpaid = selectedPatientUnpaidPrescriptions[0];
    setSelectedPrescriptionId(firstUnpaid ? firstUnpaid.id : "");
  }, [selectedPatient, selectedPatientUnpaidPrescriptions, selectedPrescriptionId]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setExternalPatientResult(null);
      return;
    }
    void handleSearchPatient(searchQuery);
  }, [searchQuery]);

  const header = (
    <div style={ui.header}>
      <div>
        <div style={ui.heroTitle}>
          <div style={ui.heroIcon}>
            <Hospital size={30} />
          </div>
          <div>
            <div style={ui.h1}>Reception Dashboard</div>
            <div style={ui.sub}>
              Receptionist ID: <b>{receptionistId}</b> - Hospital: <b>{hospitalId}</b>
            </div>
          </div>
        </div>
      </div>
      <div style={ui.tabs}>
        <button
          className="reception-tab"
          style={tab === "search" ? ui.tabActive : ui.tab}
          onClick={() => setTab("search")}
        >
          <Search size={20} />
          Search Patient
        </button>
        <button
          className="reception-tab"
          style={tab === "register" ? ui.tabActive : ui.tab}
          onClick={() => setTab("register")}
        >
          <BadgePlus size={20} />
          Register Patient
        </button>
        <button
          className="reception-tab"
          style={tab === "visits" ? ui.tabActive : ui.tab}
          onClick={() => setTab("visits")}
        >
          <Calendar size={20} />
          Today's Visits
        </button>
        <button
          className="reception-tab"
          style={tab === "payments" ? ui.tabActive : ui.tab}
          onClick={() => setTab("payments")}
        >
          <ReceiptText size={20} />
          Payments
        </button>
        <button
          className="reception-tab"
          style={tab === "processing" ? ui.tabActive : ui.tab}
          onClick={() => setTab("processing")}
        >
          <CreditCard size={20} />
          Payment Processing
        </button>
      </div>
    </div>
  );

  const overview = (
    <div style={ui.statGrid}>
      <div style={ui.statCard}>
        <div style={ui.statIcon}><UserRound size={22} /></div>
        <div>
          <div style={ui.statLabel}>Patients</div>
          <div style={ui.statValue}>{patients.length}</div>
        </div>
      </div>
      <div style={ui.statCard}>
        <div style={{ ...ui.statIcon, ...ui.statIconGreen }}><ClipboardCheck size={22} /></div>
        <div>
          <div style={ui.statLabel}>Visits Today</div>
          <div style={ui.statValue}>{todayVisitRows.length}</div>
        </div>
      </div>
      <div style={ui.statCard}>
        <div style={{ ...ui.statIcon, ...ui.statIconAmber }}><Banknote size={22} /></div>
        <div>
          <div style={ui.statLabel}>Pending Payments</div>
          <div style={ui.statValue}>{pendingPaymentCount}</div>
        </div>
      </div>
      <div style={ui.statCard}>
        <div style={{ ...ui.statIcon, ...ui.statIconGreen }}><CheckCircle size={22} /></div>
        <div>
          <div style={ui.statLabel}>Paid Prescriptions</div>
          <div style={ui.statValue}>{paidPrescriptionCount}</div>
        </div>
      </div>
    </div>
  );

  const searchContent = (
    <div style={ui.section}>
      <div style={ui.sectionHead}>
        <div style={ui.sectionTitleRow}>
          <div style={ui.sectionIcon}><Search size={22} /></div>
          <div>
            <div style={ui.sectionTitle}>Search Patient</div>
            <div style={ui.sectionSub}>Search by Patient ID, name, or phone number</div>
          </div>
        </div>
      </div>
      <div style={ui.search}>
        <input
          style={ui.searchInput}
          placeholder="Search patients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleSearchPatient(searchQuery);
            }
          }}
        />
        <button
          className="reception-primary-button"
          style={ui.searchBtn}
          onClick={() => {
            void handleSearchPatient(searchQuery);
          }}
        >
          <Search size={16} style={{ display: "inline", marginRight: 4 }} />
          Search
        </button>
      </div>

      {loading ? (
        <div style={ui.loading}>Loading patients...</div>
      ) : visiblePatients.length === 0 ? (
        <div style={ui.loading}>No patients found</div>
      ) : (
        <div>
          {visiblePatients.map((patient) => (
            <div
              className="reception-patient-card"
              key={patient.id}
              style={{
                ...ui.patientCard,
                cursor: "pointer",
                border: selectedPatient?.id === patient.id ? "2px solid #3f86dc" : "1px solid #dce6f2",
                background: selectedPatient?.id === patient.id ? "#f6fbff" : "white",
              }}
              onClick={() => handleSelectPatient(patient)}
            >
              <div className="reception-patient-row">
                <div className="reception-patient-copy">
                  <div style={{ fontWeight: 950, fontSize: 22, color: "#020617", lineHeight: 1.2 }}>
                    <span style={ui.patientIdentity}>
                      <span style={ui.patientAvatar}><UserRound size={24} /></span>
                      <span>{patient.fullName}</span>
                    </span>
                  </div>
                  <div style={{ fontSize: 16, marginTop: 8, color: "#475569" }}>
                    <IdCard size={15} style={{ verticalAlign: "middle", marginRight: 5 }} />
                    ID: {patient.id} - {patient.sex} - {patient.age} years - {patient.phone}
                  </div>
                  {patient.hospitalId !== hospitalId ? (
                    <div style={{ fontSize: 12, marginTop: 4, color: "#256f9f", fontWeight: 800 }}>
                      Registered at: {patient.hospitalName || patient.hospitalId}
                    </div>
                  ) : null}
                </div>
                <div className="reception-card-actions">
                  <button
                    className={hasVisitedToday(patient.id) ? "reception-secondary-button" : "reception-success-button"}
                    style={hasVisitedToday(patient.id) ? { ...ui.btn, ...ui.btnDisabled } : ui.btnGreen}
                    onClick={(e) => {
                      e.stopPropagation();
                      void markVisit(patient);
                    }}
                    disabled={hasVisitedToday(patient.id) || loading}
                  >
                    <ClipboardCheck size={18} />
                    {hasVisitedToday(patient.id) ? "Visited" : "Mark Visit"}
                  </button>
                  {hasVisitedToday(patient.id) ? (
                    <span style={{ ...ui.badge, ...ui.badgePaid }}>
                      <CheckCircle size={12} style={{ display: "inline", marginRight: 4 }} />
                      Visited Today
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedPatient ? (
        <div className="animated-form-surface" style={ui.paymentPanel}>
            <div style={ui.paymentHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <span style={{ ...ui.patientAvatar, ...ui.mpesaBadge }}><Wallet size={24} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={ui.paymentTitle}>Payment Panel</div>
                <div style={ui.paymentSub}>
                  {selectedPatient.fullName} - {selectedPatient.id}
                </div>
              </div>
            </div>
            <div style={ui.paymentBadge}>
              <Hospital size={16} />
              {selectedPatient.hospitalName || selectedPatient.hospitalId}
            </div>
          </div>

          <div style={ui.paymentMetrics}>
            <div style={ui.paymentMetric}>
              <div style={ui.paymentMetricLabel}>Account Status</div>
              <div style={ui.paymentMetricValue}>
                {loadingPatientAccount
                  ? "Checking..."
                  : selectedPatientAccountHasNoMoney
                    ? "No available funds"
                    : "Funds available"}
              </div>
            </div>
            <div style={ui.paymentMetric}>
              <div style={ui.paymentMetricLabel}>Unpaid Prescriptions</div>
              <div style={ui.paymentMetricValue}>
                {selectedPatientUnpaidPrescriptions.length}
              </div>
            </div>
            <div style={ui.paymentMetric}>
              <div style={ui.paymentMetricLabel}>Payment Method</div>
              <div style={{ ...ui.paymentMetricValue, ...ui.mpesaText }}>MPESA</div>
            </div>
          </div>

          {selectedPatientAccountHasNoMoney && selectedPatientUnpaidPrescriptions.length > 0 ? (
            <div style={{
              marginBottom: 16,
              padding: "13px 15px",
              borderRadius: 14,
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              fontWeight: 900,
              lineHeight: 1.45,
            }}>
              Patient account has no available money. Use direct <span style={ui.mpesaText}>MPESA</span> prescription payment below so the patient can confirm with their <span style={ui.mpesaText}>MPESA</span> PIN on the phone.
            </div>
          ) : null}

          {selectedPatientUnpaidPrescriptions.length === 0 ? (
            <div style={{ ...ui.loading, padding: 20, background: "#f8fbff", borderRadius: 14 }}>
              No unpaid prescriptions for this patient.
            </div>
          ) : (
            <div style={ui.paymentCard}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 18, color: "#102a43", fontWeight: 1000 }}>Prescription Payment</div>
                  <div style={{ fontSize: 13, color: "#5d7088", fontWeight: 800, marginTop: 4 }}>
                    Send a phone prompt and ask the patient to approve with their PIN.
                  </div>
                </div>
                {selectedPaymentPrescription ? (
                  <span style={{ ...ui.badge, ...ui.badgeNotPaid }}>Not Paid</span>
                ) : null}
              </div>

              {selectedPaymentPrescription ? (
                <div style={{ marginTop: 12, padding: 14, borderRadius: 14, background: "#f8fbff", border: "1px solid #dbeafe" }}>
                  <div style={{ fontSize: 13, color: "#5d7088", fontWeight: 900 }}>Selected Prescription</div>
                  <div style={{ marginTop: 5, fontSize: 15, color: "#102a43", fontWeight: 1000 }}>
                    {selectedPaymentPrescription.id} - Dr. {selectedPaymentPrescription.doctorName}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#5d7088", fontWeight: 800 }}>
                    Created {selectedPaymentPrescription.createdAtISO.slice(0, 10)}
                  </div>
                </div>
              ) : null}

              <div style={ui.paymentFormGrid}>
                <label style={ui.fieldLabel}>
                  Prescription
                <select
                  value={selectedPrescriptionId}
                  onChange={(e) => setSelectedPrescriptionId(e.target.value)}
                    style={ui.paymentInput}
                >
                  {selectedPatientUnpaidPrescriptions.map((rx) => (
                    <option key={rx.id} value={rx.id}>
                      {rx.id} - {rx.doctorName} - {rx.createdAtISO.slice(0, 10)}
                    </option>
                  ))}
                </select>
                </label>

                <label style={ui.fieldLabel}>
                  Amount (LSL)
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount to charge"
                    style={ui.paymentInput}
                />
                </label>

                <label style={ui.fieldLabel}>
                  Payment Method
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    style={{ ...ui.paymentInput, ...ui.mpesaInput }}
                >
                  <option value="MPESA">MPESA</option>
                </select>
                </label>

                {paymentMethod === "MPESA" ? (
                  <label style={ui.fieldLabel}>
                    <PhoneCall size={14} style={{ verticalAlign: "middle", marginRight: 5 }} />
                    Phone Number
                  <input
                    type="tel"
                    value={paymentPhone}
                    onChange={(e) => setPaymentPhone(e.target.value)}
                    placeholder="Enter mobile money phone"
                      style={ui.paymentInput}
                  />
                  </label>
                ) : null}
              </div>
              <div style={ui.paymentActionRow}>
                <div style={{ color: "#5d7088", fontSize: 13, fontWeight: 800, flex: "1 1 240px" }}>
                  Confirm the amount with the patient before sending the prompt.
                </div>
              <button
                  style={{ ...ui.btnMpesa, minWidth: 220 }}
                onClick={paySelectedPrescription}
                disabled={processingPayment}
              >
                  <PhoneCall size={18} />
                {processingPayment ? "Sending MPESA Prompt..." : "Send MPESA Prompt"}
              </button>
            </div>
            </div>
          )}

        </div>
      ) : null}
    </div>
  );

  const registerContent = (
    <div style={ui.section}>
      <div style={ui.sectionHead}>
        <div style={ui.sectionTitleRow}>
          <div style={{ ...ui.sectionIcon, background: "#e8f6ff", color: "#256f9f" }}><BadgePlus size={22} /></div>
          <div>
            <div style={ui.sectionTitle}>Register New Patient</div>
            <div style={ui.sectionSub}>Add a patient profile to this hospital</div>
          </div>
        </div>
      </div>

      {showRegisterForm ? (
        <div className="reception-registration-form" style={ui.registrationFormShell}>
          <div style={ui.registrationTopLine}>
            <span>Patient Information</span>
            <span>{registrationProgress}%</span>
          </div>
          <h2 style={ui.registrationTitle}>Hospital Registration Form</h2>
          <div style={ui.registrationHelp}>Patients are required to register their information on this form.</div>
          <hr style={ui.registrationRule} />

          <div style={ui.registrationGrid2}>
            <label style={ui.registrationLabel}>
              Hospital Name
              <input
                style={{ ...ui.registrationInput, background: "#e2edf0" }}
                value={hospitalDisplayName}
                readOnly
              />
            </label>
            <label style={ui.registrationLabel}>
              Licence Number
              <input
                style={{ ...ui.registrationInput, background: "#e2edf0" }}
                value={hospitalLicenseNumber || "Not set"}
                readOnly
              />
            </label>
            <label style={ui.registrationLabel}>
              Hospital Code
              <input
                style={{ ...ui.registrationInput, background: "#e2edf0" }}
                value={hospitalCode || "Not set"}
                readOnly
              />
            </label>
            <label style={ui.registrationLabel}>
              District Code
              <input
                style={{ ...ui.registrationInput, background: "#e2edf0" }}
                value={districtCode || "Not set"}
                readOnly
              />
            </label>
          </div>

          <div style={ui.registrationGrid2}>
            <label style={ui.registrationLabel}>
              Registration Check ID
              <input
                style={{ ...ui.registrationInput, background: "#e2edf0" }}
                value={`Auto-generated as REG-${districtCode || "DIST"}-${hospitalCode || "HOSP"}-YYYYMMDD-001`}
                readOnly
              />
            </label>
            <label style={ui.registrationLabel}>
              Health Care Number*
              <input
                style={ui.registrationInput}
                value={formData.healthCareNumber}
                onChange={(e) => setFormData({ ...formData, healthCareNumber: digitsOnlyInput(e.target.value) })}
              />
            </label>
          </div>

          <label style={{ ...ui.registrationLabel, marginBottom: 16 }}>
            Registration Location ex: ER, Clinic, etc
            <input
              style={ui.registrationInput}
              value={formData.registrationLocation}
              onChange={(e) => setFormData({ ...formData, registrationLocation: lettersOnlyInput(e.target.value) })}
            />
          </label>

          <div style={ui.registrationGrid2}>
            <label style={ui.registrationLabel}>
              Registration Date*
              <input
                type="date"
                style={ui.registrationInput}
                value={formData.registrationDate}
                onChange={(e) => setFormData({ ...formData, registrationDate: e.target.value })}
              />
            </label>
            <label style={ui.registrationLabel}>
              Registration Time*
              <input
                type="time"
                style={ui.registrationInput}
                value={formData.registrationTime}
                onChange={(e) => setFormData({ ...formData, registrationTime: e.target.value })}
              />
            </label>
          </div>

          <div style={{ color: "#2f9fe8", fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Patient Name</div>
          <div style={ui.registrationGrid2}>
            <input
              style={ui.registrationInput}
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: lettersOnlyInput(e.target.value) })}
              placeholder="First"
            />
            <input
              style={ui.registrationInput}
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: lettersOnlyInput(e.target.value) })}
              placeholder="Last"
            />
          </div>

          <div style={{ color: "#2f9fe8", fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Address</div>
          <label style={{ ...ui.registrationLabel, marginBottom: 12 }}>
            <input
              style={ui.registrationInput}
              value={formData.streetAddress}
              onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
              placeholder="Street Address"
            />
          </label>
          <label style={{ ...ui.registrationLabel, marginBottom: 12 }}>
            <input
              style={ui.registrationInput}
              value={formData.streetAddressLine2}
              onChange={(e) => setFormData({ ...formData, streetAddressLine2: e.target.value })}
              placeholder="Street Address Line 2"
            />
          </label>
          <div style={ui.registrationGridAddress}>
            <input
              style={ui.registrationInput}
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: lettersOnlyInput(e.target.value) })}
              placeholder="City"
            />
            <input
              style={ui.registrationInput}
              value={formData.region}
              onChange={(e) => setFormData({ ...formData, region: lettersOnlyInput(e.target.value) })}
              placeholder="Region"
            />
            <input
              style={ui.registrationInput}
              value={formData.postalCode}
              onChange={(e) => setFormData({ ...formData, postalCode: digitsOnlyInput(e.target.value) })}
              placeholder="Postal / Zip Code"
            />
            <select
              style={ui.registrationInput}
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            >
              <option value="Lesotho">Lesotho</option>
              <option value="South Africa">South Africa</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div style={ui.registrationGridAddress}>
            <label style={ui.registrationLabel}>
              Sex*
              <select
                style={ui.registrationInput}
                value={formData.sex}
                onChange={(e) => setFormData({ ...formData, sex: e.target.value as "MALE" | "FEMALE" })}
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </label>
            <label style={ui.registrationLabel}>
              Age*
              <input
                type="number"
                style={ui.registrationInput}
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: digitsOnlyInput(e.target.value) })}
                placeholder="Age"
              />
            </label>
            <label style={ui.registrationLabel}>
              Phone Number*
              <input
                style={ui.registrationInput}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: digitsOnlyInput(e.target.value) })}
                placeholder="Phone"
              />
            </label>
            <label style={ui.registrationLabel}>
              Email
              <input
                type="email"
                style={ui.registrationInput}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Email"
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <button
              style={ui.btn}
              onClick={() => setShowRegisterForm(false)}
            >
              Cancel
            </button>
            <button
              style={{ ...ui.btnGreen, flex: 1, minWidth: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={registerPatient}
              disabled={loading}
            >
              {loading ? "Registering..." : "Register Patient"}
            </button>
          </div>
        </div>
      ) : (
        <button
          style={{ ...ui.btnGreen, padding: "12px 20px", cursor: "pointer" }}
          onClick={() => setShowRegisterForm(true)}
        >
          <Plus size={18} />
          Register New Patient
        </button>
      )}
    </div>
   );

  const visitsContent = (
    <div style={ui.section}>
      <div style={ui.sectionHead}>
        <div style={ui.sectionTitleRow}>
          <div style={{ ...ui.sectionIcon, background: "#e8f6ff", color: "#256f9f" }}><UserCheck size={22} /></div>
          <div>
            <div style={ui.sectionTitle}>Today's Visits</div>
            <div style={ui.sectionSub}>Patients who checked in today</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={ui.loading}>Loading visits...</div>
      ) : todayVisitRows.length === 0 ? (
        <div style={ui.loading}>No visits recorded today</div>
      ) : (
        <div>
          {todayVisitRows.map((visit) => (
            <div key={visit.id} style={ui.patientCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#000000" }}>
                    {visit.patientName}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2, color: "#666666" }}>
                    ID: {visit.patientId} • Time: {new Date(visit.visitTimeISO).toLocaleTimeString()}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                  <span style={{ ...ui.badge, ...ui.badgePaid }}>
                    <Clock size={12} style={{ display: "inline", marginRight: 4 }} />
                    Visited Today
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const paymentsContent = (
    <div style={ui.section}>
      <div style={ui.sectionHead}>
        <div style={ui.sectionTitleRow}>
          <div style={{ ...ui.sectionIcon, background: "#e8f6ff", color: "#256f9f" }}><ReceiptText size={22} /></div>
          <div>
            <div style={ui.sectionTitle}>Payment History</div>
            <div style={ui.sectionSub}>Patients who have paid for prescriptions</div>
          </div>
        </div>
        <button
          onClick={reloadPrescriptions}
          style={ui.btn}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={ui.loading}>Loading prescriptions...</div>
      ) : prescriptions.filter(p => p.paymentStatus === "PAID").length === 0 ? (
        <div style={ui.loading}>No paid prescriptions found</div>
      ) : (
        <div>
          {prescriptions
            .filter(p => p.paymentStatus === "PAID")
            .map((prescription) => (
              <div key={prescription.id} style={ui.patientCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#000000" }}>
                      {prescription.patientName}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2, color: "#666666" }}>
                      RX: {prescription.id} - Patient ID: {prescription.patientId}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2, color: "#666666" }}>
                      Doctor: {prescription.doctorName}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2, color: "#666666" }}>
                      Created: {prescription.createdAtISO.slice(0, 10)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                    <span style={{ ...ui.badge, ...ui.badgePaid }}>
                      Paid
                    </span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );

  // Payment Processing Content - for unpaid prescriptions
  const paymentProcessingContent = () => {
    const unpaidPrescriptions = prescriptions.filter((p) => p.paymentStatus === "NOT_PAID");
    const pendingPatientCount = new Set(unpaidPrescriptions.map((p) => p.patientId)).size;
    const todayPendingCount = unpaidPrescriptions.filter(
      (p) => p.createdAtISO.slice(0, 10) === new Date().toISOString().slice(0, 10)
    ).length;
    const focusedPaymentPrescription = focusedPaymentPrescriptionId
      ? unpaidPrescriptions.find((p) => p.id === focusedPaymentPrescriptionId)
      : undefined;
    const visibleUnpaidPrescriptions = focusedPaymentPrescription
      ? [focusedPaymentPrescription]
      : unpaidPrescriptions;
    const paymentPanelOpen = Boolean(focusedPaymentPrescriptionId && focusedPaymentPatient);
    const cancelFocusedPayment = () => {
      setFocusedPaymentPrescriptionId("");
      setFocusedPaymentPatient(null);
      setSelectedPrescriptionId("");
      setPaymentAmount("");
      setPaymentPhone("");
      setSuccess("");
      setError("");
    };

    return (
    <div style={ui.section}>
      <div style={ui.sectionHead}>
        <div style={ui.sectionTitleRow}>
          <div style={{ ...ui.sectionIcon, background: "#eefafa", color: "#287dba" }}><Smartphone size={22} /></div>
          <div>
            <div style={ui.sectionTitle}>Payment Processing</div>
            <div style={ui.sectionSub}>Focused <span style={ui.mpesaText}>MPESA</span> queue for unpaid prescriptions</div>
          </div>
        </div>
        {paymentPanelOpen ? (
          <button
            style={ui.btn}
            onClick={cancelFocusedPayment}
          >
            Show Pending Queue
          </button>
        ) : null}
      </div>

      <div style={ui.processingHero}>
        <div style={ui.processingIntro}>
          <div style={ui.processingIntroIcon}><PhoneCall size={24} /></div>
          <div>
            <div style={{ color: "#102a43", fontSize: 18, fontWeight: 1000 }}><span style={ui.mpesaText}>MPESA</span> prompt desk</div>
            <div style={{ color: "#5d7088", fontSize: 13, fontWeight: 800, marginTop: 4, lineHeight: 1.45 }}>
              Pick one unpaid prescription, confirm the phone and amount, then send the PIN prompt to the patient.
            </div>
          </div>
        </div>
        <div style={ui.queueStat}>
          <div style={ui.queueStatLabel}>Pending RX</div>
          <div style={ui.queueStatValue}>{unpaidPrescriptions.length}</div>
        </div>
        <div style={ui.queueStat}>
          <div style={ui.queueStatLabel}>Patients</div>
          <div style={ui.queueStatValue}>{pendingPatientCount}</div>
        </div>
        <div style={ui.queueStat}>
          <div style={ui.queueStatLabel}>Today</div>
          <div style={ui.queueStatValue}>{todayPendingCount}</div>
        </div>
      </div>

      {loading ? (
        <div style={ui.loading}>Loading prescriptions...</div>
      ) : unpaidPrescriptions.length === 0 ? (
        <div style={ui.loading}>No pending payments</div>
      ) : (
        <div style={ui.queueList}>
          {visibleUnpaidPrescriptions.map((prescription: Prescription) => (
              <div key={prescription.id} style={ui.queueCard}>
                <div style={ui.queueIdentity}>
                  <div style={ui.queueAvatar}>
                    <ReceiptText size={23} />
                  </div>
                  <div>
                    <div style={ui.queueName}>
                      {prescription.patientName}
                    </div>
                    <div style={ui.queueMeta}>
                      <span style={ui.queueChip}><ReceiptText size={13} /> {prescription.id}</span>
                      <span style={ui.queueChip}><IdCard size={13} /> {prescription.patientId}</span>
                      <span style={ui.queueChip}><UserRound size={13} /> Dr. {prescription.doctorName}</span>
                      <span style={ui.queueChip}><Calendar size={13} /> {prescription.createdAtISO.slice(0, 10)}</span>
                    </div>
                  </div>
                </div>
                <div style={ui.queueActions}>
                    <span style={{ ...ui.badge, ...ui.badgeNotPaid }}>
                      Not Paid
                    </span>
                    {!paymentPanelOpen ? (
                      <button
                        style={ui.btnGreen}
                        onClick={() => processPayment(prescription.id)}
                        disabled={processingPayment}
                      >
                        <Wallet size={14} style={{ display: "inline", marginRight: 4 }} />
                        Open Payment Panel
                      </button>
                    ) : null}
                </div>
              </div>
            ))}
          {paymentPanelOpen && focusedPaymentPatient ? (
            <div className="animated-form-surface" style={ui.currentPaymentPanel}>
              <div style={ui.paymentHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                  <span style={{ ...ui.patientAvatar, ...ui.mpesaBadge }}><Wallet size={24} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={ui.paymentTitle}>Current Payment</div>
                    <div style={ui.paymentSub}>
                      {focusedPaymentPatient.fullName} - {focusedPaymentPatient.id}
                    </div>
                  </div>
                </div>
                <div style={ui.paymentBadge}>
                  <Hospital size={16} />
                  {focusedPaymentPatient.hospitalName || focusedPaymentPatient.hospitalId}
                </div>
              </div>

              {selectedPaymentPrescription ? (
                <div style={{ marginBottom: 14, padding: 14, borderRadius: 14, background: "#f8fbff", border: "1px solid #dbeafe" }}>
                  <div style={{ fontSize: 13, color: "#5d7088", fontWeight: 900 }}>Selected Prescription</div>
                  <div style={{ marginTop: 5, fontSize: 15, color: "#102a43", fontWeight: 1000 }}>
                    {selectedPaymentPrescription.id} - Dr. {selectedPaymentPrescription.doctorName}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#5d7088", fontWeight: 800 }}>
                    Created {selectedPaymentPrescription.createdAtISO.slice(0, 10)}
                  </div>
                </div>
              ) : null}

              <div style={ui.paymentFormGrid}>
                <label style={ui.fieldLabel}>
                  Prescription
                  <select
                    value={selectedPrescriptionId}
                    onChange={(e) => {
                      setSelectedPrescriptionId(e.target.value);
                      setFocusedPaymentPrescriptionId(e.target.value);
                    }}
                    style={ui.paymentInput}
                  >
                    {selectedPatientUnpaidPrescriptions.map((rx) => (
                      <option key={rx.id} value={rx.id}>
                        {rx.id} - {rx.doctorName} - {rx.createdAtISO.slice(0, 10)}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={ui.fieldLabel}>
                  Amount (LSL)
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="Enter amount to charge"
                    style={ui.paymentInput}
                  />
                </label>

                <label style={ui.fieldLabel}>
                  Phone Number
                  <input
                    type="tel"
                    value={paymentPhone}
                    onChange={(e) => setPaymentPhone(e.target.value)}
                    placeholder="Enter mobile money phone"
                    style={ui.paymentInput}
                  />
                </label>
              </div>

              <div style={ui.paymentActionRow}>
                <div style={{ color: "#5d7088", fontSize: 13, fontWeight: 800, flex: "1 1 240px" }}>
                  Send the <span style={ui.mpesaText}>MPESA</span> prompt and ask the patient to approve with their PIN.
                </div>
                <button
                  style={ui.btn}
                  onClick={cancelFocusedPayment}
                  disabled={processingPayment}
                >
                  Cancel Payment
                </button>
                <button
                  style={{ ...ui.btnMpesa, minWidth: 220 }}
                  onClick={paySelectedPrescription}
                  disabled={processingPayment}
                >
                  <PhoneCall size={18} />
                  {processingPayment ? "Sending MPESA Prompt..." : "Send MPESA Prompt"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
    );
  };

  return (
    <div className="reception-dashboard" style={ui.page}>
      {error && <div style={ui.error}>{error}</div>}
      {success && <div style={ui.success}>{success}</div>}

      {header}
      {overview}

      {tab === "search" && searchContent}
      {tab === "register" && registerContent}
      {tab === "visits" && visitsContent}
      {tab === "payments" && paymentsContent}
      {tab === "processing" && paymentProcessingContent()}
    </div>
  );
}
