from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings


@dataclass(frozen=True)
class CustomWordClipRow:
    clip_path: Path
    label: str


def custom_words_root() -> Path:
    return settings.datasets_root_path / "custom_words"


def _normalize_label(value: str) -> str:
    return " ".join(value.strip().upper().replace("_", " ").replace("-", " ").split())


def _video_files_for_label_dir(path: Path) -> list[Path]:
    extensions = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
    return sorted(
        [
            item
            for item in path.iterdir()
            if item.is_file() and item.suffix.lower() in extensions
        ]
    )


def load_custom_word_clip_rows(existing_only: bool = True) -> list[CustomWordClipRow]:
    root = custom_words_root()
    if not root.exists() or not root.is_dir():
        return []

    rows: list[CustomWordClipRow] = []
    for label_dir in sorted([item for item in root.iterdir() if item.is_dir()]):
        label = _normalize_label(label_dir.name)
        if not label:
            continue
        for clip_path in _video_files_for_label_dir(label_dir):
            if existing_only and not clip_path.is_file():
                continue
            rows.append(CustomWordClipRow(clip_path=clip_path.resolve(), label=label))
    return rows


def get_custom_words_dataset_status() -> dict[str, object]:
    rows = load_custom_word_clip_rows(existing_only=True)
    per_label: dict[str, int] = {}
    for row in rows:
        per_label[row.label] = per_label.get(row.label, 0) + 1
    return {
        "dataset_root": str(custom_words_root()),
        "total_clips": len(rows),
        "labels": sorted(per_label.keys()),
        "clips_per_label": per_label,
        "ready_for_training": len(rows) > 0,
    }
