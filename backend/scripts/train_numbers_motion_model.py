import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from random import Random

import joblib
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from tqdm import tqdm

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import settings  # noqa: E402
from app.services.custom_numbers_motion_dataset import (  # noqa: E402
    CustomNumberMotionClipRow,
    get_custom_numbers_motion_dataset_status,
    load_custom_number_motion_clip_rows,
)
from app.services.fsl_numbers_dataset import load_fsl_number_clip_rows  # noqa: E402
from app.services.word_motion_features import (  # noqa: E402
    extract_sequence_from_video,
    mirror_sequence,
    sequence_to_feature_vector,
)


@dataclass(frozen=True)
class MotionRow:
    clip_path: Path
    label: str


def _split_custom_rows_by_label(
    rows: list[CustomNumberMotionClipRow], test_ratio: float, seed: int
) -> tuple[list[CustomNumberMotionClipRow], list[CustomNumberMotionClipRow]]:
    grouped: dict[str, list[CustomNumberMotionClipRow]] = {}
    for row in rows:
        grouped.setdefault(row.label, []).append(row)

    train_rows: list[CustomNumberMotionClipRow] = []
    test_rows: list[CustomNumberMotionClipRow] = []
    rng = Random(seed)

    for label, label_rows in grouped.items():
        shuffled = label_rows[:]
        rng.shuffle(shuffled)
        if len(shuffled) <= 1:
            train_rows.extend(shuffled)
            continue

        test_count = max(1, int(round(len(shuffled) * test_ratio)))
        if test_count >= len(shuffled):
            test_count = len(shuffled) - 1

        test_rows.extend(shuffled[:test_count])
        train_rows.extend(shuffled[test_count:])
        if not train_rows:
            raise RuntimeError(f"Label {label} has no training rows after split.")

    return train_rows, test_rows


def _convert_custom_rows(rows: list[CustomNumberMotionClipRow]) -> list[MotionRow]:
    return [MotionRow(clip_path=row.clip_path, label=row.label) for row in rows]


def _convert_ten_rows(split: str) -> list[MotionRow]:
    rows = load_fsl_number_clip_rows(split, existing_only=True)
    return [MotionRow(clip_path=row.clip_path, label="10") for row in rows if row.digit == "10"]


def _limit_rows_per_label(rows: list[MotionRow], max_per_label: int | None) -> list[MotionRow]:
    if not max_per_label or max_per_label <= 0:
        return rows
    grouped: dict[str, list[MotionRow]] = {}
    for row in rows:
        grouped.setdefault(row.label, []).append(row)

    limited: list[MotionRow] = []
    for label in sorted(grouped.keys(), key=lambda item: int(item)):
        limited.extend(grouped[label][:max_per_label])
    return limited


