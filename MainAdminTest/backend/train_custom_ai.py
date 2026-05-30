#!/usr/bin/env python3
"""
Training utility for the current local medical AI.

The live backend now uses a cleaned-CSV disease model:
TF-IDF symptoms -> LinearSVC disease predictor, plus local clinical rules.

This script retrains/evaluates that model. It intentionally does not depend on
Torch or the old experimental custom_medical_ai module.
"""

from __future__ import annotations

import csv
import os
from collections import Counter
from pathlib import Path

from joblib import dump, load
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from ml_disease_model import TrainedDiseaseModel


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CSV = BASE_DIR / "dataset" / "cleaned_disease_symptoms_treatments.csv"
DEFAULT_MODEL = BASE_DIR / "models" / "custom_ai" / "linear_svc_disease_model.joblib"


def load_cleaned_rows(csv_path: Path = DEFAULT_CSV) -> tuple[list[str], list[str]]:
    """Load symptoms text and disease labels from the cleaned CSV."""
    if not csv_path.exists():
        raise FileNotFoundError(f"Cleaned training CSV not found: {csv_path}")

    texts: list[str] = []
    labels: list[str] = []

    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        required = {"disease", "symptoms"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")

        for row in reader:
            disease = (row.get("disease") or "").strip()
            symptoms = (row.get("symptoms") or "").strip()
            quality_flags = (row.get("quality_flags") or "").lower()
            if not disease or not symptoms:
                continue
            if "low_symptom_signal" in quality_flags:
                continue

            texts.append(symptoms.replace(";", " "))
            labels.append(disease)

    if len(texts) < 2:
        raise ValueError("Not enough valid rows to train a disease model.")

    return texts, labels


def build_pipeline() -> Pipeline:
    return Pipeline(
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


def train_model(csv_path: Path = DEFAULT_CSV, model_path: Path = DEFAULT_MODEL) -> None:
    texts, labels = load_cleaned_rows(csv_path)
    label_counts = Counter(labels)

    print("=== TRAIN CLEANED-CSV DISEASE MODEL ===")
    print(f"Rows: {len(texts)}")
    print(f"Diseases: {len(label_counts)}")
    print(f"CSV: {csv_path}")

    model = build_pipeline()
    model.fit(texts, labels)

    model_path.parent.mkdir(parents=True, exist_ok=True)
    dump(model, model_path)

    trained_model = TrainedDiseaseModel(str(csv_path), str(model_path))
    trained_model._write_model_metadata(len(texts))

    print(f"Saved model: {model_path}")
    print(f"Saved metadata: {trained_model.meta_path}")


def evaluate_model(csv_path: Path = DEFAULT_CSV, test_size: float = 0.2) -> None:
    texts, labels = load_cleaned_rows(csv_path)
    label_counts = Counter(labels)

    stratify = labels if min(label_counts.values()) >= 2 else None
    x_train, x_test, y_train, y_test = train_test_split(
        texts,
        labels,
        test_size=test_size,
        random_state=42,
        stratify=stratify,
    )

    model = build_pipeline()
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    print("=== EVALUATE CLEANED-CSV DISEASE MODEL ===")
    print(f"Train rows: {len(x_train)}")
    print(f"Test rows: {len(x_test)}")
    print(f"Accuracy: {accuracy_score(y_test, predictions):.2%}")

    try:
        scores = model.decision_function(x_test)
        top_3_hits = 0
        classes = list(model.classes_)
        for true_label, row_scores in zip(y_test, scores):
            ranked = sorted(zip(classes, row_scores), key=lambda item: item[1], reverse=True)[:3]
            top_3_hits += int(true_label in {label for label, _score in ranked})
        print(f"Top-3 accuracy: {top_3_hits / len(y_test):.2%}")
    except Exception as exc:
        print(f"Top-3 accuracy unavailable: {exc}")

    print("\nClassification report:")
    print(classification_report(y_test, predictions, zero_division=0))


def test_saved_model(model_path: Path = DEFAULT_MODEL) -> None:
    if not model_path.exists():
        raise FileNotFoundError(f"Saved model not found: {model_path}")

    model = load(model_path)
    samples = [
        "cough fever shortness of breath low oxygen chest pain",
        "headache nausea vomiting sensitivity to light",
        "high blood pressure palpitations chest discomfort",
        "abdominal pain diarrhea vomiting fever",
    ]

    print("=== TEST SAVED MODEL ===")
    for sample in samples:
        predicted = model.predict([sample])[0]
        print(f"{sample} -> {predicted}")


def retrain_backend_model() -> None:
    """Use the same class the backend uses, including metadata refresh."""
    if not DEFAULT_CSV.exists():
        from clean_disease_dataset import clean_dataset

        print("Cleaned CSV not found. Cleaning raw dataset first...")
        clean_dataset()

    model = TrainedDiseaseModel()
    status = model.retrain()
    print("=== BACKEND MODEL RETRAINED ===")
    print(f"Available: {status['available']}")
    print(f"Model exists: {status['model_exists']}")
    print(f"CSV exists: {status['csv_exists']}")
    print(f"Metadata matches CSV: {status['metadata_matches_csv']}")
    print(f"Model path: {status['model_path']}")


def main() -> None:
    print("=== LOCAL MEDICAL AI TRAINING ===")
    print("1. Retrain backend disease model from cleaned CSV")
    print("2. Evaluate cleaned CSV model")
    print("3. Test saved model with sample symptoms")
    print("4. Train model from custom CSV path")

    choice = input("Enter choice (1-4): ").strip()

    if choice == "1":
        retrain_backend_model()
    elif choice == "2":
        evaluate_model()
    elif choice == "3":
        test_saved_model()
    elif choice == "4":
        raw_path = input("Enter cleaned CSV path: ").strip().strip('"')
        csv_path = Path(raw_path).expanduser()
        if not csv_path.is_absolute():
            csv_path = Path(os.getcwd()) / csv_path
        train_model(csv_path)
    else:
        print("Invalid choice.")


if __name__ == "__main__":
    main()
