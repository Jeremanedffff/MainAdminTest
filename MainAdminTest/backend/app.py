from disease_predictor import DiseasePredictor
from google import genai
import hashlib
import json
import os
import re
import sys
from collections import Counter
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import traceback
import time
from dotenv import load_dotenv
from pathlib import Path

MPESA_SDK_DIR = Path(__file__).resolve().parent / "mpesa"
if str(MPESA_SDK_DIR) not in sys.path:
    sys.path.insert(0, str(MPESA_SDK_DIR))

from portalsdk import APIContext, APIMethodType, APIRequest

try:
    from custom_medical_ai import custom_ai
except ModuleNotFoundError as exc:
    custom_ai = None
    print(f"Custom Medical AI disabled: missing optional dependency {exc.name}")

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("ERROR: GEMINI_API_KEY is missing from .env file")

client = genai.Client(api_key=GEMINI_API_KEY)

# Initialize disease predictor
disease_predictor = DiseasePredictor()

# Initialize custom medical AI
if custom_ai is not None:
    print("Initializing Custom Medical AI...")
    custom_ai.initialize_models()
    custom_ai.load_models()  # Load pre-trained models if available
    print("Custom Medical AI initialized successfully!")


def _joined_note_text(notes: list[str]) -> str:
    return " ".join(str(note or "") for note in notes).lower()


def _extract_demographics_from_text(text: str) -> dict:
    demographics = {}

    age_match = re.search(r"\b(\d{1,3})\s*[-\s]?(?:year|yr)s?\s*old\b", text)
    if age_match:
        demographics["age"] = int(age_match.group(1))

    female_patterns = [
        r"\b(female|woman|girl|pregnant|pregnancy|breastfeeding|postpartum)\b",
        r"\b(she|her)\b",
    ]
    male_patterns = [
        r"\b(male|man|boy)\b",
        r"\b(he|his)\b",
    ]
    if any(re.search(pattern, text) for pattern in female_patterns):
        demographics["gender"] = "female"
    elif any(re.search(pattern, text) for pattern in male_patterns):
        demographics["gender"] = "male"

    if re.search(r"\b(pregnant|pregnancy|gestation|antenatal|postpartum|breastfeeding)\b", text):
        demographics["pregnancy_relevant"] = True

    return demographics


def _normalize_demographics(value: dict | None) -> dict:
    demographics = {}
    if not isinstance(value, dict):
        return demographics

    age = value.get("age")
    try:
        if age not in (None, ""):
            demographics["age"] = int(age)
    except (TypeError, ValueError):
        pass

    raw_gender = str(value.get("gender") or value.get("sex") or "").strip().lower()
    if raw_gender in {"m", "male"}:
        demographics["gender"] = "male"
    elif raw_gender in {"f", "female"}:
        demographics["gender"] = "female"
    elif raw_gender in {"other", "unknown"}:
        demographics["gender"] = raw_gender

    if value.get("pregnancy_relevant") is True:
        demographics["pregnancy_relevant"] = True

    return demographics


def _merge_demographics(extracted: dict, supplied: dict | None) -> dict:
    merged = dict(extracted or {})
    supplied_normalized = _normalize_demographics(supplied)
    if supplied_normalized:
        merged.update(supplied_normalized)
    if merged.get("gender") == "male" and not supplied_normalized.get("pregnancy_relevant"):
        merged.pop("pregnancy_relevant", None)
    return merged


def _patient_profile_context(demographics: dict | None) -> str:
    demographics = demographics or {}
    parts = []
    if demographics.get("age") is not None:
        parts.append(f"age {demographics['age']}")
    if demographics.get("gender"):
        parts.append(f"sex {demographics['gender']}")
    if demographics.get("pregnancy_relevant"):
        parts.append("pregnancy/breastfeeding clinically relevant")
    return f"Patient profile from database: {', '.join(parts)}." if parts else ""


def _note_fingerprint(notes: list[str]) -> str:
    cleaned = "\n".join(re.sub(r"\s+", " ", str(note or "")).strip().lower() for note in notes)
    return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()[:12]


class SummaryRequest(BaseModel):
    patient_id: str
    notes: list[str]
    demographics: Optional[dict] = None


class MedicationRecommendationRequest(SummaryRequest):
    question: Optional[str] = None


class DoctorDecisionFeedbackRequest(SummaryRequest):
    doctor_id: str
    diagnosis: Optional[str] = None
    treatments: list[dict] = Field(default_factory=list)
    treatment_notes: Optional[str] = None
    prescription_id: Optional[str] = None
    auto_retrain: bool = False


class MpesaStkPushRequest(BaseModel):
    phone: str
    amount: float
    account_reference: str
    transaction_desc: str


def _extract_retry_delay_seconds(error_text: str) -> int | None:
    match = re.search(r"retry in\s+([0-9]+(?:\.[0-9]+)?)s?", error_text, re.IGNORECASE)
    if not match:
        return None

    try:
        return max(1, round(float(match.group(1))))
    except Exception:
        return None


DEFAULT_VODACOM_MPESA_PUBLIC_KEY = (
    "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArv9yxA69XQKBo24BaF/"
    "D+fvlqmGdYjqLQ5WtNBb5tquqGvAvG3WMFETVUSow/LizQalxj2ElMVrUmzu5mGGkxK08bWEXF7a1DEvtVJs6nppIlFJc2SnrU14AOrIrB28ogm58JjAl5BOQawOXD5dfSk7MaAA82pVHoIqEu0FxA8BOKU+RGTihRU+ptw1j4bsAJYiPbSX6i71gfPvwHPYamM0bfI4CmlsUUR3KvCG24rB6FNPcRBhM3jDuv8ae2kC33w9hEq8qNB55uw51vK7hyXoAa+U7IqP1y6nBdlN25gkxEA8yrsl1678cspeXr+3ciRyqoRgj9RD/ONbJhhxFvt1cLBh+qwK2eqISfBb06eRnNeC71oBokDm3zyCnkOtMDGl7IvnMfZfEPFCfg5QgJVk1msPpRvQxmEsrX9MQRyFVzgy2CWNIb7c+jPapyrNwoUbANlN8adU1m6yOuoX7F49x+OjiG2se0EJ6nafeKUXw/+hiJZvELUYgzKUtMAZVTNZfT8jjb58j8GVtuS+6TM2AutbejaCV84ZK58E2CRJqhmjQibEUO6KPdD7oTlEkFy52Y1uOOBXgYpqMzufNPmfdqqqSM4dU70PO8ogyKGiLAIxCetMjjm6FCMEA3Kc8K0Ig7/XtFm9By6VxTJK1Mg36TlHaZKP6VzVLXMtesJECAwEAAQ=="
)
DEFAULT_VODACOM_MPESA_API_KEY = "FluXLiIjxkHyC2CNMoE62d4khqvhwZwY"