def _collect_features(
    rows: list[MotionRow],
    target_frames: int,
    min_valid_frames: int,
    max_sampled_frames: int,
    use_augmentation: bool,
) -> tuple[np.ndarray, np.ndarray, dict[str, int], int]:
    features: list[np.ndarray] = []
    labels: list[str] = []
    class_kept: dict[str, int] = {}
    skipped = 0

    for row in tqdm(rows, desc="Extracting numbers motion features"):
        sequence = extract_sequence_from_video(
            row.clip_path,
            target_frames=target_frames,
            min_valid_frames=min_valid_frames,
            max_sampled_frames=max_sampled_frames,
        )
        if sequence is None:
            skipped += 1
            continue

        features.append(sequence_to_feature_vector(sequence))
        labels.append(row.label)
        class_kept[row.label] = class_kept.get(row.label, 0) + 1

        if use_augmentation:
            mirrored = mirror_sequence(sequence)
            features.append(sequence_to_feature_vector(mirrored))
            labels.append(row.label)
            class_kept[row.label] = class_kept.get(row.label, 0) + 1

    if not features:
        raise RuntimeError("No valid motion features extracted for numbers motion training.")

    return np.stack(features), np.array(labels), class_kept, skipped


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train motion numbers model for 11-100 custom clips (optional 10 from FSL-105)."
    )
    parser.add_argument("--model-out", type=str, default="artifacts/numbers_motion_model.joblib")
    parser.add_argument(
        "--report-out", type=str, default="artifacts/numbers_motion_training_report.json"
    )
    parser.add_argument("--sequence-frames", type=int, default=settings.numbers_motion_sequence_frames)
    parser.add_argument(
        "--min-valid-frames", type=int, default=settings.numbers_motion_min_sequence_frames
    )
    parser.add_argument("--max-sampled-frames", type=int, default=38)
    parser.add_argument("--n-estimators", type=int, default=600)
    parser.add_argument("--custom-test-ratio", type=float, default=0.2)
    parser.add_argument("--max-per-label-train", type=int, default=None)
    parser.add_argument("--max-per-label-test", type=int, default=None)
    parser.add_argument("--no-augmentation", action="store_true")
    parser.add_argument("--skip-ten", action="store_true")
    args = parser.parse_args()

    status = get_custom_numbers_motion_dataset_status()
    if not status["ready_for_training"]:
        raise RuntimeError(
            "Custom motion numbers dataset is not ready. "
            f"Found labels: {status['label_count']} clips: {status['total_clips']}"
        )

    custom_rows = load_custom_number_motion_clip_rows(existing_only=True)
    custom_train_raw, custom_test_raw = _split_custom_rows_by_label(
        custom_rows, test_ratio=args.custom_test_ratio, seed=42
    )
    train_rows = _convert_custom_rows(custom_train_raw)
    test_rows = _convert_custom_rows(custom_test_raw)

    ten_train_count = 0
    ten_test_count = 0
    if not args.skip_ten:
        ten_train = _convert_ten_rows("train")
        ten_test = _convert_ten_rows("test")
        ten_train_count = len(ten_train)
        ten_test_count = len(ten_test)
        train_rows.extend(ten_train)
        test_rows.extend(ten_test)

    train_rows = _limit_rows_per_label(train_rows, args.max_per_label_train)
    test_rows = _limit_rows_per_label(test_rows, args.max_per_label_test)

    train_labels = {row.label for row in train_rows}
    if len(train_labels) < 2:
        raise RuntimeError("Need at least 2 labels to train numbers motion model.")

    X_train, y_train, train_counts, train_skipped = _collect_features(
        rows=train_rows,
        target_frames=args.sequence_frames,
        min_valid_frames=args.min_valid_frames,
        max_sampled_frames=args.max_sampled_frames,
        use_augmentation=not args.no_augmentation,
    )

    X_test: np.ndarray
    y_test: np.ndarray
    test_counts: dict[str, int]
    test_skipped: int
    if test_rows:
        X_test_all, y_test_all, test_counts, test_skipped = _collect_features(
            rows=test_rows,
            target_frames=args.sequence_frames,
            min_valid_frames=args.min_valid_frames,
            max_sampled_frames=args.max_sampled_frames,
            use_augmentation=False,
        )
        known_labels = set(y_train.tolist())
        mask = np.array([label in known_labels for label in y_test_all])
        X_test = X_test_all[mask]
        y_test = y_test_all[mask]
    else:
        X_test = np.empty((0, X_train.shape[1]), dtype=np.float32)
        y_test = np.empty((0,), dtype=object)
        test_counts = {}
        test_skipped = 0

    if y_test.size == 0:
        X_train, X_test, y_train, y_test = train_test_split(
            X_train, y_train, test_size=0.2, random_state=42, stratify=y_train
        )
        test_counts = {}
        test_skipped = 0

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

    trained_classes = sorted(list({str(item) for item in y_train.tolist()}), key=lambda item: int(item))
    artifact = {
        "model": model,
        "classes": trained_classes,
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
        "dataset_status": status,
        "custom_train_rows": len(custom_train_raw),
        "custom_test_rows": len(custom_test_raw),
        "include_ten": not args.skip_ten,
        "ten_train_rows": ten_train_count,
        "ten_test_rows": ten_test_count,
        "train_samples": int(len(y_train)),
        "test_samples": int(len(y_test)),
        "sequence_frames": int(args.sequence_frames),
        "min_valid_frames": int(args.min_valid_frames),
        "max_sampled_frames": int(args.max_sampled_frames),
        "train_class_kept_samples": train_counts,
        "test_class_kept_samples": test_counts,
        "skipped_train_no_hand": int(train_skipped),
        "skipped_test_no_hand": int(test_skipped),
        "accuracy": accuracy,
        "classification_report": report,
    }
    report_out.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")

    print(f"Numbers motion training finished. Accuracy: {accuracy:.4f}")
    print(f"Model saved to: {model_out}")
    print(f"Report saved to: {report_out}")


if __name__ == "__main__":
    main()
