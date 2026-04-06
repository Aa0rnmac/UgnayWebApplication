from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings


NUMBER_GROUP_RANGE_MAP: dict[str, tuple[int, int]] = {
    "0-10": (0, 10),
    "11-20": (11, 20),
    "21-30": (21, 30),
    "31-40": (31, 40),
    "41-50": (41, 50),
    "51-60": (51, 60),
    "61-70": (61, 70),
    "71-80": (71, 80),
    "81-90": (81, 90),
    "91-100": (91, 100),
    "all": (0, 100),
}
NUMBER_GROUP_KEYS = set(NUMBER_GROUP_RANGE_MAP.keys())


@dataclass(frozen=True)
class CustomNumberMotionClipRow:
    clip_path: Path
    label: str
    batch: str


def custom_numbers_motion_root() -> Path:
    return settings.datasets_root_path / "custom_numbers_motion"


def _video_extensions() -> set[str]:
    return {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def _parse_group_name(value: str) -> tuple[int, int] | None:
    raw = value.strip().replace(" ", "")
    if "-" not in raw:
        return None
    start_text, end_text = raw.split("-", 1)
    if not start_text.isdigit() or not end_text.isdigit():
        return None
    start = int(start_text)
    end = int(end_text)
    if start > end:
        return None
    return start, end


def load_custom_number_motion_clip_rows(existing_only: bool = True) -> list[CustomNumberMotionClipRow]:
    root = custom_numbers_motion_root()
    if not root.exists() or not root.is_dir():
        return []

    rows: list[CustomNumberMotionClipRow] = []
    exts = _video_extensions()
    for batch_dir in sorted([item for item in root.iterdir() if item.is_dir()]):
        bounds = _parse_group_name(batch_dir.name)
        if bounds is None:
            continue

        start, end = bounds
        for label_dir in sorted([item for item in batch_dir.iterdir() if item.is_dir()]):
            name = label_dir.name.strip()
            if not name.isdigit():
                continue

            label_int = int(name)
            if label_int < start or label_int > end:
                continue

            label = str(label_int)
            for clip_path in sorted([item for item in label_dir.iterdir() if item.is_file()]):
                if clip_path.suffix.lower() not in exts:
                    continue
                if existing_only and not clip_path.is_file():
                    continue
                rows.append(
                    CustomNumberMotionClipRow(
                        clip_path=clip_path.resolve(),
                        label=label,
                        batch=batch_dir.name,
                    )
                )
    return rows


def get_custom_numbers_motion_dataset_status() -> dict[str, object]:
    rows = load_custom_number_motion_clip_rows(existing_only=True)
    clips_per_label: dict[str, int] = {}
    clips_per_batch: dict[str, int] = {}
    for row in rows:
        clips_per_label[row.label] = clips_per_label.get(row.label, 0) + 1
        clips_per_batch[row.batch] = clips_per_batch.get(row.batch, 0) + 1
    labels = sorted(clips_per_label.keys(), key=lambda item: int(item))
    return {
        "dataset_root": str(custom_numbers_motion_root()),
        "total_clips": len(rows),
        "labels": labels,
        "label_count": len(labels),
        "clips_per_label": clips_per_label,
        "clips_per_batch": clips_per_batch,
        "ready_for_training": len(labels) >= 2 and len(rows) > 0,
    }


def normalize_number_group(value: str | None) -> str:
    if not value:
        return "0-10"
    raw = value.strip().lower().replace(" ", "")
    aliases = {
        "0to10": "0-10",
        "11to20": "11-20",
        "21to30": "21-30",
        "31to40": "31-40",
        "41to50": "41-50",
        "51to60": "51-60",
        "61to70": "61-70",
        "71to80": "71-80",
        "81to90": "81-90",
        "91to100": "91-100",
        "allnumbers": "all",
    }
    raw = aliases.get(raw, raw)
    return raw if raw in NUMBER_GROUP_KEYS else "0-10"


def labels_for_number_group(value: str | None) -> set[str]:
    group = normalize_number_group(value)
    start, end = NUMBER_GROUP_RANGE_MAP[group]
    return {str(item) for item in range(start, end + 1)}
