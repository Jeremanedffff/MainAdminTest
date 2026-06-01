import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase/firebase";

export type WorkerRole = "DOCTOR" | "PHARMACIST" | "RECEPTIONIST" | "LAB_STAFF";

export type WorkerRow = {
  id: string;
  hospitalId: string;
  hospitalName: string;
  role: WorkerRole;
  fullName: string;
  email: string;
  phone: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
};

export type PatientRow = {
  id: string;
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
  createdAt: string;
  bloodGroup?: string;
  chronicConditions?: string[];
  allergies?: string;
};

export type PatientNoteRow = {
  id: string;
  patientId: string;
  hospitalId: string;
  doctorId: string;
  doctorName: string;
  title: string;
  note: string;
  createdAtISO: string;
  assessment?: Record<string, any>;
  linkedPrescriptions?: {
    prescriptionId: string;
    medicationSummary: string;
    createdAtISO: string;
  }[];
};

export type PrescriptionItem = {
  drugName: string;
  dosage: string;
  frequency: string;
  days: number;
};

export type PrescriptionStatus = "PENDING" | "DISPENSED" | "PREPARING";

export type Prescription = {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  hospitalId: string;
  hospitalName: string;
  createdAtISO: string;
  status: PrescriptionStatus;
  items: PrescriptionItem[];
  notes?: string;
  linkedNoteId?: string;
  linkedNoteTitle?: string;
  linkedNoteText?: string;
  linkedNoteCreatedAtISO?: string;
  clinicalContext?: string;
  medicationSummary?: string;
  paymentStatus: "PAID" | "NOT_PAID";
  receiptNo?: string;
  preparedBy?: string;
  preparedAt?: string;
  dispensedBy?: string;
  dispensedAt?: string;
};

export type DispenseLog = {
  id: string;
  prescriptionId: string;
  patientId: string;
  pharmacistId: string;
  pharmacistName: string;
  whenISO: string;
  hospitalId: string;
};

export type PatientAccount = {
  id: string;
  patientId: string;
  hospitalId: string;
  hospitalName: string;
  balance: number;
  currency: string;
  createdAtISO: string;
  updatedAtISO: string;
};

export type DepositTransaction = {
  id: string;
  patientId: string;
  hospitalId: string;
  amount: number;
  currency: string;
  paymentMethod: "MPESA" | "ECOCASH";
  transactionId: string;
  phone: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAtISO: string;
  completedAtISO?: string;
};

export type ConsultationBill = {
  id: string;
  billId: string;
  patientId: string;
  hospitalId: string;
  amount: number;
  currency: string;
  description: string;
  status: "PENDING" | "PAID" | "PARTIAL";
  paidAmount: number;
  createdAtISO: string;
  paidAtISO?: string;
  paymentMethod?: "ACCOUNT_BALANCE" | "CASH" | "MPESA" | "ECOCASH";
  receptionistId?: string;
  receptionistName?: string;
};

export type PatientVisit = {
  id: string;
  patientId: string;
  patientName: string;
  hospitalId: string;
  hospitalName: string;
  receptionistId: string;
  receptionistName: string;
  visitDate: string; // YYYY-MM-DD format
  visitTimeISO: string; // Full ISO timestamp
  purpose?: string;
  notes?: string;
  status: "ACTIVE" | "CANCELLED";
};

export type LabRequest = {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  hospitalId: string;
  hospitalName: string;
  requestDate: string; // YYYY-MM-DD format
  requestTimeISO: string; // Full ISO timestamp
  tests: LabTest[];
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  priority: "ROUTINE" | "URGENT" | "STAT";
  clinicalNotes?: string;
  labTechnicianId?: string;
  labTechnicianName?: string;
  completedAt?: string;
  results?: LabResult[];
};

export type LabTest = {
  id: string;
  testName: string;
  testCode?: string;
  category: string; // e.g., "Blood", "Urine", "Imaging", etc.
  description?: string;
  instructions?: string;
};

export type LabResult = {
  testId: string;
  testName: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  status: "NORMAL" | "ABNORMAL" | "CRITICAL";
  notes?: string;
  completedAt: string;
};

export type LabTechnician = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  department: string;
  hospitalId: string;
  qualifications: string[];
  status: "ACTIVE" | "INACTIVE";
};

function mapPatientDoc(docId: string, data: any): PatientRow {
  return {
    id: data.patientId || docId,
    hospitalId: data.hospitalId,
    hospitalName: data.hospitalName || "",
    hospitalCode: data.hospitalCode || "",
    districtCode: data.districtCode || "",
    fullName: data.fullName,
    sex: data.sex,
    age: Number(data.age || 0),
    phone: data.phone || "",
    email: data.email || undefined,
    status: data.status || "ACTIVE",
    registeredBy: data.registeredBy || "SELF",
    createdAt: (data.createdAtISO || "").slice(0, 10),
    bloodGroup: data.clinicalFacts?.bloodGroup || data.bloodGroup || "",
    chronicConditions: data.clinicalFacts?.chronicConditions || data.chronicConditions || [],
    allergies: data.clinicalFacts?.allergies || data.allergies || "",
  };
}

function medicationSummary(items: PrescriptionItem[]): string {
  return items
    .map((item) =>
      [item.drugName, item.dosage, item.frequency, `${item.days} day${item.days === 1 ? "" : "s"}`]
        .filter(Boolean)
        .join(" - ")
    )
    .join("; ");
}

function mapPrescriptionDoc(docId: string, data: any): Prescription {
  return {
    id: data.prescriptionId || docId,
    patientId: data.patientId,
    patientName: data.patientName,
    doctorId: data.doctorId,
    doctorName: data.doctorName,
    hospitalId: data.hospitalId,
    hospitalName: data.hospitalName,
    createdAtISO: data.createdAtISO,
    status: data.status || "PENDING",
    items: data.items || [],
    notes: data.notes,
    linkedNoteId: data.linkedNoteId,
    linkedNoteTitle: data.linkedNoteTitle,
    linkedNoteText: data.linkedNoteText,
    linkedNoteCreatedAtISO: data.linkedNoteCreatedAtISO,
    clinicalContext: data.clinicalContext,
    medicationSummary: data.medicationSummary,
    paymentStatus: data.paymentStatus || "NOT_PAID",
    receiptNo: data.receiptNo,
    preparedBy: data.preparedBy,
    preparedAt: data.preparedAt,
    dispensedBy: data.dispensedBy,
    dispensedAt: data.dispensedAt,
  };
}

