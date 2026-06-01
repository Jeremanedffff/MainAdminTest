import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardPlus,
  FlaskConical,
  FolderOpen,
  Heart,
  PenLine,
  Pill,
  Save,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import "./DoctorDashboard.css";
import {
  addPatientNoteFirestore,
  createPrescriptionFirestore,
  loadPatientNotes,
  loadReleasedLabResultsByDoctor,
  loadPatientsByHospital,
  searchPatientsAcrossHospitals,
  createLabRequest,
  updatePatientClinicalFactsFirestore,
  type PatientNoteRow,
  type PatientRow,
  type PrescriptionItem,
  type LabRequest,
  type LabTest,
} from "../hospitalAdmin/hospitalAdminFirestore";
import { apiUrl } from "../../utils/api";

type Props = {
  doctorId: string;
  hospitalId: string;
};

type SummaryListItem =
  | string
  | {
      name?: string;
      count?: number;
      medication?: string;
      times_seen?: number;
      comment?: string;
      frequency?: string;
      clinical_indication?: string;
      monitoring_required?: string;
    };

type AiSummary = {
  patient_overview: string;
  main_conditions: SummaryListItem[];
  current_or_recent_medications: SummaryListItem[];
  repeated_symptoms: SummaryListItem[];
  repeated_medications: SummaryListItem[];
  possible_non_response_flags: SummaryListItem[];
  important_tests_already_done_or_ordered: SummaryListItem[];
  doctor_attention_points: SummaryListItem[];
  recommendations?: string[];
  red_flags?: string[];
  clinical_complexity?: string;
  data_completeness?: string;
};

type AiMedicationAdvice = {
  patient_context: {
    symptoms?: string[];
    current_or_recent_medications?: string[];
    demographics?: Record<string, any>;
    possible_allergy_flags?: string[];
    doctor_question?: string;
    source_note_title?: string;
    source_note_date?: string;
  };
  disease_predictions?: {
    disease: string;
    confidence: number;
    explanation?: string;
    urgency?: string;
    supporting_evidence?: string;
  }[];
  medication_options: {
    medication: string;
    matched_conditions: string[];
    rationale: string[];
    confidence: number;
    cautions: string[];
    doctor_action: string;
  }[];
  avoid_or_review: string[];
  clinician_review_note: string;
  data_completeness?: string;
};

type InsightCondition = {
  name: string;
  confidence?: number;
};

const renderSummaryListItem = (item: SummaryListItem) => {
  if (typeof item === "string") return item;

  const title = item.medication || item.name || "Clinical item";
  const details = [
    typeof item.count === "number" ? `seen ${item.count} time${item.count === 1 ? "" : "s"}` : "",
    typeof item.times_seen === "number" ? `seen ${item.times_seen} time${item.times_seen === 1 ? "" : "s"}` : "",
    item.frequency,
    item.clinical_indication,
    item.monitoring_required,
    item.comment,
  ].filter(Boolean);

  return details.length ? `${title} - ${details.join("; ")}` : title;
};

const uniqueItems = (items: string[]) =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const summaryItemTitle = (item: SummaryListItem) => {
  if (typeof item === "string") return item;
  return item.name || item.medication || item.clinical_indication || renderSummaryListItem(item);
};

const formatConfidencePercent = (confidence: number) =>
  `${Math.round(confidence <= 1 ? confidence * 100 : confidence)}%`;

const textOnlyValue = (value: string) => value.replace(/[0-9]/g, "");
const numericOnlyValue = (value: string) => value.replace(/[^0-9.]/g, "");
const bloodPressureValue = (value: string) => value.replace(/[^0-9/\s]/g, "");
const presentationSafeText = (value?: string, fallback = "") => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const blocked = [
    "use this row for disease-prediction training",
    "until disease-specific guideline treatment",
    "treatment_text_requires",
    "patient_reported_not_prescribing_guidance",
    "dataset completeness",
  ];

  return text && !blocked.some((phrase) => text.toLowerCase().includes(phrase)) ? text : fallback;
};
const displayClinicalText = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const chronicConditionTerms = [
  "Hypertension",
  "Diabetes",
  "Asthma",
  "HIV/AIDS",
  "Epilepsy",
  "Cancer",
  "Tuberculosis",
  "Kidney Disease",
  "Heart Disease",
  "Sickle Cell Disease",
];

const chronicConditionPatterns: Record<string, RegExp[]> = {
  "Hypertension": [/\bhypertension\b/i, /\bhigh blood pressure\b/i],
  "Diabetes": [/\bdiabetes\b/i, /\bdiabetic\b/i],
  "Asthma": [/\basthma\b/i, /\basthmatic\b/i],
  "HIV/AIDS": [/\bhiv\b/i, /\baids\b/i],
  "Epilepsy": [/\bepilepsy\b/i, /\bepileptic\b/i, /\bseizure disorder\b/i],
  "Cancer": [/\bcancer\b/i, /\bmalignancy\b/i],
  "Tuberculosis": [/\btuberculosis\b/i, /\btb\b/i],
  "Kidney Disease": [/\bkidney disease\b/i, /\brenal disease\b/i, /\bchronic kidney\b/i],
  "Heart Disease": [/\bheart disease\b/i, /\bcardiac disease\b/i, /\bheart failure\b/i],
  "Sickle Cell Disease": [/\bsickle cell\b/i],
};