def require_vodacom_mpesa_config() -> dict[str, str]:
    config = {
        "api_key": os.getenv("VODACOM_MPESA_API_KEY", DEFAULT_VODACOM_MPESA_API_KEY).strip(),
        "public_key": os.getenv("VODACOM_MPESA_PUBLIC_KEY", DEFAULT_VODACOM_MPESA_PUBLIC_KEY).strip(),
        "service_provider_code": os.getenv("VODACOM_MPESA_SERVICE_PROVIDER_CODE", "000000").strip(),
        "address": os.getenv("VODACOM_MPESA_ADDRESS", "openapi.m-pesa.com").strip(),
        "country": os.getenv("VODACOM_MPESA_COUNTRY", "LES").strip(),
        "currency": os.getenv("VODACOM_MPESA_CURRENCY", "LSL").strip(),
        "session_path": os.getenv("VODACOM_MPESA_SESSION_PATH", "/sandbox/ipg/v2/vodacomLES/getSession/").strip(),
        "payment_path": os.getenv("VODACOM_MPESA_PAYMENT_PATH", "/sandbox/ipg/v2/vodacomLES/c2bPayment/singleStage/").strip(),
    }

    missing = [key for key, value in config.items() if not value]
    if missing:
        raise HTTPException(
            status_code=500,
            detail="Vodacom Lesotho MPESA is not fully configured. Missing: " + ", ".join(missing),
        )

    return config


def normalize_lesotho_mpesa_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())

    if digits.startswith("266") and len(digits) == 11:
        return digits
    if len(digits) == 8:
        return "266" + digits
    if digits.startswith("0") and len(digits) == 9:
        return "266" + digits[1:]

    raise HTTPException(
        status_code=400,
        detail="Phone number must be a valid Lesotho MPESA number like 5XXXXXXX or 2665XXXXXXX.",
    )


def make_vodacom_safe_reference(reference: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9]", "", reference or "")
    if not safe:
        safe = f"HS{int(time.time())}"
    return safe[:20]


def make_vodacom_mpesa_context(config: dict[str, str], method_type: APIMethodType, path: str, api_key: str | None = None) -> APIContext:
    api_context = APIContext()
    api_context.api_key = api_key or config["api_key"]
    api_context.public_key = config["public_key"]
    api_context.ssl = True
    api_context.method_type = method_type
    api_context.address = config["address"]
    api_context.port = 443
    api_context.path = path
    api_context.add_header("Origin", "*")
    return api_context


def execute_vodacom_mpesa_request(api_context: APIContext, action: str):
    result = APIRequest(api_context).execute()
    if result is None:
        raise HTTPException(status_code=502, detail=f"Vodacom MPESA {action} call failed.")
    if result.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Vodacom MPESA {action} failed: {result.body}",
        )
    return result


@app.get("/")
def root():
    return {"message": "Gemini backend is running"}

@app.get("/ai/disease-model/status")
def disease_model_status():
    return disease_predictor.status()


@app.post("/ai/disease-model/retrain")
def retrain_disease_model():
    return disease_predictor.retrain()


@app.post("/ai/doctor-decision-feedback")
def doctor_decision_feedback(data: DoctorDecisionFeedbackRequest):
    try:
        if not data.patient_id:
            raise HTTPException(status_code=400, detail="Patient ID is required")
        if not data.doctor_id:
            raise HTTPException(status_code=400, detail="Doctor ID is required")
        if not data.notes:
            raise HTTPException(status_code=400, detail="Patient notes are required")
        if not data.treatments and not (data.treatment_notes or "").strip():
            raise HTTPException(status_code=400, detail="At least one doctor treatment decision is required")

        analysis_notes, note_scope = _prepare_notes_for_fast_summary(data.notes)
        supplied_demographics = _normalize_demographics(data.demographics)
        profile_context = _patient_profile_context(supplied_demographics)
        if profile_context:
            analysis_notes = [profile_context] + analysis_notes
        diagnosis = (data.diagnosis or "").strip()

        if not diagnosis:
            medical_entities = _extract_medical_entities(analysis_notes)
            medical_entities["demographics"] = _merge_demographics(
                medical_entities.get("demographics", {}),
                data.demographics,
            )
            prediction_result = disease_predictor.predict_diseases(
                symptoms=medical_entities.get("symptoms", []),
                vital_signs=medical_entities.get("vital_signs", {}),
                risk_factors=medical_entities.get("risk_factors", []),
                demographics=medical_entities.get("demographics", {}),
                notes=analysis_notes,
            )
            predictions = prediction_result.get("predictions", [])
            if predictions:
                diagnosis = predictions[0].get("disease", "")

        if not diagnosis:
            raise HTTPException(
                status_code=400,
                detail="Diagnosis could not be inferred. Send a confirmed diagnosis with the doctor decision feedback.",
            )

        result = disease_predictor.record_doctor_decision(
            patient_id=data.patient_id,
            doctor_id=data.doctor_id,
            notes=analysis_notes,
            diagnosis=diagnosis,
            treatments=data.treatments,
            treatment_notes=data.treatment_notes or "",
            prescription_id=data.prescription_id or "",
        )
        result["diagnosis_used_for_training"] = diagnosis
        result["note_scope"] = note_scope
        if data.auto_retrain:
            result["retrain"] = disease_predictor.retrain()
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as e:
        print("DOCTOR DECISION FEEDBACK ERROR:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/payments/mpesa/config-status")
def mpesa_config_status():
    config = require_vodacom_mpesa_config()
    return {
        "configured": True,
        "provider": "vodacom-lesotho",
        "country": config["country"],
        "currency": config["currency"],
        "serviceProviderCode": config["service_provider_code"],
    }


@app.post("/payments/mpesa/stk-push")
def mpesa_stk_push(data: MpesaStkPushRequest):
    config = require_vodacom_mpesa_config()
    phone = normalize_lesotho_mpesa_phone(data.phone)
    amount = max(1, int(round(data.amount)))

    session_context = make_vodacom_mpesa_context(
        config,
        APIMethodType.GET,
        config["session_path"],
    )
    session_result = execute_vodacom_mpesa_request(session_context, "session")
    session_id = session_result.body.get("output_SessionID")
    if not session_id:
        raise HTTPException(
            status_code=502,
            detail=f"Vodacom MPESA session response did not include output_SessionID: {session_result.body}",
        )

    session_wait_seconds = int(os.getenv("VODACOM_MPESA_SESSION_WAIT_SECONDS", "30"))
    if session_wait_seconds > 0:
        time.sleep(session_wait_seconds)

    transaction_reference = make_vodacom_safe_reference(data.account_reference)
    conversation_id = f"HS{int(time.time() * 1000)}"
    description = data.transaction_desc[:40] or "HealthSphere"

    payment_context = make_vodacom_mpesa_context(
        config,
        APIMethodType.POST,
        config["payment_path"],
        api_key=session_id,
    )
    payment_context.add_parameter("input_Amount", str(amount))
    payment_context.add_parameter("input_Country", config["country"])
    payment_context.add_parameter("input_Currency", config["currency"])
    payment_context.add_parameter("input_CustomerMSISDN", phone)
    payment_context.add_parameter("input_ServiceProviderCode", config["service_provider_code"])
    payment_context.add_parameter("input_ThirdPartyConversationID", conversation_id)
    payment_context.add_parameter("input_TransactionReference", transaction_reference)
    payment_context.add_parameter("input_PurchasedItemsDesc", description)

    payment_result = execute_vodacom_mpesa_request(payment_context, "payment")
    body = payment_result.body

    return {
        "success": True,
        "provider": "vodacom-lesotho",
        "transactionId": body.get("output_TransactionID", transaction_reference),
        "merchantRequestId": body.get("output_ConversationID", conversation_id),
        "customerMessage": body.get("output_ResponseDesc", "MPESA phone prompt sent."),
        "raw": body,
    }