export type HospitalInfo = {
  hospitalId: string;
  hospitalCode: string;
  districtCode: string;
  name: string;
  location: string;
  country: string;
  status: "ACTIVE" | "DISABLED";
  maxAdmins: number;
  createdAtISO: string;
};

export type AdminUserProfile = {
  userId: string;
  role: "HOSPITAL_ADMIN";
  fullName: string;
  email?: string;
  phone?: string;
  hospitalId: string;
  hospitalName?: string;
  status?: "ACTIVE" | "DISABLED";
};

export type CreateWorkerPayload = {
  hospitalId: string;
  hospitalName: string;
  role: WorkerRole;
  fullName: string;
  email: string;
  phone: string;
  status: "ACTIVE" | "DISABLED";
  password: string;
};

export type UpdateWorkerPayload = {
  workerId: string;
  fullName: string;
  email: string;
  phone: string;
  role: WorkerRole;
  status: "ACTIVE" | "DISABLED";
  password?: string;
};

export type CreatePatientByAdminPayload = {
  hospitalId: string;
  hospitalName: string;
  hospitalCode: string;
  districtCode: string;
  fullName: string;
  sex: "MALE" | "FEMALE";
  age: number;
  phone: string;
  email?: string;
  password: string;
};

export type UpdatePatientPayload = {
  patientId: string;
  fullName: string;
  sex: "MALE" | "FEMALE";
  age: number;
  phone: string;
  email?: string;
  status: "ACTIVE" | "DISABLED";
  password?: string;
};

function normalizePhone(p: string) {
  return p.replace(/\s+/g, "").trim();
}

function assertValidPhoneNumber(phone: string) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  const looksLikeLesotho =
    trimmed.startsWith("+266") || trimmed.startsWith("266") || !trimmed.startsWith("+");

  if (!looksLikeLesotho) return;

  if (trimmed.startsWith("+266") || trimmed.startsWith("266")) {
    if (!(digits.startsWith("266") && digits.length === 11)) {
      throw new Error("Invalid phone number for the selected country code. Lesotho numbers should have 8 digits after +266.");
    }
    return;
  }

  if (digits.length !== 8) {
    throw new Error("Invalid phone number. Use 8 digits for Lesotho numbers, or include +countrycode for other countries.");
  }
}

function normalizeEmail(e: string) {
  return e.trim().toLowerCase();
}

function rolePrefix(role: WorkerRole) {
  if (role === "DOCTOR") return "DR";
  if (role === "PHARMACIST") return "PH";
  if (role === "RECEPTIONIST") return "RC";
  return "LB";
}

export async function loadAdminProfile(adminId: string): Promise<AdminUserProfile | null> {
  const snap = await getDoc(doc(db, "users", adminId));
  if (!snap.exists()) return null;

  const data = snap.data() as any;
  return {
    userId: data.userId || adminId,
    role: data.role || "HOSPITAL_ADMIN",
    fullName: data.fullName || "",
    email: data.email || "",
    phone: data.phone || "",
    hospitalId: data.hospitalId || "",
    hospitalName: data.hospitalName || "",
    status: data.status || "ACTIVE",
  };
}

export async function loadHospitalById(hospitalId: string): Promise<HospitalInfo | null> {
  const snap = await getDoc(doc(db, "hospitals", hospitalId));
  if (!snap.exists()) return null;

  const data = snap.data() as any;
  return {
    hospitalId: data.hospitalId || hospitalId,
    hospitalCode: data.hospitalCode || "",
    districtCode: data.districtCode || "",
    name: data.name || "",
    location: data.location || "",
    country: data.country || "Lesotho",
    status: data.status || "ACTIVE",
    maxAdmins: Number(data.maxAdmins || 2),
    createdAtISO: data.createdAtISO || "",
  };
}

export async function updateHospitalInfo(
  hospitalId: string,
  payload: {
    name: string;
    location: string;
    country: string;
    status: "ACTIVE" | "DISABLED";
  }
): Promise<void> {
  await updateDoc(doc(db, "hospitals", hospitalId), {
    name: payload.name.trim(),
    location: payload.location.trim(),
    country: payload.country.trim(),
    status: payload.status,
  });
}

export async function generateWorkerId(role: WorkerRole): Promise<string> {
  const prefix = rolePrefix(role);
  const counterRef = doc(db, "counters", `staff-${prefix}`);

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number((snap.data() as any).seq || 0) : 0;
    const updated = current + 1;

    tx.set(counterRef, { seq: updated, prefix }, { merge: true });
    return updated;
  });

  return `EMP-${prefix}-${String(next).padStart(4, "0")}`;
}

export async function createWorkerFirestore(payload: CreateWorkerPayload): Promise<WorkerRow> {
  const fullName = payload.fullName.trim();
  const email = payload.email.trim();
  const emailLower = normalizeEmail(payload.email);
  const phone = payload.phone.trim();
  const phoneNorm = normalizePhone(payload.phone);
  const password = payload.password.trim();

  if (!fullName) throw new Error("Full name is required.");
  if (!email) throw new Error("Email is required.");
  if (!phone) throw new Error("Phone is required.");
  assertValidPhoneNumber(phone);
  if (!payload.hospitalId) throw new Error("Hospital is required.");
  if (!password || password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }

  const usersRef = collection(db, "users");

  const emailCheck = query(usersRef, where("emailLower", "==", emailLower), limit(1));
  const emailSnap = await getDocs(emailCheck);
  if (!emailSnap.empty) throw new Error("This email is already used.");

  const phoneCheck = query(usersRef, where("phoneNorm", "==", phoneNorm), limit(1));
  const phoneSnap = await getDocs(phoneCheck);
  if (!phoneSnap.empty) throw new Error("This phone is already used.");

  const workerId = await generateWorkerId(payload.role);
  const createdAtISO = new Date().toISOString();

  const userDoc = {
    userId: workerId,
    role: payload.role,
    fullName,
    email,
    emailLower,
    phone,
    phoneNorm,
    hospitalId: payload.hospitalId,
    hospitalName: payload.hospitalName,
    password,
    status: payload.status,
    createdAtISO,
  };

  const staffDoc = {
    staffId: workerId,
    userId: workerId,
    hospitalId: payload.hospitalId,
    hospitalName: payload.hospitalName,
    role: payload.role,
    fullName,
    email,
    phone,
    status: payload.status,
    createdAtISO,
  };

  await setDoc(doc(db, "users", workerId), userDoc);
  await setDoc(doc(db, "staff", workerId), staffDoc);

  return {
    id: workerId,
    hospitalId: payload.hospitalId,
    hospitalName: payload.hospitalName,
    role: payload.role,
    fullName,
    email,
    phone,
    status: payload.status,
    createdAt: createdAtISO.slice(0, 10),
  };
}