const normalizeAllergyText = (value: string) =>
  value
    .replace(/\b(and|or|with|reaction|reactions|rash|hives|anaphylaxis|unknown)\b/gi, " ")
    .replace(/[.;,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const extractClinicalFactsFromNotes = (patientNotes: PatientNoteRow[]) => {
  const noteText = patientNotes.map((row) => `${row.title || ""}\n${row.note || ""}`).join("\n");
  const chronicConditions = chronicConditionTerms.filter((condition) =>
    chronicConditionPatterns[condition]?.some((pattern) => pattern.test(noteText))
  );

  const allergyMatches = new Set<string>();
  const allergyPatterns = [
    /\ballerg(?:y|ic|ies)\s*(?:to|:|-)?\s*([a-z0-9 /+-]{2,48})/gi,
    /\b(?:drug|food)\s+allergies?\s*(?:to|:|-)?\s*([a-z0-9 /+-]{2,48})/gi,
    /\badverse reaction\s*(?:to|:|-)?\s*([a-z0-9 /+-]{2,48})/gi,
  ];

  allergyPatterns.forEach((pattern) => {
    for (const match of noteText.matchAll(pattern)) {
      const allergy = normalizeAllergyText(match[1] || "");
      if (allergy && !/\b(no|none|nil|not known|nka)\b/i.test(allergy)) {
        allergyMatches.add(allergy.replace(/\b\w/g, (letter) => letter.toUpperCase()));
      }
    }
  });

  const bloodGroupMatch = noteText.match(
    /\b(?:blood group|blood type|abo(?:\/rh)?|grouping)\s*(?:is|:|-)?\s*(A|B|AB|O)\s*(positive|negative|pos|neg|\+|-)?\b/i
  );
  const bloodGroup = bloodGroupMatch
    ? `${bloodGroupMatch[1].toUpperCase()}${bloodGroupMatch[2] ? (/[+-]|pos|positive/i.test(bloodGroupMatch[2]) ? "+" : "-") : ""}`
    : "";

  return {
    chronicConditions,
    allergies: allergyMatches.size ? Array.from(allergyMatches).join(", ") : "None",
    bloodGroup,
  };
};

const createEmptyAssessment = () => ({
  temperature: "",
  bloodPressure: "",
  heartRate: "",
  respiratoryRate: "",
  oxygenSaturation: "",
  bloodGlucose: "",
  weight: "",
  height: "",
  bmi: "",
  chiefComplaint: "",
  duration: "",
  painLevel: "",
  symptoms: [] as string[],
  hivTest: "",
  pregnancyTest: "",
  malariaTest: "",
  covidTest: "",
  tuberculosisScreening: "",
  hepatitisBTest: "",
  urineTest: "",
  bloodGroupTest: "",
  chronicConditions: [] as string[],
  otherCondition: "",
  currentMedications: "",
  drugAllergies: "",
  foodAllergies: "",
  generalAppearance: "",
  skinCondition: "",
  respiratoryExam: "",
  cardiovascularExam: "",
  abdominalExam: "",
  neurologicalExam: "",
  diagnosis: "",
  followUpDate: "",
});

type AssessmentState = ReturnType<typeof createEmptyAssessment>;

const filledAssessmentEntries = (assessment: AssessmentState) =>
  Object.entries(assessment).filter(([, value]) =>
    Array.isArray(value) ? value.length > 0 : String(value || "").trim().length > 0
  );

const DoctorDashboard: React.FC<Props> = ({ doctorId, hospitalId }) => {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);

  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
  const [notes, setNotes] = useState<PatientNoteRow[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const [search, setSearch] = useState("");
  const [crossHospitalSearch, setCrossHospitalSearch] = useState("");
  const [showCrossHospitalSearch, setShowCrossHospitalSearch] = useState(false);
  const [crossHospitalPatients, setCrossHospitalPatients] = useState<PatientRow[]>([]);
  const [loadingCrossHospital, setLoadingCrossHospital] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [aiMedicationAdvice, setAiMedicationAdvice] = useState<AiMedicationAdvice | null>(null);
  const [aiMedicationAdviceNoteId, setAiMedicationAdviceNoteId] = useState("");
  const [loadingMedicationAdvice, setLoadingMedicationAdvice] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showPrescriptionForm, setShowPrescriptionForm] = useState(false);
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([]);
  const [prescriptionNotes, setPrescriptionNotes] = useState("");
  const [savingPrescription, setSavingPrescription] = useState(false);

  const [showLabRequestForm, setShowLabRequestForm] = useState(false);
  const [releasedLabResults, setReleasedLabResults] = useState<LabRequest[]>([]);
  const [selectedLabResult, setSelectedLabResult] = useState<LabRequest | null>(null);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [labPriority, setLabPriority] = useState<"ROUTINE" | "URGENT" | "STAT">("ROUTINE");
  const [labClinicalNotes, setLabClinicalNotes] = useState("");
  const [savingLabRequest, setSavingLabRequest] = useState(false);

  const [showPatientHistory, setShowPatientHistory] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);
  const [assessment, setAssessment] = useState(createEmptyAssessment);

  const patientClinicalFacts = useMemo(() => extractClinicalFactsFromNotes(notes), [notes]);
  const currentBloodGroup =
    assessment.bloodGroupTest && assessment.bloodGroupTest !== "Pending"
      ? assessment.bloodGroupTest
      : selectedPatient?.bloodGroup || patientClinicalFacts.bloodGroup;

  const updateAssessment = (field: keyof typeof assessment, value: string | string[]) => {
    setAssessment((current) => ({ ...current, [field]: value }));
  };

  const updateTextOnlyAssessment = (field: keyof typeof assessment, value: string) => {
    updateAssessment(field, textOnlyValue(value));
  };

  const updateNumericAssessment = (field: keyof typeof assessment, value: string) => {
    updateAssessment(field, field === "bloodPressure" ? bloodPressureValue(value) : numericOnlyValue(value));
  };

  const toggleAssessmentListValue = (
    field: "symptoms" | "chronicConditions",
    value: string
  ) => {
    setAssessment((current) => {
      const existing = current[field];
      return {
        ...current,
        [field]: existing.includes(value)
          ? existing.filter((item) => item !== value)
          : [...existing, value],
      };
    });
  };

  useEffect(() => {
    const run = async () => {
      setLoadingPatients(true);
      setError("");

      try {
        if (!hospitalId) {
          setError("Doctor hospital ID is missing.");
          setPatients([]);
          return;
        }

        try {
          const rows = await loadPatientsByHospital(hospitalId);
          setPatients(rows);
          if (rows.length === 0) setSelectedPatient(null);
        } catch (e: any) {
          console.error("LOAD DOCTOR PATIENTS ERROR:", e);
          setError(e?.message || "Failed to load patients. Please check your connection and try again.");
          setPatients([]);
          setNotes([]);
        }
      } catch (e: any) {
        console.error("LOAD DOCTOR PATIENTS ERROR:", e);
        setError(e?.message || "Failed to load patients. Please check your connection and try again.");
        setPatients([]);
        setNotes([]);
      } finally {
        setLoadingPatients(false);
      }
    };

    run();
  }, [hospitalId]);

  useEffect(() => {
    const run = async () => {
      setAssessment(createEmptyAssessment());
      setTitle("");
      setNote("");
      setPrescriptionNotes("");
      setPrescriptionItems([]);
      setShowPrescriptionForm(false);
      setLabTests([]);
      setLabPriority("ROUTINE");
      setLabClinicalNotes("");
      setShowLabRequestForm(false);
      setCurrentNoteIndex(0);

      if (!selectedPatient) {
        setNotes([]);
        setReleasedLabResults([]);
        setSelectedLabResult(null);
        setAiSummary(null);
        setAiMedicationAdvice(null);
        setAiMedicationAdviceNoteId("");
        return;
      }

      setLoadingNotes(true);
      setError("");
      setSuccess("");

      try {
        const [rows, labRows] = await Promise.all([
          loadPatientNotes(selectedPatient.id),
          loadReleasedLabResultsByDoctor(doctorId, hospitalId),
        ]);
        setNotes(rows);
        setReleasedLabResults(labRows.filter((request) => request.patientId === selectedPatient.id));
        setAiSummary(null);
        setAiMedicationAdvice(null);
        setAiMedicationAdviceNoteId("");
      } catch (e: any) {
        console.error("LOAD PATIENT NOTES ERROR:", e);
        setError(e?.message || "Failed to load notes.");
      } finally {
        setLoadingNotes(false);
      }
    };

    run();
  }, [selectedPatient, doctorId, hospitalId]);

  const newestReleasedLabResult = releasedLabResults[0] || null;

  const labAuthorizationRoleLabel = (role?: LabRequest["authorizationRole"]) => {
    if (role === "PATHOLOGIST") return "Pathologist";
    if (role === "LABORATORY_SCIENTIST") return "Laboratory Scientist";
    if (role === "SENIOR_LAB_SCIENTIST") return "Senior Laboratory Scientist";
    if (role === "LAB_MANAGER") return "Laboratory Manager";
    return "Not recorded";
  };

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;

    return patients.filter((p) => {
      return p.id.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q);
    });
  }, [patients, search]);

  const doctorName = useMemo(() => `Doctor ${doctorId}`, [doctorId]);

  const returnToPatientList = () => {
    setSelectedPatient(null);
    setShowPatientHistory(false);
    setShowPrescriptionForm(false);
    setShowLabRequestForm(false);
  };

  const buildCurrentAssessmentNote = () => {
    const rows = [
      ["Temperature", assessment.temperature],
      ["Blood Pressure", assessment.bloodPressure],
      ["Heart Rate", assessment.heartRate],
      ["Respiratory Rate", assessment.respiratoryRate],
      ["Oxygen Saturation", assessment.oxygenSaturation],
      ["Blood Glucose", assessment.bloodGlucose],
      ["Weight", assessment.weight],
      ["Height", assessment.height],
      ["BMI", assessment.bmi],
      ["Chief Complaint", assessment.chiefComplaint],
      ["Duration", assessment.duration],
      ["Pain Level", assessment.painLevel],
      ["Symptoms", assessment.symptoms.join(", ")],
      ["HIV Test", assessment.hivTest],
      ["Pregnancy Test", assessment.pregnancyTest],
      ["Malaria Test", assessment.malariaTest],
      ["COVID-19 Test", assessment.covidTest],
      ["Tuberculosis Screening", assessment.tuberculosisScreening],
      ["Hepatitis B Test", assessment.hepatitisBTest],
      ["Urine Test", assessment.urineTest],
      ["Blood Group Test", assessment.bloodGroupTest],
      ["Chronic Conditions Checked", assessment.chronicConditions.join(", ")],
      ["Other Condition", assessment.otherCondition],
      ["Current Medications", assessment.currentMedications],
      ["Drug Allergies", assessment.drugAllergies],
      ["Food Allergies", assessment.foodAllergies],
      ["General Appearance", assessment.generalAppearance],
      ["Skin Condition", assessment.skinCondition],
      ["Respiratory Exam", assessment.respiratoryExam],
      ["Cardiovascular Exam", assessment.cardiovascularExam],
      ["Abdominal Exam", assessment.abdominalExam],
      ["Neurological Exam", assessment.neurologicalExam],
      ["Assessment Note", note],
      ["Provisional Diagnosis", title],
      ["Consultation Notes", prescriptionNotes],
      ["Treatment Plan or Lab Notes", labClinicalNotes],
    ]
      .map(([label, value]) => [label, String(value || "").trim()])
      .filter(([, value]) => value);

    if (!rows.length) return "";

    return [
      "Title: Current unsaved doctor assessment",
      `Doctor: ${doctorName}`,
      `Date: ${new Date().toISOString()}`,
      "Note: Current assessment entries from the doctor dashboard:",
      ...rows.map(([label, value]) => `${label}: ${value}`),
    ].join("\n");
  };

  const buildPersistedAssessmentNote = () => {
    const assessmentNote = buildCurrentAssessmentNote();
    const parts = [
      assessmentNote.replace(/^Title: Current unsaved doctor assessment\n/, ""),
      prescriptionItems.length
        ? [
            "Prescription Draft:",
            ...prescriptionItems.map((item) =>
              `- ${item.drugName || "Unnamed medication"}${item.dosage ? `, dosage ${item.dosage}` : ""}${item.frequency ? `, frequency ${item.frequency}` : ""}, ${item.days} day${item.days === 1 ? "" : "s"}`
            ),
          ].join("\n")
        : "",
    ].filter(Boolean);

    return parts.join("\n\n").trim();
  };

  const buildSavedPatientNotesData = () =>
    notes.map((n) => {
      const linkedMedications = n.linkedPrescriptions?.length
        ? `Linked prescriptions sent to pharmacy:\n${n.linkedPrescriptions
            .map((rx) => `- ${rx.prescriptionId}: ${rx.medicationSummary}`)
            .join("\n")}`
        : "";

      return [
        `Title: ${n.title}`,
        `Doctor: ${n.doctorName}`,
        `Date: ${n.createdAtISO}`,
        `Note: ${n.note}`,
        linkedMedications,
      ]
        .filter(Boolean)
        .join("\n");
    });

  const buildAiNotesData = () => {
    const assessmentNote = buildCurrentAssessmentNote();
    return [...buildSavedPatientNotesData(), ...(assessmentNote ? [assessmentNote] : [])];
  };

  const saveNote = async () => {
    if (!selectedPatient) {
      setError("Please select a patient first.");
      return;
    }

    setError("");
    setSuccess("");

    const persistedAssessmentNote = buildPersistedAssessmentNote();
    const hasAssessmentData = filledAssessmentEntries(assessment).length > 0;
    const cleanTitle = title.trim() || `Clinical Assessment - ${new Date().toLocaleDateString("en-GB")}`;
    const cleanNote = note.trim() || persistedAssessmentNote;

    if (!hasAssessmentData && !cleanNote.trim()) {
      setError("Please enter assessment information before saving.");
      return;
    }

    setSaving(true);

    try {
      const savedNote = await addPatientNoteFirestore({
        patientId: selectedPatient.id,
        hospitalId,
        doctorId,
        doctorName,
        title: cleanTitle,
        note: cleanNote,
        assessment: {
          ...assessment,
          prescriptionDraft: prescriptionItems,
          consultationNotes: prescriptionNotes,
          treatmentPlanOrLabNotes: labClinicalNotes,
          savedAtISO: new Date().toISOString(),
        },
      });

      const savedAllergies = [assessment.drugAllergies, assessment.foodAllergies]
        .map((item) => item.trim())
        .filter(Boolean)
        .join(", ");
      const savedConditions = [
        ...assessment.chronicConditions,
        ...(assessment.otherCondition.trim() ? [assessment.otherCondition.trim()] : []),
      ];

      if (assessment.bloodGroupTest || savedAllergies || savedConditions.length) {
        await updatePatientClinicalFactsFirestore({
          patientId: selectedPatient.id,
          bloodGroup: assessment.bloodGroupTest && assessment.bloodGroupTest !== "Pending" ? assessment.bloodGroupTest : currentBloodGroup,
          chronicConditions: savedConditions.length ? savedConditions : undefined,
          allergies: savedAllergies || undefined,
        });

        setSelectedPatient((current) =>
          current
            ? {
                ...current,
                bloodGroup: assessment.bloodGroupTest && assessment.bloodGroupTest !== "Pending" ? assessment.bloodGroupTest : current.bloodGroup,
                chronicConditions: savedConditions.length ? savedConditions : current.chronicConditions,
                allergies: savedAllergies || current.allergies,
              }
            : current
        );
        setPatients((current) =>
          current.map((patient) =>
            patient.id === selectedPatient.id
              ? {
                  ...patient,
                  bloodGroup: assessment.bloodGroupTest && assessment.bloodGroupTest !== "Pending" ? assessment.bloodGroupTest : patient.bloodGroup,
                  chronicConditions: savedConditions.length ? savedConditions : patient.chronicConditions,
                  allergies: savedAllergies || patient.allergies,
                }
              : patient
          )
        );
      }

      const rows = await loadPatientNotes(selectedPatient.id);
      setNotes(rows);
      setTitle("");
      setNote("");
      setAiSummary(null);
      setAiMedicationAdvice(null);
      setAiMedicationAdviceNoteId("");
      setSuccess(`Assessment saved successfully. Future prescriptions will link to "${savedNote.title}".`);
      setSelectedPatient(null);
    } catch (e: any) {
      console.error("SAVE PATIENT NOTE ERROR:", e);
      setError(e?.message || "Failed to save note.");
    } finally {
      setSaving(false);
    }
  };

  const buildLatestSavedPatientNoteForMedicationAI = () => {
    const latestNote = notes[0];
    const notesData = buildAiNotesData();

    if (!notesData.length) {
      throw new Error("Enter assessment information or save a patient note before asking AI for medication options.");
    }

    return {
      latestNote,
      notesData,
    };
  };

  const requestMedicationAdviceForLatestNote = async () => {
    if (!selectedPatient) {
      throw new Error("Please select a patient first.");
    }

    const { latestNote, notesData } = buildLatestSavedPatientNoteForMedicationAI();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(apiUrl("/ai/medication-recommendation"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          demographics: {
            age: selectedPatient.age,
            gender: selectedPatient.sex,
          },
          notes: notesData,
          question: `Analyze this patient's saved notes plus the current doctor assessment entries and suggest medication options that fit the documented condition and symptoms.`,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as AiMedicationAdvice;
      setAiMedicationAdvice(data);
      setAiMedicationAdviceNoteId(latestNote?.id || "current-assessment");
      return { latestNote, data };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const generateSummary = async () => {
    if (!selectedPatient) {
      setError("Please select a patient first.");
      return;
    }

    setLoadingSummary(true);
    setError("");
    setSuccess("");

    try {
      console.log("=== AI SUMMARY GENERATION START ===");
      console.log("Patient:", selectedPatient.id);
      console.log("Available notes:", notes.length);
      
      const notesData = buildAiNotesData();

      if (notesData.length === 0) {
        throw new Error("Enter assessment information or save at least one patient note before generating AI insights.");
      }

      console.log("Using patient notes plus current assessment entries:", notesData.length);
      
      const requestBody = {
        patient_id: selectedPatient.id,
        demographics: {
          age: selectedPatient.age,
          gender: selectedPatient.sex,
        },
        notes: notesData,
      };
      
      console.log("Sending request to backend...");
      
      // Try backend API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(apiUrl("/ai/patient-summary"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      console.log("Backend response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend error response:", errorText);
        throw new Error(`Backend error (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      console.log("Backend response data:", data);
      
      setAiSummary(data as AiSummary);
      setSuccess("Short AI summary generated successfully.");
      
    } catch (e: any) {
      console.error("AI SUMMARY ERROR:", e);

      if (e?.message?.includes("Enter assessment information")) {
        setAiSummary(null);
        setError(e.message);
        return;
      }

      setAiSummary(null);
      setError(e?.name === "AbortError" ? "AI summary took too long. Please try again." : e?.message || "Failed to generate AI summary from the backend.");
    } finally {
      setLoadingSummary(false);
      console.log("=== AI SUMMARY GENERATION COMPLETE ===");
    }
  };

  const recommendMedication = async () => {
    if (!selectedPatient) {
      setError("Please select a patient first.");
      return;
    }

    setLoadingMedicationAdvice(true);
    setError("");
    setSuccess("");

    try {
      const { latestNote } = await requestMedicationAdviceForLatestNote();
      setSuccess(
        latestNote
          ? `AI medication options generated from patient notes and current assessment: "${latestNote.title}".`
          : "AI medication options generated from the current assessment entries."
      );
    } catch (e: any) {
      console.error("AI MEDICATION RECOMMENDATION ERROR:", e);
      setError(e?.name === "AbortError" ? "AI medication recommendation took too long. Please try again." : e?.message || "Failed to generate medication advice.");
    } finally {
      setLoadingMedicationAdvice(false);
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

  const renderRepeatedMedications = () => {
    if (!aiSummary?.repeated_medications || aiSummary.repeated_medications.length === 0) {
      return <li>None detected</li>;
    }

    return aiSummary.repeated_medications.map((item, i) => {
      if (typeof item === "string") {
        return <li key={i}>{item}</li>;
      }

      return (
        <li key={i}>
          <b>{item.medication || item.name || "Medication"}</b>
          {typeof item.times_seen === "number" ? ` — seen ${item.times_seen} times` : ""}
          {item.comment ? ` — ${item.comment}` : ""}
        </li>
      );
    });
  };

  const insightConditions: InsightCondition[] = useMemo(() => {
    if (aiMedicationAdvice?.disease_predictions?.length) {
      return aiMedicationAdvice.disease_predictions.slice(0, 4).map((prediction) => ({
        name: prediction.disease,
        confidence: prediction.confidence,
      }));
    }

    if (aiSummary?.main_conditions?.length) {
      return aiSummary.main_conditions.slice(0, 4).map((condition) => ({
        name: summaryItemTitle(condition),
      }));
    }

    return [];
  }, [aiMedicationAdvice, aiSummary]);

  const insightRecommendedTests = useMemo(() => {
    const testsFromSummary = uniqueItems(
      (aiSummary?.important_tests_already_done_or_ordered || [])
        .map((item) => summaryItemTitle(item))
        .filter((item) => !/no important tests|none detected/i.test(item))
    );

    return uniqueItems([
      ...(!currentBloodGroup ? ["Blood Group"] : []),
      ...testsFromSummary,
    ]).slice(0, 5);
  }, [aiSummary, currentBloodGroup]);

  const insightRisk = useMemo(() => {
    if (!aiSummary) {
      return {
        level: notes.length ? "Awaiting AI review" : "No notes yet",
        text: notes.length
          ? `Generate AI Insights to analyze ${notes.length} saved patient note${notes.length === 1 ? "" : "s"}.`
          : "Save or load patient notes before generating clinical insights.",
      };
    }

    const complexity = (aiSummary.clinical_complexity || "").trim();
    const level = complexity
      ? `${complexity.charAt(0).toUpperCase()}${complexity.slice(1)} Complexity`
      : "AI Reviewed";
    const text =
      aiSummary.red_flags?.[0] ||
      aiSummary.doctor_attention_points?.map((item) => renderSummaryListItem(item))[0] ||
      aiSummary.recommendations?.[0] ||
      aiSummary.patient_overview ||
      "AI insights generated from this patient's saved notes.";

    return { level, text };
  }, [aiSummary, notes.length]);

  const medicationPatientSignals = useMemo(() => {
    const backendSymptoms = aiMedicationAdvice?.patient_context?.symptoms || [];
    return uniqueItems([...backendSymptoms, ...assessment.symptoms].map((item) => displayClinicalText(item)));
  }, [aiMedicationAdvice, assessment.symptoms]);

  const addPrescriptionItem = () => {
    setPrescriptionItems([
      ...prescriptionItems,
      { drugName: "", dosage: "", frequency: "", days: 1 },
    ]);
  };

  const updatePrescriptionItem = (index: number, field: keyof PrescriptionItem, value: string | number) => {
    const updated = [...prescriptionItems];
    updated[index] = { ...updated[index], [field]: value };
    setPrescriptionItems(updated);
  };

  const removePrescriptionItem = (index: number) => {
    setPrescriptionItems(prescriptionItems.filter((_, i) => i !== index));
  };

  const applySuggestedMedication = (medication: string) => {
    const cleanMedication = medication.trim();
    if (!cleanMedication || cleanMedication.toLowerCase().startsWith("no specific")) return;

    const firstEmptyIndex = prescriptionItems.findIndex((item) => !item.drugName.trim());
    if (firstEmptyIndex >= 0) {
      updatePrescriptionItem(firstEmptyIndex, "drugName", cleanMedication);
      return;
    }

    setPrescriptionItems([
      ...prescriptionItems,
      { drugName: cleanMedication, dosage: "", frequency: "", days: 1 },
    ]);
  };

  const openPrescriptionWithAiAnalysis = async () => {
    if (!selectedPatient) {
      setError("Please select a patient first.");
      return;
    }

    if (!notes[0]) {
      setError("Save a clinical note before prescribing so AI can analyze that note first.");
      return;
    }

    setLoadingMedicationAdvice(true);
    setError("");
    setSuccess("");

    try {
      const { latestNote } = await requestMedicationAdviceForLatestNote();
      setShowPrescriptionForm(true);
      if (prescriptionItems.length === 0) {
        setPrescriptionItems([{ drugName: "", dosage: "", frequency: "", days: 1 }]);
      }
      setSuccess(`Latest note "${latestNote.title}" analyzed. You can type medication manually or choose an AI suggestion.`);
    } catch (e: any) {
      console.error("AI ANALYSIS BEFORE PRESCRIPTION ERROR:", e);
      setError(e?.name === "AbortError" ? "AI analysis took too long. Please try again." : e?.message || "Failed to analyze latest note before prescribing.");
    } finally {
      setLoadingMedicationAdvice(false);
    }
  };

  const sendDoctorDecisionFeedback = async (
    prescriptionId: string,
    linkedNote: PatientNoteRow | undefined,
    items: PrescriptionItem[]
  ) => {
    if (!selectedPatient) return;

    const feedbackNotes = [
      linkedNote
        ? [
            `Title: ${linkedNote.title}`,
            `Doctor: ${linkedNote.doctorName}`,
            `Date: ${linkedNote.createdAtISO}`,
            `Note: ${linkedNote.note}`,
          ].join("\n")
        : [
            `Title: ${title.trim() || "Prescription decision"}`,
            `Doctor: ${doctorName}`,
            `Date: ${new Date().toISOString()}`,
            `Note: ${note.trim() || prescriptionNotes.trim() || "Doctor created a treatment decision."}`,
          ].join("\n"),
      prescriptionNotes.trim() ? `Treatment notes: ${prescriptionNotes.trim()}` : "",
      `Medications prescribed: ${items
        .map((item) => `${item.drugName} ${item.dosage} ${item.frequency} for ${item.days} days`)
        .join("; ")}`,
    ].filter(Boolean);

    const response = await fetch(apiUrl("/ai/doctor-decision-feedback"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: selectedPatient.id,
        doctor_id: doctorId,
        demographics: {
          age: selectedPatient.age,
          gender: selectedPatient.sex,
        },
        notes: feedbackNotes,
        treatments: items,
        treatment_notes: prescriptionNotes,
        prescription_id: prescriptionId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "AI feedback save failed");
    }
  };

  const createPrescription = async () => {
    if (!selectedPatient) {
      setError("Please select a patient first.");
      return;
    }

    if (prescriptionItems.length === 0) {
      setError("Please add at least one medication.");
      return;
    }

    const validItems = prescriptionItems.filter(
      (item) => item.drugName.trim() && item.dosage.trim() && item.frequency.trim() && item.days > 0
    );

    if (validItems.length === 0) {
      setError("Please fill in all medication details.");
      return;
    }

    setSavingPrescription(true);

    try {
      const linkedNote = notes[0];

      if (linkedNote && (!aiMedicationAdvice || aiMedicationAdviceNoteId !== linkedNote.id)) {
        await requestMedicationAdviceForLatestNote();
      }

      const prescriptionId = await createPrescriptionFirestore({
        patientId: selectedPatient.id,
        patientName: selectedPatient.fullName,
        doctorId,
        doctorName,
        hospitalId,
        hospitalName: selectedPatient.hospitalName || `Hospital ${hospitalId}`,
        items: validItems,
        notes: prescriptionNotes,
        linkedNoteId: linkedNote?.id,
        linkedNoteTitle: linkedNote?.title,
        linkedNoteText: linkedNote?.note,
        linkedNoteCreatedAtISO: linkedNote?.createdAtISO,
      });

      if (linkedNote) {
        try {
          await sendDoctorDecisionFeedback(prescriptionId, linkedNote, validItems);
        } catch (feedbackError) {
          console.warn("AI doctor decision feedback was not saved:", feedbackError);
        }
      }

      const refreshedNotes = await loadPatientNotes(selectedPatient.id);
      setNotes(refreshedNotes);
      setPrescriptionItems([]);
      setPrescriptionNotes("");
      setShowPrescriptionForm(false);
      setAiSummary(null);

      setSuccess(
        linkedNote
          ? `Prescription ${prescriptionId} sent to pharmacy and linked to analyzed note "${linkedNote.title}".`
          : `Prescription ${prescriptionId} sent to pharmacy.`
      );
    } catch (e: any) {
      console.error("CREATE PRESCRIPTION ERROR:", e);
      setError(e?.message || "Failed to create prescription.");
    } finally {
      setSavingPrescription(false);
    }
  };

  const addLabTest = () => {
    const newTest: LabTest = {
      id: `TEST-${Date.now()}`,
      testName: "",
      category: "Blood",
      description: "",
      instructions: "",
    };
    setLabTests([...labTests, newTest]);
  };

  const removeLabTest = (index: number) => {
    setLabTests(labTests.filter((_, i) => i !== index));
  };

  const updateLabTest = (index: number, field: keyof LabTest, value: string) => {
    const updatedTests = [...labTests];
    updatedTests[index] = {
      ...updatedTests[index],
      [field]: value,
    };
    setLabTests(updatedTests);
  };

  const sendLabRequest = async () => {
    if (!selectedPatient) {
      setError("Please select a patient first.");
      return;
    }

    if (labTests.length === 0 || labTests.every((t) => !t.testName.trim())) {
      setError("Please add at least one test with a name.");
      return;
    }

    const validTests = labTests.filter((t) => t.testName.trim());

    setSavingLabRequest(true);

    try {
      await createLabRequest({
        patientId: selectedPatient.id,
        patientName: selectedPatient.fullName,
        doctorId,
        doctorName,
        hospitalId,
        hospitalName: `Hospital ${hospitalId}`,
        tests: validTests,
        priority: labPriority,
        clinicalNotes: labClinicalNotes,
      });

      setLabTests([]);
      setLabPriority("ROUTINE");
      setLabClinicalNotes("");
      setShowLabRequestForm(false);

      setSuccess("Lab request sent successfully! Patient can now go to the laboratory.");
    } catch (e: any) {
      console.error("CREATE LAB REQUEST ERROR:", e);
      setError(e?.message || "Failed to send lab request.");
    } finally {
      setSavingLabRequest(false);
    }
  };

  const openLabRequestWithBloodGroupCheck = () => {
    if (!currentBloodGroup) {
      const hasBloodGroupTest = labTests.some((test) => /blood\s*(group|type)|abo|rh/i.test(test.testName));
      if (!hasBloodGroupTest) {
        setLabTests((current) => [
          {
            id: `TEST-BLOOD-GROUP-${Date.now()}`,
            testName: "Blood Group",
            testCode: "ABO-RH",
            category: "Blood",
            description: "Confirm ABO and Rh blood group before assigning blood group to the patient profile.",
            instructions: "Enter the confirmed blood group result only after laboratory testing.",
          },
          ...current,
        ]);
      }
      setLabClinicalNotes((current) =>
        current.trim()
          ? current
          : "Blood group is not confirmed in this patient's notes. Please test ABO/Rh blood group first."
      );
    }
    setShowLabRequestForm(true);
  };

  const symptomOptions = [
    "Fever",
    "Fatigue",
    "Chest Pain",
    "Headache",
    "Body Pain",
    "Shortness of Breath",
    "Vomiting",
    "Sore Throat",
    "Loss of Taste/Smell",
    "Cough",
    "Diarrhea",
    "Others",
  ];

  const chronicConditionOptions = [
    "Hypertension",
    "Cancer",
    "Diabetes",
    "Epilepsy",
    "Asthma",
    "HIV/AIDS",
    "Heart Disease",
    "Tuberculosis",
    "Kidney Disease",
    "Other",
  ];

  const rapidTestResultOptions = ["Positive", "Negative", "Suspected", "Normal", "Pending"];
  const bloodGroupOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Pending"];
  const rapidResultTone = (value: string) => {
    const normalized = value.toLowerCase();
    if (normalized === "positive") return "positive";
    if (normalized === "negative" || normalized === "normal") return "negative";
    if (normalized === "suspected") return "suspected";
    if (normalized === "pending") return "pending";
    return "neutral";
  };

  const rapidTests = [
    { field: "hivTest", label: "HIV Test", options: rapidTestResultOptions },
    { field: "pregnancyTest", label: "Pregnancy Test", options: rapidTestResultOptions },
    { field: "malariaTest", label: "Malaria Test", options: rapidTestResultOptions },
    { field: "covidTest", label: "COVID-19 Test", options: rapidTestResultOptions },
    { field: "tuberculosisScreening", label: "Tuberculosis Screening", options: rapidTestResultOptions },
    { field: "hepatitisBTest", label: "Hepatitis B Test", options: rapidTestResultOptions },
    { field: "urineTest", label: "Urine Test", options: rapidTestResultOptions },
    { field: "bloodGroupTest", label: "Blood Group Test", options: bloodGroupOptions },
  ] as const;

  const physicalExamFields = [
    ["generalAppearance", "General Appearance"],
    ["skinCondition", "Skin Condition"],
    ["respiratoryExam", "Respiratory Examination"],
    ["cardiovascularExam", "Cardiovascular Examination"],
    ["abdominalExam", "Abdominal Examination"],
    ["neurologicalExam", "Neurological Examination"],
  ] as const;

  return (
    <div className="doctor-dashboard" style={styles.page}>
      <div>
        <div style={styles.h1}>Doctor Dashboard</div>
        
        <div style={styles.sub}>
          Doctor ID: <b>{doctorId || "—"}</b> • Hospital: <b>{hospitalId || "—"}</b>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {success ? <div style={styles.success}>{success}</div> : null}

      <div style={selectedPatient ? styles.gridSelectedPatient : styles.grid}>
        {!selectedPatient && (
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Patients</div>
          <div style={styles.panelSub}>
            Search patients from your hospital, or use All Hospitals to find an external patient.
          </div>

          <div style={styles.searchSection}>
            <div style={styles.searchToggle}>
              <button
                style={!showCrossHospitalSearch ? styles.searchToggleActive : styles.searchToggleInactive}
                onClick={() => setShowCrossHospitalSearch(false)}
              >
                My Hospital
              </button>
              <button
                style={showCrossHospitalSearch ? styles.searchToggleActive : styles.searchToggleInactive}
                onClick={() => setShowCrossHospitalSearch(true)}
              >
                All Hospitals
              </button>
            </div>

            {!showCrossHospitalSearch ? (
              <input
                style={styles.searchInput}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patient by ID or name..."
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
                <div style={styles.loading}>
                  {search.trim()
                    ? "No patients in this hospital match this search."
                    : "No patients are registered in this hospital. Use All Hospitals to search for any patient."}
                </div>
              ) : (
                <div style={styles.list}>
                  {filteredPatients.map((p) => (
                    <button
                      key={p.id}
                      style={{
                        ...styles.patientBtn,
                      }}
                      onClick={() => setSelectedPatient(p)}
                    >
                      <div style={styles.patientName}>{p.fullName}</div>
                      <div style={styles.patientMeta}>
                        {p.id} • {p.sex} • {p.age} years
                      </div>
                    </button>
                  ))}
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
                <div style={styles.list}>
                  {crossHospitalPatients.map((p) => (
                    <button
                      key={p.id}
                      style={{
                        ...styles.patientBtn,
                        ...(p.hospitalId !== hospitalId ? styles.crossHospitalPatient : {}),
                      }}
                      onClick={() => setSelectedPatient(p)}
                    >
                      <div style={styles.patientName}>
                        {p.fullName}
                        {p.hospitalId !== hospitalId && (
                          <span style={styles.hospitalBadge}>
                            <Building2 size={13} />
                            {p.hospitalName}
                          </span>
                        )}
                      </div>
                      <div style={styles.patientMeta}>
                        {p.id} • {p.sex} • {p.age} years
                        {p.hospitalId !== hospitalId && (
                          <span style={styles.crossHospitalIndicator}>External Patient</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={styles.loading}>Enter a search term to find patients across all hospitals.</div>
              )}
            </>
          )}
        </div>
        )}

        <div className="preconsult-shell">
          {selectedPatient ? (
            <>
              <div className="preconsult-topbar">
                <div className="preconsult-titleRow">
                  <button
                    type="button"
                    className="preconsult-backBtn"
                    onClick={returnToPatientList}
                    aria-label="Back to patient list"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div>
                    <h2>Pre-Consultation Assessment</h2>
                    <p>Capture patient vitals, history, and test results before consultation</p>
                  </div>
                </div>
                <button className="assessment-secondaryBtn" onClick={() => setShowPatientHistory(true)}>
                  <BookOpen size={16} />
                  View History
                </button>
              </div>

              <section className="assessment-patientCard">
                <div className="assessment-avatar">
                  {selectedPatient.fullName
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="assessment-profileGrid">
                  <div><span>Patient ID</span><b>{selectedPatient.id}</b></div>
                  <div><span>Name</span><b>{selectedPatient.fullName}</b></div>
                  <div><span>Age</span><b>{selectedPatient.age} Years</b></div>
                  <div><span>Gender</span><b>{selectedPatient.sex === "MALE" ? "Male" : "Female"}</b></div>
                  <div><span>Visit Date</span><b>{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</b></div>
                  <div><span>Visit Type</span><b className="assessment-statusPill">Walk-in</b></div>
                </div>
                <div className="assessment-patientMeta">
                  <div>
                    <span>Chronic Conditions</span>
                    {patientClinicalFacts.chronicConditions.length ? (
                      patientClinicalFacts.chronicConditions.map((condition) => (
                        <strong key={condition}>{condition}</strong>
                      ))
                    ) : (
                      <b>None</b>
                    )}
                  </div>
                  <div><span>Allergies</span><b>{patientClinicalFacts.allergies}</b></div>
                  <div><span>Blood Group</span><b>{currentBloodGroup || "Test required"}</b></div>
                  <div><span>Phone</span><b>{selectedPatient.phone || "Not captured"}</b></div>
                </div>
              </section>

              {newestReleasedLabResult && (
                <section style={styles.labResultNotice}>
                  <div>
                    <div style={styles.labResultNoticeTitle}>
                      <CheckCircle2 size={18} />
                      New Lab Results Available
                    </div>
                    <div style={styles.labResultNoticeSub}>
                      {newestReleasedLabResult.tests.map((test) => test.testName).join(", ")} released for {selectedPatient.fullName}.
                    </div>
                  </div>
                  <button style={styles.secondaryBtn} onClick={() => setSelectedLabResult(newestReleasedLabResult)}>
                    Open Results
                  </button>
                </section>
              )}

              <div className="assessment-grid">
                <section className="assessment-card assessment-vitals">
                  <h3><Activity size={18} /> 1. Vital Signs</h3>
                  <div className="assessment-fieldGrid">
                    {[
                      ["temperature", "Temperature (C)"],
                      ["bloodPressure", "Blood Pressure (mmHg)"],
                      ["heartRate", "Heart Rate (BPM)"],
                      ["respiratoryRate", "Respiratory Rate (RPM)"],
                      ["oxygenSaturation", "Oxygen Saturation (%)"],
                      ["bloodGlucose", "Blood Glucose (mmol/L)"],
                      ["weight", "Weight (kg)"],
                      ["height", "Height (cm)"],
                      ["bmi", "BMI (kg/m2)"],
                    ].map(([field, label]) => (
                      <label key={field}>
                        {label}
                        <input
                          inputMode={field === "bloodPressure" ? "text" : "decimal"}
                          value={assessment[field as keyof typeof assessment] as string}
                          onChange={(e) => updateNumericAssessment(field as keyof typeof assessment, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </section>

                <section className="assessment-card">
                  <h3><ClipboardPlus size={18} /> 2. Current Complaint</h3>
                  <label className="assessment-wideField">
                    Chief Complaint
                    <input
                      value={assessment.chiefComplaint}
                      onChange={(e) => updateTextOnlyAssessment("chiefComplaint", e.target.value)}
                    />
                  </label>
                  <div className="assessment-twoCol">
                    <label>
                      Duration
                      <select value={assessment.duration} onChange={(e) => updateAssessment("duration", e.target.value)}>
                        <option value="">Select duration</option>
                        <option value="1 Day">1 Day</option>
                        <option value="2 Days">2 Days</option>
                        <option value="3 Days">3 Days</option>
                        <option value="1 Week">1 Week</option>
                        <option value="More than 1 Week">More than 1 Week</option>
                      </select>
                    </label>
                    <label>
                      Pain Level (0-10)
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={assessment.painLevel}
                        onChange={(e) => updateNumericAssessment("painLevel", e.target.value)}
                        placeholder="0-10"
                      />
                    </label>
                  </div>
                  <div className="assessment-checkGrid">
                    {symptomOptions.map((symptom) => (
                      <label key={symptom}>
                        <input
                          type="checkbox"
                          checked={assessment.symptoms.includes(symptom)}
                          onChange={() => toggleAssessmentListValue("symptoms", symptom)}
                        />
                        {symptom}
                      </label>
                    ))}
                  </div>
                </section>

                <section className="assessment-card">
                  <h3><FlaskConical size={18} /> 3. Rapid Test Results</h3>
                  <div className="assessment-compactRows">
                    {rapidTests.map(({ field, label, options }) => (
                      <label key={field}>
                        {label}
                        <select
                          className={`rapid-resultSelect ${rapidResultTone(assessment[field])}`}
                          value={assessment[field]}
                          onChange={(e) => updateAssessment(field, e.target.value)}
                        >
                          <option value="">Select result</option>
                          {options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="assessment-card">
                  <h3><Heart size={18} /> 4. Chronic Conditions</h3>
                  <div className="assessment-checkGrid two">
                    {chronicConditionOptions.map((condition) => (
                      <label key={condition}>
                        <input
                          type="checkbox"
                          checked={assessment.chronicConditions.includes(condition)}
                          onChange={() => toggleAssessmentListValue("chronicConditions", condition)}
                        />
                        {condition}
                      </label>
                    ))}
                  </div>
                  <input
                    className="assessment-otherInput"
                    placeholder="Enter condition"
                    value={assessment.otherCondition}
                    onChange={(e) => updateTextOnlyAssessment("otherCondition", e.target.value)}
                  />
                </section>

                <section className="assessment-card">
                  <h3><Pill size={18} /> 5. Medications & Allergies</h3>
                  <label className="assessment-wideField">
                    Current Medications
                    <textarea value={assessment.currentMedications} onChange={(e) => updateAssessment("currentMedications", e.target.value)} />
                  </label>
                  <label className="assessment-wideField">
                    Drug Allergies
                    <input value={assessment.drugAllergies} onChange={(e) => updateTextOnlyAssessment("drugAllergies", e.target.value)} />
                  </label>
                  <label className="assessment-wideField">
                    Food Allergies
                    <input value={assessment.foodAllergies} onChange={(e) => updateTextOnlyAssessment("foodAllergies", e.target.value)} />
                  </label>
                </section>

                <section className="assessment-card">
                  <h3><Stethoscope size={18} /> 6. Physical Examination</h3>
                  <div className="assessment-compactRows">
                    {physicalExamFields.map(([field, label]) => (
                      <label key={field}>
                        {label}
                        <select
                          value={assessment[field]}
                          onChange={(e) => updateAssessment(field, e.target.value)}
                        >
                          <option value="">Select finding</option>
                          <option value="Normal">Normal</option>
                          <option value="Ill-looking">Ill-looking</option>
                          <option value="Clear">Clear</option>
                          <option value="S1 S2 Normal">S1 S2 Normal</option>
                          <option value="Soft, Non-tender">Soft, Non-tender</option>
                          <option value="Abnormal">Abnormal</option>
                        </select>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="assessment-card assessment-insights">
                  <h3><BrainCircuit size={18} /> 7. AI Clinical Insights</h3>
                  <div className="assessment-insightGrid">
                    <div>
                      <h4>Possible Conditions</h4>
                      {loadingSummary || loadingMedicationAdvice ? (
                        <p><b>Analyzing patient notes...</b></p>
                      ) : insightConditions.length ? (
                        insightConditions.map((condition, index) => (
                          <p key={`${condition.name}-${index}`}>
                            <b>{index + 1}. {condition.name}</b>
                            {typeof condition.confidence === "number" && (
                              <span>{formatConfidencePercent(condition.confidence)}</span>
                            )}
                          </p>
                        ))
                      ) : (
                        <p><b>{notes.length ? "Generate AI Insights from saved notes" : "No patient notes available"}</b></p>
                      )}
                    </div>
                    <div>
                      <h4>Recommended Tests</h4>
                      {loadingSummary ? (
                        <p>Checking tests from patient notes...</p>
                      ) : insightRecommendedTests.length ? (
                        insightRecommendedTests.map((test) => <p className="recommended-test" key={test}>{test}</p>)
                      ) : (
                        <p>No tests identified from current notes</p>
                      )}
                    </div>
                  </div>
                  <div className="assessment-risk">
                    <b>Risk Level</b>
                    <span>{insightRisk.level}</span>
                    {insightRisk.text}
                  </div>
                </section>

                <section className="assessment-card assessment-notes">
                  <h3><PenLine size={18} /> 8. Doctor Consultation Notes</h3>
                  <div className="assessment-noteGrid">
                    <label>
                      Assessment
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Enter the doctor's assessment for this patient."
                      />
                    </label>
                    <label>
                      Follow-Up Date
                      <input
                        type="date"
                        value={assessment.followUpDate}
                        onChange={(e) => updateAssessment("followUpDate", e.target.value)}
                      />
                    </label>
                    <label>
                      Diagnosis (Provisional)
                      <input
                        value={title}
                        onChange={(e) => setTitle(textOnlyValue(e.target.value))}
                        placeholder="Enter provisional diagnosis."
                      />
                    </label>
                    <label>
                      Notes
                      <textarea
                        value={prescriptionNotes}
                        onChange={(e) => setPrescriptionNotes(e.target.value)}
                        placeholder="Enter consultation notes."
                      />
                    </label>
                    <label>
                      Treatment Plan
                      <textarea
                        value={labClinicalNotes}
                        onChange={(e) => setLabClinicalNotes(e.target.value)}
                        placeholder="Enter treatment plan or lab clinical notes."
                      />
                    </label>
                  </div>
                </section>
              </div>

              <div className="assessment-actionBar">
                <button className="assessment-action primary" onClick={saveNote} disabled={saving}>
                  <Save size={18} /> {saving ? "Saving..." : "Save Assessment"}
                </button>
                <button className="assessment-action purple" onClick={generateSummary} disabled={loadingSummary}>
                  <BrainCircuit size={18} /> {loadingSummary ? "Generating..." : "Generate AI Insights"}
                </button>
                <button className="assessment-action violet" onClick={recommendMedication} disabled={loadingMedicationAdvice}>
                  <Sparkles size={18} /> {loadingMedicationAdvice ? "Checking..." : "Predict Medication"}
                </button>
                <button className="assessment-action green" onClick={openPrescriptionWithAiAnalysis} disabled={loadingMedicationAdvice}>
                  <Pill size={18} /> {loadingMedicationAdvice ? "Analyzing..." : "Send Prescription"}
                </button>
                <button className="assessment-action orange" onClick={openLabRequestWithBloodGroupCheck}>
                  <FlaskConical size={18} /> Send Lab Request
                </button>
                <button className="assessment-action blue" onClick={() => setShowPatientHistory(true)}>
                  <FolderOpen size={18} /> View Patient History
                </button>
                <button className="assessment-action teal" onClick={() => setSuccess("Follow-up scheduled from assessment.")}>
                  <CalendarCheck size={18} /> Schedule Follow-Up
                </button>
              </div>

              {aiMedicationAdvice && (
                <div className="doctor-ai-card" style={{ ...styles.aiCard, ...styles.medicationAdviceCard }}>
                  <div className="doctor-ai-header">
                    <div className="doctor-ai-robot" aria-hidden="true">
                      <div className="doctor-ai-robotHead"><span /><span /></div>
                      <div className="doctor-ai-robotBody" />
                    </div>
                    <div style={styles.aiHeaderText}>
                      <div style={styles.panelTitleSmall}>AI Medication Options</div>
                      <div className="doctor-ai-subtitle">
                        Based on saved patient notes and the current assessment
                        {aiMedicationAdvice.patient_context?.source_note_title
                          ? `: ${aiMedicationAdvice.patient_context.source_note_title}`
                          : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      style={styles.aiDismissBtn}
                      onClick={() => setAiMedicationAdvice(null)}
                    >
                      <CheckCircle2 size={16} />
                      Okay, hide this
                    </button>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Predicted Disease From Latest Note</div>
                    <ul style={styles.ul}>
                      {(aiMedicationAdvice.disease_predictions || []).length > 0 ? (
                        (aiMedicationAdvice.disease_predictions || []).slice(0, 3).map((prediction, i) => (
                          <li key={i}>
                            <strong>{prediction.disease.replace(/_/g, " ")}</strong>
                            {typeof prediction.confidence === "number"
                              ? ` - ${(prediction.confidence * 100).toFixed(0)}% match`
                              : ""}
                            {prediction.explanation ? (
                              <div style={styles.aiFineText}>
                                {presentationSafeText(
                                  prediction.explanation,
                                  `Clinical pattern supports review for ${prediction.disease.replace(/_/g, " ")}.`
                                )}
                              </div>
                            ) : null}
                          </li>
                        ))
                      ) : (
                        <li>No disease prediction could be made from the latest note.</li>
                      )}
                    </ul>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Patient Signals Used</div>
                    <ul style={styles.ul}>
                      {medicationPatientSignals.length > 0 ? (
                        medicationPatientSignals.map((item, i) => <li key={i}>{item}</li>)
                      ) : (
                        <li>No symptoms entered or detected yet</li>
                      )}
                    </ul>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Best Medication Options</div>
                    <ul style={styles.ul}>
                      {(aiMedicationAdvice.medication_options || []).length > 0 ? (
                        aiMedicationAdvice.medication_options.map((option, i) => (
                          <li key={i} style={{ marginBottom: 10 }}>
                            <strong>{option.medication}</strong>
                            {option.confidence ? ` - ${(option.confidence * 100).toFixed(0)}% clinical fit` : ""}
                            {option.matched_conditions?.length ? (
                              <div style={styles.aiFineText}>For: {option.matched_conditions.join(", ")}</div>
                            ) : null}
                            {option.rationale?.length ? (
                              <div style={styles.aiFineText}>
                                {presentationSafeText(
                                  option.rationale[0],
                                  `Positive medication match: ${option.medication} aligns with this patient's documented condition pattern.`
                                )}
                              </div>
                            ) : null}
                            {option.cautions?.length ? (
                              <div style={styles.aiWarningText}>
                                {presentationSafeText(option.cautions[0])}
                              </div>
                            ) : null}
                          </li>
                        ))
                      ) : (
                        <li>No medication option could be suggested from the available notes.</li>
                      )}
                    </ul>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Before Prescribing</div>
                    <ul style={styles.ul}>
                      {(aiMedicationAdvice.avoid_or_review || [])
                        .map((item) => presentationSafeText(item))
                        .filter(Boolean)
                        .map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                    <div style={{ ...styles.aiWarningText, marginTop: 8 }}>
                      {presentationSafeText(
                        aiMedicationAdvice.clinician_review_note,
                        "Medication choice should match the confirmed diagnosis, patient safety factors, dose, route, duration, monitoring plan, and counselling needs."
                      )}
                    </div>
                  </div>

                  {aiMedicationAdvice.data_completeness && (
                    <div style={styles.aiSection}>
                      <div style={styles.aiLabel}>Data Completeness</div>
                      <div style={styles.aiFineText}>{aiMedicationAdvice.data_completeness}</div>
                    </div>
                  )}
                </div>
              )}

              {aiSummary && (
                <div className="doctor-ai-card" style={styles.aiCard}>
                  <div className="doctor-ai-header">
                    <div className="doctor-ai-robot" aria-hidden="true">
                      <div className="doctor-ai-robotHead"><span /><span /></div>
                      <div className="doctor-ai-robotBody" />
                    </div>
                    <div style={styles.aiHeaderText}>
                      <div style={styles.panelTitleSmall}>AI Patient History Summary</div>
                      <div className="doctor-ai-subtitle">Generated from clinical notes and patient history signals</div>
                    </div>
                    <button
                      type="button"
                      style={styles.aiDismissBtn}
                      onClick={() => setAiSummary(null)}
                    >
                      <CheckCircle2 size={16} />
                      Okay, hide this
                    </button>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Overview</div>
                    <div style={styles.aiText}>{aiSummary.patient_overview || "No overview available."}</div>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Main Conditions</div>
                    <ul style={styles.ul}>
                      {(aiSummary.main_conditions || []).length > 0 ? (
                        aiSummary.main_conditions.map((item, i) => <li key={i}>{renderSummaryListItem(item)}</li>)
                      ) : (
                        <li>None identified</li>
                      )}
                    </ul>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Current or Recent Medications</div>
                    <ul style={styles.ul}>
                      {(aiSummary.current_or_recent_medications || []).length > 0 ? (
                        aiSummary.current_or_recent_medications.map((item, i) => <li key={i}>{renderSummaryListItem(item)}</li>)
                      ) : (
                        <li>None identified</li>
                      )}
                    </ul>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Repeated Symptoms</div>
                    <ul style={styles.ul}>
                      {(aiSummary.repeated_symptoms || []).length > 0 ? (
                        aiSummary.repeated_symptoms.map((item, i) => <li key={i}>{renderSummaryListItem(item)}</li>)
                      ) : (
                        <li>None identified</li>
                      )}
                    </ul>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Repeated Medications</div>
                    <ul style={styles.ul}>{renderRepeatedMedications()}</ul>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Possible Non-Response Flags</div>
                    <ul style={styles.ul}>
                      {(aiSummary.possible_non_response_flags || []).length > 0 ? (
                        aiSummary.possible_non_response_flags.map((item, i) => <li key={i}>{renderSummaryListItem(item)}</li>)
                      ) : (
                        <li>None identified</li>
                      )}
                    </ul>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Important Tests Already Done or Ordered</div>
                    <ul style={styles.ul}>
                      {(aiSummary.important_tests_already_done_or_ordered || []).length > 0 ? (
                        aiSummary.important_tests_already_done_or_ordered.map((item, i) => <li key={i}>{renderSummaryListItem(item)}</li>)
                      ) : (
                        <li>None identified</li>
                      )}
                    </ul>
                  </div>

                  <div style={styles.aiSection}>
                    <div style={styles.aiLabel}>Doctor Attention Points</div>
                    <ul style={styles.ul}>
                      {(aiSummary.doctor_attention_points || []).length > 0 ? (
                        aiSummary.doctor_attention_points.map((item, i) => <li key={i}>{renderSummaryListItem(item)}</li>)
                      ) : (
                        <li>None identified</li>
                      )}
                    </ul>
                  </div>

                  {/* Recommendations */}
                  {aiSummary.recommendations && aiSummary.recommendations.length > 0 && (
                    <div style={styles.aiSection}>
                      <div style={styles.aiLabel}>Recommendations</div>
                      <ul style={styles.ul}>
                        {aiSummary.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Red Flags */}
                  {aiSummary.red_flags && aiSummary.red_flags.length > 0 && (
                    <div style={styles.aiSection}>
                      <div style={{ ...styles.aiLabel, color: '#dc3545' }}>Red Flags</div>
                      <ul style={styles.ul}>
                        {aiSummary.red_flags.map((flag, i) => <li key={i} style={{ color: '#dc3545' }}>{flag}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Clinical Complexity */}
                  {aiSummary.clinical_complexity && (
                    <div style={styles.aiSection}>
                      <div style={styles.aiLabel}>Clinical Complexity</div>
                      <div style={{ 
                        padding: '8px 12px', 
                        borderRadius: '4px',
                        backgroundColor: aiSummary.clinical_complexity === 'high' ? '#f8d7da' : 
                                         aiSummary.clinical_complexity === 'moderate' ? '#fff3cd' : '#d4edda',
                        color: aiSummary.clinical_complexity === 'high' ? '#721c24' : 
                               aiSummary.clinical_complexity === 'moderate' ? '#856404' : '#155724',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        textTransform: 'uppercase'
                      }}>
                        {aiSummary.clinical_complexity} complexity
                      </div>
                    </div>
                  )}

                  {/* Data Completeness */}
                  {aiSummary.data_completeness && (
                    <div style={styles.aiSection}>
                      <div style={styles.aiLabel}>Data Completeness</div>
                      <div style={{ fontSize: '14px', color: '#666' }}>
                        {aiSummary.data_completeness}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                {loadingNotes ? (
                  <div style={styles.loading}>Loading notes...</div>
                ) : notes.length === 0 ? (
                  <div style={styles.loading}>No notes saved for this patient yet.</div>
                ) : (
                  <></>
                )}
              </div>
            </>
          ) : (
            <div style={styles.loading}>Choose a patient from the left side.</div>
          )}
        </div>

        {showPrescriptionForm && selectedPatient && (
          <div style={styles.overlay} onClick={() => !savingPrescription && setShowPrescriptionForm(false)}>
            <div className="animated-form-surface" style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={{ margin: 0 }}>Send Prescription to Pharmacy</h2>
                <button
                  style={styles.closeBtn}
                  onClick={() => !savingPrescription && setShowPrescriptionForm(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                  Patient: <b>{selectedPatient.fullName}</b> ({selectedPatient.id})
                </div>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                  Hospital: <b>{selectedPatient.hospitalName}</b>
                </div>
                {notes[0] ? (
                  <div style={styles.infoNotice}>
                    AI-analyzed clinical note: <b>{notes[0].title}</b>
                    <div style={{ marginTop: 4, fontWeight: 700 }}>
                      The prescription will be attached to this saved note for pharmacy review.
                    </div>
                  </div>
                ) : (
                  <div style={styles.infoNotice}>
                    No saved clinical note is linked yet. The medication will still be sent to pharmacy.
                  </div>
                )}
              </div>

              <div style={styles.form}>
                <label style={styles.label}>
                  Prescription Notes (Optional)
                  <textarea
                    style={styles.textarea}
                    value={prescriptionNotes}
                    onChange={(e) => setPrescriptionNotes(e.target.value)}
                    placeholder="Additional instructions for pharmacist..."
                    disabled={savingPrescription}
                  />
                </label>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 1000, marginBottom: 12 }}>Medications</div>

                  {aiMedicationAdviceNoteId === notes[0]?.id && aiMedicationAdvice?.medication_options?.length ? (
                    <div style={styles.suggestionPanel}>
                      <div style={styles.aiLabel}>AI Suggested Medications From This Note</div>
                      <div style={styles.suggestionGrid}>
                        {aiMedicationAdvice.medication_options
                          .filter((option) => !option.medication.toLowerCase().startsWith("no specific"))
                          .slice(0, 6)
                          .map((option, optionIndex) => (
                            <button
                              type="button"
                              key={`${option.medication}-${optionIndex}`}
                              style={styles.suggestionBtn}
                              onClick={() => applySuggestedMedication(option.medication)}
                              disabled={savingPrescription}
                            >
                              <b>{option.medication}</b>
                              {option.matched_conditions?.length ? <span>{option.matched_conditions.join(", ")}</span> : null}
                            </button>
                          ))}
                      </div>
                      <div style={styles.aiFineText}>Click a suggestion to add it, or type any medication manually below.</div>
                    </div>
                  ) : (
                    <div style={styles.loading}>No AI medication suggestions loaded. You can type medication manually below.</div>
                  )}

                  {prescriptionItems.map((item, index) => (
                    <div
                      key={index}
                      style={{ border: "1px solid #e5eaf2", borderRadius: 12, padding: 12, marginBottom: 12 }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "2fr 1fr 80px 80px",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <input
                          style={styles.input}
                          placeholder="Drug name"
                          value={item.drugName}
                          onChange={(e) => updatePrescriptionItem(index, "drugName", textOnlyValue(e.target.value))}
                          disabled={savingPrescription}
                        />
                        <input
                          style={styles.input}
                          inputMode="decimal"
                          placeholder="Dosage"
                          value={item.dosage}
                          onChange={(e) => updatePrescriptionItem(index, "dosage", numericOnlyValue(e.target.value))}
                          disabled={savingPrescription}
                        />
                        <input
                          style={styles.input}
                          placeholder="Frequency"
                          value={item.frequency}
                          onChange={(e) => updatePrescriptionItem(index, "frequency", textOnlyValue(e.target.value))}
                          disabled={savingPrescription}
                        />
                        <input
                          style={styles.input}
                          type="number"
                          placeholder="Days"
                          min="1"
                          value={item.days}
                          onChange={(e) => updatePrescriptionItem(index, "days", parseInt(e.target.value) || 1)}
                          disabled={savingPrescription}
                        />
                        <button
                          style={{ ...styles.deleteBtn, padding: "8px 12px" }}
                          onClick={() => removePrescriptionItem(index)}
                          disabled={savingPrescription}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    style={{ ...styles.secondaryBtn, marginTop: 12 }}
                    onClick={addPrescriptionItem}
                    disabled={savingPrescription}
                  >
                    + Add Medication
                  </button>
                </div>

                <div style={styles.buttonRow}>
                  <button style={styles.primaryBtn} onClick={createPrescription} disabled={savingPrescription}>
                    {savingPrescription ? "Sending..." : "Send to Pharmacy"}
                  </button>
                  <button
                    style={styles.cancelBtn}
                    onClick={() => setShowPrescriptionForm(false)}
                    disabled={savingPrescription}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showLabRequestForm && selectedPatient && (
          <div style={styles.overlay} onClick={() => !savingLabRequest && setShowLabRequestForm(false)}>
            <div className="animated-form-surface" style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={{ margin: 0 }}>Send to Laboratory</h2>
                <button
                  style={styles.closeBtn}
                  onClick={() => !savingLabRequest && setShowLabRequestForm(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                  Patient: <b>{selectedPatient.fullName}</b> ({selectedPatient.id})
                </div>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                  Hospital: <b>{selectedPatient.hospitalName}</b>
                </div>
              </div>

              <div style={styles.form}>
                <label style={styles.label}>
                  Priority
                  <select
                    style={styles.input}
                    value={labPriority}
                    onChange={(e) => setLabPriority(e.target.value as "ROUTINE" | "URGENT" | "STAT")}
                    disabled={savingLabRequest}
                  >
                    <option value="ROUTINE">Routine</option>
                    <option value="URGENT">Urgent</option>
                    <option value="STAT">Stat (Emergency)</option>
                  </select>
                </label>

                <label style={styles.label}>
                  Clinical Notes (Optional)
                  <textarea
                    style={styles.textarea}
                    value={labClinicalNotes}
                    onChange={(e) => setLabClinicalNotes(e.target.value)}
                    placeholder="Additional clinical information for laboratory..."
                    disabled={savingLabRequest}
                  />
                </label>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 1000, marginBottom: 12 }}>Requested Tests</div>

                  {labTests.map((test, index) => (
                    <div
                      key={index}
                      style={{ border: "1px solid #e5eaf2", borderRadius: 12, padding: 12, marginBottom: 12 }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div>
                          <label
                            style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}
                          >
                            Test Name
                          </label>
                          <input
                            style={styles.input}
                            value={test.testName}
                            onChange={(e) => updateLabTest(index, "testName", textOnlyValue(e.target.value))}
                            placeholder="Enter test name"
                            disabled={savingLabRequest}
                          />
                        </div>
                        <div>
                          <label
                            style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}
                          >
                            Category
                          </label>
                          <select
                            style={styles.input}
                            value={test.category}
                            onChange={(e) => updateLabTest(index, "category", e.target.value)}
                            disabled={savingLabRequest}
                          >
                            <option value="Blood">Blood</option>
                            <option value="Urine">Urine</option>
                            <option value="Imaging">Imaging</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                          Description (Optional)
                        </label>
                        <textarea
                          style={{ ...styles.textarea, minHeight: 60 }}
                          value={test.description}
                          onChange={(e) => updateLabTest(index, "description", e.target.value)}
                          placeholder="Test description or details..."
                          disabled={savingLabRequest}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                          Instructions (Optional)
                        </label>
                        <textarea
                          style={{ ...styles.textarea, minHeight: 60 }}
                          value={test.instructions}
                          onChange={(e) => updateLabTest(index, "instructions", e.target.value)}
                          placeholder="Special instructions for laboratory..."
                          disabled={savingLabRequest}
                        />
                      </div>
                      <button
                        style={{ ...styles.deleteBtn, marginTop: 8 }}
                        onClick={() => removeLabTest(index)}
                        disabled={savingLabRequest}
                      >
                        Remove Test
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12 }}>
                  <button style={styles.secondaryBtn} onClick={addLabTest} disabled={savingLabRequest}>
                    + Add Test
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                <button
                  style={styles.secondaryBtn}
                  onClick={() => setShowLabRequestForm(false)}
                  disabled={savingLabRequest}
                >
                  Cancel
                </button>
                <button style={styles.primaryBtn} onClick={sendLabRequest} disabled={savingLabRequest}>
                  {savingLabRequest ? "Sending..." : "Send to Laboratory"}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedLabResult && (
          <div style={styles.overlay} onClick={() => setSelectedLabResult(null)}>
            <div className="animated-form-surface" style={styles.historyModal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>
                  <FlaskConical size={24} />
                  Lab Results - {selectedLabResult.patientName}
                </h2>
                <button style={styles.closeBtn} onClick={() => setSelectedLabResult(null)}>
                  <X size={18} />
                </button>
              </div>

              <div style={styles.labResultSummary}>
                <div><span>Request</span><b>{selectedLabResult.id}</b></div>
                <div><span>Status</span><b>Results Released</b></div>
                <div><span>Reviewed By</span><b>{selectedLabResult.reviewedBy || "Not recorded"}</b></div>
                <div><span>Approved By</span><b>{selectedLabResult.authorizedBy || "Not recorded"}</b></div>
                <div><span>Approval Role</span><b>{labAuthorizationRoleLabel(selectedLabResult.authorizationRole)}</b></div>
                <div><span>Approved At</span><b>{(selectedLabResult.authorizedAt || selectedLabResult.releasedAt || "").replace("T", " ").slice(0, 16) || "Not recorded"}</b></div>
                <div><span>Released At</span><b>{(selectedLabResult.releasedAt || selectedLabResult.completedAt || "").replace("T", " ").slice(0, 16) || "Not recorded"}</b></div>
              </div>

              <div style={styles.labResultsTable}>
                <div style={styles.labResultsHeader}>Test</div>
                <div style={styles.labResultsHeader}>Value</div>
                <div style={styles.labResultsHeader}>Reference Range</div>
                <div style={styles.labResultsHeader}>Flag</div>
                <div style={styles.labResultsHeader}>Comments</div>
                {(selectedLabResult.results || []).map((result, index) => (
                  <React.Fragment key={`${result.testId}-${index}`}>
                    <div>{result.testName}</div>
                    <div><b>{result.value}{result.unit ? ` ${result.unit}` : ""}</b></div>
                    <div>{result.referenceRange || "-"}</div>
                    <div style={result.status === "ABNORMAL" || result.status === "CRITICAL" ? styles.labAbnormal : styles.labNormal}>
                      {result.status || "NORMAL"}
                    </div>
                    <div>{result.notes || "-"}</div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        {showPatientHistory && selectedPatient && notes.length > 0 && (
          <div style={styles.overlay} onClick={() => setShowPatientHistory(false)}>
            <div style={styles.historyModal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>
                  <BookOpen size={24} />
                  Patient History - {selectedPatient.fullName}
                </h2>
                <button style={styles.closeBtn} onClick={() => setShowPatientHistory(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={styles.historyBook}>
                <div style={styles.historyPage}>
                  <div style={styles.pageNumber}>
                    Page {currentNoteIndex + 1} of {notes.length}
                  </div>
                  <div style={styles.pageDate}>
                    {new Date(notes[currentNoteIndex].createdAtISO).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                  <div style={styles.noteContent}>
                    <div style={styles.historyNoteTitle}>{notes[currentNoteIndex].title}</div>
                    <div style={styles.historyNoteMeta}>
                      Dr. {notes[currentNoteIndex].doctorName} •{" "}
                      {notes[currentNoteIndex].createdAtISO.replace("T", " ").slice(0, 16)}
                    </div>
                    <div style={styles.historyNoteBody}>{notes[currentNoteIndex].note}</div>
                  </div>
                </div>

                <div style={styles.bookControls}>
                  <button
                    style={styles.bookNavBtn}
                    onClick={() => setCurrentNoteIndex(Math.max(0, currentNoteIndex - 1))}
                    disabled={currentNoteIndex === 0}
                  >
                    ← Previous
                  </button>
                  <div style={styles.pageIndicator}>
                    {currentNoteIndex + 1} / {notes.length}
                  </div>
                  <button
                    style={styles.bookNavBtn}
                    onClick={() => setCurrentNoteIndex(Math.min(notes.length - 1, currentNoteIndex + 1))}
                    disabled={currentNoteIndex === notes.length - 1}
                  >
                    Next →
                  </button>
                </div>
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
  },
  h1: { fontSize: 22, fontWeight: 1000, color: "#000000" },
  sub: { marginTop: 4, fontSize: 13, opacity: 0.75, fontWeight: 800 },
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
  infoNotice: {
    marginTop: 12,
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1d4ed8",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 13,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    gap: 14,
  },
  gridSelectedPatient: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 14,
  },
  panel: {
    background: "white",
    border: "1px solid #e5eaf2",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 8px 26px rgba(15,23,42,0.06)",
    minHeight: 520,
  },
  panelTitle: { fontSize: 18, fontWeight: 1000, color: "#0f172a" },
  panelTitleSmall: { fontSize: 15, fontWeight: 1000, color: "#0f172a" },
  panelSub: { marginTop: 6, opacity: 0.75, fontWeight: 700, fontSize: 13 },
  searchSection: { marginTop: 12 },
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
    marginTop: 0,
  },
  loading: {
    marginTop: 12,
    border: "1px solid #e5eaf2",
    background: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    fontWeight: 800,
  },
  list: { display: "grid", gap: 10, marginTop: 12 },
  patientBtn: {
    textAlign: "left",
    border: "1px solid #e5eaf2",
    background: "white",
    borderRadius: 12,
    padding: 12,
    cursor: "pointer",
  },
  patientBtnActive: {
    border: "1px solid #1f7ae0",
    background: "#eef5ff",
  },
  crossHospitalPatient: {
    border: "1px solid #dbeafe",
    background: "#f8fbff",
  },
  patientName: { fontWeight: 1000, color: "#0f172a" },
  hospitalBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    opacity: 0.8,
    color: "#1d4ed8",
    marginLeft: 8,
    fontWeight: 700,
  },
  crossHospitalIndicator: {
    fontSize: 10,
    opacity: 0.7,
    color: "#64748b",
    marginLeft: 8,
    fontWeight: 700,
    background: "#f1f5f9",
    padding: "2px 6px",
    borderRadius: 4,
  },
  patientMeta: { marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 },
  form: { display: "grid", gap: 12, marginTop: 12 },
  label: { display: "grid", gap: 6, fontWeight: 900, color: "#0f172a" },
  input: {
    border: "1px solid #cfd7e3",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    fontWeight: 800,
  },
  textarea: {
    minHeight: 160,
    border: "1px solid #cfd7e3",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    fontWeight: 800,
    resize: "vertical",
  },
  buttonRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  primaryBtn: {
    border: "none",
    background: "linear-gradient(135deg, #2c5aa0, #4a90e2)",
    color: "white",
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 1000,
    width: "fit-content",
  },
  secondaryBtn: {
    border: "1px solid rgba(53, 183, 165, 0.34)",
    background: "linear-gradient(135deg, #35b7a5, #4a90e2)",
    color: "white",
    borderRadius: 12,
    padding: 14,
    cursor: "pointer",
    fontWeight: 1000,
    width: "fit-content",
  },
  cancelBtn: {
    border: "1px solid rgba(74, 144, 226, 0.28)",
    background: "#eef5ff",
    color: "#2c5aa0",
    borderRadius: 12,
    padding: 14,
    cursor: "pointer",
    fontWeight: 1000,
    width: "fit-content",
  },
  medicationAdviceBtn: {
    border: "none",
    background: "linear-gradient(135deg, #287dba, #35b7a5)",
    color: "white",
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 1000,
    width: "fit-content",
  },
  aiAssistantWrap: {
    width: "min(100%, 360px)",
    display: "grid",
    gap: 8,
  },
  aiAssistantBtn: {
    width: "100%",
    minHeight: 58,
    border: "1px solid rgba(14, 116, 144, 0.2)",
    background: "linear-gradient(135deg, #2c5aa0, #287dba 55%, #35b7a5)",
    color: "white",
    borderRadius: 14,
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 1000,
    display: "flex",
    alignItems: "center",
    gap: 10,
    boxShadow: "0 16px 34px rgba(15, 118, 110, 0.2)",
  },
  aiAssistantIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.16)",
    border: "1px solid rgba(255,255,255,0.22)",
    flexShrink: 0,
  },
  aiAssistantText: {
    display: "grid",
    gap: 2,
    minWidth: 0,
    flex: "1 1 auto",
    textAlign: "left",
  },
  aiOptionsMenu: {
    width: "min(540px, calc(100vw - 48px))",
    display: "grid",
    gap: 8,
    padding: 10,
    borderRadius: 14,
    background: "rgba(255,255,255,0.98)",
    border: "1px solid #dbeafe",
    boxShadow: "0 24px 54px rgba(15, 23, 42, 0.18)",
  },
  aiOptionItem: {
    width: "100%",
    border: "1px solid #e2e8f0",
    background: "#ffffff",
    borderRadius: 12,
    padding: 11,
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr)",
    alignItems: "center",
    gap: 12,
    textAlign: "left",
    color: "#0f172a",
    minHeight: 78,
  },
  aiOptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#eff6ff",
    color: "#1d4ed8",
  },
  aiOptionIconAlt: {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ecfdf5",
    color: "#047857",
  },
  aiOptionText: {
    display: "grid",
    gap: 5,
    minWidth: 0,
    lineHeight: 1.25,
  },
  historyBtn: {
    border: "none",
    background: "linear-gradient(135deg, #256f9f, #50bfbf)",
    color: "white",
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 1000,
    width: "fit-content",
  },
  aiCard: {
    marginTop: 18,
    border: "1px solid #e5eaf2",
    borderRadius: 12,
    padding: 14,
    background: "#fbfdff",
  },
  medicationAdviceCard: {
    border: "1px solid #99f6e4",
    background: "#f0fdfa",
  },
  suggestionPanel: {
    border: "1px solid #bae6fd",
    background: "#f0f9ff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  suggestionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 8,
    marginTop: 10,
  },
  suggestionBtn: {
    border: "1px solid #7dd3fc",
    background: "white",
    color: "#0f172a",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    display: "grid",
    gap: 4,
    textAlign: "left",
  },
  aiHeaderText: {
    minWidth: 0,
    flex: "1 1 auto",
  },
  aiDismissBtn: {
    border: "1px solid rgba(15, 118, 110, 0.22)",
    background: "linear-gradient(135deg, #ecfdf5, #dff8ff)",
    color: "#2c5aa0",
    borderRadius: 999,
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 1000,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    boxShadow: "0 10px 22px rgba(15, 118, 110, 0.1)",
    flexShrink: 0,
  },
  aiSection: {
    marginTop: 12,
  },
  aiLabel: {
    fontWeight: 1000,
    color: "#0f172a",
    marginBottom: 6,
  },
  aiText: {
    fontWeight: 700,
    color: "#334155",
    lineHeight: 1.5,
  },
  aiFineText: {
    fontSize: 12,
    color: "#475569",
    marginTop: 3,
    fontWeight: 700,
    lineHeight: 1.45,
  },
  aiWarningText: {
    fontSize: 12,
    color: "#92400e",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 8,
    padding: "7px 9px",
    marginTop: 5,
    fontWeight: 800,
    lineHeight: 1.45,
  },
  ul: {
    margin: 0,
    paddingLeft: 18,
    color: "#334155",
    fontWeight: 700,
    lineHeight: 1.5,
  },
  notesList: { display: "grid", gap: 10, marginTop: 12 },
  noteCard: {
    border: "1px solid #e5eaf2",
    borderRadius: 12,
    padding: 12,
    background: "#fbfdff",
  },
  noteTitle: { fontWeight: 1000, color: "#0f172a" },
  noteMeta: { marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 },
  noteBody: { marginTop: 10, whiteSpace: "pre-wrap", fontWeight: 700, lineHeight: 1.5 },
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
    maxWidth: 800,
    maxHeight: "90vh",
    background: "white",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    overflowY: "auto",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    margin: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
  },
  closeBtn: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    cursor: "pointer",
    padding: 8,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#0f172a",
  },
  deleteBtn: {
    border: "1px solid rgba(74, 144, 226, 0.22)",
    background: "#eef5ff",
    color: "#2c5aa0",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 800,
    width: "fit-content",
  },
  historyModal: {
    width: "100%",
    maxWidth: 900,
    maxHeight: "90vh",
    background: "white",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    overflowY: "auto",
  },
  historyBook: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  historyPage: {
    background: "#fefefe",
    border: "2px solid #ddd",
    borderRadius: 8,
    padding: 24,
    minHeight: 400,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    position: "relative",
  },
  pageNumber: {
    position: "absolute",
    top: 12,
    right: 16,
    fontSize: 11,
    fontWeight: 600,
    color: "#666",
    background: "#f0f0f0",
    padding: "4px 8px",
    borderRadius: 4,
  },
  pageDate: {
    fontSize: 14,
    fontWeight: 1000,
    color: "#374151",
    marginBottom: 16,
    textAlign: "center",
  },
  noteContent: {
    fontSize: 15,
    lineHeight: 1.6,
    color: "#1f2937",
  },
  historyNoteTitle: {
    fontSize: 18,
    fontWeight: 1000,
    color: "#111827",
    marginBottom: 12,
  },
  historyNoteMeta: {
    fontSize: 12,
    color: "#5d7088",
    marginBottom: 16,
  },
  historyNoteBody: {
    fontSize: 15,
    lineHeight: 1.7,
    color: "#374151",
    whiteSpace: "pre-wrap",
  },
  bookControls: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    marginTop: 20,
  },
  bookNavBtn: {
    border: "1px solid #d1d5db",
    background: "linear-gradient(135deg, #256f9f, #50bfbf)",
    color: "white",
    borderRadius: 8,
    padding: "10px 16px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
  },
  pageIndicator: {
    fontSize: 14,
    fontWeight: 1000,
    color: "#374151",
    background: "#f3f4f6",
    padding: "8px 16px",
    borderRadius: 6,
  },
  labResultNotice: {
    marginTop: 14,
    marginBottom: 14,
    border: "1px solid #b7e4cc",
    background: "#f0fdf4",
    borderRadius: 8,
    padding: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  labResultNoticeTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 1000,
    color: "#14532d",
  },
  labResultNoticeSub: {
    marginTop: 5,
    color: "#166534",
    fontSize: 13,
    fontWeight: 700,
  },
  labResultSummary: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
    margin: "14px 0",
  },
  labResultsTable: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.9fr 1fr 0.8fr 1.4fr",
    gap: 1,
    background: "#e5e7eb",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    overflow: "hidden",
  },
  labResultsHeader: {
    background: "#f8fafc",
    color: "#334155",
    fontSize: 12,
    fontWeight: 1000,
    padding: 10,
    textTransform: "uppercase",
  },
  labAbnormal: {
    color: "#b91c1c",
    fontWeight: 1000,
  },
  labNormal: {
    color: "#166534",
    fontWeight: 1000,
  },
};

export default DoctorDashboard;