def _extract_medical_entities_simple(notes: list[str]) -> dict:
    """Extract symptoms, medications, vital signs from patient notes using simple pattern matching"""
    joined_notes = _joined_note_text(notes)
    
    # Common symptom keywords normalized for the local disease model
    symptoms = []
    symptom_mapping = {
        "cough": "cough",
        "persistent cough": "persistent_cough",
        "paroxysmal cough": "paroxysmal_cough",
        "barking cough": "barking_cough",
        "dry cough": "dry_cough",
        "fever": "fever",
        "headache": "headache",
        "chest pain": "chest_pain",
        "shortness of breath": "shortness_of_breath",
        "difficulty breathing": "shortness_of_breath",
        "breathlessness": "shortness_of_breath",
        "nausea": "nausea",
        "vomiting": "vomiting",
        "diarrhea": "diarrhea",
        "abdominal pain": "abdominal_pain",
        "fatigue": "fatigue",
        "weakness": "fatigue",
        "dizziness": "dizziness",
        "sore throat": "sore_throat",
        "runny nose": "runny_nose",
        "congestion": "nasal_congestion",
        "body aches": "body_aches",
        "body pain": "body_aches",
        "chills": "chills",
        "sweating": "sweating",
        "night sweats": "night_sweats",
        "palpitations": "palpitations",
        "swelling": "swelling",
        "rash": "rash",
        "itching": "itching",
        "constipation": "constipation",
        "loss of appetite": "loss_of_appetite",
        "weight loss": "weight_loss",
        "wheezing": "wheezing",
        "chest discomfort": "chest_discomfort",
        "increased sputum": "increased_sputum",
        "sudden chest pain": "sudden_chest_pain",
        "progressive dyspnoea": "progressive_dyspnoea",
        "witnessed apnea": "witnessed_apnea",
        "morning headache": "morning_headache",
        "hemoptysis": "hemoptysis",
        "maculopapular rash": "maculopapular_rash",
        "red eyes": "red_eyes",
        "loss of taste smell": "loss_of_taste_smell",
        "loss of taste/smell": "loss_of_taste_smell",
        "loss of taste or smell": "loss_of_taste_smell",
        "whooping sound": "whooping_sound",
        "post tussive vomiting": "post_tussive_vomiting",
        "neck swelling": "neck_swelling",
        "stridor": "stridor",
        "bilateral hilar lymphadenopathy": "bilateral_hilar_lymphadenopathy",
        "bilateral crackles": "bilateral_crackles",
        "snoring": "snoring"
    }
    
    for text_symptom, normalized_symptom in symptom_mapping.items():
        if text_symptom in joined_notes:
            symptoms.append(normalized_symptom)
    
    # Medication extraction
    medications = []
    medication_keywords = [
        "lisinopril", "azithromycin", "paracetamol", "ibuprofen", "amoxicillin", "aspirin",
        "metformin", "insulin", "atorvastatin", "hydrochlorothiazide", "metoprolol"
    ]
    
    for med in medication_keywords:
        if med in joined_notes:
            medications.append(med)
    
    # Vital signs extraction
    vital_signs = {}
    import re
    
    # Temperature
    temp_match = re.search(r'temperature\s*(\d+\.?\d*)\s*[°c]?c?', joined_notes)
    if temp_match:
        vital_signs["temperature_c"] = float(temp_match.group(1))
    
    # Heart rate
    hr_match = re.search(r'(?:heart rate|pulse|hr)\s*(\d+)', joined_notes)
    if hr_match:
        vital_signs["heart_rate"] = float(hr_match.group(1))
    
    # Blood pressure
    bp_match = re.search(r'(?:blood pressure|bp)\s*(\d+)\s*/\s*(\d+)', joined_notes)
    if bp_match:
        vital_signs["blood_pressure_systolic"] = float(bp_match.group(1))
        vital_signs["blood_pressure_diastolic"] = float(bp_match.group(2))
    
    # Respiratory rate
    rr_match = re.search(r'(?:respiratory rate|rr)\s*(\d+)', joined_notes)
    if rr_match:
        vital_signs["respiratory_rate"] = float(rr_match.group(1))
    
    # Oxygen saturation
    o2_match = re.search(r'(?:oxygen\s*saturation|spo2|o2\s*sat)\s*(\d+)', joined_notes)
    if o2_match:
        vital_signs["oxygen_saturation"] = float(o2_match.group(1))
    
    # Risk factors
    risk_factors = []
    risk_keywords = [
        "smoking", "smoker", "hypertension", "diabetes", "obesity", "alcohol", "family history",
        "heart disease", "kidney disease", "liver disease", "asthma", "copd"
    ]
    
    for risk in risk_keywords:
        if risk in joined_notes:
            risk_factors.append(risk.replace(" ", "_"))
    
    demographics = _extract_demographics_from_text(joined_notes)
    
    return {
        "symptoms": symptoms,
        "medications": medications,
        "vital_signs": vital_signs,
        "risk_factors": risk_factors,
        "demographics": demographics
    }

def _extract_medical_entities(notes: list[str]) -> dict:
    """Extract symptoms, medications, vital signs from patient notes.

    The doctor dashboard needs a fast, predictable short summary. By default we
    use the local extractor and avoid waiting on an external Gemini request.
    Set USE_GEMINI_EXTRACTION=true only when richer extraction is worth the
    extra latency.
    """
    use_gemini = os.getenv("USE_GEMINI_EXTRACTION", "false").strip().lower() == "true"
    if not use_gemini or not GEMINI_API_KEY or len(notes) > 40:
        entities = _extract_medical_entities_simple(notes)
        entities["clinical_summary"] = (
            f"Fast local review from {len(notes)} record(s). "
            "Symptoms, medications, vitals, risk factors, and demographics were extracted locally."
        )
        entities["severity_assessment"] = _assess_severity(entities)
        return entities

    joined_notes = "\n\n".join(notes)
    
    try:
        prompt = f"""
You are a comprehensive medical information extraction and analysis assistant. Analyze the patient notes thoroughly and extract detailed medical information.

Required JSON format:
{{
    "symptoms": ["symptom1", "symptom2", ...],
    "medications": ["medication1", "medication2", ...],
    "vital_signs": {{
        "temperature_c": number,
        "heart_rate": number,
        "blood_pressure_systolic": number,
        "blood_pressure_diastolic": number,
        "respiratory_rate": number,
        "oxygen_saturation": number
    }},
    "risk_factors": ["risk1", "risk2", ...],
    "demographics": {{
        "age": number,
        "gender": "male/female/other"
    }},
    "clinical_summary": "brief clinical impression of the patient's condition",
    "severity_assessment": "mild/moderate/severe based on symptoms and vitals"
}}

Extraction Rules:
- Extract ALL symptoms mentioned across all notes (not just first few)
- Identify medication patterns and frequency of administration
- Analyze vital sign trends and abnormalities
- Look for chronic conditions vs acute presentations
- Assess severity based on clinical presentation
- Note any treatment response patterns
- Identify potential medication interactions or side effects
- Consider age-appropriate findings

Clinical Analysis Guidelines:
- For symptoms: Include onset, duration, severity if mentioned
- For medications: Note chronic vs acute administration
- For vital signs: Identify trends and concerning values
- For risk factors: Include lifestyle and medical history factors
- For demographics: Consider age-related clinical implications

Patient Notes ({len(notes)} total notes):
{joined_notes}

Generate a comprehensive medical analysis that would be useful for creating a detailed clinical summary.
"""

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )

        text = (response.text or "").strip()
        try:
            entities = json.loads(text)
            local_demographics = _extract_demographics_from_text(_joined_note_text(notes))
            entities.setdefault("demographics", {})
            entities["demographics"].update(local_demographics)
            return entities
        except:
            return _extract_medical_entities_simple(notes)
    except:
        return _extract_medical_entities_simple(notes)


