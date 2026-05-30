from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"
RAW_CSV = DATASET_DIR / "complete_disease_symptoms_treatments_50000.csv"
CLEAN_CSV = DATASET_DIR / "cleaned_disease_symptoms_treatments.csv"
REPORT_JSON = DATASET_DIR / "cleaned_disease_dataset_report.json"

REQUIRED_COLUMNS = {
    "disease",
    "symptoms",
    "treatment_or_cure",
    "advice",
    "treatment_status",
    "treatment_category",
    "cure_confidence",
    "dataset_origin",
    "source_notes",
}


def normalize_text(value: str) -> str:
    value = (value or "").strip().lower()
    value = value.replace("_", " ").replace("/", " ")
    value = re.sub(r"\s+", " ", value)
    return value


def normalize_free_text(value: str) -> str:
    value = (value or "").strip()
    value = re.sub(r"\s+", " ", value)
    return value


def parse_symptoms(value: str) -> list[str]:
    symptoms = []
    seen = set()

    for raw_symptom in re.split(r"[;,]", value or ""):
        symptom = normalize_text(raw_symptom)
        if not symptom or symptom in seen:
            continue
        seen.add(symptom)
        symptoms.append(symptom)

    return sorted(symptoms)


def clean_dataset(raw_csv: Path = RAW_CSV, clean_csv: Path = CLEAN_CSV, report_json: Path = REPORT_JSON) -> dict:
    if not raw_csv.exists():
        raise FileNotFoundError(f"Raw disease dataset not found: {raw_csv}")

    clean_csv.parent.mkdir(parents=True, exist_ok=True)
    report_json.parent.mkdir(parents=True, exist_ok=True)

    cleaned_rows: list[dict[str, str]] = []
    seen_training_keys: set[tuple[str, str]] = set()
    counters: Counter[str] = Counter()
    disease_counts: Counter[str] = Counter()
    symptom_counts: Counter[str] = Counter()

    with raw_csv.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        missing = sorted(REQUIRED_COLUMNS.difference(fieldnames))
        if missing:
            raise ValueError(f"Raw CSV is missing required columns: {', '.join(missing)}")

        for row in reader:
            counters["raw_rows"] += 1
            disease = normalize_text(row.get("disease", ""))
            symptoms = parse_symptoms(row.get("symptoms", ""))

            if not disease:
                counters["dropped_missing_disease"] += 1
                continue
            if not symptoms:
                counters["dropped_missing_symptoms"] += 1
                continue

            symptom_text = "; ".join(symptoms)
            training_key = (disease, symptom_text)
            if training_key in seen_training_keys:
                counters["dropped_duplicate_disease_symptoms"] += 1
                continue
            seen_training_keys.add(training_key)

            source_notes = normalize_free_text(row.get("source_notes", ""))
            quality_flags = []
            if len(symptoms) < 2:
                quality_flags.append("low_symptom_signal")
            if "generated" in source_notes.lower() or "requires clinician review" in source_notes.lower():
                quality_flags.append("treatment_text_requires_clinician_review")

            cleaned_row = {
                "id": str(len(cleaned_rows) + 1),
                "disease": disease,
                "symptoms": symptom_text,
                "symptom_count": str(len(symptoms)),
                "treatment_or_cure": normalize_free_text(row.get("treatment_or_cure", "")),
                "advice": normalize_free_text(row.get("advice", "")),
                "treatment_status": normalize_text(row.get("treatment_status", "")),
                "treatment_category": normalize_text(row.get("treatment_category", "")),
                "cure_confidence": normalize_text(row.get("cure_confidence", "")),
                "dataset_origin": normalize_text(row.get("dataset_origin", "")),
                "source_notes": source_notes,
                "quality_flags": "; ".join(quality_flags),
            }
            cleaned_rows.append(cleaned_row)
            disease_counts[disease] += 1
            symptom_counts.update(symptoms)

    output_columns = [
        "id",
        "disease",
        "symptoms",
        "symptom_count",
        "treatment_or_cure",
        "advice",
        "treatment_status",
        "treatment_category",
        "cure_confidence",
        "dataset_origin",
        "source_notes",
        "quality_flags",
    ]

    with clean_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=output_columns)
        writer.writeheader()
        writer.writerows(cleaned_rows)

    symptom_count_values = [int(row["symptom_count"]) for row in cleaned_rows]
    report = {
        **counters,
        "clean_rows": len(cleaned_rows),
        "disease_count": len(disease_counts),
        "symptom_count": len(symptom_counts),
        "rows_with_low_symptom_signal": sum(
            1 for row in cleaned_rows if "low_symptom_signal" in row["quality_flags"]
        ),
        "rows_requiring_clinician_treatment_review": sum(
            1 for row in cleaned_rows if "treatment_text_requires_clinician_review" in row["quality_flags"]
        ),
        "symptoms_per_row": {
            "min": min(symptom_count_values) if symptom_count_values else 0,
            "max": max(symptom_count_values) if symptom_count_values else 0,
            "avg": round(sum(symptom_count_values) / len(symptom_count_values), 3)
            if symptom_count_values
            else 0,
        },
        "top_diseases": disease_counts.most_common(20),
        "top_symptoms": symptom_counts.most_common(30),
        "raw_csv": str(raw_csv),
        "clean_csv": str(clean_csv),
        "important_note": (
            "Treatment/advice columns are dataset support text only. They are not a verified medication "
            "prescribing source and must be clinician-reviewed before patient-facing medication recommendations."
        ),
    }

    with report_json.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    return report


def main() -> None:
    report = clean_dataset()
    print("=== DISEASE DATASET CLEANED ===")
    print(f"Raw rows: {report['raw_rows']}")
    print(f"Clean rows: {report['clean_rows']}")
    print(f"Dropped duplicate disease/symptom rows: {report['dropped_duplicate_disease_symptoms']}")
    print(f"Diseases: {report['disease_count']}")
    print(f"Symptoms: {report['symptom_count']}")
    print(f"Clean CSV: {report['clean_csv']}")
    print(f"Report: {REPORT_JSON}")


if __name__ == "__main__":
    main()