export async function updateWorkerFirestore(
  hospitalId: string,
  payload: UpdateWorkerPayload
): Promise<void> {
  const fullName = payload.fullName.trim();
  const email = payload.email.trim();
  const emailLower = normalizeEmail(payload.email);
  const phone = payload.phone.trim();
  const phoneNorm = normalizePhone(payload.phone);
  assertValidPhoneNumber(phone);

  const userSnap = await getDoc(doc(db, "users", payload.workerId));
  if (!userSnap.exists()) throw new Error("Worker user account not found.");

  const oldUser = userSnap.data() as any;
  if (oldUser.hospitalId !== hospitalId) {
    throw new Error("You can only edit your own hospital workers.");
  }

  await updateDoc(doc(db, "users", payload.workerId), {
    fullName,
    email,
    emailLower,
    phone,
    phoneNorm,
    role: payload.role,
    status: payload.status,
    ...(payload.password && payload.password.trim().length >= 4
      ? { password: payload.password.trim() }
      : {}),
  });

  await updateDoc(doc(db, "staff", payload.workerId), {
    fullName,
    email,
    phone,
    role: payload.role,
    status: payload.status,
  });
}

export async function deleteWorkerFirestore(workerId: string): Promise<void> {
  await deleteDoc(doc(db, "staff", workerId));
  await deleteDoc(doc(db, "users", workerId));
}

export async function loadWorkersByHospital(hospitalId: string): Promise<WorkerRow[]> {
  const staffRef = collection(db, "staff");
  const q1 = query(staffRef, where("hospitalId", "==", hospitalId));
  const snap = await getDocs(q1);

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: data.staffId || d.id,
        hospitalId: data.hospitalId,
        hospitalName: data.hospitalName || "",
        role: data.role,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        status: data.status || "ACTIVE",
        createdAt: (data.createdAtISO || "").slice(0, 10),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function generatePatientId(
  districtCode: string,
  hospitalCode: string
): Promise<string> {
  const cleanDistrict = districtCode.trim().toUpperCase();
  const cleanHospital = hospitalCode.trim().toUpperCase();

  const counterId = `patient-${cleanDistrict}-${cleanHospital}`;
  const counterRef = doc(db, "counters", counterId);

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number((snap.data() as any).seq || 0) : 0;
    const updated = current + 1;

    tx.set(
      counterRef,
      {
        seq: updated,
        districtCode: cleanDistrict,
        hospitalCode: cleanHospital,
      },
      { merge: true }
    );

    return updated;
  });

  return `${cleanDistrict}-${cleanHospital}-${String(next).padStart(4, "0")}`;
}

export async function createPatientByAdminFirestore(
  payload: CreatePatientByAdminPayload
): Promise<PatientRow> {
  const fullName = payload.fullName.trim();
  const phone = payload.phone.trim();
  const phoneNorm = normalizePhone(payload.phone);
  const rawEmail = (payload.email || "").trim();
  const hasEmail = rawEmail.length > 0;
  const emailLower = hasEmail ? normalizeEmail(rawEmail) : "";
  const password = payload.password.trim();

  if (!fullName) throw new Error("Full name is required.");
  if (!phone) throw new Error("Phone is required.");
  assertValidPhoneNumber(phone);
  if (!payload.hospitalId) throw new Error("Hospital is required.");
  if (!payload.password || payload.password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }

  const usersRef = collection(db, "users");

  if (hasEmail) {
    const emailCheck = query(usersRef, where("emailLower", "==", emailLower), limit(1));
    const emailSnap = await getDocs(emailCheck);
    if (!emailSnap.empty) throw new Error("This email is already used.");
  }

  const phoneCheck = query(usersRef, where("phoneNorm", "==", phoneNorm), limit(1));
  const phoneSnap = await getDocs(phoneCheck);
  if (!phoneSnap.empty) throw new Error("This phone is already used.");

  const patientId = await generatePatientId(payload.districtCode, payload.hospitalCode);
  const createdAtISO = new Date().toISOString();

  const userDoc = {
    userId: patientId,
    role: "PATIENT",
    fullName,
    phone,
    phoneNorm,
    hospitalId: payload.hospitalId,
    hospitalName: payload.hospitalName,
    districtCode: payload.districtCode,
    password,
    status: "ACTIVE",
    createdAtISO,
    ...(hasEmail ? { email: rawEmail, emailLower } : {}),
  };

  const patientDoc = {
    patientId,
    userId: patientId,
    hospitalId: payload.hospitalId,
    hospitalName: payload.hospitalName,
    hospitalCode: payload.hospitalCode,
    districtCode: payload.districtCode,
    fullName,
    sex: payload.sex,
    age: payload.age,
    phone,
    status: "ACTIVE",
    registeredBy: "ADMIN",
    createdAtISO,
    ...(hasEmail ? { email: rawEmail } : {}),
  };

  await setDoc(doc(db, "users", patientId), userDoc);
  await setDoc(doc(db, "patients", patientId), patientDoc);

  return {
    id: patientId,
    hospitalId: payload.hospitalId,
    hospitalName: payload.hospitalName,
    hospitalCode: payload.hospitalCode,
    districtCode: payload.districtCode,
    fullName,
    sex: payload.sex,
    age: payload.age,
    phone,
    email: rawEmail || undefined,
    status: "ACTIVE",
    registeredBy: "ADMIN",
    createdAt: createdAtISO.slice(0, 10),
  };
}

export async function updatePatientFirestore(
  hospitalId: string,
  payload: UpdatePatientPayload
): Promise<void> {
  const fullName = payload.fullName.trim();
  const phone = payload.phone.trim();
  const phoneNorm = normalizePhone(payload.phone);
  const rawEmail = (payload.email || "").trim();
  const hasEmail = rawEmail.length > 0;
  const emailLower = hasEmail ? normalizeEmail(rawEmail) : "";
  assertValidPhoneNumber(phone);

  const patientSnap = await getDoc(doc(db, "patients", payload.patientId));
  if (!patientSnap.exists()) throw new Error("Patient not found.");

  const oldPatient = patientSnap.data() as any;
  if (oldPatient.hospitalId !== hospitalId) {
    throw new Error("You can only edit your own hospital patients.");
  }

  await updateDoc(doc(db, "patients", payload.patientId), {
    fullName,
    sex: payload.sex,
    age: payload.age,
    phone,
    status: payload.status,
    ...(hasEmail ? { email: rawEmail } : { email: "" }),
  });

  await updateDoc(doc(db, "users", payload.patientId), {
    fullName,
    phone,
    phoneNorm,
    status: payload.status,
    ...(hasEmail ? { email: rawEmail, emailLower } : { email: "", emailLower: "" }),
    ...(payload.password && payload.password.trim().length >= 4
      ? { password: payload.password.trim() }
      : {}),
  });
}