def _prepare_notes_for_fast_summary(notes: list[str]) -> tuple[list[str], dict]:
    """Bound long histories so summaries stay quick and short."""
    max_notes = int(os.getenv("AI_SUMMARY_MAX_NOTES", "40"))
    max_note_chars = int(os.getenv("AI_SUMMARY_MAX_NOTE_CHARS", "1200"))
    max_total_chars = int(os.getenv("AI_SUMMARY_MAX_TOTAL_CHARS", "24000"))

    cleaned_notes = [str(note or "").strip() for note in notes if str(note or "").strip()]
    original_count = len(cleaned_notes)

    if original_count > max_notes:
        half = max_notes // 2
        selected_notes = cleaned_notes[:half] + cleaned_notes[-(max_notes - half):]
    else:
        selected_notes = cleaned_notes

    trimmed_notes: list[str] = []
    total_chars = 0
    for note in selected_notes:
        compact_note = re.sub(r"\s+", " ", note).strip()
        if len(compact_note) > max_note_chars:
            compact_note = compact_note[:max_note_chars].rstrip() + "..."

        remaining = max_total_chars - total_chars
        if remaining <= 0:
            break
        if len(compact_note) > remaining:
            compact_note = compact_note[:remaining].rstrip() + "..."

        trimmed_notes.append(compact_note)
        total_chars += len(compact_note)

    return trimmed_notes, {
        "original_count": original_count,
        "analyzed_count": len(trimmed_notes),
        "truncated": original_count != len(trimmed_notes) or any(
            len(str(original)) > max_note_chars for original in selected_notes
        ),
    }


def _assess_severity(medical_entities: dict) -> str:
    symptoms = set(medical_entities.get("symptoms", []))
    vitals = medical_entities.get("vital_signs", {})
    urgent_symptoms = {"chest_pain", "shortness_of_breath", "hemoptysis", "stridor"}

    if (
        vitals.get("oxygen_saturation", 100) < 90
        or vitals.get("temperature_c", 0) > 39.5
        or vitals.get("heart_rate", 0) > 130
        or symptoms.intersection(urgent_symptoms)
    ):
        return "severe"
    if len(symptoms) >= 4 or vitals.get("temperature_c", 0) > 38 or vitals.get("oxygen_saturation", 100) < 95:
        return "moderate"
    return "mild"


def _merge_prediction_lists(*prediction_lists: list[dict], limit: int = 10) -> list[dict]:
    merged: dict[str, dict] = {}

    for predictions in prediction_lists:
        for pred in predictions or []:
            disease = str(pred.get("disease", "")).strip()
            if not disease:
                continue
            key = disease.lower().replace(" ", "_")
            normalized = pred.copy()
            normalized["disease"] = disease
            normalized["confidence"] = float(normalized.get("confidence", 0) or 0)

            if key not in merged or normalized["confidence"] > merged[key].get("confidence", 0):
                merged[key] = normalized
            else:
                existing_sources = merged[key].get("model_source", "")
                new_source = normalized.get("model_source", "")
                if new_source and new_source not in existing_sources:
                    merged[key]["model_source"] = ", ".join(filter(None, [existing_sources, new_source]))

    ranked = sorted(merged.values(), key=lambda item: item.get("confidence", 0), reverse=True)
    return ranked[:limit]


def _count_terms_in_notes(notes: list[str], terms: list[str]) -> list[dict]:
    counts = Counter()
    lowered_notes = [note.lower() for note in notes]

    for term in terms:
        readable = str(term).replace("_", " ").lower()
        if not readable:
            continue
        count = sum(1 for note in lowered_notes if readable in note)
        if count:
            counts[term] = count

    return [
        {"name": term.replace("_", " ").title(), "count": count}
        for term, count in counts.most_common(8)
    ]


def _clean_summary_text(value: object, max_chars: int = 180) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"^(CRITICAL|URGENT|ALERT|WARNING|MONITORING REQUIRED|IMMEDIATE ACTION REQUIRED)\s*:\s*", "", text, flags=re.IGNORECASE)
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0].rstrip(" .,:;") + "."
    return text


def _presentation_safe_text(value: object, fallback: str = "") -> str:
    text = _clean_summary_text(value, 220)
    blocked_phrases = [
        "use this row for disease-prediction training",
        "until disease-specific guideline treatment",
        "treatment_text_requires",
        "patient_reported_not_prescribing_guidance",
        "source_notes",
        "dataset completeness",
    ]
    if not text or any(phrase in text.lower() for phrase in blocked_phrases):
        return fallback
    return text


def _compact_summary_list(items: object, limit: int = 4, max_chars: int = 150) -> list:
    if not isinstance(items, list):
        return []

    compact = []
    for item in items:
        if isinstance(item, dict):
            cleaned = item.copy()
            for key, value in list(cleaned.items()):
                if isinstance(value, str):
                    cleaned[key] = _clean_summary_text(value, max_chars)
            compact.append(cleaned)
        else:
            text = _clean_summary_text(item, max_chars)
            if text:
                compact.append(text)

        if len(compact) >= limit:
            break

    return compact


def _short_patient_overview(notes: list[str], medical_entities: dict, predictions: list[dict]) -> str:
    total_notes = len(notes)
    symptoms = [str(symptom).replace("_", " ").title() for symptom in medical_entities.get("symptoms", [])[:5]]
    medications = medical_entities.get("medications", [])[:4]
    vitals = medical_entities.get("vital_signs", {})
    demographics = medical_entities.get("demographics", {})

    parts = []
    age = demographics.get("age")
    gender = demographics.get("gender")
    if age or gender:
        demo = " ".join(str(value).title() for value in [age, gender] if value)
        parts.append(f"{demo} patient reviewed across {total_notes} record(s).")
    else:
        parts.append(f"Patient reviewed across {total_notes} record(s).")

    if symptoms:
        parts.append(f"Main recurring symptoms: {', '.join(symptoms)}.")
    vital_flags = []
    if vitals.get("temperature_c", 0) > 37.5:
        vital_flags.append(f"temperature {vitals['temperature_c']} C")
    if vitals.get("heart_rate", 0) > 100:
        vital_flags.append(f"heart rate {vitals['heart_rate']} bpm")
    if vitals.get("oxygen_saturation", 100) < 95:
        vital_flags.append(f"oxygen saturation {vitals['oxygen_saturation']}%")
    if vital_flags:
        parts.append(f"Notable vitals: {', '.join(vital_flags)}.")

    if medications:
        parts.append(f"Current/recent medications noted: {', '.join(medications)}.")

    return " ".join(parts)


def _condition_mentions_in_notes(notes: list[str], condition: str) -> int:
    readable = str(condition or "").replace("_", " ").strip().lower()
    if not readable:
        return 0

    words = [word for word in re.findall(r"[a-z0-9]+", readable) if len(word) > 2]
    count = 0
    for note in notes:
        lowered = str(note or "").lower()
        if readable in lowered or readable.replace(" ", "_") in lowered:
            count += 1
            continue
        if words and all(word in lowered for word in words[:3]):
            count += 1
            continue
        diagnosis_match = re.search(r"(?:diagnosis|provisional diagnosis|assessment)\s*:\s*([^\n.]+)", lowered)
        if diagnosis_match and any(word in diagnosis_match.group(1) for word in words[:2]):
            count += 1

    return count


