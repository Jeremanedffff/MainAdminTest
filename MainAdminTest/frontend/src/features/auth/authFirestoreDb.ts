import {
  collection,
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

export type UserRole =
  | "MAIN_ADMIN"
  | "HOSPITAL_ADMIN"
  | "DOCTOR"
  | "PHARMACIST"
  | "RECEPTIONIST"
  | "LAB_STAFF"
  | "PATIENT";

export type DbUser = {
  role: UserRole;
  userId: string;
  fullName: string;
  email?: string;
  emailLower?: string;
  phone?: string;
  phoneNorm?: string;
  hospitalId?: string;
  hospitalName?: string;
  districtCode?: string;
  password: string;
  createdAtISO: string;
  status?: "ACTIVE" | "DISABLED";
};

export type HospitalOption = {
  hospitalId: string;
  hospitalCode: string;
  districtCode: string;
  name: string;
  location: string;
  status: "ACTIVE" | "DISABLED";
};

export type CountryCodeOption = {
  code: string;
  country: string;
  flag: string;
};

export type RegisterPatientPayload = {
  fullName: string;
  sex: "MALE" | "FEMALE";
  age: number;
  phone: string;
  email?: string;
  password: string;
  hospitalId: string;
  hospitalName: string;
  hospitalCode: string;
  districtCode: string;
};

export type PatientProfile = {
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

const USERS_COL = "users";
const PATIENTS_COL = "patients";
const COUNTERS_COL = "counters";
const HOSPITALS_COL = "hospitals";
const ADMIN_SETTINGS_DOC = "app_settings/main_admin";

const DEFAULT_COUNTRY_CODE_OPTIONS: CountryCodeOption[] = [
  { code: "+266", country: "Lesotho", flag: "🇱🇸" },
  { code: "+27", country: "South Africa", flag: "🇿🇦" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+1", country: "United States/Canada", flag: "🇺🇸" },
  { code: "+44", country: "United Kingdom", flag: "🇬🇧" },
];

export function normalizePhone(p: string) {
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

export function normalizeEmail(e: string) {
  return e.trim().toLowerCase();
}

export async function loadActiveHospitals(): Promise<HospitalOption[]> {
  const hospitalsRef = collection(db, HOSPITALS_COL);
  const snap = await getDocs(hospitalsRef);

  const rows: HospitalOption[] = snap.docs
    .map((d) => {
      const data = d.data() as any;

      return {
        hospitalId: data.hospitalId || d.id,
        hospitalCode: data.hospitalCode || "",
        districtCode: data.districtCode || "",
        name: data.name || "",
        location: data.location || "",
        status: (data.status || "ACTIVE") as "ACTIVE" | "DISABLED",
      };
    })
    .filter(
      (h) =>
        h.status === "ACTIVE" &&
        h.hospitalId &&
        h.hospitalCode &&
        h.districtCode &&
        h.name
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return rows;
}

export async function loadAllowedCountryCodes(): Promise<CountryCodeOption[]> {
  const snap = await getDoc(doc(db, ADMIN_SETTINGS_DOC));
  const savedCodes = snap.exists() ? ((snap.data() as any).allowedCountryCodes as string[] | undefined) : undefined;
  const codes = (savedCodes?.length ? savedCodes : DEFAULT_COUNTRY_CODE_OPTIONS.map((item) => item.code))
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => (code.startsWith("+") ? code : `+${code}`));

  return codes.map((code) => {
    const known = DEFAULT_COUNTRY_CODE_OPTIONS.find((item) => item.code === code);
    if (known) return known;

    return {
      code,
      country: "Custom",
      flag: "🌍",
    };
  });
}

export async function generatePatientId(
  districtCode: string,
  hospitalCode: string
): Promise<string> {
  const cleanDistrict = districtCode.trim().toUpperCase();
  const cleanHospital = hospitalCode.trim().toUpperCase();

  const counterId = `patient-${cleanDistrict}-${cleanHospital}`;
  const counterRef = doc(db, COUNTERS_COL, counterId);

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

  const num = String(next).padStart(4, "0");
  return `${cleanDistrict}-${cleanHospital}-${num}`;
}

export async function findUserByIdentifier(identifier: string): Promise<DbUser | null> {
  const id = identifier.trim();
  if (!id) return null;

  const emailLower = normalizeEmail(id);
  const phoneNorm = normalizePhone(id);
  const usersRef = collection(db, USERS_COL);

  {
    const q1 = query(usersRef, where("userId", "==", id), limit(1));
    const s1 = await getDocs(q1);
    if (!s1.empty) return s1.docs[0].data() as DbUser;
  }

  {
    const q2 = query(usersRef, where("emailLower", "==", emailLower), limit(1));
    const s2 = await getDocs(q2);
    if (!s2.empty) return s2.docs[0].data() as DbUser;
  }

  {
    const q3 = query(usersRef, where("phoneNorm", "==", phoneNorm), limit(1));
    const s3 = await getDocs(q3);
    if (!s3.empty) return s3.docs[0].data() as DbUser;
  }

  return null;
}

export async function loginFirestore(identifier: string, password: string): Promise<DbUser | null> {
  const u = await findUserByIdentifier(identifier);
  if (!u) return null;
  if ((u.status || "ACTIVE") !== "ACTIVE") return null;
  if ((u.password || "") !== password) return null;
  return u;
}

export async function changeUserPasswordFirestore(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const { userId, currentPassword, newPassword } = params;

  const snap = await getDoc(doc(db, USERS_COL, userId));
  if (!snap.exists()) {
    throw new Error("User account not found.");
  }

  const data = snap.data() as DbUser;

  if ((data.password || "") !== currentPassword) {
    throw new Error("Current password is incorrect.");
  }

  const cleanNew = newPassword.trim();
  if (cleanNew.length < 4) {
    throw new Error("New password must have at least 4 characters.");
  }

  await updateDoc(doc(db, USERS_COL, userId), {
    password: cleanNew,
  });
}

export async function registerPatientFirestore(payload: RegisterPatientPayload): Promise<DbUser> {
  const fullName = payload.fullName.trim();
  const phone = payload.phone.trim();
  const rawEmail = (payload.email || "").trim();
  const hasEmail = rawEmail.length > 0;
  const emailLower = hasEmail ? normalizeEmail(rawEmail) : "";
  const phoneNorm = normalizePhone(payload.phone);

  if (!fullName) throw new Error("Full name is required.");
  if (!phone) throw new Error("Phone is required.");
  assertValidPhoneNumber(phone);
  if (!payload.hospitalId) throw new Error("Hospital is required.");
  if (!payload.hospitalCode) throw new Error("Hospital code is missing.");
  if (!payload.districtCode) throw new Error("District code is missing.");

  if (hasEmail) {
    const existingEmail = await findUserByIdentifier(emailLower);
    if (existingEmail) throw new Error("This email is already registered.");
  }

  if (phoneNorm) {
    const usersRef = collection(db, USERS_COL);
    const qPhone = query(usersRef, where("phoneNorm", "==", phoneNorm), limit(1));
    const sPhone = await getDocs(qPhone);
    if (!sPhone.empty) throw new Error("This phone number is already registered.");
  }

  const patientId = await generatePatientId(payload.districtCode, payload.hospitalCode);
  const now = new Date().toISOString();

  const user: DbUser = {
    role: "PATIENT",
    userId: patientId,
    fullName,
    phone,
    phoneNorm,
    hospitalId: payload.hospitalId,
    hospitalName: payload.hospitalName,
    districtCode: payload.districtCode,
    password: payload.password,
    createdAtISO: now,
    status: "ACTIVE",
    ...(hasEmail
      ? {
          email: rawEmail,
          emailLower,
        }
      : {}),
  };

  const patientProfile: PatientProfile = {
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
    registeredBy: "SELF",
    createdAtISO: now,
    ...(hasEmail ? { email: rawEmail } : {}),
  };

  await setDoc(doc(db, USERS_COL, patientId), user, { merge: false });
  await setDoc(doc(db, PATIENTS_COL, patientId), patientProfile, { merge: false });

  return user;
}

export async function getPatientProfile(patientId: string): Promise<PatientProfile | null> {
  const snap = await getDoc(doc(db, PATIENTS_COL, patientId));
  if (!snap.exists()) return null;
  return snap.data() as PatientProfile;
}
