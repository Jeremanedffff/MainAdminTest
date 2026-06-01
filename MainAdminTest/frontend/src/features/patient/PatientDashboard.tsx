import React, { useEffect, useState } from "react";
import './PatientDashboard.css';
import { AlertTriangle, BookOpen, ClipboardList, Wallet, BadgePlus, Building2, HeartPulse, FlaskConical } from "lucide-react";
import mpesaLogo from "../../assets/images/mpesa.png";
import ecocashLogo from "../../assets/images/ecocash.png";
import { getPatientProfile } from "../auth/authFirestoreDb";
import {
  loadPatientNotes,
  loadReleasedLabResultsByPatient,
  loadPrescriptionsByPatient,
  updatePrescriptionPaymentStatus,
  updatePrescriptionStatus,
  getPatientAccount,
  createPatientAccount,
  updatePatientBalance,
  getPatientBillsByPatient,
  payBillWithAccountBalanceByPatient,
  payBillByPatient,
  createDepositTransaction,
  updateDepositTransactionStatus,
  getPatientDepositHistory,
  testMpesaPayment,
  testEcocashPayment,
  type PatientNoteRow,
  type Prescription,
  type PatientAccount,
  type DepositTransaction,
  type ConsultationBill,
  type LabRequest,
} from "../hospitalAdmin/hospitalAdminFirestore";

type Props = {
  patientId: string;
};

type PatientProfile = {
  patientId: string;
  userId: string;
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
  registeredBy: "SELF" | "ADMIN" | "RECEPTIONIST";
  createdAtISO: string;
};

function PaymentMethodContent({
  label,
  logoSrc,
}: {
  label: string;
  logoSrc?: string;
}) {
  return (
    <span style={styles.paymentMethodContent}>
      {logoSrc ? <img src={logoSrc} alt={`${label} logo`} style={styles.paymentMethodLogo} /> : null}
      <span>{label}</span>
    </span>
  );
}