def _build_main_condition_summary(notes: list[str], medical_entities: dict, predictions: list[dict]) -> list[dict]:
    symptoms = [str(symptom or "").replace("_", " ").title() for symptom in medical_entities.get("symptoms", [])]
    repeated_symptoms = _count_terms_in_notes(notes, medical_entities.get("symptoms", []))[:4]
    recurring_symptom_names = [
        str(item.get("name", "")).replace("_", " ").title()
        for item in repeated_symptoms
        if isinstance(item, dict) and item.get("name")
    ] or symptoms[:4]

    candidates: dict[str, dict] = {}
    for prediction in predictions[:8]:
        disease = str(prediction.get("disease", "")).replace("_", " ").title().strip()
        if not disease:
            continue

        mentions = _condition_mentions_in_notes(notes, disease)
        confidence = float(prediction.get("confidence", 0) or 0)
        symptom_support = len(recurring_symptom_names)
        score = confidence + (mentions * 0.2) + (symptom_support * 0.03)
        candidates[disease.lower()] = {
            "name": disease,
            "count": mentions,
            "confidence": round(confidence, 3),
            "score": score,
            "comment": (
                f"Compared across {len(notes)} patient record(s); "
                f"{'documented directly in ' + str(mentions) + ' record(s)' if mentions else 'supported by the current symptom pattern'}"
                f"{' with recurring symptoms: ' + ', '.join(recurring_symptom_names[:3]) if recurring_symptom_names else ''}."
            ),
        }

    diagnosis_patterns = [
        r"(?:diagnosis|provisional diagnosis|assessment)\s*:\s*([^\n.]+)",
        r"(?:main condition|primary condition)\s*:\s*([^\n.]+)",
    ]
    joined = "\n".join(str(note or "") for note in notes)
    for pattern in diagnosis_patterns:
        for match in re.finditer(pattern, joined, flags=re.IGNORECASE):
            disease = _clean_summary_text(match.group(1), 80).strip(" .,:;")
            if not disease:
                continue
            key = disease.lower()
            existing = candidates.get(key)
            mentions = _condition_mentions_in_notes(notes, disease)
            if existing:
                existing["count"] = max(existing["count"], mentions)
                existing["score"] += 0.35
                existing["comment"] = f"Doctor assessment/diagnosis appears in the compared patient notes; reviewed across {len(notes)} record(s)."
            else:
                candidates[key] = {
                    "name": disease.title(),
                    "count": mentions,
                    "confidence": 0,
                    "score": 0.35 + (mentions * 0.2),
                    "comment": f"Doctor assessment/diagnosis appears in the compared patient notes; reviewed across {len(notes)} record(s).",
                }

    ranked = sorted(candidates.values(), key=lambda item: item["score"], reverse=True)
    return [
        {
            "name": item["name"],
            "count": item["count"],
            "comment": item["comment"],
        }
        for item in ranked[:3]
    ]


def _make_summary_concise(summary: dict, notes: list[str], medical_entities: dict, predictions: list[dict]) -> dict:
    concise = summary.copy()
    symptoms = medical_entities.get("symptoms", [])
    medications = medical_entities.get("medications", [])
    total_notes = len(notes)

    concise["patient_overview"] = _short_patient_overview(notes, medical_entities, predictions)
    compared_main_conditions = _build_main_condition_summary(notes, medical_entities, predictions)
    concise["main_conditions"] = compared_main_conditions or _compact_summary_list(concise.get("main_conditions"), 3)
    concise["current_or_recent_medications"] = medications[:5]
    concise["repeated_symptoms"] = _count_terms_in_notes(notes, symptoms)[:5] or symptoms[:5]
    concise["repeated_medications"] = _count_terms_in_notes(notes, medications)[:5] or medications[:5]
    concise.pop("disease_predictions", None)
    concise["clinical_complexity"] = "high" if total_notes > 50 else "moderate" if total_notes > 20 else "low"
    concise["data_completeness"] = f"{total_notes} patient record(s) reviewed into a short valid summary."

    concise["possible_non_response_flags"] = _compact_summary_list(concise.get("possible_non_response_flags"), 3)
    concise["important_tests_already_done_or_ordered"] = _compact_summary_list(concise.get("important_tests_already_done_or_ordered"), 4)
    concise["doctor_attention_points"] = _compact_summary_list(concise.get("doctor_attention_points"), 4)
    concise["recommendations"] = _compact_summary_list(concise.get("recommendations"), 3)
    concise["red_flags"] = []

    if "clinician_review_note" not in concise:
        concise["clinician_review_note"] = "Short clinical summary generated from this patient's notes only."

    return concise


def _title_case_medication(value: str) -> str:
    cleaned = str(value or "").replace("_", " ").strip()
    return " ".join(part.capitalize() for part in cleaned.split())


def _clinical_prediction_explanation(prediction: dict) -> str:
    disease = str(prediction.get("disease", "")).replace("_", " ").title() or "the predicted condition"
    raw = _presentation_safe_text(prediction.get("explanation", ""), "")
    lowered = raw.lower()
    blocked_phrases = [
        "linearsvc",
        "trained on",
        "cleaned disease",
        "cleaned data",
        "model_source",
        "treatment status",
        "category based",
        "category-based",
        "clinician review",
    ]
    if raw and not any(phrase in lowered for phrase in blocked_phrases):
        return raw
    return f"The patient notes fit {disease} based on the recorded symptoms, clinical context, and recent history."


def _public_prediction(prediction: dict) -> dict:
    disease = str(prediction.get("disease", "")).replace("_", " ").title()
    return {
        "disease": disease,
        "confidence": round(float(prediction.get("confidence", 0) or 0), 3),
        "explanation": _clinical_prediction_explanation(prediction),
        "urgency": str(prediction.get("urgency", "review")).lower(),
        "supporting_evidence": _presentation_safe_text(
            prediction.get("supporting_evidence", ""),
            f"Clinical pattern supports review for {disease}."
        ),
    }


def _extract_allergy_flags(notes: list[str]) -> list[str]:
    joined = " ".join(notes).lower()
    flags = []
    allergy_patterns = [
        r"allerg(?:y|ic|ies)\s+(?:to\s+)?([a-zA-Z][a-zA-Z\s-]{2,32})",
        r"adverse reaction\s+(?:to\s+)?([a-zA-Z][a-zA-Z\s-]{2,32})",
    ]

    for pattern in allergy_patterns:
        for match in re.finditer(pattern, joined):
            flags.append(match.group(1).strip(" .,:;"))

    return list(dict.fromkeys(flags))[:6]


