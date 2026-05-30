import csv
import json
import os
from collections import Counter
from typing import Any, Dict, List

from ml_disease_model import TrainedDiseaseModel


class DiseasePredictor:
    """Local disease predictor backed by the cleaned disease dataset.

    It combines the trained LinearSVC model with deterministic symptom-overlap
    matching from the cleaned CSV, keeping the same API shape used by app.py.
    """

    def __init__(self, model: TrainedDiseaseModel | None = None):
        self.model = model or TrainedDiseaseModel()
        self.model.load_or_train()
        self.csv_path = self.model.csv_path
        self.medication_summary_path = os.path.join(
            os.path.dirname(__file__),
            "dataset",
            "cleaned_medication_condition_summary.csv",
        )
        self.doctor_feedback_path = self.model.doctor_feedback_path
        self.disease_catalog: Dict[str, Dict[str, Any]] = {}
        self.medication_evidence_index: Dict[str, List[Dict[str, Any]]] = {}
        self.symptom_vocab: list[str] = []
        self._load_catalog()
        self._load_medication_evidence()
        print("Local cleaned-data disease predictor initialized successfully")

    def predict_diseases(
        self,
        symptoms: List[str],
        vital_signs: Dict[str, float] | None = None,
        risk_factors: List[str] | None = None,
        demographics: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        vital_signs = vital_signs or {}
        risk_factors = risk_factors or []
        demographics = demographics or {}

        entities = {
            "symptoms": symptoms or [],
            "vital_signs": vital_signs,
            "risk_factors": risk_factors,
            "demographics": demographics,
        }

        rule_predictions = self._predict_by_clinical_rules(symptoms or [], vital_signs, risk_factors)
        ml_predictions = self.model.predict(entities, limit=8)
        pattern_predictions = self._predict_by_symptom_overlap(symptoms or [], vital_signs, limit=8)
        predictions = self._merge_predictions(rule_predictions, ml_predictions, pattern_predictions)

        return {
            "predictions": predictions[:10],
            "input_data": entities,
            "model_source": "cleaned_csv_linear_svc_plus_symptom_overlap",
        }

    def get_available_symptoms(self) -> List[str]:
        return self.symptom_vocab

    def get_disease_info(self, disease: str) -> Dict[str, Any]:
        key = self._normalize(disease)
        info = self.disease_catalog.get(key)
        if not info:
            return {"name": disease, "symptoms": [], "risk_factors": [], "error": "Disease not found in cleaned data"}

        return {
            "name": info["disease"],
            "symptoms": sorted(info["symptoms"]),
            "risk_factors": [],
            "treatment_or_cure": info.get("treatment_or_cure", ""),
            "advice": info.get("advice", ""),
            "treatment_status": info.get("treatment_status", ""),
            "medication_evidence": self._medication_evidence_for_disease(info["disease"]),
            "medication_evidence_note": "Patient-reported review evidence only; not prescribing guidance.",
            "explanation": self._get_explanation(info["disease"], sorted(info["symptoms"])),
        }

    def status(self) -> Dict[str, Any]:
        status = self.model.status()
        status["catalog_disease_count"] = len(self.disease_catalog)
        status["catalog_symptom_count"] = len(self.symptom_vocab)
        status["medication_evidence_condition_count"] = len(self.medication_evidence_index)
        status["medication_summary_path"] = self.medication_summary_path
        status["medication_summary_exists"] = os.path.exists(self.medication_summary_path)
        status["doctor_feedback_path"] = self.doctor_feedback_path
        status["doctor_feedback_exists"] = os.path.exists(self.doctor_feedback_path)
        status["doctor_feedback_rows"] = self._doctor_feedback_count()
        status["predictor"] = "local_cleaned_csv"
        return status

    def retrain(self) -> Dict[str, Any]:
        status = self.model.retrain()
        self._load_catalog()
        self._load_medication_evidence()
        status["catalog_disease_count"] = len(self.disease_catalog)
        status["catalog_symptom_count"] = len(self.symptom_vocab)
        status["medication_evidence_condition_count"] = len(self.medication_evidence_index)
        status["doctor_feedback_rows"] = self._doctor_feedback_count()
        status["predictor"] = "local_cleaned_csv"
        return status

    def record_doctor_decision(
        self,
        patient_id: str,
        doctor_id: str,
        notes: List[str],
        diagnosis: str,
        treatments: List[Dict],
        treatment_notes: str = "",
        prescription_id: str = "",
    ) -> Dict[str, Any]:
        result = self.model.record_doctor_decision(
            patient_id=patient_id,
            doctor_id=doctor_id,
            notes=notes,
            diagnosis=diagnosis,
            treatments=treatments,
            treatment_notes=treatment_notes,
            prescription_id=prescription_id,
        )
        self._load_medication_evidence()
        result["status"] = self.status()
        return result

    def _load_catalog(self) -> None:
        self.disease_catalog = {}
        symptom_counts: Counter[str] = Counter()

        if not os.path.exists(self.csv_path):
            self.symptom_vocab = []
            return

        with open(self.csv_path, newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                disease = (row.get("disease") or "").strip()
                if not disease:
                    continue

                symptoms = self._parse_symptoms(row.get("symptoms", ""))
                key = self._normalize(disease)

                if key not in self.disease_catalog:
                    self.disease_catalog[key] = {
                        "disease": disease,
                        "symptoms": set(),
                        "treatment_or_cure": row.get("treatment_or_cure", ""),
                        "advice": row.get("advice", ""),
                        "treatment_status": row.get("treatment_status", ""),
                    }

                self.disease_catalog[key]["symptoms"].update(symptoms)
                symptom_counts.update(symptoms)

        self.symptom_vocab = [symptom for symptom, _count in symptom_counts.most_common()]

    def _predict_by_symptom_overlap(
        self,
        symptoms: List[str],
        vital_signs: Dict[str, float],
        limit: int = 8,
    ) -> List[Dict[str, Any]]:
        patient_symptoms = {self._normalize(symptom) for symptom in symptoms if symptom}
        patient_symptoms.update(self._vital_symptom_hints(vital_signs))
        if not patient_symptoms:
            return []

        predictions = []
        for info in self.disease_catalog.values():
            disease_symptoms = {self._normalize(symptom) for symptom in info["symptoms"]}
            if not disease_symptoms:
                continue

            matches = patient_symptoms.intersection(disease_symptoms)
            if not matches:
                continue

            recall = len(matches) / max(len(disease_symptoms), 1)
            precision = len(matches) / max(len(patient_symptoms), 1)
            confidence = min(0.95, 0.25 + (precision * 0.45) + (recall * 0.30))

            predictions.append(
                {
                    "disease": info["disease"],
                    "confidence": round(confidence, 3),
                    "explanation": self._get_explanation(info["disease"], sorted(matches)),
                    "urgency": self._urgency_for(info["disease"], confidence, vital_signs),
                    "model_source": "cleaned_csv_symptom_overlap",
                    "supporting_evidence": f"Matched symptoms: {', '.join(sorted(matches))}",
                    "advice": info.get("advice", ""),
                    "treatment_or_cure": info.get("treatment_or_cure", ""),
                }
            )

        predictions.sort(key=lambda item: item["confidence"], reverse=True)
        return predictions[:limit]

    def _predict_by_clinical_rules(
        self,
        symptoms: List[str],
        vital_signs: Dict[str, float],
        risk_factors: List[str],
    ) -> List[Dict[str, Any]]:
        normalized_symptoms = {self._normalize(symptom) for symptom in symptoms}
        normalized_risks = {self._normalize(risk) for risk in risk_factors}
        predictions = []

        has_cough = "cough" in normalized_symptoms or "persistent cough" in normalized_symptoms
        has_fever = "fever" in normalized_symptoms or vital_signs.get("temperature_c", 0) > 37.5
        has_dyspnea = (
            "shortness of breath" in normalized_symptoms
            or "difficulty breathing" in normalized_symptoms
            or vital_signs.get("oxygen_saturation", 100) < 95
        )
        has_wheeze = "wheezing" in normalized_symptoms
        has_chest_pain = "chest pain" in normalized_symptoms

        if has_cough and has_fever and has_dyspnea:
            confidence = 0.82
            if vital_signs.get("oxygen_saturation", 100) < 94:
                confidence += 0.07
            if vital_signs.get("temperature_c", 0) > 38.5:
                confidence += 0.04
            predictions.append(
                self._clinical_prediction(
                    "pneumonia",
                    min(confidence, 0.95),
                    "cough, fever, and shortness of breath/low oxygen form an acute lower-respiratory pattern",
                    vital_signs,
                )
            )

        if has_cough and has_fever and (has_dyspnea or "loss of taste smell" in normalized_symptoms):
            predictions.append(
                self._clinical_prediction(
                    "covid19",
                    0.78,
                    "cough and fever with respiratory symptoms match a viral respiratory infection pattern",
                    vital_signs,
                )
            )

        if has_dyspnea and (has_wheeze or has_cough or "asthma" in normalized_risks):
            predictions.append(
                self._clinical_prediction(
                    "asthma_exacerbation",
                    0.72,
                    "shortness of breath with cough/wheeze or asthma risk suggests bronchospasm",
                    vital_signs,
                )
            )

        systolic = vital_signs.get("blood_pressure_systolic", 0)
        diastolic = vital_signs.get("blood_pressure_diastolic", 0)
        if systolic > 140 or diastolic > 90 or "hypertension" in normalized_risks:
            confidence = 0.64
            if systolic > 160 or diastolic > 100:
                confidence += 0.12
            predictions.append(
                self._clinical_prediction(
                    "hypertension",
                    min(confidence, 0.88),
                    f"elevated blood pressure pattern noted ({systolic or 'unknown'}/{diastolic or 'unknown'} mmHg)",
                    vital_signs,
                )
            )

        if has_chest_pain and has_dyspnea:
            predictions.append(
                self._clinical_prediction(
                    "acute_coronary_syndrome",
                    0.68,
                    "chest pain with shortness of breath requires urgent cardiac consideration",
                    vital_signs,
                    urgency="high",
                )
            )

        return predictions

    def _clinical_prediction(
        self,
        disease: str,
        confidence: float,
        explanation: str,
        vital_signs: Dict[str, float],
        urgency: str | None = None,
    ) -> Dict[str, Any]:
        catalog = self.disease_catalog.get(self._normalize(disease), {})
        return {
            "disease": disease,
            "confidence": round(confidence, 3),
            "explanation": f"Clinical AI rule: {explanation}",
            "urgency": urgency or self._urgency_for(disease, confidence, vital_signs),
            "model_source": "local_clinical_rules",
            "supporting_evidence": explanation,
            "advice": catalog.get("advice", ""),
            "treatment_or_cure": catalog.get("treatment_or_cure", ""),
        }

    def _merge_predictions(self, *prediction_lists: list[dict]) -> list[dict]:
        merged: Dict[str, Dict[str, Any]] = {}

        for predictions in prediction_lists:
            for pred in predictions or []:
                disease = str(pred.get("disease", "")).strip()
                if not disease:
                    continue
                key = self._normalize(disease)
                normalized = pred.copy()
                normalized["disease"] = disease
                normalized["confidence"] = float(normalized.get("confidence", 0) or 0)

                if key not in merged:
                    merged[key] = normalized
                    continue

                existing = merged[key]
                existing["confidence"] = round(max(existing.get("confidence", 0), normalized["confidence"]), 3)
                sources = [
                    source
                    for source in [existing.get("model_source"), normalized.get("model_source")]
                    if source
                ]
                existing["model_source"] = ", ".join(dict.fromkeys(", ".join(sources).split(", ")))
                if normalized.get("supporting_evidence") and not existing.get("supporting_evidence"):
                    existing["supporting_evidence"] = normalized["supporting_evidence"]
                if normalized.get("advice") and not existing.get("advice"):
                    existing["advice"] = normalized["advice"]
                if normalized.get("treatment_or_cure") and not existing.get("treatment_or_cure"):
                    existing["treatment_or_cure"] = normalized["treatment_or_cure"]

        ranked = sorted(merged.values(), key=lambda item: item.get("confidence", 0), reverse=True)
        for item in ranked:
            item["medication_evidence"] = self._medication_evidence_for_disease(item["disease"])
            if item["medication_evidence"]:
                item["medication_evidence_note"] = (
                    "Patient-reported review evidence only; not prescribing guidance."
                )
        return ranked

    def _load_medication_evidence(self) -> None:
        self.medication_evidence_index = {}
        if not os.path.exists(self.medication_summary_path):
            self._load_doctor_medication_feedback()
            return

        with open(self.medication_summary_path, newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                condition = self._normalize(row.get("condition", ""))
                drug_name = self._normalize(row.get("drug_name", ""))
                if not condition or not drug_name:
                    continue

                try:
                    review_count = int(row.get("review_count") or 0)
                    average_rating = float(row.get("average_rating") or 0)
                    positive_rate = float(row.get("positive_rate") or 0)
                except ValueError:
                    continue

                if review_count < 5:
                    continue

                self.medication_evidence_index.setdefault(condition, []).append(
                    {
                        "drug_name": drug_name,
                        "condition": condition,
                        "review_count": review_count,
                        "average_rating": round(average_rating, 2),
                        "positive_rate": round(positive_rate, 3),
                        "evidence_type": "patient_reported_drug_reviews",
                    }
                )

        for condition, rows in self.medication_evidence_index.items():
            rows.sort(
                key=lambda row: (
                    row["review_count"],
                    row["average_rating"],
                    row["positive_rate"],
                ),
                reverse=True,
            )
            self.medication_evidence_index[condition] = rows[:8]

        self._load_doctor_medication_feedback()

    def _medication_evidence_for_disease(self, disease: str, limit: int = 5) -> List[Dict[str, Any]]:
        key = self._normalize(disease)
        if key in self.medication_evidence_index:
            return self.medication_evidence_index[key][:limit]

        matches: list[dict[str, Any]] = []
        for condition, rows in self.medication_evidence_index.items():
            if key and (key in condition or condition in key):
                matches.extend(rows[:3])

        matches.sort(
            key=lambda row: (
                row["review_count"],
                row["average_rating"],
                row["positive_rate"],
            ),
            reverse=True,
        )
        return matches[:limit]

    def _parse_symptoms(self, symptoms_text: str) -> set[str]:
        return {
            symptom.strip().lower()
            for symptom in symptoms_text.replace(",", ";").split(";")
            if symptom.strip()
        }

    def _load_doctor_medication_feedback(self) -> None:
        if not os.path.exists(self.doctor_feedback_path):
            return

        doctor_counts: Dict[tuple[str, str], Dict[str, Any]] = {}
        with open(self.doctor_feedback_path, newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                condition = self._normalize(row.get("diagnosis", ""))
                if not condition:
                    continue
                try:
                    treatments = json.loads(row.get("treatments_json") or "[]")
                except json.JSONDecodeError:
                    treatments = []

                for treatment in treatments:
                    drug_name = self._normalize(treatment.get("drugName") or treatment.get("medication") or "")
                    if not drug_name:
                        continue
                    key = (condition, drug_name)
                    item = doctor_counts.setdefault(
                        key,
                        {
                            "drug_name": drug_name,
                            "condition": condition,
                            "review_count": 0,
                            "average_rating": 0,
                            "positive_rate": 1,
                            "evidence_type": "doctor_prescribed_from_patient_notes",
                        },
                    )
                    item["review_count"] += 1

        for (condition, _drug_name), evidence in doctor_counts.items():
            self.medication_evidence_index.setdefault(condition, []).insert(0, evidence)

        for condition, rows in self.medication_evidence_index.items():
            rows.sort(
                key=lambda row: (
                    1 if row.get("evidence_type") == "doctor_prescribed_from_patient_notes" else 0,
                    row.get("review_count", 0),
                    row.get("average_rating", 0),
                    row.get("positive_rate", 0),
                ),
                reverse=True,
            )
            self.medication_evidence_index[condition] = rows[:8]

    def _doctor_feedback_count(self) -> int:
        if not os.path.exists(self.doctor_feedback_path):
            return 0
        with open(self.doctor_feedback_path, newline="", encoding="utf-8") as handle:
            return max(0, sum(1 for _row in handle) - 1)

    def _vital_symptom_hints(self, vital_signs: Dict[str, float]) -> set[str]:
        hints = set()
        if vital_signs.get("temperature_c", 0) > 37.5:
            hints.add("fever")
        if vital_signs.get("oxygen_saturation", 100) < 95:
            hints.update({"shortness of breath", "difficulty breathing"})
        if vital_signs.get("heart_rate", 0) > 100:
            hints.update({"palpitations", "rapid heartbeat"})
        if vital_signs.get("blood_pressure_systolic", 0) > 140:
            hints.add("high blood pressure")
        return hints

    def _urgency_for(self, disease: str, confidence: float, vital_signs: Dict[str, float]) -> str:
        disease_text = disease.lower()
        emergency_terms = ["aneurysm", "stroke", "heart attack", "embolism", "sepsis", "shock"]
        if any(term in disease_text for term in emergency_terms):
            return "high"
        if vital_signs.get("oxygen_saturation", 100) < 90 or vital_signs.get("temperature_c", 0) > 39.5:
            return "high"
        if confidence > 0.75:
            return "high"
        if confidence > 0.45:
            return "medium"
        return "low"

    def _get_explanation(self, disease: str, symptoms: List[str]) -> str:
        if symptoms:
            readable_symptoms = ", ".join(str(symptom).replace("_", " ") for symptom in symptoms[:6])
            return f"The patient notes fit {disease} because they include {readable_symptoms}."
        return f"The available patient notes fit the clinical pattern for {disease}."

    def _normalize(self, value: str) -> str:
        return str(value).strip().lower().replace("_", " ")
