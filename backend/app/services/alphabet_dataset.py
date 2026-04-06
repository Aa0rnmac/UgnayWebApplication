from pathlib import Path
import zipfile

from app.core.config import settings

ALPHABET_LABELS_24 = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
]


def _find_kaggle_zip(datasets_root: Path) -> Path:
    direct_candidates = [
        datasets_root / "fsl_kaggle" / "fsl-dataset.zip",
        datasets_root / "archive.zip",
        datasets_root / "fsl_kaggle" / "archive.zip",
    ]
    for item in direct_candidates:
        if item.exists():
            return item

    for item in datasets_root.rglob("*.zip"):
        return item
    return direct_candidates[0]


def _find_collated_dir(datasets_root: Path) -> Path:
    candidates = [
        datasets_root / "fsl_kaggle" / "extracted" / "Collated",
        datasets_root / "fsl_kaggle" / "Collated",
        datasets_root / "Collated",
    ]
    for item in candidates:
        if item.exists() and item.is_dir():
            return item

    for item in datasets_root.rglob("Collated"):
        if item.is_dir():
            return item
    return candidates[0]


def _dataset_paths() -> dict[str, Path]:
    datasets_root = settings.datasets_root_path
    kaggle_zip = _find_kaggle_zip(datasets_root)
    kaggle_collated = _find_collated_dir(datasets_root)
    github_root = datasets_root / "MediaPipe-FSL-Alphabet" / "MediaPipe-FSL-Alphabet-main"
    github_model = github_root / "trained_SVM_linear_24classes.sav"
    github_scaler = github_root / "trained_scaler24.sav"

    return {
        "datasets_root": datasets_root,
        "kaggle_zip": kaggle_zip,
        "kaggle_collated": kaggle_collated,
        "github_root": github_root,
        "github_model": github_model,
        "github_scaler": github_scaler,
    }


def get_alphabet_dataset_status() -> dict[str, object]:
    paths = _dataset_paths()
    datasets_root = paths["datasets_root"]
    kaggle_zip = paths["kaggle_zip"]
    kaggle_collated = paths["kaggle_collated"]
    github_model = paths["github_model"]
    github_scaler = paths["github_scaler"]

    kaggle_zip_found = kaggle_zip.exists()
    kaggle_zip_valid = False
    kaggle_zip_error: str | None = None

    if kaggle_zip_found:
        try:
            with zipfile.ZipFile(kaggle_zip, "r") as archive:
                archive.testzip()
            kaggle_zip_valid = True
        except Exception as exc:  # noqa: BLE001
            kaggle_zip_error = str(exc)

    github_model_found = github_model.exists()
    github_scaler_found = github_scaler.exists()

    kaggle_collated_found = kaggle_collated.exists() and kaggle_collated.is_dir()
    kaggle_classes: list[str] = []
    kaggle_total_images = 0
    if kaggle_collated_found:
        class_dirs = [item for item in kaggle_collated.iterdir() if item.is_dir()]
        kaggle_classes = sorted(item.name for item in class_dirs)
        for class_dir in class_dirs:
            kaggle_total_images += len([f for f in class_dir.iterdir() if f.is_file()])

    return {
        "datasets_root": str(datasets_root),
        "kaggle_zip_found": kaggle_zip_found,
        "kaggle_zip_valid": kaggle_zip_valid,
        "kaggle_zip_error": kaggle_zip_error,
        "kaggle_zip_path": str(kaggle_zip),
        "kaggle_collated_found": kaggle_collated_found,
        "kaggle_collated_path": str(kaggle_collated),
        "kaggle_classes": kaggle_classes,
        "kaggle_total_images": kaggle_total_images,
        "github_model_found": github_model_found,
        "github_scaler_found": github_scaler_found,
        "github_model_path": str(github_model),
        "github_scaler_path": str(github_scaler),
        "supported_labels": ALPHABET_LABELS_24,
        "ready_for_alphabet_mode": github_model_found and github_scaler_found,
    }