def _generate_medication_recommendations(
    notes: list[str],
    medical_entities: dict,
    predictions: list[dict],
    question: str | None = None,
) -> dict:
    symptoms = [str(symptom).replace("_", " ").title() for symptom in medical_entities.get("symptoms", [])[:8]]
    current_meds = [_title_case_medication(med) for med in medical_entities.get("medications", [])[:10]]
    vitals = medical_entities.get("vital_signs", {})
    demographics = medical_entities.get("demographics", {}) or {}
    allergy_flags = _extract_allergy_flags(notes)
    option_map: dict[str, dict] = {}

    for prediction in predictions[:6]:
        disease = str(prediction.get("disease", "")).replace("_", " ").title()
        confidence = float(prediction.get("confidence", 0) or 0)
        clinical_reason = _clinical_prediction_explanation(prediction)
        evidence_rows = prediction.get("medication_evidence", []) or []

        for evidence in evidence_rows[:4]:
            drug_name = _title_case_medication(evidence.get("drug_name", ""))
            if not drug_name:
                continue

            key = drug_name.lower()
            option = option_map.setdefault(
                key,
                {
                    "medication": drug_name,
                    "matched_conditions": [],
                    "rationale": [],
                    "confidence": 0,
                    "evidence": [],
                    "cautions": [],
                },
            )

            option["matched_conditions"].append(disease)
            option["confidence"] = max(option["confidence"], round(confidence, 3))
            option["rationale"].append(
                f"Positive clinical fit for {disease}: {clinical_reason}"
            )
            if evidence.get("positive_rate") or evidence.get("average_rating"):
                option["rationale"].append(
                    f"Positive medication match: {drug_name} aligns with the documented {disease} pattern in this patient's notes."
                )
            option["evidence"].append(
                {
                    "condition": evidence.get("condition", disease.lower()),
                    "review_count": evidence.get("review_count", 0),
                    "average_rating": evidence.get("average_rating", 0),
                    "positive_rate": evidence.get("positive_rate", 0),
                }
            )

    options = []
    for option in option_map.values():
        matched_conditions = list(dict.fromkeys(option["matched_conditions"]))[:4]
        rationale = [
            _presentation_safe_text(text)
            for text in list(dict.fromkeys(option["rationale"]))
        ]
        rationale = [text for text in rationale if text][:3]
        if not rationale and matched_conditions:
            rationale = [
                f"Positive medication match: {option['medication']} aligns with the documented {matched_conditions[0]} pattern in this patient's notes."
            ]
        gender = str(demographics.get("gender", "")).lower()
        if gender == "female" or demographics.get("pregnancy_relevant"):
            safety_caution = (
                "Before prescribing, confirm allergies, pregnancy/breastfeeding status, renal/hepatic "
                "function, interactions, contraindications, and local dosing guidance."
            )
        else:
            safety_caution = (
                "Before prescribing, confirm allergies, renal/hepatic function, interactions, "
                "contraindications, and local dosing guidance."
            )

        cautions = [safety_caution]

        if allergy_flags:
            cautions.append(f"Notes mention possible allergy/reaction terms: {', '.join(allergy_flags)}.")
        if current_meds:
            cautions.append(f"Check interactions with current/recent medication(s): {', '.join(current_meds)}.")
        if vitals.get("oxygen_saturation", 100) < 92 or vitals.get("temperature_c", 0) > 39.5:
            cautions.append("Concerning vital signs are present; consider urgent assessment before routine medication changes.")

        options.append(
            {
                "medication": option["medication"],
                "matched_conditions": matched_conditions,
                "rationale": rationale,
                "confidence": option["confidence"],
                "evidence": option["evidence"][:3],
                "cautions": cautions,
                "doctor_action": "Confirm patient-specific dosing and prescribe if it fits the final diagnosis and safety checks.",
            }
        )

    options.sort(key=lambda item: item["confidence"], reverse=True)
    options = options[:6]

    if not options and predictions:
        top_conditions = [pred["disease"].replace("_", " ").title() for pred in predictions[:3]]
        options.append(
            {
                "medication": "No specific medicine suggested from local evidence",
                "matched_conditions": top_conditions,
                "rationale": [
                    "The patient notes suggest possible conditions, but the available treatment data was not strong enough to choose a named medicine."
                ],
                "confidence": float(predictions[0].get("confidence", 0) or 0),
                "evidence": [],
                "cautions": [
                    "Use the confirmed diagnosis, test results, allergy history, and patient-specific factors before choosing treatment."
                ],
                "doctor_action": "Choose treatment after confirming the diagnosis and patient-specific safety factors.",
            }
        )

    return {
        "patient_context": {
            "symptoms": symptoms,
            "current_or_recent_medications": current_meds,
            "demographics": demographics,
            "possible_allergy_flags": allergy_flags,
            "notable_vitals": vitals,
            "doctor_question": question or "Which medication options may be appropriate based on this patient's notes?",
            "note_fingerprint": _note_fingerprint(notes),
        },
        "medication_options": options,
        "disease_predictions": [_public_prediction(prediction) for prediction in predictions[:6]],
        "avoid_or_review": [
            "Confirm allergies, contraindications, interactions, age, weight, renal/hepatic function, culture/lab results, local formulary, and pregnancy status only when clinically relevant to this patient.",
            "For antibiotics, confirm likely bacterial indication and follow antimicrobial stewardship guidance.",
        ],
        "clinician_review_note": "Medication choice should match the confirmed diagnosis, patient safety factors, dose, route, duration, monitoring plan, and counselling needs.",
    }

