from pathlib import Path

from app.core.config import settings


DIGIT_LABELS = [str(index) for index in range(10)]


def _candidate_dataset_dirs() -> list[Path]:
    datasets_root = settings.datasets_root_path
    return [
        datasets_root / "numbers_digits" / "source" / "Sign-Language-Digits-Dataset-master" / "Dataset",
        datasets_root / "numbers_digits" / "Sign-Language-Digits-Dataset-master" / "Dataset",
        datasets_root / "Sign-Language-Digits-Dataset" / "Dataset",
        datasets_root / "sign-language-digits" / "Dataset",
        datasets_root / "digits_0_9" / "Dataset",
    ]


def _find_dataset_dir() -> Path:
    for candidate in _candidate_dataset_dirs():
        if candidate.exists() and candidate.is_dir():
            return candidate
    return _candidate_dataset_dirs()[0]


def get_numbers_dataset_status() -> dict[str, object]:
    dataset_dir = _find_dataset_dir()
    found = dataset_dir.exists() and dataset_dir.is_dir()

    class_counts: dict[str, int] = {}
    missing_labels: list[str] = []
    total_images = 0

    if found:
        for label in DIGIT_LABELS:
            class_dir = dataset_dir / label
            if not class_dir.exists() or not class_dir.is_dir():
                missing_labels.append(label)
                class_counts[label] = 0
                continue
            count = len([item for item in class_dir.iterdir() if item.is_file()])
            class_counts[label] = count
            total_images += count
    else:
        missing_labels = DIGIT_LABELS.copy()

    return {
        "dataset_path": str(dataset_dir),
        "dataset_found": found,
        "class_labels": DIGIT_LABELS,
        "class_counts": class_counts,
        "missing_labels": missing_labels,
        "total_images": total_images,
        "ready_for_training": found and len(missing_labels) == 0 and total_images > 0,
    }
