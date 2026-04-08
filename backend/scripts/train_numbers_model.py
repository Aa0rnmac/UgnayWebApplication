import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
import joblib
import mediapipe as mp
import numpy as np
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from tqdm import tqdm

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import settings  # noqa: E402
from app.services.numbers_dataset import DIGIT_LABELS, get_numbers_dataset_status  # noqa: E402


def normalize_landmarks(landmarks: np.ndarray) -> np.ndarray | None:
    if landmarks.shape != (21, 3):
        return None
    centered = landmarks - landmarks[0]
    scale = float(np.max(np.linalg.norm(centered[:, :2], axis=1)))
    if scale <= 1e-9:
        return None
    normalized = centered / scale
    return normalized.flatten().astype(np.float32)


def extract_features_from_image(
    image_bgr: np.ndarray,
    hands: mp.solutions.hands.Hands,
) -> np.ndarray | None:
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    result = hands.process(image_rgb)
    if not result.multi_hand_landmarks:
        return None
    raw = result.multi_hand_landmarks[0].landmark
    landmarks = np.array([[point.x, point.y, point.z] for point in raw], dtype=np.float32)
    return normalize_landmarks(landmarks)


def collect_dataset(
    dataset_dir: Path,
    max_images_per_class: int | None,
    use_mirror_augmentation: bool,
) -> tuple[np.ndarray, np.ndarray, dict[str, int], int]:
    labels: list[str] = []
    features: list[np.ndarray] = []
    class_kept: dict[str, int] = {}
    skipped_no_hand = 0

    with mp.solutions.hands.Hands(
        static_image_mode=True,
        max_num_hands=1,
        min_detection_confidence=settings.mediapipe_detection_confidence,
        model_complexity=settings.mediapipe_model_complexity,
    ) as hands:
        for class_label in DIGIT_LABELS:
            class_dir = dataset_dir / class_label
            if not class_dir.exists() or not class_dir.is_dir():
                class_kept[class_label] = 0
                continue

            image_paths = sorted([item for item in class_dir.iterdir() if item.is_file()])
            if max_images_per_class and len(image_paths) > max_images_per_class:
                stride = max(1, len(image_paths) // max_images_per_class)
                image_paths = image_paths[::stride][:max_images_per_class]

            kept = 0
            for image_path in tqdm(image_paths, desc=f"Extracting {class_label}", leave=False):
                image = cv2.imread(str(image_path))
                if image is None:
                    continue

                feature = extract_features_from_image(image, hands)
                if feature is None:
                    skipped_no_hand += 1
                    continue

                features.append(feature)
                labels.append(class_label)
                kept += 1

                if use_mirror_augmentation:
                    mirror_feature = extract_features_from_image(cv2.flip(image, 1), hands)
                    if mirror_feature is not None:
                        features.append(mirror_feature)
                        labels.append(class_label)
                        kept += 1

            class_kept[class_label] = kept

    if not features:
        raise RuntimeError("No features extracted from digits dataset. Training cannot continue.")

    return np.stack(features), np.array(labels), class_kept, skipped_no_hand


def main() -> None:
    parser = argparse.ArgumentParser(description="Train numbers model from static sign digits dataset.")
    parser.add_argument("--max-images-per-class", type=int, default=None)
    parser.add_argument("--no-mirror-augmentation", action="store_true")
    parser.add_argument("--model-out", type=str, default="artifacts/numbers_model.joblib")
    parser.add_argument("--report-out", type=str, default="artifacts/numbers_training_report.json")
    args = parser.parse_args()

    status = get_numbers_dataset_status()
    if not status["ready_for_training"]:
        raise RuntimeError(
            f"Numbers dataset not ready at {status['dataset_path']}. Missing: {status['missing_labels']}"
        )

    dataset_dir = Path(status["dataset_path"])
    model_out = settings.resolve_artifact_path(args.model_out)
    report_out = settings.resolve_artifact_path(args.report_out)
    model_out.parent.mkdir(parents=True, exist_ok=True)
    report_out.parent.mkdir(parents=True, exist_ok=True)

    print(f"Using numbers dataset: {dataset_dir}")
    X, y, class_kept, skipped_no_hand = collect_dataset(
        dataset_dir=dataset_dir,
        max_images_per_class=args.max_images_per_class,
        use_mirror_augmentation=not args.no_mirror_augmentation,
    )
    print(f"Extracted samples: {len(y)}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pipeline = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "svc",
                SVC(
                    kernel="rbf",
                    C=8.0,
                    gamma="scale",
                    probability=True,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ]
    )
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    accuracy = float(accuracy_score(y_test, y_pred))
    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)

    artifact = {
        "pipeline": pipeline,
        "classes": sorted(list(set(y.tolist()))),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "feature_dim": int(X.shape[1]),
        "train_samples": int(len(y_train)),
        "test_samples": int(len(y_test)),
        "accuracy": accuracy,
    }
    joblib.dump(artifact, model_out)

    report_payload = {
        "model_path": str(model_out),
        "dataset_path": str(dataset_dir),
        "classes": sorted(class_kept.keys()),
        "class_kept_samples": class_kept,
        "total_samples": int(len(y)),
        "skipped_no_hand": int(skipped_no_hand),
        "train_samples": int(len(y_train)),
        "test_samples": int(len(y_test)),
        "accuracy": accuracy,
        "classification_report": report,
    }
    report_out.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")

    print(f"Training finished. Accuracy: {accuracy:.4f}")
    print(f"Model saved to: {model_out}")
    print(f"Report saved to: {report_out}")


if __name__ == "__main__":
    main()