def _generate_fallback_summary(data: SummaryRequest, medical_entities: dict, disease_predictions_input: list) -> dict:
    """Generate comprehensive long-form AI summary without Gemini - STRICT PATIENT DATA ISOLATION"""
    
    print(f"=== FALLBACK SUMMARY FOR PATIENT {data.patient_id} ===")
    print(f"Using ONLY {len(data.notes)} notes from this specific patient")
    print("No cross-patient data - strict isolation enforced in fallback mode")
    
    # Analyze all medical data from THIS patient only
    symptoms = medical_entities.get("symptoms", [])
    medications = medical_entities.get("medications", [])
    vital_signs = medical_entities.get("vital_signs", {})
    risk_factors = medical_entities.get("risk_factors", [])
    demographics = medical_entities.get("demographics", {})
    
    # Count total notes for scaling summary
    total_notes = len(data.notes)
    
    # Generate comprehensive patient overview
    overview_sections = []
    
    # Chief Complaint Section
    if symptoms:
        chief_complaints = [s.replace('_', ' ').title() for s in symptoms[:8]]
        overview_sections.append(f"CHIEF COMPLAINTS: Patient presents with multiple symptoms including {', '.join(chief_complaints)}.")
    
    # Vital Signs Analysis
    if vital_signs:
        vital_analysis = []
        if vital_signs.get("temperature_c", 0) > 37.5:
            temp = vital_signs["temperature_c"]
            if temp > 39:
                vital_analysis.append(f"high-grade fever ({temp}°C)")
            elif temp > 38.5:
                vital_analysis.append(f"moderate fever ({temp}°C)")
            else:
                vital_analysis.append(f"low-grade fever ({temp}°C)")
        
        if vital_signs.get("heart_rate", 0):
            hr = vital_signs["heart_rate"]
            if hr > 100:
                vital_analysis.append(f"tachycardia ({hr} bpm)")
            elif hr < 60:
                vital_analysis.append(f"bradycardia ({hr} bpm)")
            else:
                vital_analysis.append(f"normal heart rate ({hr} bpm)")
        
        if vital_signs.get("blood_pressure_systolic"):
            sbp = vital_signs["blood_pressure_systolic"]
            dbp = vital_signs.get("blood_pressure_diastolic", 0)
            if sbp > 140:
                vital_analysis.append(f"elevated blood pressure ({sbp}/{dbp} mmHg)")
            elif sbp < 90:
                vital_analysis.append(f"low blood pressure ({sbp}/{dbp} mmHg)")
            else:
                vital_analysis.append(f"blood pressure within normal range ({sbp}/{dbp} mmHg)")
        
        if "oxygen_saturation" in vital_signs:
            o2 = vital_signs["oxygen_saturation"]
            if o2 < 90:
                vital_analysis.append(f"hypoxemia ({o2}% oxygen saturation)")
            elif o2 < 95:
                vital_analysis.append(f"mild hypoxemia ({o2}% oxygen saturation)")
            else:
                vital_analysis.append(f"adequate oxygenation ({o2}% oxygen saturation)")
        
        if vital_analysis:
            overview_sections.append(f"VITAL SIGNS ASSESSMENT: {', '.join(vital_analysis)}.")
    
    # Medication History Analysis
    if medications:
        med_count = len(medications)
        if med_count > 5:
            overview_sections.append(f"CURRENT MEDICATIONS: Patient is currently on {med_count} medications: {', '.join(medications)}. This polypharmacy requires careful monitoring for drug interactions.")
        else:
            overview_sections.append(f"CURRENT MEDICATIONS: Patient is currently on {', '.join(medications)}.")
    
    # Risk Factor Assessment
    if risk_factors:
        risk_list = [rf.replace('_', ' ').title() for rf in risk_factors[:6]]
        overview_sections.append(f"RISK FACTORS: Patient has multiple risk factors including {', '.join(risk_list)}.")
    
    # Demographics
    if demographics:
        age = demographics.get("age")
        gender = demographics.get("gender", "").title()
        if age and gender:
            age_group = "elderly" if age > 65 else "middle-aged" if age > 45 else "young adult" if age > 25 else "young"
            overview_sections.append(f"DEMOGRAPHICS: {age}-year-old {gender} patient ({age_group} category).")
    
    # Scale overview based on note count
    if total_notes > 100:
        overview_sections.append(f"CLINICAL HISTORY: Comprehensive review of {total_notes} clinical notes reveals complex medical history with multiple healthcare encounters over extended period.")
    elif total_notes > 50:
        overview_sections.append(f"CLINICAL HISTORY: Review of {total_notes} clinical notes shows established patient with significant medical history and multiple treatment courses.")
    elif total_notes > 20:
        overview_sections.append(f"CLINICAL HISTORY: Analysis of {total_notes} clinical notes indicates patient with moderate medical complexity and ongoing healthcare needs.")
    elif total_notes > 10:
        overview_sections.append(f"CLINICAL HISTORY: Examination of {total_notes} clinical notes reveals developing medical picture with evolving treatment plans.")
    else:
        overview_sections.append(f"CLINICAL HISTORY: Review of {total_notes} recent clinical notes provides current medical status.")
    
    patient_overview = " ".join(overview_sections)
    
    # Comprehensive red flag analysis
    red_flags = []
    
    # Critical vital sign flags
    if vital_signs.get("temperature_c", 0) > 39.5:
        red_flags.append("CRITICAL: High-grade fever (>39.5°C) requiring immediate medical intervention")
    if vital_signs.get("oxygen_saturation", 100) < 88:
        red_flags.append("CRITICAL: Severe hypoxemia (<88% O2 sat) requiring immediate oxygen therapy")
    if vital_signs.get("heart_rate", 0) > 130:
        red_flags.append("CRITICAL: Severe tachycardia (>130 bpm) requiring cardiac evaluation")
    if vital_signs.get("blood_pressure_systolic", 120) > 180:
        red_flags.append("CRITICAL: Hypertensive crisis (>180/120 mmHg) requiring emergency treatment")
    
    # Urgent symptom flags
    urgent_symptoms = ["chest_pain", "shortness_of_breath", "severe_headache", "neurological_deficit", "altered_mental_status"]
    for symptom in urgent_symptoms:
        if symptom in symptoms:
            red_flags.append(f"URGENT: {symptom.replace('_', ' ').title()} requires immediate evaluation")
    
    # Treatment response flags
    if total_notes > 10:
        red_flags.append("MONITORING REQUIRED: Chronic condition with multiple treatment attempts - review long-term effectiveness")
    if len(medications) > 7:
        red_flags.append("POLYPHARMACY ALERT: High medication load increases risk of adverse drug reactions")
    
    # Generate detailed recommendations
    recommendations = []
    
    # Diagnostic recommendations
    if symptoms and len(symptoms) > 3:
        recommendations.append("COMPREHENSIVE DIAGNOSTIC WORKUP: Consider advanced imaging and laboratory studies to clarify complex symptomatology")
    if vital_signs and any(vital_signs.get(key, 0) > threshold for key, threshold in [("temperature_c", 38), ("heart_rate", 100), ("blood_pressure_systolic", 140)]):
        recommendations.append("VITAL SIGNS MONITORING: Implement continuous vital signs monitoring and trend analysis")
    
    # Treatment recommendations
    if medications:
        if len(medications) > 5:
            recommendations.append("MEDICATION RECONCILIATION: Review all current medications for necessity, interactions, and potential deprescribing opportunities")
        else:
            recommendations.append("MEDICATION REVIEW: Assess current medication efficacy and monitor for therapeutic response and side effects")
    
    # Follow-up recommendations
    if total_notes > 20:
        recommendations.append("LONG-TERM MANAGEMENT PLAN: Develop comprehensive care coordination strategy given extensive medical history")
    elif total_notes > 5:
        recommendations.append("FOLLOW-UP SCHEDULING: Arrange regular follow-up appointments to monitor treatment response and disease progression")
    
    # Emergency recommendations
    if red_flags:
        recommendations.append("IMMEDIATE ACTION REQUIRED: Address all red flags urgently with appropriate medical interventions")
    
    # Create detailed disease predictions
    disease_predictions = []
    for i, pred in enumerate(disease_predictions_input[:8]):
        disease_predictions.append({
            "disease": pred["disease"].replace("_", " ").title(),
            "confidence": pred["confidence"],
            "explanation": pred.get("explanation", f"Based on analysis of {len(symptoms)} symptoms and clinical patterns"),
            "urgency": "critical" if pred["confidence"] > 0.9 else "high" if pred["confidence"] > 0.7 else "medium" if pred["confidence"] > 0.4 else "low",
            "supporting_evidence": f"Matched {len(symptoms)} clinical indicators" if symptoms else "Limited clinical data"
        })
    
    # Medication analysis with repetition detection
    medication_analysis = []
    if medications:
        # Simple frequency analysis (would be enhanced with real data)
        for med in medications:
            medication_analysis.append({
                "medication": med,
                "frequency": "multiple administrations documented",
                "clinical_indication": "ongoing therapy",
                "monitoring_required": "therapeutic response and adverse effects"
            })
    
    return {
        "patient_overview": patient_overview,
        "main_conditions": [],
        "current_or_recent_medications": medications,
        "repeated_symptoms": symptoms,
        "repeated_medications": medication_analysis,
        "possible_non_response_flags": ["Complex treatment history requires coordinated care approach"] if total_notes > 20 else ["Treatment response requires close monitoring"],
        "important_tests_already_done_or_ordered": [
            f"Comprehensive review of {total_notes} clinical encounters",
            "Vital signs trend analysis",
            "Medication efficacy assessment"
        ],
        "doctor_attention_points": [
            "Review the current symptoms, medicines, vital signs, and test history",
            "Assess medication polypharmacy risks",
            "Monitor critical vital signs trends",
            "Consider specialist consultation for complex cases"
        ] + red_flags,
        "recommendations": recommendations,
        "red_flags": red_flags,
        "clinical_complexity": "high" if total_notes > 50 else "moderate" if total_notes > 20 else "low",
        "data_completeness": f"comprehensive ({total_notes} notes analyzed)"
    }