export async function deletePatientFirestore(patientId: string): Promise<void> {
  await deleteDoc(doc(db, "patients", patientId));
  await deleteDoc(doc(db, "users", patientId));
}

export async function loadPatientsByHospital(hospitalId: string): Promise<PatientRow[]> {
  const patientsRef = collection(db, "patients");
  const q1 = query(patientsRef, where("hospitalId", "==", hospitalId));
  const snap = await getDocs(q1);

  return snap.docs
    .map((d) => mapPatientDoc(d.id, d.data() as any))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findPatientById(patientId: string): Promise<PatientRow | null> {
  const id = patientId.trim();
  if (!id) return null;

  const candidateIds = Array.from(
    new Set([id, id.toUpperCase(), id.toLowerCase()])
  );

  let patientSnap = null as Awaited<ReturnType<typeof getDoc>> | null;
  for (const candidateId of candidateIds) {
    const snap = await getDoc(doc(db, "patients", candidateId));
    if (snap.exists()) {
      patientSnap = snap;
      break;
    }
  }

  if (!patientSnap || !patientSnap.exists()) return null;

  return mapPatientDoc(patientSnap.id, patientSnap.data() as any);
}

export async function loadAllPatients(): Promise<PatientRow[]> {
  const patientsRef = collection(db, "patients");
  const snap = await getDocs(patientsRef);

  return snap.docs
    .map((d) => mapPatientDoc(d.id, d.data() as any))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function searchPatientsAcrossHospitals(searchQuery: string): Promise<PatientRow[]> {
  const patientsRef = collection(db, "patients");
  const snap = await getDocs(patientsRef);

  const query = searchQuery.trim().toLowerCase();
  if (!query) return [];

  return snap.docs
    .map((d) => mapPatientDoc(d.id, d.data() as any))
    .filter((patient) => {
      return (
        patient.id.toLowerCase().includes(query) ||
        patient.fullName.toLowerCase().includes(query) ||
        patient.phone.toLowerCase().includes(query) ||
        patient.email?.toLowerCase().includes(query) ||
        patient.hospitalName.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addPatientNoteFirestore(payload: {
  patientId: string;
  hospitalId: string;
  doctorId: string;
  doctorName: string;
  title: string;
  note: string;
  assessment?: Record<string, any>;
}): Promise<PatientNoteRow> {
  const cleanTitle = payload.title.trim();
  const cleanNote = payload.note.trim();
  const createdAtISO = new Date().toISOString();

  if (!cleanTitle) throw new Error("Note title is required.");
  if (!cleanNote) throw new Error("Note body is required.");

  const docRef = await addDoc(collection(db, "patient_notes"), {
    patientId: payload.patientId,
    hospitalId: payload.hospitalId,
    doctorId: payload.doctorId,
    doctorName: payload.doctorName,
    title: cleanTitle,
    note: cleanNote,
    ...(payload.assessment ? { assessment: payload.assessment } : {}),
    createdAtISO,
    linkedPrescriptions: [],
  });

  return {
    id: docRef.id,
    patientId: payload.patientId,
    hospitalId: payload.hospitalId,
    doctorId: payload.doctorId,
    doctorName: payload.doctorName,
    title: cleanTitle,
    note: cleanNote,
    assessment: payload.assessment,
    createdAtISO,
    linkedPrescriptions: [],
  };
}

export async function updatePatientClinicalFactsFirestore(payload: {
  patientId: string;
  bloodGroup?: string;
  chronicConditions?: string[];
  allergies?: string;
}): Promise<void> {
  const updateData: Record<string, any> = {
    "clinicalFacts.updatedAtISO": new Date().toISOString(),
  };

  if (payload.bloodGroup) {
    updateData["clinicalFacts.bloodGroup"] = payload.bloodGroup;
    updateData.bloodGroup = payload.bloodGroup;
  }

  if (payload.chronicConditions) {
    updateData["clinicalFacts.chronicConditions"] = payload.chronicConditions;
    updateData.chronicConditions = payload.chronicConditions;
  }

  if (payload.allergies !== undefined) {
    updateData["clinicalFacts.allergies"] = payload.allergies;
    updateData.allergies = payload.allergies;
  }

  await updateDoc(doc(db, "patients", payload.patientId), updateData);
}

export async function loadPatientNotes(patientId: string): Promise<PatientNoteRow[]> {
  const notesRef = collection(db, "patient_notes");
  const q1 = query(notesRef, where("patientId", "==", patientId));
  const snap = await getDocs(q1);

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        patientId: data.patientId,
        hospitalId: data.hospitalId,
        doctorId: data.doctorId,
        doctorName: data.doctorName,
        title: data.title,
        note: data.note,
        createdAtISO: data.createdAtISO,
        assessment: data.assessment,
        linkedPrescriptions: data.linkedPrescriptions || [],
      };
    })
    .sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO));
}

// Pharmacy Functions
export async function createPaidPrescriptionFirestore(payload: {
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  hospitalId: string;
  hospitalName: string;
  items: PrescriptionItem[];
  notes?: string;
  receiptNo: string;
}): Promise<string> {
  return await createPrescriptionFirestore({
    ...payload,
    paymentStatus: "PAID",
    receiptNo: payload.receiptNo,
  });
}

export async function createPrescriptionFirestore(payload: {
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  hospitalId: string;
  hospitalName: string;
  items: PrescriptionItem[];
  notes?: string;
  linkedNoteId?: string;
  linkedNoteTitle?: string;
  linkedNoteText?: string;
  linkedNoteCreatedAtISO?: string;
  paymentStatus?: "PAID" | "NOT_PAID";
  receiptNo?: string;
}): Promise<string> {
  if (!payload.patientId.trim()) throw new Error("Patient ID is required.");
  if (!payload.patientName.trim()) throw new Error("Patient name is required.");
  if (!payload.doctorId.trim()) throw new Error("Doctor ID is required.");
  if (!payload.doctorName.trim()) throw new Error("Doctor name is required.");
  if (!payload.hospitalId.trim()) throw new Error("Hospital ID is required.");
  if (!payload.hospitalName.trim()) throw new Error("Hospital name is required.");
  if (!payload.items || payload.items.length === 0) throw new Error("At least one medication is required.");

  const prescriptionId = await generatePrescriptionId();
  const createdAtISO = new Date().toISOString();
  const medsSummary = medicationSummary(payload.items);
  const clinicalContext = [
    payload.linkedNoteTitle ? `Clinical note: ${payload.linkedNoteTitle}` : "",
    payload.linkedNoteText ? payload.linkedNoteText : "",
    payload.notes?.trim() ? `Prescription instructions: ${payload.notes.trim()}` : "",
    medsSummary ? `Medications prescribed: ${medsSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prescriptionDoc = {
    prescriptionId,
    patientId: payload.patientId.trim(),
    patientName: payload.patientName.trim(),
    doctorId: payload.doctorId.trim(),
    doctorName: payload.doctorName.trim(),
    hospitalId: payload.hospitalId.trim(),
    hospitalName: payload.hospitalName.trim(),
    items: payload.items,
    notes: payload.notes?.trim() || "",
    medicationSummary: medsSummary,
    clinicalContext,
    status: "PENDING",
    paymentStatus: payload.paymentStatus || "NOT_PAID",
    createdAtISO,
    ...(payload.linkedNoteId
      ? {
          linkedNoteId: payload.linkedNoteId,
          linkedNoteTitle: payload.linkedNoteTitle || "",
          linkedNoteText: payload.linkedNoteText || "",
          linkedNoteCreatedAtISO: payload.linkedNoteCreatedAtISO || "",
        }
      : {}),
    ...(payload.receiptNo ? { receiptNo: payload.receiptNo } : {}),
  };

  await addDoc(collection(db, "prescriptions"), prescriptionDoc);

  if (payload.linkedNoteId) {
    await updateDoc(doc(db, "patient_notes", payload.linkedNoteId), {
      linkedPrescriptions: arrayUnion({
        prescriptionId,
        medicationSummary: medsSummary,
        createdAtISO,
      }),
    });
  }

  return prescriptionId;
}

export async function generatePrescriptionId(): Promise<string> {
  const counterRef = doc(db, "counters", "prescription");

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number((snap.data() as any).seq || 0) : 0;
    const updated = current + 1;

    tx.set(counterRef, { seq: updated }, { merge: true });
    return updated;
  });

  return `RX-${new Date().getFullYear()}-${String(next).padStart(4, "0")}`;
}

export async function loadPrescriptionsByHospital(hospitalId: string): Promise<Prescription[]> {
  const prescriptionsRef = collection(db, "prescriptions");
  const q = query(prescriptionsRef, where("hospitalId", "==", hospitalId));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => mapPrescriptionDoc(d.id, d.data() as any))
    .sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO));
}

export async function loadPrescriptionsByPatient(patientId: string): Promise<Prescription[]> {
  const prescriptionsRef = collection(db, "prescriptions");
  const q = query(prescriptionsRef, where("patientId", "==", patientId));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => mapPrescriptionDoc(d.id, d.data() as any))
    .sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO));
}

export async function updatePrescriptionStatus(
  prescriptionId: string,
  status: PrescriptionStatus,
  pharmacistId?: string,
  pharmacistName?: string
): Promise<void> {
  const updateData: any = { status };

  if (status === "PREPARING") {
    updateData.preparedBy = pharmacistId;
    updateData.preparedByName = pharmacistName;
    updateData.preparedAt = new Date().toISOString();
  } else if (status === "DISPENSED") {
    updateData.dispensedBy = pharmacistId;
    updateData.dispensedByName = pharmacistName;
    updateData.dispensedAt = new Date().toISOString();
  }

  const prescriptionsRef = collection(db, "prescriptions");
  const q = query(prescriptionsRef, where("prescriptionId", "==", prescriptionId));
  const snap = await getDocs(q);

  if (!snap.empty) {
    const docRef = snap.docs[0].ref;
    await updateDoc(docRef, updateData);
  }
}

export async function updatePrescriptionPaymentStatus(
  prescriptionId: string,
  paymentStatus: "PAID" | "NOT_PAID",
  receiptNo?: string
): Promise<void> {
  try {
    console.log("Updating prescription payment:", { prescriptionId, paymentStatus, receiptNo });
    
    const prescriptionsRef = collection(db, "prescriptions");
    const q = query(prescriptionsRef, where("prescriptionId", "==", prescriptionId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.error("Prescription not found with ID:", prescriptionId);
      throw new Error(`Prescription with ID ${prescriptionId} not found`);
    }
    
    const docRef = querySnapshot.docs[0].ref;
    const updateData: any = { 
      paymentStatus,
      ...(receiptNo && { receiptNo })
    };
    
    console.log("Updating document with data:", updateData);
    await updateDoc(docRef, updateData);
    console.log("Successfully updated prescription payment status");
    
  } catch (error) {
    console.error("Error updating prescription payment status:", error);
    throw error;
  }
}

export async function addDispenseLog(payload: {
  prescriptionId: string;
  patientId: string;
  pharmacistId: string;
  pharmacistName: string;
  hospitalId: string;
}): Promise<void> {
  await addDoc(collection(db, "dispense_logs"), {
    prescriptionId: payload.prescriptionId,
    patientId: payload.patientId,
    pharmacistId: payload.pharmacistId,
    pharmacistName: payload.pharmacistName,
    hospitalId: payload.hospitalId,
    whenISO: new Date().toISOString(),
  });
}

export async function loadDispenseLogsByHospital(hospitalId: string): Promise<DispenseLog[]> {
  const logsRef = collection(db, "dispense_logs");
  const q = query(logsRef, where("hospitalId", "==", hospitalId));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        prescriptionId: data.prescriptionId,
        patientId: data.patientId,
        pharmacistId: data.pharmacistId,
        pharmacistName: data.pharmacistName,
        whenISO: data.whenISO,
        hospitalId: data.hospitalId,
      };
    })
    .sort((a, b) => b.whenISO.localeCompare(a.whenISO));
}

export async function findPrescriptionByPatientId(patientId: string): Promise<Prescription | null> {
  const prescriptionsRef = collection(db, "prescriptions");
  const q = query(prescriptionsRef, where("patientId", "==", patientId));
  const snap = await getDocs(q);

  if (snap.empty) return null;

  return mapPrescriptionDoc(snap.docs[0].id, snap.docs[0].data() as any);
}

// Visit Tracking Functions
export async function addPatientVisit(payload: {
  patientId: string;
  patientName: string;
  hospitalId: string;
  hospitalName: string;
  receptionistId: string;
  receptionistName: string;
  purpose?: string;
  notes?: string;
}): Promise<string> {
  const visitId = `VISIT-${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const visitTimeISO = new Date().toISOString();

  await addDoc(collection(db, "patient_visits"), {
    visitId,
    patientId: payload.patientId,
    patientName: payload.patientName,
    hospitalId: payload.hospitalId,
    hospitalName: payload.hospitalName,
    receptionistId: payload.receptionistId,
    receptionistName: payload.receptionistName,
    visitDate: today,
    visitTimeISO,
    purpose: payload.purpose?.trim() || "",
    notes: payload.notes?.trim() || "",
    status: "ACTIVE",
  });

  return visitId;
}

export async function loadTodayVisitsByHospital(hospitalId: string): Promise<PatientVisit[]> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const visitsRef = collection(db, "patient_visits");
  const q = query(
    visitsRef, 
    where("hospitalId", "==", hospitalId),
    where("visitDate", "==", today),
    where("status", "==", "ACTIVE")
  );
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: data.visitId || d.id,
        patientId: data.patientId,
        patientName: data.patientName,
        hospitalId: data.hospitalId,
        hospitalName: data.hospitalName,
        receptionistId: data.receptionistId,
        receptionistName: data.receptionistName,
        visitDate: data.visitDate,
        visitTimeISO: data.visitTimeISO,
        purpose: data.purpose,
        notes: data.notes,
        status: data.status || "ACTIVE",
      };
    })
    .sort((a, b) => b.visitTimeISO.localeCompare(a.visitTimeISO));
}

