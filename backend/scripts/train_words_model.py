import argparse
import json
import sys
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
from app.services.custom_words_dataset import (  # noqa: E402
    CustomWordClipRow,
    load_custom_word_clip_rows,
)
from app.services.word_motion_features import (  # noqa: E402
    extract_sequence_from_video,
    mirror_sequence,
    sequence_to_feature_vector,
)
from app.services.words_dataset import (  # noqa: E402
    WordClipRow,
    get_words_dataset_status,
    load_word_clip_rows,
)


def _split_custom_rows_by_label(
    rows: list[CustomWordClipRow], test_ratio: float, seed: int
) -> tuple[list[CustomWordClipRow], list[CustomWordClipRow]]:
    grouped: dict[str, list[CustomWordClipRow]] = {}
    for row in rows:
        grouped.setdefault(row.label, []).append(row)

    train_rows: list[CustomWordClipRow] = []
    test_rows: list[CustomWordClipRow] = []
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
            raise RuntimeError(f"Custom label {label} has no training rows after split.")

    return train_rows, test_rows


def _convert_custom_to_word_rows(rows: list[CustomWordClipRow]) -> list[WordClipRow]:
    converted: list[WordClipRow] = []
    for index, row in enumerate(rows):
        converted.append(
            WordClipRow(
                clip_path=row.clip_path,
                id_label=f"custom_{index}_{row.label}",
                label=row.label,
                category="CUSTOM",
            )
        )
    return converted


def collect_split_features(
    rows: list[WordClipRow],
    target_frames: int,
    min_valid_frames: int,
    max_sampled_frames: int,
    use_mirror_augmentation: bool,
) -> tuple[np.ndarray, np.ndarray, dict[str, int], int]:
    features: list[np.ndarray] = []
    labels: list[str] = []
    class_kept: dict[str, int] = {}
    skipped_no_hand = 0

    for row in tqdm(rows, desc="Extracting word motion features"):
        sequence = extract_sequence_from_video(
            row.clip_path,
            target_frames=target_frames,
            min_valid_frames=min_valid_frames,
            max_sampled_frames=max_sampled_frames,
        )
        if sequence is None:
            skipped_no_hand += 1
            continue

        vector = sequence_to_feature_vector(sequence)
        features.append(vector)
        labels.append(row.label)
        class_kept[row.label] = class_kept.get(row.label, 0) + 1

        if use_mirror_augmentation:
            mirrored = mirror_sequence(sequence)
            features.append(sequence_to_feature_vector(mirrored))
            labels.append(row.label)
            class_kept[row.label] = class_kept.get(row.label, 0) + 1

    if not features:
        raise RuntimeError("No valid word motion features extracted from dataset.")

    return np.stack(features), np.array(labels), class_kept, skipped_no_hand


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train words mode model from FSL-105 clips (excluding numbers)."
    )
    parser.add_argument("--model-out", type=str, default="artifacts/words_model.joblib")
    parser.add_argument("--report-out", type=str, default="artifacts/words_training_report.json")
    parser.add_argument("--sequence-frames", type=int, default=settings.words_sequence_frames)
    parser.add_argument("--min-valid-frames", type=int, default=settings.words_min_sequence_frames)
    parser.add_argument("--max-sampled-frames", type=int, default=45)
    parser.add_argument("--limit-train", type=int, default=None)
    parser.add_argument("--limit-test", type=int, default=None)
    parser.add_argument("--n-estimators", type=int, default=400)
    parser.add_argument("--no-mirror-augmentation", action="store_true")
    parser.add_argument("--skip-custom-words", action="store_true")
    parser.add_argument("--custom-test-ratio", type=float, default=0.2)
    args = parser.parse_args()

    status = get_words_dataset_status()
    if not status["ready_for_training"]:
        raise RuntimeError(
            "FSL-105 words dataset not ready for training. "
            f"Found train clips: {status['train_clips_found']}"
        )

    train_rows = load_word_clip_rows("train", existing_only=True)
    test_rows = load_word_clip_rows("test", existing_only=True)
    custom_rows = load_custom_word_clip_rows(existing_only=True)

    custom_labels = sorted({item.label for item in custom_rows})
    custom_train_count = 0
    custom_test_count = 0
    if not args.skip_custom_words and custom_rows:
        custom_train, custom_test = _split_custom_rows_by_label(
            custom_rows, test_ratio=args.custom_test_ratio, seed=42
        )
        train_rows.extend(_convert_custom_to_word_rows(custom_train))
        test_rows.extend(_convert_custom_to_word_rows(custom_test))
        custom_train_count = len(custom_train)
        custom_test_count = len(custom_test)
        print(
            "Included custom word clips:",
            f"labels={len(custom_labels)}, train={custom_train_count}, test={custom_test_count}",
        )
    elif args.skip_custom_words:
        print("Custom words skipped (--skip-custom-words enabled).")
    else:
        print(f"No custom word clips found under {settings.datasets_root_path / 'custom_words'}.")

    if args.limit_train:
        train_rows = train_rows[: args.limit_train]
    if args.limit_test:
        test_rows = test_rows[: args.limit_test]

    print(f"Using train clips: {len(train_rows)}")
    print(f"Using test clips: {len(test_rows)}")

    X_train, y_train, kept_train, train_skipped = collect_split_features(
        rows=train_rows,
        target_frames=args.sequence_frames,
        min_valid_frames=args.min_valid_frames,
        max_sampled_frames=args.max_sampled_frames,
        use_mirror_augmentation=not args.no_mirror_augmentation,
    )

    X_test: np.ndarray
    y_test: np.ndarray
    test_skipped = 0
    kept_test: dict[str, int] = {}
    if test_rows:
        X_test_all, y_test_all, kept_test, test_skipped = collect_split_features(
            rows=test_rows,
            target_frames=args.sequence_frames,
            min_valid_frames=args.min_valid_frames,
            max_sampled_frames=args.max_sampled_frames,
            use_mirror_augmentation=False,
        )
        known = set(y_train.tolist())
        mask = np.array([label in known for label in y_test_all])
        X_test = X_test_all[mask]
        y_test = y_test_all[mask]
    else:
        X_test = np.empty((0, X_train.shape[1]), dtype=np.float32)
        y_test = np.empty((0,), dtype=object)

    if y_test.size == 0:
        X_train, X_test, y_train, y_test = train_test_split(
            X_train, y_train, test_size=0.2, random_state=42, stratify=y_train
        )
        kept_test = {}
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

    artifact = {
        "model": model,
        "classes": sorted(list(set(y_train.tolist()))),
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
        "custom_words_included": not args.skip_custom_words and bool(custom_rows),
        "custom_words_labels": custom_labels,
        "custom_words_train_clips": custom_train_count,
        "custom_words_test_clips": custom_test_count,
        "train_samples": int(len(y_train)),
        "test_samples": int(len(y_test)),
        "sequence_frames": int(args.sequence_frames),
        "min_valid_frames": int(args.min_valid_frames),
        "max_sampled_frames": int(args.max_sampled_frames),
        "train_class_kept_samples": kept_train,
        "test_class_kept_samples": kept_test,
        "skipped_train_no_hand": int(train_skipped),
        "skipped_test_no_hand": int(test_skipped),
        "accuracy": accuracy,
        "classification_report": report,
    }
    report_out.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")

    print(f"Words training finished. Accuracy: {accuracy:.4f}")
    print(f"Model saved to: {model_out}")
    print(f"Report saved to: {report_out}")


if __name__ == "__main__":
    main()
