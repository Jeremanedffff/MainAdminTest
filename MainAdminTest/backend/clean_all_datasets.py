from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from clean_disease_dataset import CLEAN_CSV as CLEAN_DISEASE_CSV
from clean_disease_dataset import RAW_CSV as RAW_DISEASE_CSV
from clean_disease_dataset import clean_dataset as clean_disease_dataset
from clean_disease_dataset import normalize_text


csv.field_size_limit(sys.maxsize)

BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"

RAW_DRUG_FILES = {
    "train": DATASET_DIR / "drug_review_train.csv",
    "test": DATASET_DIR / "drug_review_test.csv",
    "validation": DATASET_DIR / "drug_review_validation.csv",
}

CLEAN_DRUG_REVIEWS_CSV = DATASET_DIR / "cleaned_drug_reviews.csv"
MEDICATION_SUMMARY_CSV = DATASET_DIR / "cleaned_medication_condition_summary.csv"
DRUG_REPORT_JSON = DATASET_DIR / "cleaned_drug_review_report.json"
MASTER_REPORT_JSON = DATASET_DIR / "cleaned_dataset_master_report.json"


def normalize_review(value: str) -> str:
    value = (value or "").strip().strip('"')
    value = value.replace("\r\n", " ").replace("\n", " ").replace("\r", " ")
    value = re.sub(r"\s+", " ", value)
    return value


def parse_float(value: str) -> float | None:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def parse_int(value: str) -> int | None:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None

def parse_review_date(value: str) -> str:
    value = (value or "").strip()
    for fmt in ("%B %d, %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    return ""


def sentiment_from_rating(rating: float) -> str:
    if rating >= 8:
        return "positive"
    if rating >= 5:
        return "mixed"
    return "negative"


def is_valid_condition(condition: str) -> bool:
    if len(condition) < 3:
        return False

    noisy_patterns = [
        "<",
        ">",
        "users found this comment helpful",
        "comment helpful",
        "span",
    ]
    return not any(pattern in condition for pattern in noisy_patterns)


def clean_drug_reviews() -> dict:
    existing_clean_outputs = [
        CLEAN_DRUG_REVIEWS_CSV,
        MEDICATION_SUMMARY_CSV,
        DRUG_REPORT_JSON,
    ]
    if not any(path.exists() for path in RAW_DRUG_FILES.values()) and all(
        path.exists() and path.stat().st_size > 0 for path in existing_clean_outputs
    ):
        with DRUG_REPORT_JSON.open(encoding="utf-8") as handle:
            report = json.load(handle)
        report["raw_csvs_already_removed"] = True
        return report

    required = {"patient_id", "drugName", "condition", "review", "rating", "date", "usefulCount"}
    cleaned_rows: list[dict[str, str]] = []
    seen: set[tuple[str, str, str, str]] = set()
    counters: Counter[str] = Counter()
    condition_counts: Counter[str] = Counter()
    drug_counts: Counter[str] = Counter()
    summary: dict[tuple[str, str], dict[str, float | int]] = defaultdict(
        lambda: {
            "review_count": 0,
            "rating_sum": 0.0,
            "useful_sum": 0,
            "positive_reviews": 0,
            "mixed_reviews": 0,
            "negative_reviews": 0,
        }
    )

    for split, path in RAW_DRUG_FILES.items():
        if not path.exists():
            counters[f"missing_{split}_file"] += 1
            continue

        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            fieldnames = {name for name in (reader.fieldnames or []) if name}
            missing = sorted(required.difference(fieldnames))
            if missing:
                raise ValueError(f"{path.name} is missing required columns: {', '.join(missing)}")

            for row in reader:
                counters[f"{split}_raw_rows"] += 1
                counters["raw_rows"] += 1

                patient_id = str(row.get("patient_id", "")).strip()
                drug_name = normalize_text(row.get("drugName", ""))
                condition = normalize_text(row.get("condition", ""))
                review = normalize_review(row.get("review", ""))
                rating = parse_float(row.get("rating", ""))
                useful_count = parse_int(row.get("usefulCount", ""))
                date_iso = parse_review_date(row.get("date", ""))

                if not patient_id or not drug_name or not condition or not review:
                    counters["dropped_missing_required_text"] += 1
                    continue
                if not is_valid_condition(condition):
                    counters["dropped_invalid_condition"] += 1
                    continue
                if rating is None or rating < 1 or rating > 10:
                    counters["dropped_invalid_rating"] += 1
                    continue
                if useful_count is None or useful_count < 0:
                    counters["dropped_invalid_useful_count"] += 1
                    continue

                key = (patient_id, drug_name, condition, review.lower())
                if key in seen:
                    counters["dropped_duplicate_reviews"] += 1
                    continue
                seen.add(key)

                sentiment = sentiment_from_rating(rating)
                cleaned = {
                    "id": str(len(cleaned_rows) + 1),
                    "source_split": split,
                    "patient_id": patient_id,
                    "drug_name": drug_name,
                    "condition": condition,
                    "review": review,
                    "rating": f"{rating:.1f}",
                    "sentiment": sentiment,
                    "date": date_iso,
                    "useful_count": str(useful_count),
                    "review_length": str(len(review.split())),
                    "quality_flags": "" if date_iso else "unparsed_date",
                }
                cleaned_rows.append(cleaned)

                condition_counts[condition] += 1
                drug_counts[drug_name] += 1
                item = summary[(condition, drug_name)]
                item["review_count"] = int(item["review_count"]) + 1
                item["rating_sum"] = float(item["rating_sum"]) + rating
                item["useful_sum"] = int(item["useful_sum"]) + useful_count
                item[f"{sentiment}_reviews"] = int(item[f"{sentiment}_reviews"]) + 1

    review_columns = [
        "id",
        "source_split",
        "patient_id",
        "drug_name",
        "condition",
        "review",
        "rating",
        "sentiment",
        "date",
        "useful_count",
        "review_length",
        "quality_flags",
    ]
    with CLEAN_DRUG_REVIEWS_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=review_columns)
        writer.writeheader()
        writer.writerows(cleaned_rows)

    summary_rows = []
    for (condition, drug_name), values in summary.items():
        review_count = int(values["review_count"])
        positive = int(values["positive_reviews"])
        mixed = int(values["mixed_reviews"])
        negative = int(values["negative_reviews"])
        summary_rows.append(
            {
                "condition": condition,
                "drug_name": drug_name,
                "review_count": str(review_count),
                "average_rating": f"{float(values['rating_sum']) / review_count:.2f}",
                "total_useful_count": str(int(values["useful_sum"])),
                "positive_reviews": str(positive),
                "mixed_reviews": str(mixed),
                "negative_reviews": str(negative),
                "positive_rate": f"{positive / review_count:.3f}",
                "quality_flags": "patient_reported_not_prescribing_guidance",
            }
        )

    summary_rows.sort(
        key=lambda row: (
            row["condition"],
            -int(row["review_count"]),
            -float(row["average_rating"]),
            row["drug_name"],
        )
    )

    summary_columns = [
        "condition",
        "drug_name",
        "review_count",
        "average_rating",
        "total_useful_count",
        "positive_reviews",
        "mixed_reviews",
        "negative_reviews",
        "positive_rate",
        "quality_flags",
    ]
    with MEDICATION_SUMMARY_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=summary_columns)
        writer.writeheader()
        writer.writerows(summary_rows)

    report = {
        **counters,
        "clean_rows": len(cleaned_rows),
        "condition_count": len(condition_counts),
        "drug_count": len(drug_counts),
        "condition_drug_pairs": len(summary_rows),
        "top_conditions": condition_counts.most_common(25),
        "top_drugs": drug_counts.most_common(25),
        "clean_drug_reviews_csv": str(CLEAN_DRUG_REVIEWS_CSV),
        "medication_summary_csv": str(MEDICATION_SUMMARY_CSV),
        "important_note": (
            "Drug reviews are patient-reported evidence. They can support medication context, "
            "but they are not prescribing guidance and must not override clinician judgment, "
            "local formulary rules, contraindications, allergies, pregnancy status, age, kidney/liver function, or guidelines."
        ),
    }

    with DRUG_REPORT_JSON.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    return report


