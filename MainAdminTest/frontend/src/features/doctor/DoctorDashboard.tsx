import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronDown,
  FileText,
  FlaskConical,
  Pill,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import "./DoctorDashboard.css";
import {
  addPatientNoteFirestore,
  createPrescriptionFirestore,
  loadPatientNotes,
  loadAllPatients,
  loadPatientsByHospital,
  searchPatientsAcrossHospitals,
  createLabRequest,
  type PatientNoteRow,
  type PatientRow,
  type PrescriptionItem,
  type LabTest,
} from "../hospitalAdmin/hospitalAdminFirestore";

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

const DoctorDashboard: React.FC<Props> = ({ doctorId, hospitalId }) => {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [showingAllPatientsFallback, setShowingAllPatientsFallback] = useState(false);

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
  const [showAiOptions, setShowAiOptions] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showPrescriptionForm, setShowPrescriptionForm] = useState(false);
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([]);
  const [prescriptionNotes, setPrescriptionNotes] = useState("");
  const [savingPrescription, setSavingPrescription] = useState(false);

  const [showLabRequestForm, setShowLabRequestForm] = useState(false);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [labPriority, setLabPriority] = useState<"ROUTINE" | "URGENT" | "STAT">("ROUTINE");
  const [labClinicalNotes, setLabClinicalNotes] = useState("");
  const [savingLabRequest, setSavingLabRequest] = useState(false);

  const [showPatientHistory, setShowPatientHistory] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);

  useEffect(() => {
    const run = async () => {
      setLoadingPatients(true);
      setError("");

      try {
        setShowingAllPatientsFallback(false);

        if (!hospitalId) {
          setError("Doctor hospital ID is missing.");
          setPatients([]);
          return;
        }

        try {
          const rows = await loadPatientsByHospital(hospitalId);
          setPatients(rows);

          if (rows.length === 0) {
            const allRegisteredPatients = await loadAllPatients();
            setPatients(allRegisteredPatients);

            if (allRegisteredPatients.length === 0) {
              setError("No registered patients found. Please register patients first.");
              return;
            }

            setShowingAllPatientsFallback(true);
            setError(
              "No patients are assigned to this doctor's hospital yet. Showing all registered patients so you can continue."
            );
          }
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
      if (!selectedPatient) {
        setNotes([]);
        setAiSummary(null);
        setAiMedicationAdvice(null);
        setAiMedicationAdviceNoteId("");
        setShowAiOptions(false);
        return;
      }

      setLoadingNotes(true);
      setError("");
      setSuccess("");

      try {
        const rows = await loadPatientNotes(selectedPatient.id);
        setNotes(rows);
        setAiSummary(null);
        setAiMedicationAdvice(null);
        setAiMedicationAdviceNoteId("");
        setShowAiOptions(false);
      } catch (e: any) {
        console.error("LOAD PATIENT NOTES ERROR:", e);
        setError(e?.message || "Failed to load notes.");
      } finally {
        setLoadingNotes(false);
      }
    };

    run();
  }, [selectedPatient]);

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;

    return patients.filter((p) => {
      return p.id.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q);
    });
  }, [patients, search]);

  const doctorName = useMemo(() => `Doctor ${doctorId}`, [doctorId]);

  const saveNote = async () => {
    if (!selectedPatient) {
      setError("Please select a patient first.");
      return;
    }

    setError("");
    setSuccess("");

    if (!title.trim()) {
      setError("Note title is required.");
      return;
    }

    if (!note.trim()) {
      setError("Note body is required.");
      return;
    }

    setSaving(true);

    try {
      const savedNote = await addPatientNoteFirestore({
        patientId: selectedPatient.id,
        hospitalId,
        doctorId,
        doctorName,
        title,
        note,
      });

      const rows = await loadPatientNotes(selectedPatient.id);
      setNotes(rows);
      setTitle("");
      setNote("");
      setAiSummary(null);
      setAiMedicationAdvice(null);
      setAiMedicationAdviceNoteId("");
      setSuccess(`Patient note saved successfully. Prescriptions will link to "${savedNote.title}".`);
    } catch (e: any) {
      console.error("SAVE PATIENT NOTE ERROR:", e);
      setError(e?.message || "Failed to save note.");
    } finally {
      setSaving(false);
    }
  };

  const buildLatestSavedPatientNoteForMedicationAI = () => {
    const latestNote = notes[0];

    if (!latestNote) {
      throw new Error("Save a patient note first. Medication options are based only on the latest saved note.");
    }

    const linkedMedications = latestNote.linkedPrescriptions?.length
      ? `Linked prescriptions sent to pharmacy:\n${latestNote.linkedPrescriptions
          .map((rx) => `- ${rx.prescriptionId}: ${rx.medicationSummary}`)
          .join("\n")}`
      : "";

    return {
      latestNote,
      notesData: [
        [
          `Title: ${latestNote.title}`,
          `Doctor: ${latestNote.doctorName}`,
          `Date: ${latestNote.createdAtISO}`,
          `Note: ${latestNote.note}`,
          linkedMedications,
        ]
          .filter(Boolean)
          .join("\n"),
      ],
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
      const response = await fetch("http://127.0.0.1:8001/ai/medication-recommendation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          notes: notesData,
          question: `Analyze the latest saved note "${latestNote.title}" and suggest medication options that fit the patient's documented condition and symptoms.`,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as AiMedicationAdvice;
      setAiMedicationAdvice(data);
      setAiMedicationAdviceNoteId(latestNote.id);
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
    setShowAiOptions(false);
    setError("");
    setSuccess("");

    try {
      console.log("=== AI SUMMARY GENERATION START ===");
      console.log("Patient:", selectedPatient.id);
      console.log("Available notes:", notes.length);
      
      // Prepare notes data
      let notesData = [];
      
      if (notes.length > 0) {
        // Use real notes from database
        notesData = notes.map((n) => {
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
          ].join("\n");
        });
        console.log("Using real database notes:", notesData.length);
      } else {
        throw new Error("Save at least one patient note before generating an AI summary.");
      }
      
      const requestBody = {
        patient_id: selectedPatient.id,
        notes: notesData,
      };
      
      console.log("Sending request to backend...");
      
      // Try backend API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch("http://127.0.0.1:8001/ai/patient-summary", {
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

      if (e?.message?.includes("Save at least one patient note")) {
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
    setShowAiOptions(false);
    setError("");
    setSuccess("");

    try {
      const { latestNote } = await requestMedicationAdviceForLatestNote();
      setSuccess(`AI medication options generated from latest saved note: "${latestNote.title}".`);
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

    const response = await fetch("http://127.0.0.1:8001/ai/doctor-decision-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: selectedPatient.id,
        doctor_id: doctorId,
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
      if (!linkedNote) {
        throw new Error("Save a clinical note before prescribing so AI can analyze and link the medication decision.");
      }

      if (!aiMedicationAdvice || aiMedicationAdviceNoteId !== linkedNote.id) {
        await requestMedicationAdviceForLatestNote();
      }

      const prescriptionId = await createPrescriptionFirestore({
        patientId: selectedPatient.id,
        patientName: selectedPatient.fullName,
        doctorId,
        doctorName,
        hospitalId,
        hospitalName: `Hospital ${hospitalId}`,
        items: validItems,
        notes: prescriptionNotes,
        linkedNoteId: linkedNote?.id,
        linkedNoteTitle: linkedNote?.title,
        linkedNoteText: linkedNote?.note,
        linkedNoteCreatedAtISO: linkedNote?.createdAtISO,
      });

      try {
        await sendDoctorDecisionFeedback(prescriptionId, linkedNote, validItems);
      } catch (feedbackError) {
        console.warn("AI doctor decision feedback was not saved:", feedbackError);
      }

      const refreshedNotes = await loadPatientNotes(selectedPatient.id);
      setNotes(refreshedNotes);
      setPrescriptionItems([]);
      setPrescriptionNotes("");
      setShowPrescriptionForm(false);
      setAiSummary(null);

      setSuccess(`Prescription sent to pharmacy and linked to analyzed note "${linkedNote.title}".`);
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

      <div style={styles.grid}>
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Patients</div>
          <div style={styles.panelSub}>
            {showingAllPatientsFallback
              ? "No hospital-specific patients were found, so all registered patients are shown."
              : "Search patients from your hospital or all hospitals."}
          </div>
          {showingAllPatientsFallback && !showCrossHospitalSearch ? (
            <div style={styles.infoNotice}>
              Showing all registered patients. Select one to continue the consultation.
            </div>
          ) : null}

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
                  {showingAllPatientsFallback
                    ? "No registered patients match this search."
                    : "No patients found for this hospital."}
                </div>
              ) : (
                <div style={styles.list}>
                  {filteredPatients.map((p) => (
                    <button
                      key={p.id}
                      style={{
                        ...styles.patientBtn,
                        ...(selectedPatient?.id === p.id ? styles.patientBtnActive : {}),
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
                        ...(selectedPatient?.id === p.id ? styles.patientBtnActive : {}),
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

        <div style={styles.panel}>
          <div className="consultation-head">
            <div>
              <div style={styles.panelTitle}>Consultation Notes</div>
              <div style={styles.panelSub}>
                {selectedPatient ? `Write and review notes for ${selectedPatient.fullName}` : "Select a patient first."}
              </div>
            </div>
            {selectedPatient ? (
              <div className="consultation-count">
                <span>{notes.length}</span>
                <small>saved doctor note{notes.length === 1 ? "" : "s"}</small>
              </div>
            ) : null}
          </div>

          {selectedPatient && (
            <div className="consultation-actions" aria-label="Consultation actions">
              <button
                className="consultation-action consultation-action-prescription"
                onClick={openPrescriptionWithAiAnalysis}
                disabled={loadingMedicationAdvice}
              >
                <span className="consultation-action-icon"><Send size={20} strokeWidth={2.4} /></span>
                <span>{loadingMedicationAdvice ? "Analyzing Note" : "Send Prescription"}</span>
                <small>{loadingMedicationAdvice ? "AI review" : "Pharmacy"}</small>
              </button>
              <button className="consultation-action consultation-action-lab" onClick={() => setShowLabRequestForm(true)}>
                <span className="consultation-action-icon"><FlaskConical size={20} strokeWidth={2.4} /></span>
                <span>Send Lab Request</span>
                <small>Laboratory</small>
              </button>
              <button className="consultation-action consultation-action-history" onClick={() => setShowPatientHistory(true)}>
                <span className="consultation-action-icon"><BookOpen size={20} strokeWidth={2.4} /></span>
                <span>View History</span>
                <small>Patient record</small>
              </button>
            </div>
          )}

          {selectedPatient ? (
            <>
              <div style={styles.form}>
                <label style={styles.label}>
                  Note Title
                  <input
                    style={styles.input}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Consultation Summary"
                    disabled={saving}
                  />
                </label>

                <label style={styles.label}>
                  Note
                  <textarea
                    style={styles.textarea}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Write symptoms, findings, diagnosis, treatment plan..."
                    disabled={saving}
                  />
                </label>

                <div style={styles.buttonRow}>
                  <button style={styles.primaryBtn} onClick={saveNote} disabled={saving}>
                    {saving ? "Saving..." : "Save Note"}
                  </button>

                  <div style={styles.aiAssistantWrap}>
                    <button
                      type="button"
                      style={styles.aiAssistantBtn}
                      onClick={() => setShowAiOptions((value) => !value)}
                      disabled={loadingSummary || loadingMedicationAdvice}
                    >
                      <span style={styles.aiAssistantIcon}>
                        <BrainCircuit size={20} />
                      </span>
                      <span style={styles.aiAssistantText}>
                        <strong>
                          {loadingSummary
                            ? "Preparing summary..."
                            : loadingMedicationAdvice
                              ? "Checking prediction..."
                              : "AI Assistant"}
                        </strong>
                        <small>Choose clinical insight</small>
                      </span>
                      <Sparkles size={16} />
                      <ChevronDown size={18} />
                    </button>

                    {showAiOptions ? (
                      <div style={styles.aiOptionsMenu}>
                        <button type="button" style={styles.aiOptionItem} onClick={generateSummary}>
                          <span style={styles.aiOptionIcon}>
                            <FileText size={18} />
                          </span>
                          <span style={styles.aiOptionText}>
                            <strong>Patient History Summary</strong>
                            <small>Summarize saved clinical notes and patient history.</small>
                          </span>
                        </button>

                        <button type="button" style={styles.aiOptionItem} onClick={recommendMedication}>
                          <span style={styles.aiOptionIconAlt}>
                            <Pill size={18} />
                          </span>
                          <span style={styles.aiOptionText}>
                            <strong>Disease & Medication Prediction</strong>
                            <small>Use the latest saved note to predict disease and suggest medication.</small>
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
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
                        Based only on the latest saved note
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
                              <div style={styles.aiFineText}>{prediction.explanation}</div>
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
                      {(aiMedicationAdvice.patient_context?.symptoms || []).length > 0 ? (
                        aiMedicationAdvice.patient_context.symptoms?.map((item, i) => <li key={i}>{item}</li>)
                      ) : (
                        <li>No symptoms detected from notes</li>
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
                              <div style={styles.aiFineText}>{option.rationale[0]}</div>
                            ) : null}
                            {option.cautions?.length ? (
                              <div style={styles.aiWarningText}>{option.cautions[0]}</div>
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
                      {(aiMedicationAdvice.avoid_or_review || []).map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                    <div style={{ ...styles.aiWarningText, marginTop: 8 }}>
                      {aiMedicationAdvice.clinician_review_note}
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
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
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
                  <div style={styles.error}>
                    Save a clinical note before prescribing so the medication can be linked to the symptoms/assessment.
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
                    <div style={styles.loading}>Analyzing the latest saved note before medication selection...</div>
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
                          onChange={(e) => updatePrescriptionItem(index, "drugName", e.target.value)}
                          disabled={savingPrescription}
                        />
                        <input
                          style={styles.input}
                          placeholder="Dosage"
                          value={item.dosage}
                          onChange={(e) => updatePrescriptionItem(index, "dosage", e.target.value)}
                          disabled={savingPrescription}
                        />
                        <input
                          style={styles.input}
                          placeholder="Frequency"
                          value={item.frequency}
                          onChange={(e) => updatePrescriptionItem(index, "frequency", e.target.value)}
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
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
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
                            onChange={(e) => updateLabTest(index, "testName", e.target.value)}
                            placeholder="e.g., Complete Blood Count"
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
};

export default DoctorDashboard;