function IconLabel({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span style={styles.iconLabel}>
      <span style={styles.iconGlyph}>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

const PatientDashboard: React.FC<Props> = ({ patientId }) => {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [notes, setNotes] = useState<PatientNoteRow[]>([]);
  const [releasedLabResults, setReleasedLabResults] = useState<LabRequest[]>([]);
  const [selectedLabReport, setSelectedLabReport] = useState<LabRequest | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [account, setAccount] = useState<PatientAccount | null>(null);
  const [depositHistory, setDepositHistory] = useState<DepositTransaction[]>([]);
  const [serviceBills, setServiceBills] = useState<ConsultationBill[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(true);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [loadingBills, setLoadingBills] = useState(true);
  const [selectedServiceBill, setSelectedServiceBill] = useState<ConsultationBill | null>(null);
  const [showServicePaymentModal, setShowServicePaymentModal] = useState(false);
  const [servicePayMethod, setServicePayMethod] = useState<"ACCOUNT_BALANCE" | "MPESA" | "ECOCASH">("ACCOUNT_BALANCE");
  const [servicePayPhone, setServicePayPhone] = useState("");
  const [processingServicePayment, setProcessingServicePayment] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Patient history viewer states
  const [showPatientHistory, setShowPatientHistory] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);

  // Deposit modal states
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<"MPESA" | "ECOCASH">("MPESA");
  const [depositPhone, setDepositPhone] = useState("");
  const [processingDeposit, setProcessingDeposit] = useState(false);
  const [showPayPrescriptionModal, setShowPayPrescriptionModal] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"ACCOUNT_BALANCE" | "MPESA" | "ECOCASH">("ACCOUNT_BALANCE");
  const [payPhone, setPayPhone] = useState("");
  const [processingPrescriptionPayment, setProcessingPrescriptionPayment] = useState(false);
  const isPaid = (status?: string) => String(status || "").trim().toUpperCase() === "PAID";
  const unpaidPrescriptionCount = prescriptions.filter((prescription) => !isPaid(prescription.paymentStatus)).length;
  const shouldWarnNoAccountFunds =
    !loadingAccount &&
    !loadingPrescriptions &&
    unpaidPrescriptionCount > 0 &&
    Number(account?.balance || 0) <= 0;

  // Deposit functions
  const handleDeposit = async () => {
    if (!depositAmount || !depositPhone || !profile) {
      setError("Please fill in all deposit fields");
      return;
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setProcessingDeposit(true);
    setError("");
    setSuccess("");

    try {
      // Create deposit transaction
      const transactionId = await createDepositTransaction({
        patientId,
        hospitalId: profile.hospitalId,
        amount,
        currency: "LSL",
        paymentMethod: depositMethod,
        phone: depositPhone,
      });

      // Process payment with test API
      let paymentResult;
      if (depositMethod === "MPESA") {
        paymentResult = await testMpesaPayment(depositPhone, amount);
      } else {
        paymentResult = await testEcocashPayment(depositPhone, amount);
      }

      if (paymentResult.success) {
        // Update transaction status
        await updateDepositTransactionStatus(transactionId, "COMPLETED");
        
        // Update patient balance
        await updatePatientBalance(patientId, profile.hospitalId, amount, "DEPOSIT");
        
        // Reload account data
        const updatedAccount = await getPatientAccount(patientId, profile.hospitalId);
        if (updatedAccount) {
          setAccount(updatedAccount);
        }

        // Reload deposit history
        const history = await getPatientDepositHistory(patientId, profile.hospitalId);
        setDepositHistory(history);

        // Reset form
        setDepositAmount("");
        setDepositPhone("");
        setShowDepositModal(false);
        
        setSuccess(`Successfully deposited LSL ${amount.toFixed(2)} via ${depositMethod}`);
      } else {
        await updateDepositTransactionStatus(transactionId, "FAILED");
        setError(`Payment failed via ${depositMethod}. Please try again.`);
      }
    } catch (e: any) {
      console.error("DEPOSIT ERROR:", e);
      setError(e?.message || "Deposit failed. Please try again.");
    } finally {
      setProcessingDeposit(false);
    }
  };

  const openPayPrescriptionModal = (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    setPayAmount("");
    setPayMethod("ACCOUNT_BALANCE");
    setPayPhone(profile?.phone || "");
    setShowPayPrescriptionModal(true);
    setError("");
  };

  const handlePayPrescription = async () => {
    if (!profile || !selectedPrescription) {
      setError("Unable to process payment. Missing patient or prescription.");
      return;
    }

    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    if ((payMethod === "MPESA" || payMethod === "ECOCASH") && !payPhone.trim()) {
      setError("Phone number is required for mobile money payments.");
      return;
    }

    setProcessingPrescriptionPayment(true);
    setError("");

    try {
      if (payMethod === "ACCOUNT_BALANCE") {
        await updatePatientBalance(patientId, profile.hospitalId, amount, "DEDUCTION");
      } else {
        const paymentResult =
          payMethod === "MPESA"
            ? await testMpesaPayment(payPhone.trim(), amount)
            : await testEcocashPayment(payPhone.trim(), amount);

        if (!paymentResult.success) {
          throw new Error(`${payMethod} payment failed. Please try again.`);
        }
      }

      const receiptNo = `RCP-${Date.now()}`;
      await updatePrescriptionPaymentStatus(selectedPrescription.id, "PAID", receiptNo);
      await updatePrescriptionStatus(
        selectedPrescription.id,
        "PREPARING",
        patientId,
        `Self-paid by patient ${patientId} via ${payMethod}`
      );

      const patientPrescriptions = await loadPrescriptionsByPatient(patientId);
      setPrescriptions(patientPrescriptions);

      const refreshedAccount = await getPatientAccount(patientId, profile.hospitalId);
      if (refreshedAccount) {
        setAccount(refreshedAccount);
      }

      setShowPayPrescriptionModal(false);
      setSelectedPrescription(null);
      setPayAmount("");
    } catch (e: any) {
      console.error("PAY PRESCRIPTION ERROR:", e);
      setError(e?.message || "Failed to pay prescription.");
    } finally {
      setProcessingPrescriptionPayment(false);
    }
  };

  const openServicePaymentModal = (bill: ConsultationBill) => {
    setSelectedServiceBill(bill);
    setServicePayMethod("ACCOUNT_BALANCE");
    setServicePayPhone(profile?.phone || "");
    setShowServicePaymentModal(true);
    setError("");
  };

  const handlePayServiceBill = async () => {
    if (!profile || !selectedServiceBill) {
      setError("Select a service bill first.");
      return;
    }

    const remainingAmount = Math.max(
      0,
      Number(selectedServiceBill.amount || 0) - Number(selectedServiceBill.paidAmount || 0)
    );
    if (remainingAmount <= 0) {
      setError("This bill is already paid.");
      return;
    }

    if ((servicePayMethod === "MPESA" || servicePayMethod === "ECOCASH") && !servicePayPhone.trim()) {
      setError("Phone number is required for mobile money.");
      return;
    }

    setProcessingServicePayment(true);
    setError("");

    try {
      if (servicePayMethod === "ACCOUNT_BALANCE") {
        await payBillWithAccountBalanceByPatient(selectedServiceBill.billId, patientId, selectedServiceBill.hospitalId);
      } else if (servicePayMethod === "MPESA") {
        const paymentResult = await testMpesaPayment(servicePayPhone.trim(), remainingAmount);
        if (!paymentResult.success) throw new Error("MPESA payment failed. Please try again.");
        await payBillByPatient(selectedServiceBill.billId, remainingAmount, patientId, "MPESA");
      } else {
        const paymentResult = await testEcocashPayment(servicePayPhone.trim(), remainingAmount);
        if (!paymentResult.success) throw new Error("EcoCash payment failed. Please try again.");
        await payBillByPatient(selectedServiceBill.billId, remainingAmount, patientId, "ECOCASH");
      }

      const refreshedBills = await getPatientBillsByPatient(patientId);
      setServiceBills(refreshedBills);
      const refreshedAccount = await getPatientAccount(patientId, profile.hospitalId);
      if (refreshedAccount) setAccount(refreshedAccount);

      setShowServicePaymentModal(false);
      setSelectedServiceBill(null);
    } catch (e: any) {
      console.error("PAY SERVICE BILL ERROR:", e);
      setError(e?.message || "Failed to pay service bill.");
    } finally {
      setProcessingServicePayment(false);
    }
  };

  // PDF download function
  const downloadPrescriptionPDF = (prescription: Prescription) => {
    // Create a simple text-based prescription for now
    const prescriptionText = `
PRESCRIPTION
=============
Hospital: ${prescription.hospitalName}
Prescription ID: ${prescription.id}
Date: ${new Date(prescription.createdAtISO).toLocaleDateString()}

PATIENT INFORMATION
==================
Name: ${prescription.patientName}
Patient ID: ${prescription.patientId}

DOCTOR INFORMATION
==================
Doctor: ${prescription.doctorName}
Doctor ID: ${prescription.doctorId}

PRESCRIPTION DETAILS
===================
Status: ${prescription.status}
Payment Status: ${prescription.paymentStatus}
${prescription.receiptNo ? `Receipt No: ${prescription.receiptNo}` : ''}

MEDICATIONS
===========
${prescription.items.map((item, index) => 
  `${index + 1}. ${item.drugName}
   Dosage: ${item.dosage}
   Frequency: ${item.frequency}
   Duration: ${item.days} days`
).join('\n\n')}

${prescription.notes ? `DOCTOR'S NOTES:\n${prescription.notes}` : ''}

---
Generated on: ${new Date().toLocaleDateString()}
    `.trim();

    // Create a blob and download
    const blob = new Blob([prescriptionText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Prescription_${prescription.id}_${prescription.patientName.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const downloadLabReport = (request: LabRequest) => {
    const reportText = `
LAB REPORT
==========
Patient: ${request.patientName}
Lab Request: ${request.id}
Status: Results Released
Released: ${(request.releasedAt || request.completedAt || "").replace("T", " ").slice(0, 16) || "Not recorded"}

Your lab results are ready.

Tests:
${request.tests.map((test) => `- ${test.testName}`).join("\n")}

Please contact your doctor if you have questions about these results.
    `.trim();

    const blob = new Blob([reportText], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Lab_Report_${request.id}_${request.patientName.replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const run = async () => {
      setLoadingProfile(true);
      setLoadingNotes(true);
      setLoadingPrescriptions(true);
      setLoadingAccount(true);
      setLoadingBills(true);
      setError("");

      try {
        const patientProfile = await getPatientProfile(patientId);
        console.log("Patient profile loaded:", patientProfile);
        setProfile(patientProfile as PatientProfile | null);

        const [patientNotes, labReports] = await Promise.all([
          loadPatientNotes(patientId),
          loadReleasedLabResultsByPatient(patientId),
        ]);
        console.log("Patient notes loaded:", patientNotes.length);
        setNotes(patientNotes);
        setReleasedLabResults(labReports);

        // Load prescriptions for this patient
        if (patientProfile?.hospitalId) {
          try {
            const patientPrescriptions = await loadPrescriptionsByPatient(patientId);
            console.log("Found prescriptions for patient:", patientPrescriptions.length);
            setPrescriptions(patientPrescriptions);

            // Load or create patient account
            let patientAccount = await getPatientAccount(patientId, patientProfile.hospitalId);
            if (!patientAccount) {
              console.log("Creating new patient account");
              patientAccount = await createPatientAccount(patientId, patientProfile.hospitalId, patientProfile.hospitalName);
            }
            console.log("Patient account loaded:", patientAccount);
            setAccount(patientAccount);

            // Load deposit history
            const history = await getPatientDepositHistory(patientId, patientProfile.hospitalId);
            console.log("Deposit history loaded:", history.length);
            setDepositHistory(history);

            // Load service bills/payment history
            const bills = await getPatientBillsByPatient(patientId);
            setServiceBills(bills);
          } catch (prescriptionError: any) {
            console.error("LOAD PRESCRIPTIONS ERROR:", prescriptionError);
            // Don't set main error, just log it and continue with empty prescriptions
            setPrescriptions([]);
          }
        } else {
          console.log("No hospital ID found for patient");
          setPrescriptions([]);
        }
      } catch (e: any) {
        console.error("LOAD PATIENT DASHBOARD ERROR:", e);
        setError(e?.message || "Failed to load patient dashboard.");
      } finally {
        setLoadingProfile(false);
        setLoadingNotes(false);
        setLoadingPrescriptions(false);
        setLoadingAccount(false);
        setLoadingBills(false);
        console.log("Loading states set to false");
      }
    };

    run();
  }, [patientId]);

  return (
    <div className="patient-dashboard" style={styles.page}>
      <div style={styles.topCard}>
        <div style={styles.heroBadge}>
          <BadgePlus size={16} />
          Patient Care Portal
        </div>
        <div style={styles.h1}>Patient Dashboard</div>
        <div style={styles.sub}>
          Track your notes, prescriptions, payments, and hospital account in one place.
        </div>
        <div style={styles.topMetaRow}>
          <div style={styles.topMetaPill}>
            <Building2 size={16} />
            Patient ID: <b>{patientId}</b>
          </div>
          {profile?.hospitalName ? (
            <div style={styles.topMetaPill}>
              <HeartPulse size={16} />
              Hospital: <b>{profile.hospitalName}</b>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {success ? <div style={styles.success}>{success}</div> : null}
      {shouldWarnNoAccountFunds ? (
        <div style={styles.warning}>
          <AlertTriangle size={18} />
          <span>
            Your hospital account has no available money and you have unpaid prescription payment. Please confirm direct MPESA payment when reception sends the phone prompt.
          </span>
        </div>
      ) : null}

      {loadingProfile ? (
        <div style={styles.loading}>Loading patient profile...</div>
      ) : !profile ? (
        <div style={styles.loading}>Patient profile not found.</div>
      ) : (
        <>
          <div style={styles.profileCard}>
            <div style={styles.sectionTitle}>My Information</div>

            <div style={styles.infoGrid}>
              <div style={styles.infoBox}>
                <div style={styles.infoLabel}>Full Name</div>
                <div style={styles.infoValue}>{profile.fullName}</div>
              </div>

              <div style={styles.infoBox}>
                <div style={styles.infoLabel}>Hospital</div>
                <div style={styles.infoValue}>{profile.hospitalName}</div>
              </div>

              <div style={styles.infoBox}>
                <div style={styles.infoLabel}>Sex</div>
                <div style={styles.infoValue}>{profile.sex}</div>
              </div>

              <div style={styles.infoBox}>
                <div style={styles.infoLabel}>Age</div>
                <div style={styles.infoValue}>{profile.age}</div>
              </div>

              <div style={styles.infoBox}>
                <div style={styles.infoLabel}>Phone</div>
                <div style={styles.infoValue}>{profile.phone}</div>
              </div>

              <div style={styles.infoBox}>
                <div style={styles.infoLabel}>Status</div>
                <div style={styles.infoValue}>{profile.status}</div>
              </div>

              <div style={styles.infoBox}>
                <div style={styles.infoLabel}>Doctor Notes</div>
                <div style={styles.infoValue}>
                  {loadingNotes ? "Loading..." : `${notes.length} note${notes.length === 1 ? "" : "s"}`}
                </div>
              </div>
            </div>
          </div>

          <div style={styles.sectionsGrid}>
          <div style={styles.notesCard}>
            <div style={styles.sectionTitle}>Doctor Notes</div>
            <div style={styles.sectionSub}>
              {loadingNotes
                ? "Loading doctor notes..."
                : `${notes.length} doctor note${notes.length === 1 ? "" : "s"} available from consultations.`}
            </div>

            {notes.length > 0 && (
              <button 
                style={styles.historyBtn} 
                onClick={() => setShowPatientHistory(true)}
              >
                <IconLabel icon={<BookOpen size={16} />} label="View My Medical History" />
              </button>
            )}

            {loadingNotes ? (
              <div style={styles.loading}>Loading doctor notes...</div>
            ) : notes.length === 0 ? (
              <div style={styles.loading}>No doctor notes available yet.</div>
            ) : (
              <></>
            )}
          </div>

          <div style={styles.labResultsCard}>
            <div style={styles.sectionTitle}>Lab Results</div>
            <div style={styles.sectionSub}>
              {releasedLabResults.length ? "Your lab results are ready." : "No released lab results yet."}
            </div>
            {releasedLabResults.length > 0 ? (
              <div style={styles.labReadyList}>
                {releasedLabResults.map((request) => (
                  <div key={request.id} style={styles.labReadyItem}>
                    <div>
                      <div style={styles.prescriptionTitle}>
                        <IconLabel icon={<FlaskConical size={16} />} label="Your lab results are ready" />
                      </div>
                      <div style={styles.prescriptionDetails}>
                        {request.tests.map((test) => test.testName).join(", ")}
                      </div>
                    </div>
                    <div style={styles.labReadyActions}>
                      <button style={styles.downloadBtn} onClick={() => setSelectedLabReport(request)}>
                        View
                      </button>
                      <button style={styles.downloadBtn} onClick={() => downloadLabReport(request)}>
                        Download Report
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.loading}>Released lab reports will appear here.</div>
            )}
          </div>

          <div style={styles.prescriptionsCard}>
            <div style={styles.sectionTitle}>My Prescriptions</div>
            <div style={styles.sectionSub}>
              Download your prescriptions as PDF documents.
            </div>

            {loadingPrescriptions ? (
              <div style={styles.loading}>Loading prescriptions...</div>
            ) : prescriptions.length === 0 ? (
              <div style={styles.loading}>No prescriptions available yet.</div>
            ) : (
              <div style={styles.prescriptionsList}>
                {prescriptions.map((prescription) => (
                  <div key={prescription.id} style={styles.prescriptionCard}>
                    <div style={styles.prescriptionHeader}>
                      <div style={styles.prescriptionTitle}>
                        <IconLabel icon={<ClipboardList size={16} />} label={`Prescription ${prescription.id}`} />
                      </div>
                      <div style={styles.prescriptionStatus}>
                        Status: {prescription.status}
                      </div>
                    </div>
                    <div style={styles.prescriptionMeta}>
                      Dr. {prescription.doctorName} • {new Date(prescription.createdAtISO).toLocaleDateString()}
                    </div>
                    <div style={styles.prescriptionPayment}>
                      Payment: {prescription.paymentStatus} {prescription.receiptNo && `• Receipt: ${prescription.receiptNo}`}
                    </div>
                    <div style={styles.medicationsList}>
                      {prescription.items.map((item, index) => (
                        <div key={index} style={styles.medicationItem}>
                          • {item.drugName} - {item.dosage} - {item.frequency} for {item.days} days
                        </div>
                      ))}
                    </div>
                    <button
                      style={styles.downloadBtn}
                      onClick={() => downloadPrescriptionPDF(prescription)}
                    >
                      Download PDF
                    </button>
                    {!isPaid(prescription.paymentStatus) ? (
                      <button
                        style={styles.payPrescriptionBtn}
                        onClick={() => openPayPrescriptionModal(prescription)}
                      >
                        Pay Now
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.accountCard}>
            <div style={styles.sectionTitle}>My Account</div>
            <div style={styles.sectionSub}>
              Manage your hospital account balance and deposits.
            </div>

            {loadingAccount ? (
              <div style={styles.loading}>Loading account information...</div>
            ) : account ? (
              <>
                <div style={styles.balanceDisplay}>
                  <div style={styles.balanceLabel}>Current Balance</div>
                  <div style={styles.balanceAmount}>
                    {account.currency} {account.balance.toFixed(2)}
                  </div>
                </div>

                <button
                  style={styles.depositBtn}
                  onClick={() => {
                    setShowDepositModal(true);
                    setDepositPhone(profile?.phone || "");
                  }}
                >
                  <IconLabel icon={<Wallet size={16} />} label="Deposit Money" />
                </button>

                {depositHistory.length > 0 && (
                  <div style={styles.depositHistory}>
                    <div style={styles.historyTitle}>Recent Deposits</div>
                    <div style={styles.historyList}>
                      {depositHistory.slice(0, 3).map((transaction) => (
                        <div key={transaction.id} style={styles.historyItem}>
                          <div style={styles.historyAmount}>
                            +{transaction.currency} {transaction.amount.toFixed(2)}
                          </div>
                          <div style={styles.historyMeta}>
                            {transaction.paymentMethod} • {new Date(transaction.createdAtISO).toLocaleDateString()}
                          </div>
                          <div style={{
                            ...styles.historyStatus,
                            color: transaction.status === "COMPLETED" ? "#059669" : 
                                   transaction.status === "FAILED" ? "#dc2626" : "#ca8a04"
                          }}>
                            {transaction.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={styles.depositHistory}>
                  <div style={styles.historyTitle}>Service Payment History</div>
                  {loadingBills ? (
                    <div style={styles.loading}>Loading service payments...</div>
                  ) : serviceBills.length === 0 ? (
                    <div style={styles.loading}>No service payments recorded yet.</div>
                  ) : (
                    <div style={styles.historyList}>
                      {serviceBills.slice(0, 5).map((bill) => (
                        <div key={bill.id} style={styles.historyItem}>
                          <div style={styles.historyAmount}>
                            {bill.currency} {Number(bill.paidAmount || 0).toFixed(2)}
                          </div>
                          <div style={styles.historyMeta}>
                            {bill.description} - {bill.paymentMethod || "N/A"} - {new Date(bill.createdAtISO).toLocaleDateString()}
                          </div>
                          <div style={styles.historyMeta}>
                            Hospital: {bill.hospitalId}
                          </div>
                          <div style={styles.historyMeta}>
                            Total: {bill.currency} {Number(bill.amount || 0).toFixed(2)} - Remaining: {bill.currency} {Math.max(0, Number(bill.amount || 0) - Number(bill.paidAmount || 0)).toFixed(2)}
                          </div>
                          <div style={{
                            ...styles.historyStatus,
                            color: bill.status === "PAID" ? "#059669" : bill.status === "PARTIAL" ? "#ca8a04" : "#dc2626"
                          }}>
                            {bill.status}
                          </div>
                          {bill.status !== "PAID" ? (
                            <button
                              style={styles.payServiceBtn}
                              onClick={() => openServicePaymentModal(bill)}
                            >
                              Pay Service Bill
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={styles.loading}>Account information not available.</div>
            )}
          </div>
          </div>

          {/* Deposit Modal */}
          {showDepositModal && (
            <div style={styles.overlay} onClick={() => setShowDepositModal(false)}>
              <div className="animated-form-surface" style={styles.depositModal} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ margin: 0 }}><IconLabel icon={<Wallet size={18} />} label="Deposit Money" /></h2>
                  <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 4 }} onClick={() => setShowDepositModal(false)}>
                    ✕
                  </button>
                </div>

                <div style={styles.depositForm}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Amount (LSL)</label>
                    <input
                      type="number"
                      style={styles.formInput}
                      placeholder="Enter amount"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      min="1"
                      step="0.01"
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Payment Method</label>
                    <div style={styles.paymentMethods}>
                      <button
                        style={{
                          ...styles.paymentMethodBtn,
                          background: depositMethod === "MPESA" ? "#8b5cf6" : "#f3f4f6",
                          color: depositMethod === "MPESA" ? "white" : "#374151"
                        }}
                        onClick={() => setDepositMethod("MPESA")}
                      >
                        <PaymentMethodContent label="Mpesa" logoSrc={mpesaLogo} />
                      </button>
                      <button
                        style={{
                          ...styles.paymentMethodBtn,
                          background: depositMethod === "ECOCASH" ? "#8b5cf6" : "#f3f4f6",
                          color: depositMethod === "ECOCASH" ? "white" : "#374151"
                        }}
                        onClick={() => setDepositMethod("ECOCASH")}
                      >
                        <PaymentMethodContent label="EcoCash" logoSrc={ecocashLogo} />
                      </button>
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Phone Number</label>
                    <input
                      type="tel"
                      style={styles.formInput}
                      placeholder="Enter phone number"
                      value={depositPhone}
                      onChange={(e) => setDepositPhone(e.target.value)}
                    />
                  </div>

                  <div style={styles.depositActions}>
                    <button
                      style={styles.cancelBtn}
                      onClick={() => setShowDepositModal(false)}
                      disabled={processingDeposit}
                    >
                      Cancel
                    </button>
                    <button
                      style={styles.confirmDepositBtn}
                      onClick={handleDeposit}
                      disabled={processingDeposit}
                    >
                      {processingDeposit ? "Processing..." : `Deposit LSL ${depositAmount || "0"}`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showPayPrescriptionModal && selectedPrescription && (
            <div style={styles.overlay} onClick={() => setShowPayPrescriptionModal(false)}>
              <div className="animated-form-surface" style={styles.depositModal} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ margin: 0 }}>Pay Prescription {selectedPrescription.id}</h2>
                  <button
                    style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 4 }}
                    onClick={() => setShowPayPrescriptionModal(false)}
                  >
                    Close
                  </button>
                </div>

                <div style={styles.depositForm}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Amount (LSL)</label>
                    <input
                      type="number"
                      style={styles.formInput}
                      placeholder="Enter amount"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      min="1"
                      step="0.01"
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Payment Method</label>
                    <div style={styles.paymentMethodsThree}>
                      <button
                        style={{
                          ...styles.paymentMethodBtn,
                          background: payMethod === "ACCOUNT_BALANCE" ? "#2563eb" : "#f3f4f6",
                          color: payMethod === "ACCOUNT_BALANCE" ? "white" : "#374151",
                        }}
                        onClick={() => setPayMethod("ACCOUNT_BALANCE")}
                      >
                        <PaymentMethodContent label="Account" />
                      </button>
                      <button
                        style={{
                          ...styles.paymentMethodBtn,
                          background: payMethod === "MPESA" ? "#2563eb" : "#f3f4f6",
                          color: payMethod === "MPESA" ? "white" : "#374151",
                        }}
                        onClick={() => setPayMethod("MPESA")}
                      >
                        <PaymentMethodContent label="MPESA" logoSrc={mpesaLogo} />
                      </button>
                      <button
                        style={{
                          ...styles.paymentMethodBtn,
                          background: payMethod === "ECOCASH" ? "#2563eb" : "#f3f4f6",
                          color: payMethod === "ECOCASH" ? "white" : "#374151",
                        }}
                        onClick={() => setPayMethod("ECOCASH")}
                      >
                        <PaymentMethodContent label="EcoCash" logoSrc={ecocashLogo} />
                      </button>
                    </div>
                  </div>

                  {payMethod === "ACCOUNT_BALANCE" && account ? (
                    <div style={styles.accountHint}>
                      Available balance: {account.currency} {account.balance.toFixed(2)}
                    </div>
                  ) : null}

                  {payMethod === "MPESA" || payMethod === "ECOCASH" ? (
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Phone Number</label>
                      <input
                        type="tel"
                        style={styles.formInput}
                        placeholder="Enter phone number"
                        value={payPhone}
                        onChange={(e) => setPayPhone(e.target.value)}
                      />
                    </div>
                  ) : null}

                  <div style={styles.depositActions}>
                    <button
                      style={styles.cancelBtn}
                      onClick={() => setShowPayPrescriptionModal(false)}
                      disabled={processingPrescriptionPayment}
                    >
                      Cancel
                    </button>
                    <button
                      style={styles.confirmPayBtn}
                      onClick={handlePayPrescription}
                      disabled={processingPrescriptionPayment}
                    >
                      {processingPrescriptionPayment ? "Processing..." : `Pay LSL ${payAmount || "0"}`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showServicePaymentModal && selectedServiceBill && (
            <div style={styles.overlay} onClick={() => setShowServicePaymentModal(false)}>
              <div className="animated-form-surface" style={styles.depositModal} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ margin: 0 }}>Pay Service Bill {selectedServiceBill.billId}</h2>
                  <button
                    style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 4 }}
                    onClick={() => setShowServicePaymentModal(false)}
                  >
                    Close
                  </button>
                </div>

                <div style={styles.depositForm}>
                  <div style={styles.accountHint}>
                    Remaining: {selectedServiceBill.currency} {Math.max(0, Number(selectedServiceBill.amount || 0) - Number(selectedServiceBill.paidAmount || 0)).toFixed(2)}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Payment Method</label>
                    <div style={styles.paymentMethodsThree}>
                      <button
                        style={{
                          ...styles.paymentMethodBtn,
                          background: servicePayMethod === "ACCOUNT_BALANCE" ? "#2563eb" : "#f3f4f6",
                          color: servicePayMethod === "ACCOUNT_BALANCE" ? "white" : "#374151",
                        }}
                        onClick={() => setServicePayMethod("ACCOUNT_BALANCE")}
                      >
                        <PaymentMethodContent label="Account" />
                      </button>
                      <button
                        style={{
                          ...styles.paymentMethodBtn,
                          background: servicePayMethod === "MPESA" ? "#2563eb" : "#f3f4f6",
                          color: servicePayMethod === "MPESA" ? "white" : "#374151",
                        }}
                        onClick={() => setServicePayMethod("MPESA")}
                      >
                        <PaymentMethodContent label="MPESA" logoSrc={mpesaLogo} />
                      </button>
                      <button
                        style={{
                          ...styles.paymentMethodBtn,
                          background: servicePayMethod === "ECOCASH" ? "#2563eb" : "#f3f4f6",
                          color: servicePayMethod === "ECOCASH" ? "white" : "#374151",
                        }}
                        onClick={() => setServicePayMethod("ECOCASH")}
                      >
                        <PaymentMethodContent label="EcoCash" logoSrc={ecocashLogo} />
                      </button>
                    </div>
                  </div>

                  {servicePayMethod === "MPESA" || servicePayMethod === "ECOCASH" ? (
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Phone Number</label>
                      <input
                        type="tel"
                        style={styles.formInput}
                        placeholder="Enter phone number"
                        value={servicePayPhone}
                        onChange={(e) => setServicePayPhone(e.target.value)}
                      />
                    </div>
                  ) : null}

                  <div style={styles.depositActions}>
                    <button
                      style={styles.cancelBtn}
                      onClick={() => setShowServicePaymentModal(false)}
                      disabled={processingServicePayment}
                    >
                      Cancel
                    </button>
                    <button
                      style={styles.confirmPayBtn}
                      onClick={handlePayServiceBill}
                      disabled={processingServicePayment}
                    >
                      {processingServicePayment ? "Processing..." : "Pay Bill"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedLabReport && (
            <div style={styles.overlay} onClick={() => setSelectedLabReport(null)}>
              <div className="animated-form-surface" style={styles.depositModal} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ margin: 0 }}><IconLabel icon={<FlaskConical size={18} />} label="Lab Results Ready" /></h2>
                  <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 4 }} onClick={() => setSelectedLabReport(null)}>
                    Close
                  </button>
                </div>
                <p style={styles.sectionSub}>
                  Your lab results are ready. Download the report or contact your doctor for interpretation.
                </p>
                <div style={styles.labReportSimpleBox}>
                  <b>{selectedLabReport.tests.map((test) => test.testName).join(", ")}</b>
                  <span>Released {(selectedLabReport.releasedAt || selectedLabReport.completedAt || "").replace("T", " ").slice(0, 16) || "recently"}</span>
                </div>
                <button style={styles.downloadBtn} onClick={() => downloadLabReport(selectedLabReport)}>
                  Download Report
                </button>
              </div>
            </div>
          )}

          {/* Patient History Modal */}
          {showPatientHistory && notes.length > 0 && (
            <div style={styles.overlay} onClick={() => setShowPatientHistory(false)}>
              <div style={styles.historyModal} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ margin: 0 }}><IconLabel icon={<BookOpen size={18} />} label="My Medical History" /></h2>
                  <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 4 }} onClick={() => setShowPatientHistory(false)}>
                    ✕
                  </button>
                </div>

                <div style={styles.historyBook}>
                  <div style={styles.historyPage}>
                    <div style={styles.pageNumber}>
                      Page {currentNoteIndex + 1} of {notes.length}
                    </div>
                    <div style={styles.pageDate}>
                      {new Date(notes[currentNoteIndex].createdAtISO).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                    <div style={styles.noteContent}>
                      <div style={styles.historyNoteTitle}>{notes[currentNoteIndex].title}</div>
                      <div style={styles.historyNoteMeta}>
                        Dr. {notes[currentNoteIndex].doctorName} • {notes[currentNoteIndex].createdAtISO.replace("T", " ").slice(0, 16)}
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
        </>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 20,
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 12% 16%, rgba(37, 211, 102, 0.14), transparent 22%), radial-gradient(circle at 84% 22%, rgba(74, 144, 226, 0.18), transparent 24%), linear-gradient(135deg, #eef7fb 0%, #dfeefa 48%, #d9f6f0 100%)",
  },
  topCard: {
    background: "linear-gradient(160deg, #12355c 0%, #0d4f76 46%, #0e7c86 100%)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 28px 64px rgba(30, 41, 59, 0.16)",
    marginBottom: 18,
    color: "white",
  },
  heroBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    width: "fit-content",
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "white",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    marginBottom: 12,
  },
  h1: { fontSize: 32, fontWeight: 1000, color: "white", letterSpacing: "-0.03em" },
  sub: { marginTop: 8, fontSize: 14, color: "rgba(255,255,255,0.82)", fontWeight: 700, maxWidth: 620 },
  topMetaRow: {
    marginTop: 18,
    display: "flex",
    gap: 12,
    flexWrap: "wrap" as const,
  },
  topMetaPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "white",
    fontSize: 13,
    fontWeight: 700,
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
  warning: {
    marginBottom: 14,
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    padding: "12px 14px",
    borderRadius: 12,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    gap: 10,
    lineHeight: 1.45,
  },
  loading: {
    background: "rgba(247, 252, 255, 0.92)",
    border: "1px solid #d6e4f0",
    borderRadius: 18,
    padding: 16,
    fontWeight: 800,
    marginBottom: 14,
    boxShadow: "0 12px 28px rgba(116, 142, 170, 0.08)",
  },
  profileCard: {
    background: "rgba(247, 252, 255, 0.92)",
    border: "1px solid #d6e4f0",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 18px 36px rgba(116, 142, 170, 0.1)",
    marginBottom: 18,
  },
  sectionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
    gap: 16,
    alignItems: "start" as const,
  },
  notesCard: {
    background: "rgba(247, 252, 255, 0.92)",
    border: "1px solid #d6e4f0",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 18px 36px rgba(116, 142, 170, 0.1)",
    order: 4,
    minWidth: 0,
  },
  prescriptionsCard: {
    background: "rgba(247, 252, 255, 0.92)",
    border: "1px solid #d6e4f0",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 18px 36px rgba(116, 142, 170, 0.1)",
    order: 2,
    minWidth: 0,
  },
  labResultsCard: {
    background: "rgba(240, 253, 244, 0.92)",
    border: "1px solid #b7e4cc",
    borderRadius: 12,
    padding: 18,
    boxShadow: "0 18px 36px rgba(116, 142, 170, 0.1)",
    gridColumn: "1 / -1",
    order: 1,
    minWidth: 0,
  },
  labReadyList: {
    display: "grid",
    gap: 12,
    marginTop: 12,
  },
  labReadyItem: {
    border: "1px solid #cdebd8",
    background: "white",
    borderRadius: 8,
    padding: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  labReadyActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  labReportSimpleBox: {
    border: "1px solid #d6e4f0",
    borderRadius: 8,
    padding: 14,
    display: "grid",
    gap: 8,
    marginBottom: 14,
    background: "#f8fafc",
  },
  prescriptionsList: {
    display: "grid",
    gap: 12,
    marginTop: 12,
  },
  prescriptionCard: {
    border: "1px solid #d6e4f0",
    borderRadius: 18,
    padding: 14,
    background: "white",
    boxShadow: "0 10px 24px rgba(116, 142, 170, 0.08)",
  },
  prescriptionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  prescriptionTitle: {
    fontWeight: 1000,
    color: "#000000",
    fontSize: 16,
  },
  prescriptionStatus: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#eef6ff",
    color: "#1163b8",
    fontWeight: 700,
  },
  prescriptionMeta: {
    fontSize: 12,
    opacity: 0.75,
    fontWeight: 800,
    marginBottom: 4,
  },
  prescriptionPayment: {
    fontSize: 12,
    opacity: 0.75,
    fontWeight: 800,
    marginBottom: 8,
  },
  medicationsList: {
    marginTop: 8,
    marginBottom: 12,
  },
  medicationItem: {
    fontSize: 13,
    color: "#374151",
    marginBottom: 4,
    fontWeight: 700,
  },
  downloadBtn: {
    border: "none",
    background: "linear-gradient(135deg, #1eb7a6, #0f9f8f)",
    color: "white",
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
  },
  payPrescriptionBtn: {
    border: "none",
    background: "linear-gradient(135deg, #1678d8, #1f66c2)",
    color: "white",
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    marginLeft: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 1000,
    color: "#000000",
  },
  sectionSub: {
    marginTop: 6,
    opacity: 0.75,
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 12,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginTop: 12,
  },
  infoBox: {
    border: "1px solid #d6e4f0",
    borderRadius: 18,
    padding: 14,
    background: "white",
    boxShadow: "0 10px 24px rgba(116, 142, 170, 0.06)",
  },
  infoLabel: {
    fontSize: 12,
    opacity: 0.75,
    fontWeight: 800,
  },
  infoValue: {
    marginTop: 4,
    fontWeight: 1000,
    color: "#000000",
  },
  notesList: {
    display: "grid",
    gap: 12,
  },
  noteCard: {
    border: "1px solid #e5eaf2",
    borderRadius: 12,
    padding: 12,
    background: "#fbfdff",
  },
  noteTitle: {
    fontWeight: 1000,
    color: "#000000",
  },
  noteMeta: {
    fontSize: 12,
    opacity: 0.75,
    fontWeight: 800,
  },
  noteBody: {
    marginTop: 10,
    whiteSpace: "pre-wrap",
    fontWeight: 700,
    lineHeight: 1.5,
  },
  historyBtn: {
    border: "none",
    background: "linear-gradient(135deg, #6f58e8, #8a5cf6)",
    color: "white",
    borderRadius: 14,
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 1000,
    width: "fit-content",
    marginBottom: 12,
    boxShadow: "0 14px 26px rgba(111, 88, 232, 0.18)",
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
    color: "#6b7280",
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
    background: "#8b5cf6",
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
  accountCard: {
    background: "rgba(247, 252, 255, 0.92)",
    border: "1px solid #d6e4f0",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 18px 36px rgba(116, 142, 170, 0.1)",
    order: 3,
    minWidth: 0,
  },
  balanceDisplay: {
    background: "linear-gradient(135deg, #1678d8 0%, #0e7c86 100%)",
    borderRadius: 20,
    padding: 22,
    marginBottom: 16,
    textAlign: "center" as const,
    color: "white",
    boxShadow: "0 18px 36px rgba(22, 120, 216, 0.2)",
  },
  balanceLabel: {
    fontSize: 14,
    opacity: 0.9,
    fontWeight: 700,
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 1000,
    textShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  depositBtn: {
    border: "none",
    background: "linear-gradient(135deg, #1eb7a6, #0f9f8f)",
    color: "white",
    borderRadius: 16,
    padding: "14px 20px",
    cursor: "pointer",
    fontWeight: 1000,
    fontSize: 14,
    width: "100%",
    marginBottom: 16,
    boxShadow: "0 16px 28px rgba(15, 159, 143, 0.18)",
  },
  depositHistory: {
    marginTop: 16,
    maxHeight: 360,
    overflowY: "auto",
    paddingRight: 4,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: 1000,
    color: "#000000",
    marginBottom: 12,
  },
  historyList: {
    display: "grid",
    gap: 8,
  },
  historyItem: {
    border: "1px solid #d6e4f0",
    borderRadius: 14,
    padding: 12,
    background: "white",
    boxShadow: "0 10px 24px rgba(116, 142, 170, 0.06)",
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: 1000,
    color: "#059669",
    marginBottom: 4,
  },
  historyMeta: {
    fontSize: 12,
    opacity: 0.75,
    fontWeight: 800,
    marginBottom: 4,
  },
  historyStatus: {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase" as const,
  },
  payServiceBtn: {
    marginTop: 8,
    border: "none",
    background: "linear-gradient(135deg, #1678d8, #1f66c2)",
    color: "white",
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
  },
  depositModal: {
    width: "100%",
    maxWidth: 500,
    background: "white",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  depositForm: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: 800,
    color: "#374151",
  },
  formInput: {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 600,
    outline: "none",
    transition: "border-color 0.2s",
  },
  paymentMethods: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  paymentMethodsThree: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
  },
  paymentMethodBtn: {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "10px 16px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 0,
    transition: "all 0.2s",
  },
  iconLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    lineHeight: 1.2,
    fontWeight: 800,
  },
  iconGlyph: {
    width: 22,
    height: 22,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    background: "rgba(255,255,255,0.18)",
    color: "currentColor",
    flexShrink: 0,
  },
  paymentMethodContent: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.2,
  },
  paymentMethodLogo: {
    width: 24,
    height: 24,
    objectFit: "contain",
    background: "white",
    borderRadius: 6,
    padding: 2,
    flexShrink: 0,
  },
  accountHint: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 700,
    color: "#1e40af",
  },
  depositActions: {
    display: "flex",
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    border: "1px solid #d1d5db",
    background: "white",
    color: "#374151",
    borderRadius: 8,
    padding: "12px 20px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
  },
  confirmDepositBtn: {
    flex: 2,
    border: "none",
    background: "#10b981",
    color: "white",
    borderRadius: 8,
    padding: "12px 20px",
    cursor: "pointer",
    fontWeight: 1000,
    fontSize: 14,
  },
  confirmPayBtn: {
    flex: 2,
    border: "none",
    background: "#2563eb",
    color: "white",
    borderRadius: 8,
    padding: "12px 20px",
    cursor: "pointer",
    fontWeight: 1000,
    fontSize: 14,
  },
};

export default PatientDashboard;