def delete_raw_files() -> list[str]:
    deleted = []
    raw_files = [RAW_DISEASE_CSV, *RAW_DRUG_FILES.values()]
    required_clean_files = [
        CLEAN_DISEASE_CSV,
        CLEAN_DRUG_REVIEWS_CSV,
        MEDICATION_SUMMARY_CSV,
        DRUG_REPORT_JSON,
    ]

    missing_clean = [str(path) for path in required_clean_files if not path.exists() or path.stat().st_size == 0]
    if missing_clean:
        raise RuntimeError("Refusing to delete raw files because cleaned outputs are missing: " + ", ".join(missing_clean))

    for path in raw_files:
        if path.exists():
            path.unlink()
            deleted.append(str(path))

    return deleted


def clean_all(delete_raw: bool = False) -> dict:
    disease_report = clean_disease_dataset() if RAW_DISEASE_CSV.exists() else {
        "clean_rows": count_csv_rows(CLEAN_DISEASE_CSV),
        "clean_csv": str(CLEAN_DISEASE_CSV),
        "raw_csv_already_removed": True,
    }
    drug_report = clean_drug_reviews()
    deleted = delete_raw_files() if delete_raw else []

    master_report = {
        "disease_dataset": disease_report,
        "drug_review_dataset": drug_report,
        "deleted_raw_files": deleted,
        "model_ready_files": [
            str(CLEAN_DISEASE_CSV),
            str(CLEAN_DRUG_REVIEWS_CSV),
            str(MEDICATION_SUMMARY_CSV),
        ],
    }
    with MASTER_REPORT_JSON.open("w", encoding="utf-8") as handle:
        json.dump(master_report, handle, indent=2)

    return master_report


def count_csv_rows(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open(newline="", encoding="utf-8") as handle:
        return max(sum(1 for _line in handle) - 1, 0)


def main() -> None:
    delete_raw = "--delete-raw" in sys.argv
    report = clean_all(delete_raw=delete_raw)
    disease = report["disease_dataset"]
    drug = report["drug_review_dataset"]
    print("=== ALL DATASETS CLEANED ===")
    print(f"Disease clean rows: {disease.get('clean_rows')}")
    print(f"Drug review clean rows: {drug.get('clean_rows')}")
    print(f"Medication condition/drug pairs: {drug.get('condition_drug_pairs')}")
    print("Model-ready files:")
    for path in report["model_ready_files"]:
        print(f"- {path}")
    if delete_raw:
        print("Deleted raw files:")
        for path in report["deleted_raw_files"]:
            print(f"- {path}")


if __name__ == "__main__":
    main()