export async function loadPatientVisitHistory(patientId: string): Promise<PatientVisit[]> {
  const visitsRef = collection(db, "patient_visits");
  const q = query(
    visitsRef, 
    where("patientId", "==", patientId),
    where("status", "==", "ACTIVE")
  );
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: data.visitId || d.id,
        patientId: data.patientId,
        patientName: data.patientName,
        hospitalId: data.hospitalId,
        hospitalName: data.hospitalName,
        receptionistId: data.receptionistId,
        receptionistName: data.receptionistName,
        visitDate: data.visitDate,
        visitTimeISO: data.visitTimeISO,
        purpose: data.purpose,
        notes: data.notes,
        status: data.status || "ACTIVE",
      };
    })
    .sort((a, b) => b.visitTimeISO.localeCompare(a.visitTimeISO));
}

// Lab Functions
export async function createLabRequest(payload: {
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  hospitalId: string;
  hospitalName: string;
  tests: LabTest[];
  priority: "ROUTINE" | "URGENT" | "STAT";
  clinicalNotes?: string;
}): Promise<string> {
  const requestId = `LAB-${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const requestTimeISO = new Date().toISOString();

  await addDoc(collection(db, "lab_requests"), {
    requestId,
    patientId: payload.patientId,
    patientName: payload.patientName,
    doctorId: payload.doctorId,
    doctorName: payload.doctorName,
    hospitalId: payload.hospitalId,
    hospitalName: payload.hospitalName,
    requestDate: today,
    requestTimeISO,
    tests: payload.tests,
    status: "PENDING",
    priority: payload.priority,
    clinicalNotes: payload.clinicalNotes?.trim() || "",
  });

  return requestId;
}

export async function loadPendingLabRequests(hospitalId: string): Promise<LabRequest[]> {
  const requestsRef = collection(db, "lab_requests");
  const q = query(
    requestsRef,
    where("hospitalId", "==", hospitalId),
    where("status", "in", ["PENDING", "IN_PROGRESS"])
  );
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: data.requestId || d.id,
        patientId: data.patientId,
        patientName: data.patientName,
        doctorId: data.doctorId,
        doctorName: data.doctorName,
        hospitalId: data.hospitalId,
        hospitalName: data.hospitalName,
        requestDate: data.requestDate,
        requestTimeISO: data.requestTimeISO,
        tests: data.tests || [],
        status: data.status || "PENDING",
        priority: data.priority || "ROUTINE",
        clinicalNotes: data.clinicalNotes,
        labTechnicianId: data.labTechnicianId,
        labTechnicianName: data.labTechnicianName,
        completedAt: data.completedAt,
        results: data.results || [],
      };
    })
    .sort((a, b) => {
      // Sort by priority first, then by time
      const priorityOrder = { STAT: 0, URGENT: 1, ROUTINE: 2 };
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder];
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder];
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      return b.requestTimeISO.localeCompare(a.requestTimeISO);
    });
}

export async function findLabRequestByPatientId(patientId: string): Promise<LabRequest | null> {
  const requestsRef = collection(db, "lab_requests");
  const q = query(
    requestsRef,
    where("patientId", "==", patientId),
    where("status", "in", ["PENDING", "IN_PROGRESS"]),
    limit(1)
  );
  const snap = await getDocs(q);

  if (snap.empty) return null;

  const data = snap.docs[0].data() as any;
  return {
    id: data.requestId || snap.docs[0].id,
    patientId: data.patientId,
    patientName: data.patientName,
    doctorId: data.doctorId,
    doctorName: data.doctorName,
    hospitalId: data.hospitalId,
    hospitalName: data.hospitalName,
    requestDate: data.requestDate,
    requestTimeISO: data.requestTimeISO,
    tests: data.tests || [],
    status: data.status || "PENDING",
    priority: data.priority || "ROUTINE",
    clinicalNotes: data.clinicalNotes,
    labTechnicianId: data.labTechnicianId,
    labTechnicianName: data.labTechnicianName,
    completedAt: data.completedAt,
    results: data.results || [],
  };
}

export async function updateLabRequestStatus(
  requestId: string,
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  labTechnicianId?: string,
  labTechnicianName?: string
): Promise<void> {
  const updateData: any = { status };

  if (status === "IN_PROGRESS") {
    updateData.labTechnicianId = labTechnicianId;
    updateData.labTechnicianName = labTechnicianName;
  } else if (status === "COMPLETED") {
    updateData.completedAt = new Date().toISOString();
  }

  const requestsRef = collection(db, "lab_requests");
  const q = query(requestsRef, where("requestId", "==", requestId));
  const snap = await getDocs(q);

  if (!snap.empty) {
    const docRef = snap.docs[0].ref;
    await updateDoc(docRef, updateData);
  }
}

export async function addLabResults(
  requestId: string,
  results: LabResult[],
  labTechnicianId: string,
  labTechnicianName: string
): Promise<void> {
  const requestsRef = collection(db, "lab_requests");
  const q = query(requestsRef, where("requestId", "==", requestId));
  const snap = await getDocs(q);

  if (!snap.empty) {
    const docRef = snap.docs[0].ref;
    const requestData = snap.docs[0].data() as any;
    
    await updateDoc(docRef, {
      status: "COMPLETED",
      labTechnicianId,
      labTechnicianName,
      completedAt: new Date().toISOString(),
      results: results,
    });

    // Also save results as patient notes
    if (requestData.patientId && requestData.doctorId) {
      const resultsText = results
        .map(result => `${result.testName}: ${result.value}${result.unit ? ` ${result.unit}` : ""} (${result.status})${result.notes ? ` - ${result.notes}` : ""}`)
        .join("\n");
      
      await addDoc(collection(db, "patient_notes"), {
        patientId: requestData.patientId,
        hospitalId: requestData.hospitalId,
        doctorId: requestData.doctorId,
        doctorName: requestData.doctorName,
        title: `Lab Results - ${requestData.requestDate}`,
        note: `Tests requested: ${requestData.tests.map((t: LabTest) => t.testName).join(", ")}\n\nResults:\n${resultsText}`,
        createdAtISO: new Date().toISOString(),
      });
    }
  }
}

// Patient Account Functions
export async function getPatientAccount(patientId: string, hospitalId: string): Promise<PatientAccount | null> {
  const accountsRef = collection(db, "patient_accounts");
  const q = query(accountsRef, where("patientId", "==", patientId), where("hospitalId", "==", hospitalId));
  const snap = await getDocs(q);

  if (snap.empty) return null;

  const data = snap.docs[0].data() as any;
  return {
    id: data.id || snap.docs[0].id,
    patientId: data.patientId,
    hospitalId: data.hospitalId,
    hospitalName: data.hospitalName,
    balance: Number(data.balance || 0),
    currency: data.currency || "LSL",
    createdAtISO: data.createdAtISO,
    updatedAtISO: data.updatedAtISO,
  };
}

export async function createPatientAccount(patientId: string, hospitalId: string, hospitalName: string): Promise<PatientAccount> {
  const existingAccount = await getPatientAccount(patientId, hospitalId);
  if (existingAccount) {
    return existingAccount;
  }

  const accountId = `ACC-${patientId}-${hospitalId}`;
  const now = new Date().toISOString();

  const accountData: PatientAccount = {
    id: accountId,
    patientId,
    hospitalId,
    hospitalName,
    balance: 0,
    currency: "LSL",
    createdAtISO: now,
    updatedAtISO: now,
  };

  await setDoc(doc(db, "patient_accounts", accountId), accountData);
  return accountData;
}

export async function updatePatientBalance(
  patientId: string,
  hospitalId: string,
  amount: number,
  transactionType: "DEPOSIT" | "DEDUCTION"
): Promise<PatientAccount> {
  const account = await getPatientAccount(patientId, hospitalId);
  if (!account) {
    throw new Error("Patient account not found");
  }

  const newBalance = transactionType === "DEPOSIT" 
    ? account.balance + amount 
    : account.balance - amount;

  if (newBalance < 0) {
    throw new Error("Insufficient balance");
  }

  const updatedAccount = {
    ...account,
    balance: newBalance,
    updatedAtISO: new Date().toISOString(),
  };

  await updateDoc(doc(db, "patient_accounts", account.id), {
    balance: newBalance,
    updatedAtISO: updatedAccount.updatedAtISO,
  });

  return updatedAccount;
}

export async function createDepositTransaction(payload: {
  patientId: string;
  hospitalId: string;
  amount: number;
  currency: string;
  paymentMethod: "MPESA" | "ECOCASH";
  phone: string;
}): Promise<string> {
  const transactionId = `TXN-${Date.now()}`;
  const createdAtISO = new Date().toISOString();

  await addDoc(collection(db, "deposit_transactions"), {
    transactionId,
    patientId: payload.patientId,
    hospitalId: payload.hospitalId,
    amount: payload.amount,
    currency: payload.currency,
    paymentMethod: payload.paymentMethod,
    phone: payload.phone,
    status: "PENDING",
    createdAtISO,
  });

  return transactionId;
}

export async function updateDepositTransactionStatus(
  transactionId: string,
  status: "COMPLETED" | "FAILED"
): Promise<void> {
  const transactionsRef = collection(db, "deposit_transactions");
  const q = query(transactionsRef, where("transactionId", "==", transactionId));
  const snap = await getDocs(q);

  if (!snap.empty) {
    const docRef = snap.docs[0].ref;
    const updateData: any = { status };

    if (status === "COMPLETED") {
      updateData.completedAtISO = new Date().toISOString();
    }

    await updateDoc(docRef, updateData);
  }
}

export async function getPatientDepositHistory(patientId: string, hospitalId: string): Promise<DepositTransaction[]> {
  const transactionsRef = collection(db, "deposit_transactions");
  const q = query(transactionsRef, where("patientId", "==", patientId), where("hospitalId", "==", hospitalId));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        transactionId: data.transactionId,
        patientId: data.patientId,
        hospitalId: data.hospitalId,
        amount: Number(data.amount),
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        phone: data.phone,
        status: data.status,
        createdAtISO: data.createdAtISO,
        completedAtISO: data.completedAtISO,
      };
    })
    .sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO));
}

// Test payment APIs (for development)
export async function testMpesaPayment(phone: string, amount: number): Promise<{ success: boolean; transactionId: string }> {
  const response = await fetch("http://127.0.0.1:8001/payments/mpesa/stk-push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone,
      amount,
      account_reference: "HealthSphere",
      transaction_desc: "Patient payment",
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.detail || "MPESA payment request failed.");
  }

  return {
    success: Boolean(body.success),
    transactionId: body.transactionId || "",
  };
}

export async function testEcocashPayment(phone: string, amount: number): Promise<{ success: boolean; transactionId: string }> {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Simulate 85% success rate
  const success = Math.random() > 0.15;
  
  return {
    success,
    transactionId: success ? `ECO-${Date.now()}-${phone.slice(-4)}-${amount}` : "",
  };
}

// Billing Functions
export async function createConsultationBill(payload: {
  patientId: string;
  hospitalId: string;
  amount: number;
  currency: string;
  description: string;
}): Promise<string> {
  const billId = `BILL-${Date.now()}`;
  const createdAtISO = new Date().toISOString();

  await addDoc(collection(db, "consultation_bills"), {
    billId,
    patientId: payload.patientId,
    hospitalId: payload.hospitalId,
    amount: payload.amount,
    currency: payload.currency,
    description: payload.description,
    status: "PENDING",
    paidAmount: 0,
    createdAtISO,
  });

  return billId;
}

export async function getPatientBills(patientId: string, hospitalId: string): Promise<ConsultationBill[]> {
  const billsRef = collection(db, "consultation_bills");
  const q = query(billsRef, where("patientId", "==", patientId), where("hospitalId", "==", hospitalId));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        billId: data.billId,
        patientId: data.patientId,
        hospitalId: data.hospitalId,
        amount: Number(data.amount),
        currency: data.currency,
        description: data.description,
        status: data.status,
        paidAmount: Number(data.paidAmount),
        createdAtISO: data.createdAtISO,
        paidAtISO: data.paidAtISO,
        paymentMethod: data.paymentMethod,
        receptionistId: data.receptionistId,
        receptionistName: data.receptionistName,
      };
    })
    .sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO));
}

export async function getPatientBillsByPatient(patientId: string): Promise<ConsultationBill[]> {
  const billsRef = collection(db, "consultation_bills");
  const q = query(billsRef, where("patientId", "==", patientId));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        billId: data.billId,
        patientId: data.patientId,
        hospitalId: data.hospitalId,
        amount: Number(data.amount),
        currency: data.currency,
        description: data.description,
        status: data.status,
        paidAmount: Number(data.paidAmount),
        createdAtISO: data.createdAtISO,
        paidAtISO: data.paidAtISO,
        paymentMethod: data.paymentMethod,
        receptionistId: data.receptionistId,
        receptionistName: data.receptionistName,
      };
    })
    .sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO));
}

export async function payBillWithAccountBalance(
  billId: string,
  patientId: string,
  hospitalId: string,
  receptionistId: string,
  receptionistName: string
): Promise<void> {
  return await runTransaction(db, async (transaction) => {
    // Get the bill
    const billsRef = collection(db, "consultation_bills");
    const billQuery = query(billsRef, where("billId", "==", billId));
    const billSnap = await getDocs(billQuery);
    
    if (billSnap.empty) {
      throw new Error("Bill not found");
    }
    
    const billDoc = billSnap.docs[0];
    const bill = billDoc.data() as any;
    
    if (bill.status === "PAID") {
      throw new Error("Bill already paid");
    }
    
    // Get patient account
    const accountsRef = collection(db, "patient_accounts");
    const accountQuery = query(accountsRef, where("patientId", "==", patientId), where("hospitalId", "==", hospitalId));
    const accountSnap = await getDocs(accountQuery);
    
    if (accountSnap.empty) {
      throw new Error("Patient account not found");
    }
    
    const accountDoc = accountSnap.docs[0];
    const account = accountDoc.data() as any;
    
    const remainingAmount = bill.amount - bill.paidAmount;
    
    if (account.balance < remainingAmount) {
      throw new Error("Insufficient account balance");
    }
    
    // Update account balance
    const newBalance = account.balance - remainingAmount;
    transaction.update(accountDoc.ref, {
      balance: newBalance,
      updatedAtISO: new Date().toISOString(),
    });
    
    // Update bill status
    transaction.update(billDoc.ref, {
      status: "PAID",
      paidAmount: bill.amount,
      paidAtISO: new Date().toISOString(),
      paymentMethod: "ACCOUNT_BALANCE",
      receptionistId,
      receptionistName,
    });
  });
}

export async function payBillWithCash(
  billId: string,
  amount: number,
  receptionistId: string,
  receptionistName: string,
  paymentMethod: "CASH" | "MPESA" | "ECOCASH" = "CASH"
): Promise<void> {
  const billsRef = collection(db, "consultation_bills");
  const q = query(billsRef, where("billId", "==", billId));
  const snap = await getDocs(q);

  if (snap.empty) {
    throw new Error("Bill not found");
  }

  const billDoc = snap.docs[0];
  const bill = billDoc.data() as any;

  if (bill.status === "PAID") {
    throw new Error("Bill already paid");
  }

  const newPaidAmount = bill.paidAmount + amount;
  const newStatus = newPaidAmount >= bill.amount ? "PAID" : "PARTIAL";

  await updateDoc(billDoc.ref, {
    paidAmount: newPaidAmount,
    status: newStatus,
    paidAtISO: newStatus === "PAID" ? new Date().toISOString() : bill.paidAtISO,
    paymentMethod,
    receptionistId,
    receptionistName,
  });
}

export async function payBillWithAccountBalanceByPatient(
  billId: string,
  patientId: string,
  hospitalId: string
): Promise<void> {
  return await runTransaction(db, async (transaction) => {
    const billsRef = collection(db, "consultation_bills");
    const billQuery = query(billsRef, where("billId", "==", billId));
    const billSnap = await getDocs(billQuery);

    if (billSnap.empty) throw new Error("Bill not found");

    const billDoc = billSnap.docs[0];
    const bill = billDoc.data() as any;
    if (bill.status === "PAID") throw new Error("Bill already paid");

    const accountsRef = collection(db, "patient_accounts");
    const accountQuery = query(
      accountsRef,
      where("patientId", "==", patientId),
      where("hospitalId", "==", hospitalId)
    );
    const accountSnap = await getDocs(accountQuery);
    if (accountSnap.empty) throw new Error("Patient account not found");

    const accountDoc = accountSnap.docs[0];
    const account = accountDoc.data() as any;
    const remainingAmount = Number(bill.amount || 0) - Number(bill.paidAmount || 0);
    if (account.balance < remainingAmount) throw new Error("Insufficient account balance");

    transaction.update(accountDoc.ref, {
      balance: Number(account.balance) - remainingAmount,
      updatedAtISO: new Date().toISOString(),
    });

    transaction.update(billDoc.ref, {
      status: "PAID",
      paidAmount: Number(bill.amount || 0),
      paidAtISO: new Date().toISOString(),
      paymentMethod: "ACCOUNT_BALANCE",
      paidByPatientId: patientId,
      paidByRole: "PATIENT",
    });
  });
}

export async function payBillByPatient(
  billId: string,
  amount: number,
  patientId: string,
  paymentMethod: "MPESA" | "ECOCASH"
): Promise<void> {
  const billsRef = collection(db, "consultation_bills");
  const q = query(billsRef, where("billId", "==", billId));
  const snap = await getDocs(q);

  if (snap.empty) throw new Error("Bill not found");

  const billDoc = snap.docs[0];
  const bill = billDoc.data() as any;
  if (bill.status === "PAID") throw new Error("Bill already paid");

  const newPaidAmount = Number(bill.paidAmount || 0) + amount;
  const newStatus = newPaidAmount >= Number(bill.amount || 0) ? "PAID" : "PARTIAL";

  await updateDoc(billDoc.ref, {
    paidAmount: newPaidAmount,
    status: newStatus,
    paidAtISO: newStatus === "PAID" ? new Date().toISOString() : bill.paidAtISO,
    paymentMethod,
    paidByPatientId: patientId,
    paidByRole: "PATIENT",
  });
}
