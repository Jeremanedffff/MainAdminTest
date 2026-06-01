import React, { useEffect, useMemo, useState } from "react";
import "./LabDashboard.css";
import {
  addLabResults,
  findLabRequestByPatientId,
  findPatientById,
  loadPendingLabRequests,
  markLabResultsReviewed,
  saveLabResultsDraft,
  submitLabResultsForReview,
  updateLabRequestStatus,
  type LabRequest,
  type LabResult,
  type LabTest,
  type PatientRow,
} from "../hospitalAdmin/hospitalAdminFirestore";
import {
  Bell,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileText,
  FlaskConical,
  Menu,
  MoreVertical,
  Plus,
  Printer,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  TestTube2,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

type Props = {
  staffId: string;
  hospitalId: string;
};

type ResultStatus = LabResult["status"];
type QualityKey = "specimenCondition" | "hemolysis" | "lipemia" | "icterus";
type LabToolPanel = "" | "visual" | "settings" | "templates" | "workflow";
type ReviewStage = "DRAFT" | "PENDING_REVIEW" | "REVIEWED" | "AUTHORIZED";
type AuthorizationRole = NonNullable<LabRequest["authorizationRole"]>;

type LabVisualSettings = {
  normalColor: string;
  abnormalColor: string;
  criticalColor: string;
  resultColor: string;
  fontSize: number;
  compactMode: boolean;
  showReferenceRanges: boolean;
  showSpecimenCards: boolean;
  requireReviewer: boolean;
};

type ResultTemplateParameter = {
  name: string;
  unit?: string;
  referenceRange?: string;
  value?: string;
};

type ResultTemplate = {
  id: string;
  label: string;
  category: string;
  specimenType: string;
  method: string;
  parameters: ResultTemplateParameter[];
};

const TEST_TEMPLATES: { match: RegExp; template: ResultTemplate }[] = [
  {
    match: /\bcbc\b|complete blood count|full blood count|hematology/i,
    template: {
      id: "cbc",
      label: "Complete Blood Count (CBC)",
      category: "Hematology",
      specimenType: "Whole Blood",
      method: "Automated Analyzer",
      parameters: [
        { name: "WBC (White Blood Cells)", unit: "10^3/uL", referenceRange: "4.0 - 10.0" },
        { name: "RBC (Red Blood Cells)", unit: "10^6/uL", referenceRange: "4.5 - 5.9" },
        { name: "Hemoglobin", unit: "g/dL", referenceRange: "13.0 - 17.0" },
        { name: "Hematocrit", unit: "%", referenceRange: "40 - 50" },
        { name: "MCV", unit: "fL", referenceRange: "80 - 100" },
        { name: "MCH", unit: "pg", referenceRange: "27 - 32" },
        { name: "MCHC", unit: "g/dL", referenceRange: "32 - 36" },
        { name: "Platelets", unit: "10^3/uL", referenceRange: "150 - 450" },
        { name: "Neutrophils", unit: "%", referenceRange: "40 - 70" },
        { name: "Lymphocytes", unit: "%", referenceRange: "20 - 40" },
        { name: "Monocytes", unit: "%", referenceRange: "2 - 10" },
        { name: "Eosinophils", unit: "%", referenceRange: "1 - 6" },
        { name: "Basophils", unit: "%", referenceRange: "0 - 2" },
      ],
    },
  },
  {
    match: /malaria|parasite/i,
    template: {
      id: "malaria",
      label: "Malaria Parasite Test",
      category: "Parasitology",
      specimenType: "Blood",
      method: "Microscopy / Rapid Diagnostic Test",
      parameters: [
        { name: "Malaria Parasites", unit: "", referenceRange: "Negative" },
        { name: "Parasite Density", unit: "parasites/uL", referenceRange: "Not detected" },
        { name: "Species Identified", unit: "", referenceRange: "None" },
      ],
    },
  },
  {
    match: /hiv/i,
    template: {
      id: "hiv",
      label: "HIV Screening",
      category: "Serology",
      specimenType: "Blood / Serum",
      method: "Rapid Test / Immunoassay",
      parameters: [
        { name: "HIV 1/2 Screening Result", unit: "", referenceRange: "Non-reactive" },
        { name: "Confirmatory Result", unit: "", referenceRange: "Non-reactive" },
      ],
    },
  },
  {
    match: /liver|lft|hepatic/i,
    template: {
      id: "liver-function",
      label: "Liver Function Test",
      category: "Clinical Chemistry",
      specimenType: "Serum",
      method: "Biochemistry Analyzer",
      parameters: [
        { name: "ALT", unit: "U/L", referenceRange: "7 - 56" },
        { name: "AST", unit: "U/L", referenceRange: "10 - 40" },
        { name: "ALP", unit: "U/L", referenceRange: "44 - 147" },
        { name: "Total Bilirubin", unit: "mg/dL", referenceRange: "0.1 - 1.2" },
        { name: "Albumin", unit: "g/dL", referenceRange: "3.5 - 5.0" },
      ],
    },
  },
  {
    match: /widal|typhoid/i,
    template: {
      id: "widal",
      label: "Widal / Typhoid Serology",
      category: "Serology",
      specimenType: "Serum",
      method: "Slide / Tube Agglutination",
      parameters: [
        { name: "S. typhi O", unit: "titer", referenceRange: "< 1:80" },
        { name: "S. typhi H", unit: "titer", referenceRange: "< 1:80" },
        { name: "S. paratyphi AH", unit: "titer", referenceRange: "< 1:80" },
        { name: "S. paratyphi BH", unit: "titer", referenceRange: "< 1:80" },
      ],
    },
  },
  {
    match: /urine|urinalysis/i,
    template: {
      id: "urinalysis",
      label: "Urinalysis",
      category: "Urinalysis",
      specimenType: "Urine",
      method: "Dipstick / Microscopy",
      parameters: [
        { name: "Color", referenceRange: "Yellow" },
        { name: "Appearance", referenceRange: "Clear" },
        { name: "Protein", referenceRange: "Negative" },
        { name: "Glucose", referenceRange: "Negative" },
        { name: "Ketones", referenceRange: "Negative" },
        { name: "WBC", unit: "/HPF", referenceRange: "0 - 5" },
        { name: "RBC", unit: "/HPF", referenceRange: "0 - 2" },
      ],
    },
  },
  {
    match: /blood group|abo|rhesus|rh/i,
    template: {
      id: "blood-group",
      label: "Blood Grouping",
      category: "Blood Bank",
      specimenType: "Whole Blood",
      method: "Forward and Reverse Grouping",
      parameters: [
        { name: "ABO Group", referenceRange: "A/B/AB/O" },
        { name: "Rh Factor", referenceRange: "Positive / Negative" },
      ],
    },
  },
  {
    match: /glucose|blood sugar|fbs|rbs/i,
    template: {
      id: "blood-glucose",
      label: "Blood Glucose",
      category: "Clinical Chemistry",
      specimenType: "Blood / Serum",
      method: "Biochemistry Analyzer",
      parameters: [{ name: "Blood Glucose", unit: "mg/dL", referenceRange: "70 - 110" }],
    },
  },
  {
    match: /kidney|renal|urea|creatinine|electrolyte/i,
    template: {
      id: "renal-function",
      label: "Renal Function / Electrolytes",
      category: "Clinical Chemistry",
      specimenType: "Serum",
      method: "Biochemistry Analyzer",
      parameters: [
        { name: "Urea", unit: "mg/dL", referenceRange: "7 - 20" },
        { name: "Creatinine", unit: "mg/dL", referenceRange: "0.6 - 1.3" },
        { name: "Sodium", unit: "mmol/L", referenceRange: "135 - 145" },
        { name: "Potassium", unit: "mmol/L", referenceRange: "3.5 - 5.1" },
        { name: "Chloride", unit: "mmol/L", referenceRange: "98 - 107" },
      ],
    },
  },
  {
    match: /stool|ova|cyst|worm|gastro/i,
    template: {
      id: "stool-analysis",
      label: "Stool Analysis",
      category: "Microbiology",
      specimenType: "Stool",
      method: "Macroscopy / Microscopy",
      parameters: [
        { name: "Appearance", referenceRange: "Formed" },
        { name: "Ova / Cysts / Parasites", referenceRange: "Not seen" },
        { name: "Red Blood Cells", unit: "/HPF", referenceRange: "Not seen" },
        { name: "White Blood Cells", unit: "/HPF", referenceRange: "Not seen" },
      ],
    },
  },
  {
    match: /culture|sensitivity|swab|pus|wound/i,
    template: {
      id: "culture-sensitivity",
      label: "Culture and Sensitivity",
      category: "Microbiology",
      specimenType: "Swab / Fluid / Tissue",
      method: "Culture and Antibiogram",
      parameters: [
        { name: "Gram Stain", referenceRange: "No organisms seen" },
        { name: "Culture Growth", referenceRange: "No growth" },
        { name: "Organism Isolated", referenceRange: "None" },
        { name: "Antibiotic Sensitivity", referenceRange: "Not applicable" },
      ],
    },
  },
];

const QUALITY_DEFAULTS: Record<QualityKey, string> = {
  specimenCondition: "",
  hemolysis: "",
  lipemia: "",
  icterus: "",
};

const TEST_CATALOG = TEST_TEMPLATES.map((entry) => entry.template);
const TEMPLATE_BY_ID = new Map(TEST_CATALOG.map((template) => [template.id, template]));

function getTemplate(test: LabTest): ResultTemplate {
  const haystack = `${test.testName} ${test.testCode || ""} ${test.category || ""} ${test.description || ""}`;
  const found = TEST_TEMPLATES.find((entry) => entry.match.test(haystack));
  if (found) return found.template;

  return {
    id: "doctor-requested-custom",
    label: test.testName || "Doctor Requested Test",
    category: test.category || "General Laboratory",
    specimenType: "As requested by doctor",
    method: test.instructions?.toLowerCase().includes("microscopy") ? "Microscopy" : "Manual Entry",
    parameters: [
      {
        name: test.testName,
        unit: "",
        referenceRange: test.description || "",
      },
    ],
  };
}

function getTemplateById(templateId: string, fallbackTest: LabTest) {
  return TEMPLATE_BY_ID.get(templateId) || getTemplate(fallbackTest);
}

function formatDateTime(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function makeResultId(test: LabTest, index: number) {
  return test.id || test.testCode || `${test.testName}-${index}`;
}

function buildResults(tests: LabTest[]): LabResult[] {
  return tests.flatMap((test, testIndex) => {
    const template = getTemplate(test);
    return template.parameters.map((parameter) => ({
      testId: `${makeResultId(test, testIndex)}::${parameter.name}`,
      testName: parameter.name,
      value: parameter.value || "",
      unit: parameter.unit || "",
      referenceRange: parameter.referenceRange || "",
      status: "" as const,
      notes: "",
      completedAt: "",
    }));
  });
}

function buildResultsForTemplate(test: LabTest, testIndex: number, template: ResultTemplate): LabResult[] {
  return template.parameters.map((parameter) => ({
    testId: `${makeResultId(test, testIndex)}::${parameter.name}`,
    testName: parameter.name,
    value: "",
    unit: parameter.unit || "",
    referenceRange: parameter.referenceRange || "",
    status: "" as const,
    notes: "",
    completedAt: "",
  }));
}

function requestResultKey(result: LabResult) {
  return `${result.testId}|${result.testName}`;
}

function mergeExistingResults(tests: LabTest[], existing?: LabResult[]) {
  const fresh = buildResults(tests);
  if (!existing?.length) return fresh;
  const existingMap = new Map(existing.map((result) => [requestResultKey(result), result]));
  return fresh.map((result) => ({ ...result, ...existingMap.get(requestResultKey(result)) }));
}

function statusClass(status: string) {
  return `lab-pill lab-pill--${status.toLowerCase().replace("_", "-")}`;
}

function labStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING_SAMPLE_COLLECTION: "Pending Sample Collection",
    SAMPLE_COLLECTED: "Sample Collected",
    PENDING_VERIFICATION: "Pending Verification",
    RESULTS_RELEASED: "Results Released",
    PENDING: "Pending Sample Collection",
    IN_PROGRESS: "Sample Collected",
    COMPLETED: "Results Released",
  };
  return labels[status] || status.replace(/_/g, " ");
}

