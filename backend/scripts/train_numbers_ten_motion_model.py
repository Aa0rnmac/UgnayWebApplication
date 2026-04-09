import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.metrics import accuracy_score, classification_report
from tqdm import tqdm

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import settings  # noqa: E402
from app.services.fsl_numbers_dataset import load_fsl_number_clip_rows  # noqa: E402
from app.services.word_motion_features import (  # noqa: E402
    extract_sequence_from_video,
    mirror_sequence,
    sequence_to_feature_vector,
)


def _collect_features(
    rows,
    target_frames: int,
    min_valid_frames: int,
    max_sampled_frames: int,
    use_augmentation: bool,
):
    features: list[np.ndarray] = []
    labels: list[str] = []
    per_class_count: dict[str, int] = {"TEN": 0, "NOT_TEN": 0}
    skipped = 0

    for row in tqdm(rows, desc="Extracting ten-motion features"):
        sequence = extract_sequence_from_video(
            row.clip_path,
            target_frames=target_frames,
            min_valid_frames=min_valid_frames,
            max_sampled_frames=max_sampled_frames,
        )
        if sequence is None:
            skipped += 1
            continue

        class_label = "TEN" if row.digit == "10" else "NOT_TEN"
        features.append(sequence_to_feature_vector(sequence))
        labels.append(class_label)
        per_class_count[class_label] += 1

        if use_augmentation:
            mirrored = mirror_sequence(sequence)
            features.append(sequence_to_feature_vector(mirrored))
            labels.append(class_label)
            per_class_count[class_label] += 1

    if not features:
        raise RuntimeError("No valid sequence features extracted for ten-motion training.")
    return np.stack(features), np.array(labels), per_class_count, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Train motion detector for number 10 using FSL-105 clips.")
    parser.add_argument("--model-out", type=str, default="artifacts/numbers_ten_motion_model.joblib")
    parser.add_argument(
        "--report-out", type=str, default="artifacts/numbers_ten_motion_training_report.json"
    )
    parser.add_argument("--sequence-frames", type=int, default=settings.numbers_ten_sequence_frames)
    parser.add_argument(
        "--min-valid-frames", type=int, default=settings.numbers_ten_min_sequence_frames
    )
    parser.add_argument("--max-sampled-frames", type=int, default=45)
    parser.add_argument("--n-estimators", type=int, default=300)
    parser.add_argument("--no-augmentation", action="store_true")
    args = parser.parse_args()

    train_rows = load_fsl_number_clip_rows("train", existing_only=True)
    test_rows = load_fsl_number_clip_rows("test", existing_only=True)
    if not train_rows or not test_rows:
        raise RuntimeError(
            f"Missing FSL number clips. Check {settings.datasets_root_path / 'fsl_105'}."
        )

    X_train, y_train, train_counts, train_skipped = _collect_features(
        train_rows,
        target_frames=args.sequence_frames,
        min_valid_frames=args.min_valid_frames,
        max_sampled_frames=args.max_sampled_frames,
        use_augmentation=not args.no_augmentation,
    )
    X_test, y_test, test_counts, test_skipped = _collect_features(
        test_rows,
        target_frames=args.sequence_frames,
        min_valid_frames=args.min_valid_frames,
        max_sampled_frames=args.max_sampled_frames,
        use_augmentation=False,
    )

    model = ExtraTreesClassifier(
        n_estimators=args.n_estimators,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    accuracy = float(accuracy_score(y_test, y_pred))
    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)

    model_out = (ROOT / args.model_out).resolve()
    report_out = (ROOT / args.report_out).resolve()
    model_out.parent.mkdir(parents=True, exist_ok=True)
    report_out.parent.mkdir(parents=True, exist_ok=True)

    artifact = {
        "model": model,
        "classes": ["NOT_TEN", "TEN"],
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "feature_dim": int(X_train.shape[1]),
        "sequence_frames": int(args.sequence_frames),
        "min_valid_frames": int(args.min_valid_frames),
        "train_samples": int(len(y_train)),
        "test_samples": int(len(y_test)),
        "accuracy": accuracy,
    }
    joblib.dump(artifact, model_out)

    report_payload = {
        "model_path": str(model_out),
        "train_rows_seen": len(train_rows),
        "test_rows_seen": len(test_rows),
        "train_samples": int(len(y_train)),
        "test_samples": int(len(y_test)),
        "train_class_counts": train_counts,
        "test_class_counts": test_counts,
        "skipped_train_no_hand": int(train_skipped),
        "skipped_test_no_hand": int(test_skipped),
        "accuracy": accuracy,
        "classification_report": report,
    }
    report_out.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")

    print(f"Ten-motion training finished. Accuracy: {accuracy:.4f}")
    print(f"Model saved to: {model_out}")
    print(f"Report saved to: {report_out}")


if __name__ == "__main__":
    main()
