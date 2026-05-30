import React, { useState, useEffect } from "react";
import './LabDashboard.css';
import {
  loadPendingLabRequests,
  findLabRequestByPatientId,
  updateLabRequestStatus,
  addLabResults,
  type LabRequest,
  type LabResult,
  type LabTest,
} from "../hospitalAdmin/hospitalAdminFirestore";
import { Search, TestTube, CheckCircle } from "lucide-react";

type Props = {
  staffId: string;
  hospitalId: string;
};

export default function LabDashboard({ staffId, hospitalId }: Props) {
  const [tab, setTab] = useState<"pending" | "search" | "results">("pending");
  const [patientIdSearch, setPatientIdSearch] = useState("");
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<LabRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Test results form state
  const [testResults, setTestResults] = useState<LabResult[]>([]);

  const ui: Record<string, React.CSSProperties> = {
    page: { padding: 18 },
    header: {
      background: "white",
      border: "1px solid #e5eaf2",
      borderRadius: 14,
      padding: 16,
      boxShadow: "0 8px 26px rgba(15,23,42,0.06)",
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
      marginTop: 14,
    },
    sectionTitle: { fontSize: 18, fontWeight: 1000, color: "#000000" },
    sectionSub: { marginTop: 6, opacity: 0.75, fontWeight: 800, fontSize: 13 },

    search: {
      display: "flex",
      gap: 12,
      alignItems: "center",
      marginBottom: 16,
    },
    searchInput: {
      flex: 1,
      border: "1px solid #cfd7e3",
      borderRadius: 12,
      padding: "10px 14px",
      fontSize: 14,
      outline: "none",
    },

    requestCard: {
      border: "1px solid #e5eaf2",
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      cursor: "pointer",
      transition: "all 0.2s",
    },
    requestCardSelected: {
      border: "1px solid #3b82f6",
      background: "#eef5ff",
    },

    priorityBadge: {
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
    },
    priorityRoutine: {
      background: "#f0fdf4",
      border: "1px solid #bbf7d0",
      color: "#16a34a",
    },
    priorityUrgent: {
      background: "#fef3c7",
      border: "1px solid #fde047",
      color: "#d97706",
    },
    priorityStat: {
      background: "#fef2f2",
      border: "1px solid #fecaca",
      color: "#dc2626",
    },

    statusBadge: {
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
    },
    statusPending: {
      background: "#fef3c7",
      border: "1px solid #fde047",
      color: "#d97706",
    },
    statusInProgress: {
      background: "#dbeafe",
      border: "1px solid #93c5fd",
      color: "#1d4ed8",
    },

    form: {
      display: "grid",
      gap: 12,
    },
    input: {
      border: "1px solid #cfd7e3",
      borderRadius: 12,
      padding: "10px 14px",
      fontSize: 14,
      outline: "none",
    },
    textarea: {
      border: "1px solid #cfd7e3",
      borderRadius: 12,
      padding: "10px 14px",
      fontSize: 14,
      outline: "none",
      minHeight: 80,
      resize: "vertical",
    },
    select: {
      border: "1px solid #cfd7e3",
      borderRadius: 12,
      padding: "10px 14px",
      fontSize: 14,
      outline: "none",
      background: "white",
    },

    btn: {
      border: "1px solid #cfd7e3",
      background: "white",
      borderRadius: 12,
      padding: "10px 16px",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 14,
    },
    btnPrimary: {
      border: "1px solid #3b82f6",
      background: "#3b82f6",
      color: "white",
      borderRadius: 12,
      padding: "10px 16px",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 14,
    },
    btnGreen: {
      border: "1px solid #10b981",
      background: "#10b981",
      color: "white",
      borderRadius: 12,
      padding: "10px 16px",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 14,
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
  };

  // Load pending lab requests on component mount
  useEffect(() => {
    loadLabRequests();
  }, [hospitalId]);

  const loadLabRequests = async () => {
    setLoading(true);
    setError("");
    try {
      const requestsData = await loadPendingLabRequests(hospitalId);
      setRequests(requestsData);
    } catch (e: any) {
      setError(e?.message || "Failed to load lab requests");
    } finally {
      setLoading(false);
    }
  };

  const searchPatientRequest = async () => {
    if (!patientIdSearch.trim()) {
      setSelectedRequest(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const request = await findLabRequestByPatientId(patientIdSearch.trim());
      setSelectedRequest(request);
    } catch (e: any) {
      setError(e?.message || "Failed to find lab request");
      setSelectedRequest(null);
    } finally {
      setLoading(false);
    }
  };

  const startProcessing = async (requestId: string) => {
    try {
      await updateLabRequestStatus(requestId, "IN_PROGRESS", staffId, `Lab Technician ${staffId}`);
      await loadLabRequests(); // Refresh the list
      setSuccess("Request marked as in progress");
    } catch (e: any) {
      setError(e?.message || "Failed to update request status");
    }
  };

  const submitResults = async () => {
    if (!selectedRequest || testResults.length === 0) {
      setError("Please enter test results");
      return;
    }

    // Validate all results have values
    const invalidResults = testResults.filter(r => !r.value.trim());
    if (invalidResults.length > 0) {
      setError("Please enter values for all test results");
      return;
    }

    try {
      await addLabResults(
        selectedRequest.id,
        testResults.map(r => ({
          ...r,
          completedAt: new Date().toISOString(),
        })),
        staffId,
        `Lab Technician ${staffId}`
      );

      setSuccess("Test results submitted successfully and sent to doctor");
      setSelectedRequest(null);
      setTestResults([]);
      await loadLabRequests(); // Refresh the list
    } catch (e: any) {
      setError(e?.message || "Failed to submit test results");
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "STAT": return ui.priorityStat;
      case "URGENT": return ui.priorityUrgent;
      default: return ui.priorityRoutine;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "IN_PROGRESS": return ui.statusInProgress;
      default: return ui.statusPending;
    }
  };

  const initializeTestResults = (tests: LabTest[]) => {
    setTestResults(tests.map(test => ({
      testId: test.id,
      testName: test.testName,
      value: "",
      unit: "",
      referenceRange: "",
      status: "NORMAL" as const,
      notes: "",
      completedAt: "",
    })));
  };

  // When a request is selected, initialize test results
  useEffect(() => {
    if (selectedRequest && selectedRequest.status === "IN_PROGRESS") {
      initializeTestResults(selectedRequest.tests);
    }
  }, [selectedRequest]);

  const header = (
    <div style={ui.header}>
      <div>
        <div style={ui.h1}>Laboratory Dashboard</div>
        <div style={ui.sub}>
          Lab Technician ID: <b>{staffId}</b> • Hospital: <b>{hospitalId}</b>
        </div>
      </div>

      <div style={ui.tabs}>
        <button
          style={tab === "pending" ? ui.tabActive : ui.tab}
          onClick={() => setTab("pending")}
        >
          <TestTube size={16} style={{ display: "inline", marginRight: 4 }} />
          Pending Requests
        </button>
        <button
          style={tab === "search" ? ui.tabActive : ui.tab}
          onClick={() => setTab("search")}
        >
          <Search size={16} style={{ display: "inline", marginRight: 4 }} />
          Search Patient
        </button>
        <button
          style={tab === "results" ? ui.tabActive : ui.tab}
          onClick={() => setTab("results")}
        >
          <CheckCircle size={16} style={{ display: "inline", marginRight: 4 }} />
          Enter Results
        </button>
      </div>
    </div>
  );

  const pendingContent = (
    <div style={ui.section}>
      <div style={ui.sectionTitle}>Pending Lab Requests</div>
      <div style={ui.sectionSub}>Patients waiting for laboratory tests</div>

      {loading ? (
        <div style={ui.loading}>Loading lab requests...</div>
      ) : requests.length === 0 ? (
        <div style={ui.loading}>No pending lab requests</div>
      ) : (
        <div>
          {requests.map((request) => (
            <div
              key={request.id}
              style={{
                ...ui.requestCard,
                ...(selectedRequest?.id === request.id ? ui.requestCardSelected : {}),
              }}
              onClick={() => setSelectedRequest(request)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 16, marginBottom: 4 }}>
                    {request.patientName}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 2 }}>
                    Patient ID: {request.patientId} • Doctor: {request.doctorName}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 2 }}>
                    Requested: {request.requestDate} at {request.requestTimeISO.slice(11, 16)}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Tests: {request.tests.map(t => t.testName).join(", ")}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                  <span style={{ ...ui.priorityBadge, ...getPriorityColor(request.priority) }}>
                    {request.priority}
                  </span>
                  <span style={{ ...ui.statusBadge, ...getStatusColor(request.status) }}>
                    {request.status.replace("_", " ")}
                  </span>
                  {request.status === "PENDING" && (
                    <button
                      style={ui.btnPrimary}
                      onClick={(e) => {
                        e.stopPropagation();
                        startProcessing(request.id);
                      }}
                    >
                      Start Processing
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const searchContent = (
    <div style={ui.section}>
      <div style={ui.sectionTitle}>Search Patient Request</div>
      <div style={ui.sectionSub}>Enter Patient ID to find their lab request</div>

      <div style={ui.search}>
        <input
          style={ui.searchInput}
          value={patientIdSearch}
          onChange={(e) => setPatientIdSearch(e.target.value)}
          placeholder="Enter Patient ID..."
        />
        <button style={ui.btnPrimary} onClick={searchPatientRequest}>
          Search
        </button>
      </div>

      {loading && <div style={ui.loading}>Searching...</div>}

      {selectedRequest && (
        <div style={{ ...ui.section, marginTop: 16 }}>
          <div style={ui.sectionTitle}>Lab Request Details</div>
          <div style={ui.sectionSub}>
            {selectedRequest.patientName} ({selectedRequest.patientId})
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontWeight: 1000, marginBottom: 8 }}>Request Information</div>
              <div style={{ marginBottom: 4 }}>
                <b>Request ID:</b> {selectedRequest.id}
              </div>
              <div style={{ marginBottom: 4 }}>
                <b>Doctor:</b> {selectedRequest.doctorName}
              </div>
              <div style={{ marginBottom: 4 }}>
                <b>Requested:</b> {selectedRequest.requestDate} at {selectedRequest.requestTimeISO.slice(11, 16)}
              </div>
              <div style={{ marginBottom: 4 }}>
                <b>Priority:</b> 
                <span style={{ ...ui.priorityBadge, ...getPriorityColor(selectedRequest.priority), marginLeft: 4 }}>
                  {selectedRequest.priority}
                </span>
              </div>
              {selectedRequest.clinicalNotes && (
                <div style={{ marginBottom: 4 }}>
                  <b>Clinical Notes:</b> {selectedRequest.clinicalNotes}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontWeight: 1000, marginBottom: 8 }}>Requested Tests</div>
              {selectedRequest.tests.map((test, index) => (
                <div key={index} style={{ marginBottom: 4, padding: 8, border: "1px solid #e5eaf2", borderRadius: 8 }}>
                  <div style={{ fontWeight: 900 }}>
                    {test.testName}
                  </div>
                  {test.category && (
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                      Category: {test.category}
                    </div>
                  )}
                  {test.description && (
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                      {test.description}
                    </div>
                  )}
                  {test.instructions && (
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                      <b>Instructions:</b> {test.instructions}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {selectedRequest.status === "PENDING" && (
            <div style={{ marginTop: 12 }}>
              <button
                style={ui.btnPrimary}
                onClick={() => startProcessing(selectedRequest.id)}
              >
                Start Processing
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const resultsContent = (
    <div style={ui.section}>
      <div style={ui.sectionTitle}>Enter Test Results</div>
      <div style={ui.sectionSub}>Record test results for processing request</div>

      {selectedRequest ? (
        <div>
          <div style={{ marginBottom: 16, padding: 12, border: "1px solid #e5eaf2", borderRadius: 8 }}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>
              {selectedRequest.patientName} ({selectedRequest.patientId})
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Request ID: {selectedRequest.id} • Doctor: {selectedRequest.doctorName}
            </div>
          </div>

          <div style={ui.form}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>Test Results</div>
            {testResults.map((result, index) => (
              <div key={index} style={{ padding: 12, border: "1px solid #e5eaf2", borderRadius: 8 }}>
                <div style={{ fontWeight: 900, marginBottom: 4 }}>
                  {result.testName}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Result Value</label>
                    <input
                      style={ui.input}
                      value={result.value}
                      onChange={(e) => {
                        const newResults = [...testResults];
                        newResults[index].value = e.target.value;
                        setTestResults(newResults);
                      }}
                      placeholder="Enter test result"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Unit</label>
                    <input
                      style={ui.input}
                      value={result.unit}
                      onChange={(e) => {
                        const newResults = [...testResults];
                        newResults[index].unit = e.target.value;
                        setTestResults(newResults);
                      }}
                      placeholder="e.g., mg/dL"
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Reference Range</label>
                    <input
                      style={ui.input}
                      value={result.referenceRange}
                      onChange={(e) => {
                        const newResults = [...testResults];
                        newResults[index].referenceRange = e.target.value;
                        setTestResults(newResults);
                      }}
                      placeholder="e.g., 70-100"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Status</label>
                    <select
                      style={ui.select}
                      value={result.status}
                      onChange={(e) => {
                        const newResults = [...testResults];
                        newResults[index].status = e.target.value as "NORMAL" | "ABNORMAL" | "CRITICAL";
                        setTestResults(newResults);
                      }}
                    >
                      <option value="NORMAL">Normal</option>
                      <option value="ABNORMAL">Abnormal</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Notes</label>
                  <textarea
                    style={ui.textarea}
                    value={result.notes}
                    onChange={(e) => {
                      const newResults = [...testResults];
                      newResults[index].notes = e.target.value;
                      setTestResults(newResults);
                    }}
                    placeholder="Additional notes about this test result"
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button
              style={ui.btn}
              onClick={() => {
                setSelectedRequest(null);
                setTestResults([]);
              }}
            >
              Cancel
            </button>
            <button
              style={ui.btnGreen}
              onClick={submitResults}
            >
              Submit Results
            </button>
          </div>
        </div>
      ) : (
        <div style={ui.loading}>
          Please select a lab request from the Pending Requests or Search Patient tabs
        </div>
      )}
    </div>
  );

return (
  <div className="lab-dashboard" style={ui.page}>
    {error && <div style={ui.error}>{error}</div>}
    {success && <div style={ui.success}>{success}</div>}

    {header}

    {tab === "pending" && pendingContent}
    {tab === "search" && searchContent}
    {tab === "results" && resultsContent}
  </div>
);
}