function textOnlyValue(value: string) {
  return value.replace(/[0-9]/g, "");
}

function numericOnlyValue(value: string) {
  return value.replace(/[^0-9.\-+<>:/\s]/g, "");
}

function isNumericResult(result: LabResult) {
  const unit = result.unit?.trim();
  const range = result.referenceRange?.trim() || "";
  const name = result.testName.toLowerCase();
  return Boolean(unit) || /\d/.test(range) || /count|density|glucose|alt|ast|alp|bilirubin|albumin|urea|creatinine|sodium|potassium|chloride|wbc|rbc|mcv|mch|mchc|platelet|hemoglobin|hematocrit/i.test(name);
}

function cleanResultValue(result: LabResult, value: string) {
  return isNumericResult(result) ? numericOnlyValue(value) : textOnlyValue(value);
}

function firstNumber(value?: string) {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseReferenceRange(range?: string) {
  const values = String(range || "")
    .match(/-?\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((value) => Number.isFinite(value));

  if (!values?.length) return null;
  if (values.length === 1) return { low: 0, high: Math.max(values[0], 1), target: values[0] };

  const low = Math.min(values[0], values[1]);
  const high = Math.max(values[0], values[1]);
  return { low, high, target: (low + high) / 2 };
}

function statusColor(status: ResultStatus, settings: LabVisualSettings) {
  if (status === "CRITICAL") return settings.criticalColor;
  if (status === "ABNORMAL") return settings.abnormalColor;
  if (status === "NORMAL") return settings.normalColor;
  return settings.resultColor;
}

export default function LabDashboard({ staffId, hospitalId }: Props) {
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<LabRequest | null>(null);
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [patientIdSearch, setPatientIdSearch] = useState("");
  const [testResults, setTestResults] = useState<LabResult[]>([]);
  const [selectedTestKey, setSelectedTestKey] = useState("");
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, string>>({});
  const [dateTested, setDateTested] = useState("");
  const [authorizationTime, setAuthorizationTime] = useState("");
  const [quality, setQuality] = useState<Record<QualityKey, string>>(QUALITY_DEFAULTS);
  const [comments, setComments] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [reviewerRole, setReviewerRole] = useState("Laboratory Scientist");
  const [authorizerName, setAuthorizerName] = useState("");
  const [authorizationRole, setAuthorizationRole] = useState<AuthorizationRole>("SENIOR_LAB_SCIENTIST");
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<"draft" | "verify" | "release" | "start" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLabMenu, setShowLabMenu] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState("");
  const [activeToolPanel, setActiveToolPanel] = useState<LabToolPanel>("");
  const [visualSettings, setVisualSettings] = useState<LabVisualSettings>({
    normalColor: "#22c55e",
    abnormalColor: "#f59e0b",
    criticalColor: "#ef4444",
    resultColor: "#155df5",
    fontSize: 13,
    compactMode: false,
    showReferenceRanges: true,
    showSpecimenCards: true,
    requireReviewer: false,
  });

  const sampleId = useMemo(() => {
    const seed = selectedRequest?.id || "LAB";
    return `SMP-${seed.replace(/[^0-9]/g, "").slice(-8).padStart(8, "0")}`;
  }, [selectedRequest]);

  const groupedResults = useMemo(() => {
    if (!selectedRequest) return [];
    return selectedRequest.tests.map((test, testIndex) => {
      const prefix = `${makeResultId(test, testIndex)}::`;
      const testKey = makeResultId(test, testIndex);
      const templateId = templateOverrides[testKey];
      return {
        testIndex,
        testKey,
        test,
        template: templateId ? getTemplateById(templateId, test) : getTemplate(test),
        results: testResults.filter((result) => result.testId.startsWith(prefix)),
      };
    });
  }, [selectedRequest, templateOverrides, testResults]);

  const activeGroup = useMemo(() => {
    if (!groupedResults.length) return null;
    return groupedResults.find((group) => group.testKey === selectedTestKey) || groupedResults[0];
  }, [groupedResults, selectedTestKey]);

  const activeTemplate = activeGroup?.template || null;
  const reviewStage: ReviewStage = (selectedRequest?.reviewStatus || "DRAFT") as ReviewStage;

  const numericVisualRows = useMemo(() => {
    return (activeGroup?.results || [])
      .map((result) => {
        const value = firstNumber(result.value);
        if (value === null) return null;
        const range = parseReferenceRange(result.referenceRange);
        const graphMax = Math.max(value, range?.high || 0, range?.target || 0, 1);
        return {
          result,
          value,
          range,
          resultPercent: Math.min(100, Math.max(2, (value / graphMax) * 100)),
          normalPercent: range ? Math.min(100, Math.max(2, (range.target / graphMax) * 100)) : 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [activeGroup]);

  const statusSummary = useMemo(() => {
    const results = activeGroup?.results || [];
    return {
      normal: results.filter((result) => result.status === "NORMAL").length,
      abnormal: results.filter((result) => result.status === "ABNORMAL").length,
      critical: results.filter((result) => result.status === "CRITICAL").length,
      pending: results.filter((result) => !result.status || !result.value.trim()).length,
      total: results.length,
    };
  }, [activeGroup]);

  const completionPercent = statusSummary.total
    ? Math.round(((statusSummary.total - statusSummary.pending) / statusSummary.total) * 100)
    : 0;

  const specimenBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    groupedResults.forEach((group) => {
      counts.set(group.template.specimenType, (counts.get(group.template.specimenType) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
  }, [groupedResults]);

  const completedTestIds = useMemo(() => {
    const completed = new Set<string>();
    groupedResults.forEach((group, index) => {
      if (group.results.length > 0 && group.results.every((result) => result.value.trim())) {
        completed.add(makeResultId(group.test, index));
      }
    });
    return completed;
  }, [groupedResults]);

  const notificationCounts = useMemo(
    () => ({
      total: requests.length,
      pending: requests.filter((request) => request.status === "PENDING_SAMPLE_COLLECTION" || request.status === "PENDING").length,
      inProgress: requests.filter((request) => request.status === "SAMPLE_COLLECTED" || request.status === "PENDING_VERIFICATION" || request.status === "IN_PROGRESS").length,
      stat: requests.filter((request) => request.priority === "STAT").length,
      urgent: requests.filter((request) => request.priority === "URGENT").length,
    }),
    [requests]
  );

  useEffect(() => {
    loadLabRequests();
  }, [hospitalId]);

  useEffect(() => {
    if (!selectedRequest) {
      setPatient(null);
      return;
    }

    setTestResults(mergeExistingResults(selectedRequest.tests, selectedRequest.results));
    setSelectedTestKey(selectedRequest.tests[0] ? makeResultId(selectedRequest.tests[0], 0) : "");
    setTemplateOverrides(
      selectedRequest.tests.reduce<Record<string, string>>((acc, test, index) => {
        acc[makeResultId(test, index)] = getTemplate(test).id;
        return acc;
      }, {})
    );
    setQuality(QUALITY_DEFAULTS);
    setComments("");
    setReviewedBy(selectedRequest.reviewedBy || "");
    setReviewerRole("Laboratory Scientist");
    setAuthorizerName(selectedRequest.authorizedBy || "");
    setAuthorizationRole(selectedRequest.authorizationRole || "SENIOR_LAB_SCIENTIST");
    setSignature(selectedRequest.authorizedBy || "");
    setDateTested("");
    setAuthorizationTime("");

    let cancelled = false;
    findPatientById(selectedRequest.patientId)
      .then((record) => {
        if (!cancelled) setPatient(record);
      })
      .catch(() => {
        if (!cancelled) setPatient(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRequest, staffId]);

  async function loadLabRequests(silent = false) {
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      const requestsData = await loadPendingLabRequests(hospitalId);
      setRequests(requestsData);
      setSelectedRequest((current) => {
        if (!current) return requestsData[0] || null;
        return requestsData.find((request) => request.id === current.id) || requestsData[0] || null;
      });
      setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (e: any) {
      if (!silent) setError(e?.message || "Failed to load lab requests");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function searchPatientRequest() {
    if (!patientIdSearch.trim()) return;
    setLoading(true);
    setError("");
    try {
      const request = await findLabRequestByPatientId(patientIdSearch.trim());
      if (!request) {
        setError("No active lab request found for that patient.");
        return;
      }
      setSelectedRequest(request);
      setSuccess("Lab request loaded.");
    } catch (e: any) {
      setError(e?.message || "Failed to find lab request");
    } finally {
      setLoading(false);
    }
  }

  async function startProcessing(request: LabRequest) {
    setSaving("start");
    setError("");
    try {
      const sampleCollectedAt = new Date().toISOString();
      await updateLabRequestStatus(request.id, "SAMPLE_COLLECTED", staffId, `Lab Technician ${staffId}`);
      const updated = {
        ...request,
        status: "SAMPLE_COLLECTED" as const,
        labTechnicianId: staffId,
        labTechnicianName: `Lab Technician ${staffId}`,
        sampleCollectedAt,
      };
      setSelectedRequest(updated);
      setRequests((current) => current.map((item) => (item.id === request.id ? updated : item)));
      setSuccess("Sample collected. You can now perform the test and enter results.");
    } catch (e: any) {
      setError(e?.message || "Failed to start the request");
    } finally {
      setSaving(null);
    }
  }

  function updateResult(index: number, field: keyof LabResult, value: string) {
    setTestResults((current) =>
      current.map((result, resultIndex) =>
        resultIndex === index ? { ...result, [field]: field === "status" ? (value as ResultStatus) : value } : result
      )
    );
  }

  function addParameter(test: LabTest, testIndex: number) {
    const label = "New parameter";
    setTestResults((current) => [
      ...current,
      {
        testId: `${makeResultId(test, testIndex)}::${label}-${Date.now()}`,
        testName: label,
        value: "",
        unit: "",
        referenceRange: "",
        status: "",
        notes: "",
        completedAt: "",
      },
    ]);
  }

  function removeParameter(resultIndex: number) {
    setTestResults((current) => current.filter((_, index) => index !== resultIndex));
  }

  function resultGlobalIndex(target: LabResult) {
    return testResults.findIndex((result) => result === target);
  }

  function validateResults() {
    if (!selectedRequest) return "Select a lab request first.";
    if (!testResults.length) return "This request has no result fields.";
    const missing = testResults.filter((result) => !result.value.trim());
    if (missing.length) return "Fill in every required result value before approving and sending to the doctor.";
    const missingStatus = testResults.filter((result) => !result.status);
    if (missingStatus.length) return "Choose Normal, Abnormal, or Critical for every result.";
    if (!dateTested) return "Enter the real date and time the test was performed.";
    return "";
  }

  function validateReviewer() {
    const validation = validateResults();
    if (validation) return validation;
    if (!reviewedBy.trim()) return "Enter the laboratory scientist or senior technologist who reviewed the results.";
    return "";
  }

  function validateAuthorization() {
    const validation = validateReviewer();
    if (validation) return validation;
    if (!dateTested) return "Enter the date and time the test was performed.";
    if (!authorizationTime) return "Enter the real authorization date and time.";
    if (!authorizerName.trim()) return "Enter the laboratory scientist or pathologist authorizing the report.";
    if (!signature.trim()) return "Enter the final electronic signature.";
    return "";
  }

  function changeTemplateForTest(test: LabTest, testIndex: number, templateId: string) {
    const testKey = makeResultId(test, testIndex);
    const template = getTemplateById(templateId, test);
    const prefix = `${testKey}::`;
    setTemplateOverrides((current) => ({ ...current, [testKey]: template.id }));
    setTestResults((current) => [
      ...current.filter((result) => !result.testId.startsWith(prefix)),
      ...buildResultsForTemplate(test, testIndex, template),
    ]);
  }

  async function saveDraft() {
    if (!selectedRequest) return;
    setSaving("draft");
    setError("");
    try {
      await saveLabResultsDraft(selectedRequest.id, testResults, staffId, `Lab Technician ${staffId}`);
      setSelectedRequest({ ...selectedRequest, results: testResults, status: "SAMPLE_COLLECTED" });
      setSuccess("Draft saved in the database.");
    } catch (e: any) {
      setError(e?.message || "Failed to save draft results");
    } finally {
      setSaving(null);
    }
  }

  async function submitForReview() {
    const validation = validateResults();
    if (validation) {
      setError(validation);
      return;
    }
    if (!selectedRequest) return;

    setSaving("verify");
    setError("");
    try {
      await submitLabResultsForReview(selectedRequest.id, testResults, staffId, `Lab Technician ${staffId}`);
      setSelectedRequest({
        ...selectedRequest,
        results: testResults,
        status: "PENDING_VERIFICATION",
        reviewStatus: "PENDING_REVIEW",
        labTechnicianId: staffId,
        labTechnicianName: `Lab Technician ${staffId}`,
      });
      setSuccess("Results submitted for laboratory scientist / senior technologist review.");
    } catch (e: any) {
      setError(e?.message || "Failed to submit results for review");
    } finally {
      setSaving(null);
    }
  }

  async function verifyResults() {
    const validation = validateReviewer();
    if (validation) {
      setError(validation);
      return;
    }
    setSaving("verify");
    setError("");
    try {
      if (!selectedRequest) return;
      await markLabResultsReviewed(selectedRequest.id, `${reviewedBy.trim()} (${reviewerRole})`);
      setSelectedRequest({
        ...selectedRequest,
        results: testResults,
        reviewStatus: "REVIEWED",
        reviewedBy: `${reviewedBy.trim()} (${reviewerRole})`,
        reviewedAt: new Date().toISOString(),
      });
      setSuccess("Results reviewed by laboratory scientist / senior technologist. They are ready for final authorization.");
    } catch (e: any) {
      setError(e?.message || "Failed to mark results as reviewed");
    } finally {
      setSaving(null);
    }
  }

  async function approveAndRelease() {
    const validation = validateAuthorization();
    if (validation) {
      setError(validation);
      return;
    }
    if (reviewStage !== "REVIEWED") {
      setError("Results must be reviewed by a laboratory scientist or senior technologist before final authorization.");
      return;
    }
    if (!selectedRequest) return;

    setSaving("release");
    setError("");
    try {
      const completedAt = new Date().toISOString();
      await addLabResults(
        selectedRequest.id,
        testResults.map((result) => ({
          ...result,
          notes: [
            result.notes,
            `Date tested: ${formatDateTime(dateTested)}`,
            `Authorized: ${formatDateTime(authorizationTime)}`,
            `Reviewed by: ${reviewedBy.trim()} (${reviewerRole})`,
            `Authorized by: ${authorizerName.trim()} (${authorizationRole === "PATHOLOGIST" ? "Pathologist" : authorizationRole === "LABORATORY_SCIENTIST" ? "Laboratory Scientist" : authorizationRole === "SENIOR_LAB_SCIENTIST" ? "Senior Laboratory Scientist" : "Laboratory Manager"})`,
            Object.entries(quality)
              .filter(([, value]) => value)
              .map(([key, value]) => `${key}: ${value}`)
              .join("; "),
            comments ? `Lab comments: ${comments}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          completedAt,
        })),
        staffId,
        `Lab Technician ${staffId}`,
        {
          reviewedBy: `${reviewedBy.trim()} (${reviewerRole})`,
          authorizedBy: `${authorizerName.trim()} - ${signature.trim()}`,
          authorizationRole,
          authorizedAt: authorizationTime,
        }
      );
      setSuccess("Results authorized by the laboratory scientist/pathologist, dated, released, and sent back to the doctor.");
      setSelectedRequest(null);
      setTestResults([]);
      await loadLabRequests();
    } catch (e: any) {
      setError(e?.message || "Failed to approve and send results");
    } finally {
      setSaving(null);
    }
  }

  const canEdit = selectedRequest?.status === "SAMPLE_COLLECTED" || selectedRequest?.status === "PENDING_VERIFICATION" || selectedRequest?.status === "IN_PROGRESS";
  const canEditResults = canEdit && (reviewStage === "DRAFT" || reviewStage === "PENDING_REVIEW");
  const canSubmitForReview = canEdit && reviewStage !== "REVIEWED";
  const canReviewResults = canEdit && reviewStage === "PENDING_REVIEW";
  const canAuthorizeResults = canEdit && reviewStage === "REVIEWED";

  return (
    <div className="lab-dashboard">
      <header className="lab-topbar">
        <button
          className="lab-icon-button"
          aria-label="Lab menu"
          onClick={() => {
            setShowLabMenu((open) => !open);
            setShowNotifications(false);
          }}
        >
          <Menu size={20} />
        </button>
        {showLabMenu && (
          <div className="lab-dropdown lab-dropdown--menu">
            <button
              onClick={() => {
                setActiveToolPanel("visual");
                setShowLabMenu(false);
              }}
            >
              <BarChart3 size={16} />
              <span>Visual Dashboard</span>
            </button>
            <button
              onClick={() => {
                setActiveToolPanel("templates");
                setShowLabMenu(false);
              }}
            >
              <ClipboardList size={16} />
              <span>Result Templates</span>
            </button>
            <button
              onClick={() => {
                setActiveToolPanel("settings");
                setShowLabMenu(false);
              }}
            >
              <Settings size={16} />
              <span>Lab Settings</span>
            </button>
            <button
              onClick={() => {
                setActiveToolPanel("workflow");
                setShowLabMenu(false);
              }}
            >
              <SlidersHorizontal size={16} />
              <span>Workflow Settings</span>
            </button>
          </div>
        )}
        <div className="lab-brand">
          <div className="lab-brand-icon">
            <FlaskConical size={30} />
          </div>
          <div>
            <h1>Laboratory</h1>
            <p>Enter and manage patient test results</p>
          </div>
        </div>
        <div className="lab-topbar-actions">
          <button
            className="lab-icon-button lab-notification"
            aria-label="Notifications"
            onClick={() => {
              setShowNotifications((open) => !open);
              setShowLabMenu(false);
            }}
          >
            <Bell size={18} />
            <span>{notificationCounts.total}</span>
          </button>
          {showNotifications && (
            <div className="lab-dropdown lab-dropdown--notifications">
              <div className="lab-dropdown-heading">
                <strong>Lab Notifications</strong>
                <small>Updated {lastRefreshedAt || "now"}</small>
              </div>
              <div className="lab-notification-grid">
                <span>Pending</span>
                <strong>{notificationCounts.pending}</strong>
                <span>In progress</span>
                <strong>{notificationCounts.inProgress}</strong>
                <span>STAT / Urgent</span>
                <strong>{notificationCounts.stat + notificationCounts.urgent}</strong>
              </div>
              <button className="lab-dropdown-action" onClick={() => loadLabRequests()}>
                Refresh requests
              </button>
            </div>
          )}
          <button
            className="lab-icon-button"
            aria-label="More lab settings"
            onClick={() => {
              setShowLabMenu((open) => !open);
              setShowNotifications(false);
            }}
          >
            <MoreVertical size={18} />
          </button>
          <div className="lab-user">
            <div className="lab-avatar">{staffId.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>Lab Technician</strong>
              <span>{staffId}</span>
            </div>
            <ChevronDown size={16} />
          </div>
        </div>
      </header>

      {activeToolPanel === "visual" ? (
        <main className="lab-visual-page" style={{ fontSize: visualSettings.fontSize }}>
          <div className="lab-visual-hero">
            <div>
              <span>Laboratory Analytics</span>
              <h2>Visual Dashboard</h2>
              <p>
                {activeGroup
                  ? `${activeGroup.test.testName} results compared with normal reference ranges.`
                  : "Select a lab request and enter results to generate live result graphics."}
              </p>
            </div>
            <button className="lab-btn lab-btn--primary" onClick={() => setActiveToolPanel("")}>
              <X size={16} />
              Back to Results
            </button>
          </div>

          {activeGroup ? (
            <>
              <section className="lab-visual-kpis">
                <div className="lab-kpi-card">
                  <span>Completion</span>
                  <strong>{completionPercent}%</strong>
                  <div className="lab-ring" style={{ background: `conic-gradient(${visualSettings.resultColor} ${completionPercent}%, #e8eef6 0)` }} />
                </div>
                <div className="lab-kpi-card">
                  <span>Normal</span>
                  <strong>{statusSummary.normal}</strong>
                  <em style={{ background: visualSettings.normalColor }} />
                </div>
                <div className="lab-kpi-card">
                  <span>Abnormal</span>
                  <strong>{statusSummary.abnormal}</strong>
                  <em style={{ background: visualSettings.abnormalColor }} />
                </div>
                <div className="lab-kpi-card">
                  <span>Critical</span>
                  <strong>{statusSummary.critical}</strong>
                  <em style={{ background: visualSettings.criticalColor }} />
                </div>
              </section>

              <section className="lab-visual-grid">
                <div className="lab-card lab-visual-card-wide">
                  <div className="lab-card-title">
                    <BarChart3 size={18} />
                    <span>Reference Range Comparison</span>
                  </div>
                  {numericVisualRows.length > 0 ? (
                    <div className="lab-chart-stack">
                      {numericVisualRows.map((row) => (
                        <div className="lab-chart-row" key={row.result.testId}>
                          <div className="lab-chart-label">
                            <strong>{row.result.testName}</strong>
                            <span>
                              Result: {row.result.value} {row.result.unit || ""} / Normal: {row.result.referenceRange || "not set"}
                            </span>
                          </div>
                          <div className="lab-chart-bars">
                            <div className="lab-chart-track">
                              {row.range && (
                                <div
                                  className="lab-normal-bar"
                                  style={{
                                    width: `${row.normalPercent}%`,
                                    background: `${visualSettings.normalColor}33`,
                                    borderColor: visualSettings.normalColor,
                                  }}
                                />
                              )}
                              <div
                                className="lab-result-bar"
                                style={{
                                  width: `${row.resultPercent}%`,
                                  background: statusColor(row.result.status, visualSettings),
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="lab-empty-state">Enter numeric results for this test to see live comparison graphs.</div>
                  )}
                </div>

                <div className="lab-card">
                  <div className="lab-card-title">
                    <CheckCircle2 size={18} />
                    <span>Status Distribution</span>
                  </div>
                  <div className="lab-donut-wrap">
                    <div
                      className="lab-donut"
                      style={{
                        background: `conic-gradient(${visualSettings.normalColor} 0 ${statusSummary.total ? (statusSummary.normal / statusSummary.total) * 100 : 0}%, ${visualSettings.abnormalColor} 0 ${statusSummary.total ? ((statusSummary.normal + statusSummary.abnormal) / statusSummary.total) * 100 : 0}%, ${visualSettings.criticalColor} 0 100%)`,
                      }}
                    >
                      <strong>{statusSummary.total}</strong>
                      <span>results</span>
                    </div>
                  </div>
                  <div className="lab-status-chart">
                    {(["NORMAL", "ABNORMAL", "CRITICAL"] as ResultStatus[]).map((status) => {
                      const count = status === "NORMAL" ? statusSummary.normal : status === "ABNORMAL" ? statusSummary.abnormal : statusSummary.critical;
                      const width = statusSummary.total ? Math.max(4, (count / statusSummary.total) * 100) : 4;
                      return (
                        <div className="lab-status-chart-row" key={status || "pending"}>
                          <span>{status ? status.toLowerCase() : "pending"}</span>
                          <div>
                            <em style={{ width: `${width}%`, background: statusColor(status, visualSettings) }} />
                          </div>
                          <strong>{count}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {visualSettings.showSpecimenCards && (
                  <div className="lab-card">
                    <div className="lab-card-title">
                      <TestTube2 size={18} />
                      <span>Specimen View</span>
                    </div>
                    <div className="lab-specimen-bars">
                      {specimenBreakdown.length ? (
                        specimenBreakdown.map((item) => (
                          <div key={item.label}>
                            <span>{item.label}</span>
                            <div>
                              <em style={{ width: `${Math.max(12, (item.count / Math.max(1, selectedRequest?.tests.length || 1)) * 100)}%`, background: visualSettings.resultColor }} />
                            </div>
                            <strong>{item.count}</strong>
                          </div>
                        ))
                      ) : (
                        <div className="lab-empty-mini">No specimen data yet</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="lab-card">
                  <div className="lab-card-title">
                    <FileText size={18} />
                    <span>Qualitative Findings</span>
                  </div>
                  <div className="lab-finding-list">
                    {(activeGroup.results.filter((result) => !isNumericResult(result) && result.value.trim()).length
                      ? activeGroup.results.filter((result) => !isNumericResult(result) && result.value.trim())
                      : activeGroup.results.filter((result) => result.value.trim()).slice(0, 5)
                    ).map((result) => (
                      <div key={result.testId}>
                        <strong>{result.testName}</strong>
                        <span style={{ color: statusColor(result.status, visualSettings) }}>{result.value || "Pending"}</span>
                      </div>
                    ))}
                    {!activeGroup.results.some((result) => result.value.trim()) && <div className="lab-empty-mini">No findings entered yet</div>}
                  </div>
                </div>
              </section>
            </>
          ) : (
            <div className="lab-card">
              <div className="lab-empty-state">Select a lab request and enter results to build the visual dashboard.</div>
            </div>
          )}
        </main>
      ) : activeToolPanel === "templates" ? (
        <main className="lab-templates-page" style={{ fontSize: visualSettings.fontSize }}>
          <div className="lab-templates-hero">
            <div>
              <span>Laboratory Library</span>
              <h2>Result Templates</h2>
              <p>Choose beautifully organized test templates that match the doctor request, specimen type, method, and result parameters.</p>
            </div>
            <button className="lab-btn lab-btn--primary" onClick={() => setActiveToolPanel("")}>
              <X size={16} />
              Back to Results
            </button>
          </div>

          <section className="lab-template-showcase">
            {TEST_CATALOG.map((template, index) => (
              <article className="lab-template-card" key={template.id}>
                <div className="lab-template-card-top">
                  <div className="lab-template-orb">{String(index + 1).padStart(2, "0")}</div>
                  <div>
                    <h3>{template.label}</h3>
                    <p>{template.category}</p>
                  </div>
                </div>
                <div className="lab-template-meta">
                  <span>
                    <TestTube2 size={15} />
                    {template.specimenType}
                  </span>
                  <span>
                    <Settings size={15} />
                    {template.method}
                  </span>
                  <span>
                    <ClipboardList size={15} />
                    {template.parameters.length} parameters
                  </span>
                </div>
                <div className="lab-template-parameter-cloud">
                  {template.parameters.slice(0, 8).map((parameter) => (
                    <span key={parameter.name}>{parameter.name}</span>
                  ))}
                  {template.parameters.length > 8 && <span>+{template.parameters.length - 8} more</span>}
                </div>
                <button
                  className="lab-template-apply"
                  disabled={!activeGroup || !canEdit}
                  onClick={() => {
                    if (activeGroup) {
                      changeTemplateForTest(activeGroup.test, activeGroup.testIndex, template.id);
                      setActiveToolPanel("");
                    }
                  }}
                >
                  Apply to selected test
                </button>
              </article>
            ))}
          </section>
        </main>
      ) : activeToolPanel === "settings" ? (
        <main className="lab-settings-page" style={{ fontSize: visualSettings.fontSize }}>
          <div className="lab-settings-hero">
            <div>
              <span>Laboratory Control Center</span>
              <h2>Lab Settings</h2>
              <p>Control how the lab dashboard looks, refreshes, validates results, and presents reports for the laboratory team.</p>
            </div>
            <button className="lab-btn lab-btn--primary" onClick={() => setActiveToolPanel("")}>
              <X size={16} />
              Back to Results
            </button>
          </div>

          <section className="lab-settings-page-grid">
            <div className="lab-settings-card lab-settings-card--wide">
              <div className="lab-card-title">
                <BarChart3 size={18} />
                <span>Result Colors</span>
              </div>
              <div className="lab-color-settings">
                {[
                  ["normalColor", "Normal", visualSettings.normalColor],
                  ["abnormalColor", "Abnormal", visualSettings.abnormalColor],
                  ["criticalColor", "Critical", visualSettings.criticalColor],
                  ["resultColor", "Graph Result", visualSettings.resultColor],
                ].map(([key, label, value]) => (
                  <label key={key}>
                    <input
                      type="color"
                      value={value}
                      onChange={(event) => setVisualSettings((current) => ({ ...current, [key]: event.target.value }))}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="lab-settings-card">
              <div className="lab-card-title">
                <Settings size={18} />
                <span>Display</span>
              </div>
              <label className="lab-setting-range">
                Dashboard font size
                <input
                  type="range"
                  min="11"
                  max="18"
                  value={visualSettings.fontSize}
                  onChange={(event) => setVisualSettings((current) => ({ ...current, fontSize: Number(event.target.value) }))}
                />
                <strong>{visualSettings.fontSize}px</strong>
              </label>
              <label className="lab-setting-toggle">
                <input
                  type="checkbox"
                  checked={visualSettings.compactMode}
                  onChange={(event) => setVisualSettings((current) => ({ ...current, compactMode: event.target.checked }))}
                />
                Compact result rows
              </label>
              <label className="lab-setting-toggle">
                <input
                  type="checkbox"
                  checked={visualSettings.showReferenceRanges}
                  onChange={(event) => setVisualSettings((current) => ({ ...current, showReferenceRanges: event.target.checked }))}
                />
                Show reference ranges
              </label>
              <label className="lab-setting-toggle">
                <input
                  type="checkbox"
                  checked={visualSettings.showSpecimenCards}
                  onChange={(event) => setVisualSettings((current) => ({ ...current, showSpecimenCards: event.target.checked }))}
                />
                Show specimen cards
              </label>
            </div>

            <div className="lab-settings-card">
              <div className="lab-card-title">
                <Bell size={18} />
                <span>Manual Refresh</span>
              </div>
              <p className="lab-settings-copy">
                Lab requests only refresh when the laboratory worker clicks refresh. This keeps result entry stable while tests are being recorded.
              </p>
              <button className="lab-settings-action" onClick={() => loadLabRequests()}>
                Refresh now
              </button>
            </div>

            <div className="lab-settings-card">
              <div className="lab-card-title">
                <CheckCircle2 size={18} />
                <span>Verification</span>
              </div>
              <label className="lab-setting-toggle">
                <input
                  type="checkbox"
                  checked={visualSettings.requireReviewer}
                  onChange={(event) => setVisualSettings((current) => ({ ...current, requireReviewer: event.target.checked }))}
                />
                Require reviewer before release
              </label>
              <div className="lab-settings-preview">
                <span style={{ background: visualSettings.normalColor }}>Normal</span>
                <span style={{ background: visualSettings.abnormalColor }}>Abnormal</span>
                <span style={{ background: visualSettings.criticalColor }}>Critical</span>
              </div>
            </div>
          </section>
        </main>
      ) : (
      <main className="lab-workspace">
        {error && <div className="lab-alert lab-alert--error">{error}</div>}
        {success && <div className="lab-alert lab-alert--success">{success}</div>}

        <section className="lab-main-panel">
          {activeToolPanel === "workflow" && (
            <div className="lab-card lab-tool-panel" style={{ fontSize: visualSettings.fontSize }}>
              <div className="lab-card-title">
                <Settings size={18} />
                <span>
                  {activeToolPanel === "workflow" && "Workflow Settings"}
                </span>
                <button className="lab-panel-close" onClick={() => setActiveToolPanel("")} aria-label="Close panel">
                  <X size={16} />
                </button>
              </div>

              {activeToolPanel === "workflow" && (
                <div className="lab-template-list">
                  <div>
                    <strong>Draft</strong>
                    <span>Save unfinished results in the database while testing continues.</span>
                  </div>
                  <div>
                    <strong>Verify</strong>
                    <span>Check that all values, statuses, and authorization times are present.</span>
                  </div>
                  <div>
                    <strong>Approve & Release</strong>
                    <span>Save final results and send the report back to the doctor.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="lab-card lab-entry-card">
            <div className="lab-card-title">
              <ClipboardList size={18} />
              <span>Enter Lab Results</span>
            </div>

            {selectedRequest ? (
              <>
                <div className="lab-meta-grid">
                  <label>
                    Request ID
                    <strong>{selectedRequest.id}</strong>
                  </label>
                  <label>
                    Sample ID
                    <strong>{sampleId}</strong>
                  </label>
                  <label>
                    Date Received
                    <span className="lab-readonly-input">
                      <Calendar size={15} />
                      {formatDateTime(selectedRequest.requestTimeISO)}
                    </span>
                  </label>
                  <label>
                    Priority
                    <span className={statusClass(selectedRequest.priority)}>{selectedRequest.priority}</span>
                  </label>
                  <label>
                    Test Type
                    <select
                      value={activeGroup ? templateOverrides[activeGroup.testKey] || activeGroup.template.id : ""}
                      disabled={!canEdit || !activeGroup}
                      onChange={(event) => {
                        if (activeGroup) changeTemplateForTest(activeGroup.test, activeGroup.testIndex, event.target.value);
                      }}
                    >
                      {activeGroup && !TEMPLATE_BY_ID.has(activeGroup.template.id) && (
                        <option value={activeGroup.template.id}>{activeGroup.template.label}</option>
                      )}
                      {TEST_CATALOG.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label} - {template.specimenType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Doctor Suggested Test
                    <select value={activeGroup?.testKey || ""} onChange={(event) => setSelectedTestKey(event.target.value)}>
                      {selectedRequest.tests.map((test, index) => (
                        <option key={makeResultId(test, index)} value={makeResultId(test, index)}>
                          {test.testName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Specimen
                    <select value={activeTemplate?.specimenType || ""} disabled>
                      <option>{activeTemplate?.specimenType || "Choose test type"}</option>
                    </select>
                  </label>
                  <label>
                    Date Tested
                    <input type="datetime-local" value={dateTested} onChange={(event) => setDateTested(event.target.value)} disabled={!canEdit} />
                  </label>
                </div>

                <div className="lab-method-strip">
                  <Clock3 size={15} />
                  <span>{activeTemplate ? `${activeTemplate.method} for ${activeTemplate.category}` : "Choose an ordered test to see the lab method."}</span>
                  {activeGroup?.test.instructions && <strong>Doctor instructions: {activeGroup.test.instructions}</strong>}
                </div>

                {(selectedRequest.status === "PENDING_SAMPLE_COLLECTION" || selectedRequest.status === "PENDING") && (
                  <div className="lab-start-strip">
                    <span>This request is waiting for sample collection before testing can begin.</span>
                    <button className="lab-btn lab-btn--primary" onClick={() => startProcessing(selectedRequest)} disabled={saving === "start"}>
                      <TestTube2 size={16} />
                      Collect Sample
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="lab-empty-state">{loading ? "Loading lab requests..." : "Select an ordered lab request to begin."}</div>
            )}
          </div>

          {selectedRequest && (
            <div className="lab-card">
              <div className="lab-card-title">
                <FileText size={18} />
                <span>Test Results</span>
              </div>

              <div className="lab-results-table">
                <div className="lab-results-head">
                  <span>Test Parameter</span>
                  <span>Result</span>
                  <span>Unit</span>
                  <span>Reference Range</span>
                  <span>Status</span>
                  <span></span>
                </div>

                {activeGroup ? (
                  <React.Fragment key={activeGroup.testKey}>
                    <div className="lab-test-group-label">
                      {activeGroup.test.testName}
                      <span>
                        {activeGroup.template.category} / {activeGroup.template.specimenType}
                      </span>
                    </div>
                    {activeGroup.results.map((result) => {
                      const index = resultGlobalIndex(result);
                      return (
                        <div className={`lab-result-row ${visualSettings.compactMode ? "lab-result-row--compact" : ""}`} key={result.testId}>
                          <input
                            value={result.testName}
                            disabled={!canEditResults}
                            onChange={(event) => updateResult(index, "testName", event.target.value)}
                          />
                          <input
                            value={result.value}
                            disabled={!canEditResults}
                            inputMode={isNumericResult(result) ? "decimal" : "text"}
                            onChange={(event) => updateResult(index, "value", cleanResultValue(result, event.target.value))}
                            placeholder={isNumericResult(result) ? "Numbers only" : "Text only"}
                          />
                          <input
                            value={result.unit || ""}
                            disabled={!canEditResults}
                            onChange={(event) => updateResult(index, "unit", event.target.value)}
                            placeholder="Unit"
                          />
                          {visualSettings.showReferenceRanges ? (
                            <input
                              value={result.referenceRange || ""}
                              disabled={!canEditResults}
                              onChange={(event) => updateResult(index, "referenceRange", event.target.value)}
                              placeholder="Reference"
                            />
                          ) : (
                            <span className="lab-muted-cell">Hidden</span>
                          )}
                          <select
                            value={result.status}
                            disabled={!canEditResults}
                            onChange={(event) => updateResult(index, "status", event.target.value)}
                          >
                            <option value="">Select status</option>
                            <option value="NORMAL">Normal</option>
                            <option value="ABNORMAL">Abnormal</option>
                            <option value="CRITICAL">Critical</option>
                          </select>
                          <button className="lab-row-icon" onClick={() => removeParameter(index)} disabled={!canEditResults} aria-label="Remove parameter">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      );
                    })}
                    <button className="lab-add-parameter" onClick={() => addParameter(activeGroup.test, activeGroup.testIndex)} disabled={!canEditResults}>
                      <Plus size={15} />
                      Add Parameter
                    </button>
                  </React.Fragment>
                ) : (
                  <div className="lab-empty-state">Choose a doctor-requested test to enter results.</div>
                )}
              </div>
            </div>
          )}

          {selectedRequest && (
            <div className="lab-card">
              <div className="lab-card-title">
                <CheckCircle2 size={18} />
                <span>Additional Information</span>
              </div>
              <div className="lab-quality-grid">
                {(["specimenCondition", "hemolysis", "lipemia", "icterus"] as QualityKey[]).map((key) => (
                  <label key={key}>
                    {key === "specimenCondition" ? "Specimen Condition" : key.charAt(0).toUpperCase() + key.slice(1)}
                    <select
                      value={quality[key]}
                      onChange={(event) => setQuality((current) => ({ ...current, [key]: event.target.value }))}
                      disabled={!canEditResults}
                    >
                      <option value="">Select</option>
                      <option>Acceptable</option>
                      <option>None</option>
                      <option>Mild</option>
                      <option>Moderate</option>
                      <option>Severe</option>
                      <option>Rejected</option>
                    </select>
                  </label>
                ))}
              </div>
              <label className="lab-notes-field">
                Comments / Notes
                <textarea value={comments} onChange={(event) => setComments(textOnlyValue(event.target.value))} disabled={!canEditResults} />
              </label>
            </div>
          )}

          {selectedRequest && (
            <div className="lab-card">
              <div className="lab-card-title">
                <Send size={18} />
                <span>Review & Final Authorization</span>
              </div>
              <div className="lab-workflow-steps">
                <span className={reviewStage === "DRAFT" ? "active" : ""}>Technician entry</span>
                <span className={reviewStage === "PENDING_REVIEW" ? "active" : ""}>Pending verification</span>
                <span className={reviewStage === "REVIEWED" ? "active" : ""}>Reviewed</span>
                <span className={reviewStage === "AUTHORIZED" ? "active" : ""}>Authorized</span>
              </div>
              <div className="lab-auth-grid">
                <label>
                  Laboratory Technician
                  <select value={`Lab Technician ${staffId}`} disabled>
                    <option>{`Lab Technician ${staffId}`}</option>
                  </select>
                </label>
                <label>
                  Reviewed By
                  <input value={reviewedBy} onChange={(event) => setReviewedBy(textOnlyValue(event.target.value))} disabled={!canReviewResults} placeholder="Lab scientist or senior technologist" />
                </label>
                <label>
                  Reviewer Role
                  <select value={reviewerRole} onChange={(event) => setReviewerRole(event.target.value)} disabled={!canReviewResults}>
                    <option>Laboratory Scientist</option>
                    <option>Senior Technologist</option>
                  </select>
                </label>
                <label>
                  Authorizing Scientist / Pathologist
                  <input value={authorizerName} onChange={(event) => setAuthorizerName(textOnlyValue(event.target.value))} disabled={!canAuthorizeResults} placeholder="Scientist or pathologist name" />
                </label>
                <label>
                  Authorizer Role
                  <select value={authorizationRole} onChange={(event) => setAuthorizationRole(event.target.value as AuthorizationRole)} disabled={!canAuthorizeResults}>
                    <option value="SENIOR_LAB_SCIENTIST">Senior Laboratory Scientist</option>
                    <option value="LABORATORY_SCIENTIST">Laboratory Scientist</option>
                    <option value="PATHOLOGIST">Pathologist</option>
                    <option value="LAB_MANAGER">Laboratory Manager</option>
                  </select>
                </label>
                <label>
                  Authorization Date & Time
                  <input type="datetime-local" value={authorizationTime} onChange={(event) => setAuthorizationTime(event.target.value)} disabled={!canAuthorizeResults} />
                </label>
                <div className="lab-signature-box">
                  <input value={signature} onChange={(event) => setSignature(textOnlyValue(event.target.value))} disabled={!canAuthorizeResults} placeholder="Final electronic signature" />
                  <button onClick={() => setSignature("")} disabled={!canAuthorizeResults}>
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedRequest && (
            <div className="lab-actions">
              <button className="lab-btn" onClick={saveDraft} disabled={!canEditResults || saving !== null}>
                Save as Draft
              </button>
              <button className="lab-btn lab-btn--primary" onClick={submitForReview} disabled={!canSubmitForReview || saving !== null}>
                <Send size={16} />
                Submit for Review
              </button>
              <button className="lab-btn lab-btn--soft" onClick={verifyResults} disabled={!canReviewResults || saving !== null}>
                <Check size={16} />
                Mark Reviewed
              </button>
              <button className="lab-btn lab-btn--success" onClick={approveAndRelease} disabled={!canAuthorizeResults || saving !== null}>
                <Send size={16} />
                Authorize & Release
              </button>
              <button className="lab-btn lab-btn--soft" onClick={() => window.print()}>
                <Printer size={16} />
                Print Report
              </button>
              <button
                className="lab-btn lab-btn--danger"
                onClick={() => {
                  setSelectedRequest(null);
                  setTestResults([]);
                }}
              >
                <X size={16} />
                Cancel
              </button>
            </div>
          )}
        </section>

        <aside className="lab-side-panel">
          <div className="lab-card">
            <div className="lab-search-box">
              <Search size={16} />
              <input
                value={patientIdSearch}
                onChange={(event) => setPatientIdSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") searchPatientRequest();
                }}
                placeholder="Search patient ID"
              />
              <button onClick={searchPatientRequest}>Search</button>
            </div>
          </div>

          <div className="lab-card">
            <div className="lab-card-title">
              <UserRound size={18} />
              <span>Patient Information</span>
            </div>
            <div className="lab-info-list">
              <span>Patient ID</span>
              <strong>{selectedRequest?.patientId || "-"}</strong>
              <span>Name</span>
              <strong>{patient?.fullName || selectedRequest?.patientName || "-"}</strong>
              <span>Age / Gender</span>
              <strong>{patient ? `${patient.age || "-"} Years / ${patient.sex || "-"}` : "-"}</strong>
              <span>Phone</span>
              <strong>{patient?.phone || "-"}</strong>
              <span>Department</span>
              <strong>{activeTemplate?.category || "-"}</strong>
              <span>Doctor</span>
              <strong>{selectedRequest?.doctorName || "-"}</strong>
            </div>
          </div>

          <div className="lab-card">
            <div className="lab-card-title">
              <ClipboardList size={18} />
              <span>Test Request Information</span>
            </div>
            <div className="lab-info-list">
              <span>Request Date</span>
              <strong>{formatDateTime(selectedRequest?.requestTimeISO)}</strong>
              <span>Requested By</span>
              <strong>{selectedRequest?.doctorName || "-"}</strong>
              <span>Clinical Info</span>
              <strong>{selectedRequest?.clinicalNotes || "None provided"}</strong>
              <span>Priority</span>
              <strong>{selectedRequest?.priority || "-"}</strong>
            </div>
          </div>

          <div className="lab-card">
            <div className="lab-card-title">
              <TestTube2 size={18} />
              <span>Ordered Tests</span>
            </div>
            <div className="lab-ordered-tests">
                  {selectedRequest
                ? selectedRequest.tests.map((test, index) => {
                    const testKey = makeResultId(test, index);
                    const done = completedTestIds.has(makeResultId(test, index));
                    return (
                      <button
                        key={test.id || `${test.testName}-${index}`}
                        className={selectedTestKey === testKey ? "active" : ""}
                        type="button"
                        onClick={() => setSelectedTestKey(testKey)}
                      >
                        <span>
                          {test.testName}
                          <small>{getTemplateById(templateOverrides[testKey] || getTemplate(test).id, test).category}</small>
                        </span>
                      <em className={statusClass(done ? "COMPLETED" : "PENDING")}>{done ? "Completed" : "Pending"}</em>
                      </button>
                    );
                  })
                : requests.map((request) => (
                    <button key={request.id} onClick={() => setSelectedRequest(request)}>
                      <span>
                        {request.patientName}
                        <small>{request.tests.map((test) => test.testName).join(", ")}</small>
                      </span>
                      <em className={statusClass(request.status)}>{labStatusLabel(request.status)}</em>
                    </button>
                  ))}
              {!selectedRequest && !requests.length && <div className="lab-empty-mini">{loading ? "Loading..." : "No pending tests"}</div>}
            </div>
          </div>

        </aside>
      </main>
      )}
    </div>
  );
}