@app.post("/ai/patient-summary")
def patient_summary(data: SummaryRequest):
    try:
        if not data.notes:
            raise HTTPException(status_code=400, detail="No notes were provided")
        
        if not data.patient_id:
            raise HTTPException(status_code=400, detail="Patient ID is required")

        # STRICT PATIENT DATA ISOLATION: Use only this patient's notes.
        # Long histories are condensed locally so the endpoint responds quickly.
        analysis_notes, note_scope = _prepare_notes_for_fast_summary(data.notes)
        supplied_demographics = _normalize_demographics(data.demographics)
        profile_context = _patient_profile_context(supplied_demographics)
        if profile_context:
            analysis_notes = [profile_context] + analysis_notes
        patient_note_count = note_scope["original_count"]
        
        print(f"=== GENERATING AI SUMMARY FOR PATIENT {data.patient_id} ===")
        print(f"Using ONLY this patient's notes: analyzing {note_scope['analyzed_count']} of {patient_note_count}")
        print("No cross-patient data contamination - strict isolation enforced")
        
        # Step 1: Extract medical entities ONLY from this patient's notes
        medical_entities = _extract_medical_entities(analysis_notes)
        medical_entities["demographics"] = _merge_demographics(
            medical_entities.get("demographics", {}),
            data.demographics,
        )
        
        # Step 2: Get local cleaned-data disease predictions
        local_predictions = []
        try:
            prediction_result = disease_predictor.predict_diseases(
                symptoms=medical_entities.get("symptoms", []),
                vital_signs=medical_entities.get("vital_signs", {}),
                risk_factors=medical_entities.get("risk_factors", []),
                demographics=medical_entities.get("demographics", {}),
                notes=analysis_notes,
            )
            local_predictions = prediction_result.get("predictions", [])
        except Exception as e:
            print(f"Local disease prediction error: {e}")
        
        # Step 3: Use Custom Medical AI for analysis if installed
        try:
            if custom_ai is None:
                raise RuntimeError("Custom Medical AI is unavailable")

            print(f"=== USING CUSTOM MEDICAL AI FOR PATIENT {data.patient_id} ===")
            print("No external API dependencies - fully local AI processing")
            
            # Get disease predictions from custom AI
            custom_predictions = custom_ai.predict_diseases(medical_entities)
            
            # Merge local cleaned-data and Custom AI predictions
            all_predictions = _merge_prediction_lists(local_predictions, custom_predictions)
            
            # Generate comprehensive summary using custom AI
            summary = custom_ai.generate_summary(analysis_notes, medical_entities, all_predictions)
            
            summary = _make_summary_concise(summary, analysis_notes, medical_entities, all_predictions)
            summary["data_completeness"] = (
                f"Reviewed {note_scope['analyzed_count']} key record(s) from {patient_note_count} patient record(s)."
            )
            print("Custom AI Summary Generated without disease prediction section")
            return summary
            
        except Exception as ai_error:
            print(f"Custom AI analysis failed, using fallback: {ai_error}")
            all_predictions = _merge_prediction_lists(local_predictions)
            scoped_data = SummaryRequest(patient_id=data.patient_id, notes=analysis_notes)
            summary = _generate_fallback_summary(scoped_data, medical_entities, all_predictions)
            concise_summary = _make_summary_concise(summary, analysis_notes, medical_entities, all_predictions)
            concise_summary["data_completeness"] = (
                f"Reviewed {note_scope['analyzed_count']} key record(s) from {patient_note_count} patient record(s)."
            )
            return concise_summary

    except HTTPException:
        raise
    except Exception as e:
        print("FULL BACKEND ERROR:")
        traceback.print_exc()
        error_text = str(e)
        lowered = error_text.lower()

        if "resource_exhausted" in lowered or "quota exceeded" in lowered or "429" in lowered:
            retry_seconds = _extract_retry_delay_seconds(error_text)
            retry_text = (
                f" Please wait about {retry_seconds} seconds and try again."
                if retry_seconds
                else " Please wait a bit and try again."
            )
            raise HTTPException(
                status_code=429,
                detail=(
                    "AI summary is temporarily unavailable because the Gemini API quota has been exceeded."
                    + retry_text
                    + " If this keeps happening, check your Gemini plan and billing."
                ),
            )

        raise HTTPException(status_code=500, detail=error_text)


@app.post("/ai/medication-recommendation")
def medication_recommendation(data: MedicationRecommendationRequest):
    try:
        if not data.notes:
            raise HTTPException(status_code=400, detail="No notes were provided")
        if not data.patient_id:
            raise HTTPException(status_code=400, detail="Patient ID is required")

        cleaned_notes = [str(note or "").strip() for note in data.notes if str(note or "").strip()]
        if not cleaned_notes:
            raise HTTPException(status_code=400, detail="No usable notes were provided")

        latest_note_only = cleaned_notes[-1:]
        analysis_notes, note_scope = _prepare_notes_for_fast_summary(latest_note_only)
        supplied_demographics = _normalize_demographics(data.demographics)
        profile_context = _patient_profile_context(supplied_demographics)
        if profile_context:
            analysis_notes = [profile_context] + analysis_notes
        medical_entities = _extract_medical_entities(analysis_notes)
        medical_entities["demographics"] = _merge_demographics(
            medical_entities.get("demographics", {}),
            data.demographics,
        )

        prediction_result = disease_predictor.predict_diseases(
            symptoms=medical_entities.get("symptoms", []),
            vital_signs=medical_entities.get("vital_signs", {}),
            risk_factors=medical_entities.get("risk_factors", []),
            demographics=medical_entities.get("demographics", {}),
            notes=analysis_notes,
        )
        predictions = prediction_result.get("predictions", [])

        recommendation = _generate_medication_recommendations(
            analysis_notes,
            medical_entities,
            predictions,
            data.question,
        )

        latest_note_text = next((note for note in analysis_notes if str(note).startswith("Title:")), latest_note_only[0])
        title_match = re.search(r"Title:\s*(.+?)(?:\s+Doctor:|\s+Date:|\s+Note:|$)", latest_note_text)
        date_match = re.search(r"Date:\s*(.+?)(?:\s+Note:|$)", latest_note_text)
        recommendation.setdefault("patient_context", {})
        recommendation["patient_context"]["source_note_title"] = title_match.group(1).strip() if title_match else "Latest saved note"
        recommendation["patient_context"]["source_note_date"] = date_match.group(1).strip() if date_match else ""
        recommendation["data_completeness"] = (
            "Latest saved patient note only: "
            f"{note_scope['analyzed_count']} note analyzed for disease prediction and medication decision support"
        )
        recommendation["patient_id"] = data.patient_id
        return recommendation
    except HTTPException:
        raise
    except Exception as e:
        print("MEDICATION RECOMMENDATION ERROR:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("Starting Health-Sphere AI Backend Server...")
    print("Patient Data Isolation: ENABLED - Each patient analyzed separately")
    print("AI Summary Generation: ACTIVE - Using local cleaned-data AI + fallback")
    uvicorn.run(app, host="0.0.0.0", port=8001)
