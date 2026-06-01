import csv
import json
import math
import os
import re
from datetime import datetime
from typing import Dict, List


class TrainedDiseaseModel:
    """TF-IDF + LinearSVC disease predictor trained from the cleaned CSV."""

    def __init__(self, csv_path: str | None = None, model_path: str | None = None):
        base_dir = os.path.dirname(__file__)
        self.csv_path = csv_path or os.path.join(base_dir, "dataset", "cleaned_disease_symptoms_treatments.csv")
        self.doctor_feedback_path = os.path.join(base_dir, "dataset", "doctor_decision_feedback.csv")
        self.model_path = model_path or os.path.join(base_dir, "models", "custom_ai", "linear_svc_disease_model.joblib")
        self.meta_path = f"{self.model_path}.meta.json"
        self.pipeline = None
        self.disease_advice: Dict[str, Dict[str, str]] = {}
        self.available = False

    def load_or_train(self) -> None:
        try:
            from joblib import dump, load
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.pipeline import Pipeline
            from sklearn.svm import LinearSVC
        except Exception as exc:
            print(f"LinearSVC disease model disabled: missing dependency ({exc})")
            return

        self._ensure_clean_csv_exists()
        self._load_disease_advice()

        try:
            if os.path.exists(self.model_path) and self._saved_model_matches_csv():
                self.pipeline = load(self.model_path)
                self.available = True
                print("Loaded trained LinearSVC disease model")
                return
        except Exception as exc:
            print(f"Could not load LinearSVC disease model, retraining: {exc}")

        rows = self._load_training_rows()
        if len(rows) < 2:
            print("LinearSVC disease model disabled: cleaned CSV has too little training data")
            return

        texts = [row["text"] for row in rows]
        labels = [row["disease"] for row in rows]

        self.pipeline = Pipeline(
            [
                (
                    "tfidf",
                    TfidfVectorizer(
                        lowercase=True,
                        ngram_range=(1, 2),
                        min_df=1,
                        sublinear_tf=True,
                    ),
                ),
                ("classifier", LinearSVC(class_weight="balanced", max_iter=5000)),
            ]
        )
        self.pipeline.fit(texts, labels)

        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        dump(self.pipeline, self.model_path)
        self._write_model_metadata(len(rows))
        self.available = True
        print(f"Trained LinearSVC disease model from {len(rows)} cleaned rows")

    def record_doctor_decision(
        self,
        patient_id: str,
        doctor_id: str,
        notes: List[str],
        diagnosis: str,
        treatments: List[Dict],
        treatment_notes: str = "",
        prescription_id: str = "",
    ) -> Dict:
        note_text = self._normalize_feedback_text(" ".join(notes))
        disease = str(diagnosis or "").strip().lower()
        if not patient_id or not doctor_id:
            raise ValueError("patient_id and doctor_id are required")
        if not note_text:
            raise ValueError("patient notes are required")
        if not disease:
            raise ValueError("diagnosis is required before feedback can train the model")
        if not treatments and not treatment_notes.strip():
            raise ValueError("at least one treatment or treatment note is required")

        os.makedirs(os.path.dirname(self.doctor_feedback_path), exist_ok=True)
        file_exists = os.path.exists(self.doctor_feedback_path)
        fieldnames = [
            "created_at",
            "patient_id",
            "doctor_id",
            "diagnosis",
            "note_text",
            "treatments_json",
            "treatment_notes",
            "prescription_id",
        ]
        row = {
            "created_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "diagnosis": disease,
            "note_text": note_text,
            "treatments_json": json.dumps(treatments or [], ensure_ascii=True),
            "treatment_notes": self._normalize_feedback_text(treatment_notes),
            "prescription_id": prescription_id,
        }

        with open(self.doctor_feedback_path, "a", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()
            writer.writerow(row)

        return {
            "saved": True,
            "doctor_feedback_path": self.doctor_feedback_path,
            "doctor_feedback_rows": self._doctor_feedback_count(),
            "message": "Doctor decision saved. It will be used the next time the disease model retrains.",
        }

    def _ensure_clean_csv_exists(self) -> None:
        if os.path.exists(self.csv_path):
            return

        try:
            from clean_disease_dataset import clean_dataset

            print("Cleaned disease CSV missing; generating it from the raw dataset.")
            clean_dataset()
        except Exception as exc:
            print(f"Could not generate cleaned disease CSV: {exc}")

    def retrain(self) -> Dict:
        self.pipeline = None
        self.available = False
        rows = self._load_training_rows()
        if not rows:
            return self.status()

        try:
            if os.path.exists(self.model_path):
                os.remove(self.model_path)
            if os.path.exists(self.meta_path):
                os.remove(self.meta_path)
        except OSError as exc:
            print(f"Could not remove old LinearSVC model before retraining: {exc}")

        self.load_or_train()
        return self.status()

    def status(self) -> Dict:
        metadata = {}
        if os.path.exists(self.meta_path):
            try:
                with open(self.meta_path, encoding="utf-8") as handle:
                    metadata = json.load(handle)
            except Exception:
                metadata = {}

        return {
            "available": self.available,
            "model_path": self.model_path,
            "model_exists": os.path.exists(self.model_path),
            "csv_path": self.csv_path,
            "csv_exists": os.path.exists(self.csv_path),
            "doctor_feedback_path": self.doctor_feedback_path,
            "doctor_feedback_exists": os.path.exists(self.doctor_feedback_path),
            "doctor_feedback_rows": self._doctor_feedback_count(),
            "csv_signature": self._csv_signature(),
            "metadata": metadata,
            "metadata_matches_csv": self._saved_model_matches_csv(),
        }

    def predict(self, entities: Dict, limit: int = 5) -> List[Dict]:
        if not self.available or self.pipeline is None:
            return []

        symptom_text = self._entities_to_text(entities)
        if not symptom_text.strip():
            return []

        try:
            classifier = self.pipeline.named_steps["classifier"]
            scores = self.pipeline.decision_function([symptom_text])
            classes = list(classifier.classes_)

            if len(classes) == 2 and not hasattr(scores[0], "__len__"):
                raw_scores = [-float(scores[0]), float(scores[0])]
            else:
                raw_scores = list(scores[0])

            ranked = sorted(zip(classes, raw_scores), key=lambda item: item[1], reverse=True)[:limit]
            return [self._format_prediction(disease, score) for disease, score in ranked]
        except Exception as exc:
            print(f"LinearSVC disease prediction failed: {exc}")
            return []

    def _load_training_rows(self) -> List[Dict[str, str]]:
        rows: List[Dict[str, str]] = []
        if not os.path.exists(self.csv_path):
            return rows

        with open(self.csv_path, newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                disease = (row.get("disease") or "").strip().lower()
                symptoms = (row.get("symptoms") or "").strip().lower()
                quality_flags = (row.get("quality_flags") or "").lower()
                if disease and symptoms:
                    if "low_symptom_signal" in quality_flags:
                        continue
                    rows.append({"disease": disease, "text": symptoms.replace(";", " ")})
        rows.extend(self._load_doctor_feedback_training_rows())
        return rows

    def _load_doctor_feedback_training_rows(self) -> List[Dict[str, str]]:
        rows: List[Dict[str, str]] = []
        if not os.path.exists(self.doctor_feedback_path):
            return rows

        with open(self.doctor_feedback_path, newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                disease = (row.get("diagnosis") or "").strip().lower()
                note_text = self._normalize_feedback_text(row.get("note_text") or "")
                if disease and len(note_text) >= 20:
                    rows.append({"disease": disease, "text": note_text})
        return rows

    def _csv_signature(self) -> Dict[str, float | int | str]:
        if not os.path.exists(self.csv_path):
            return {"path": self.csv_path, "mtime": 0, "size": 0}

        stat = os.stat(self.csv_path)
        return {
            "path": self.csv_path,
            "mtime": stat.st_mtime,
            "size": stat.st_size,
        }

    def _saved_model_matches_csv(self) -> bool:
        if not os.path.exists(self.meta_path):
            return False

        try:
            with open(self.meta_path, encoding="utf-8") as handle:
                metadata = json.load(handle)
            return (
                metadata.get("csv") == self._csv_signature()
                and metadata.get("doctor_feedback_signature") == self._feedback_signature()
            )
        except Exception:
            return False

    def _write_model_metadata(self, row_count: int) -> None:
        metadata = {
            "model": "tfidf_linear_svc",
            "row_count": row_count,
            "csv": self._csv_signature(),
            "doctor_feedback_signature": self._feedback_signature(),
            "doctor_feedback": {
                "path": self.doctor_feedback_path,
                "row_count": self._doctor_feedback_count(),
            },
        }
        with open(self.meta_path, "w", encoding="utf-8") as handle:
            json.dump(metadata, handle, indent=2)

    def _load_disease_advice(self) -> None:
        if not os.path.exists(self.csv_path):
            return

        with open(self.csv_path, newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                disease = (row.get("disease") or "").strip().lower()
                if not disease or disease in self.disease_advice:
                    continue
                self.disease_advice[disease] = {
                    "treatment_or_cure": row.get("treatment_or_cure", ""),
                    "advice": row.get("advice", ""),
                    "treatment_status": row.get("treatment_status", ""),
                }

    def _entities_to_text(self, entities: Dict) -> str:
        symptoms = [str(symptom).replace("_", " ") for symptom in entities.get("symptoms", [])]
        risk_factors = [str(factor).replace("_", " ") for factor in entities.get("risk_factors", [])]
        vitals = entities.get("vital_signs", {})
        note_text = self._normalize_feedback_text(str(entities.get("note_text", "")))
        abnormal_vitals = []

        if vitals.get("temperature_c", 0) > 37.5:
            abnormal_vitals.append("fever")
        if vitals.get("oxygen_saturation", 100) < 95:
            abnormal_vitals.append("shortness of breath low oxygen")
        if vitals.get("heart_rate", 0) > 100:
            abnormal_vitals.append("palpitations tachycardia")
        if vitals.get("blood_pressure_systolic", 0) > 140:
            abnormal_vitals.append("high blood pressure")

        return " ".join(symptoms + risk_factors + abnormal_vitals + [note_text])

    def _doctor_feedback_count(self) -> int:
        if not os.path.exists(self.doctor_feedback_path):
            return 0
        with open(self.doctor_feedback_path, newline="", encoding="utf-8") as handle:
            return max(0, sum(1 for _row in handle) - 1)

    def _feedback_signature(self) -> Dict[str, float | int | str]:
        if not os.path.exists(self.doctor_feedback_path):
            return {"path": self.doctor_feedback_path, "mtime": 0, "size": 0}

        stat = os.stat(self.doctor_feedback_path)
        return {
            "path": self.doctor_feedback_path,
            "mtime": stat.st_mtime,
            "size": stat.st_size,
        }

    def _normalize_feedback_text(self, value: str) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip().lower()

    def _format_prediction(self, disease: str, score: float) -> Dict:
        disease = str(disease)
        confidence = 1 / (1 + math.exp(-float(score)))
        advice = self.disease_advice.get(disease.lower(), {})
        explanation = f"The patient's recorded symptoms are most consistent with {disease}."
        if advice.get("advice"):
            explanation += f" {advice['advice']}"

        return {
            "disease": disease,
            "confidence": round(max(0.05, min(confidence, 0.98)), 3),
            "explanation": explanation,
            "urgency": "high" if confidence > 0.75 else "medium" if confidence > 0.45 else "low",
            "advice": advice.get("advice", ""),
            "treatment_or_cure": advice.get("treatment_or_cure", ""),
        }
    
