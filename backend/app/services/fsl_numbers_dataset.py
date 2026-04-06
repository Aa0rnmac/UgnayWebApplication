from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.core.config import settings


LABEL_TO_DIGIT = {
    "ONE": "1",
    "TWO": "2",
    "THREE": "3",
    "FOUR": "4",
    "FIVE": "5",
    "SIX": "6",
    "SEVEN": "7",
    "EIGHT": "8",
    "NINE": "9",
    "TEN": "10",
}


@dataclass(frozen=True)
class FslNumberClipRow:
    clip_path: Path
    id_label: str
    label: str
    digit: str


def _dataset_root() -> Path:
    return settings.datasets_root_path / "fsl_105"


def _processed_path() -> Path:
    return _dataset_root() / "processed"


def _clips_root() -> Path:
    return _dataset_root() / "clips_raw"


def _normalize_label(value: str) -> str:
    return " ".join(value.strip().upper().split())


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists() or not path.is_file():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return [dict(row) for row in reader]


def _resolve_clip_path(path_value: str) -> Path:
    relative = Path(path_value.replace("\\", "/"))
    if relative.is_absolute():
        return relative
    return (_clips_root() / relative).resolve()


def load_fsl_number_clip_rows(
    split: Literal["train", "test", "all"], existing_only: bool = True
) -> list[FslNumberClipRow]:
    file_map = {
        "train": "train_numbers.csv",
        "test": "test_numbers.csv",
        "all": "all_numbers.csv",
    }
    rows = _read_csv_rows(_processed_path() / file_map[split])
    items: list[FslNumberClipRow] = []
    for row in rows:
        id_label = (row.get("id_label") or row.get("id") or "").strip()
        label = _normalize_label(row.get("label", ""))
        digit = LABEL_TO_DIGIT.get(label)
        if not id_label or not label or not digit:
            continue

        clip_rel = (row.get("vid_path") or "").strip()
        if not clip_rel:
            continue

        clip_path = _resolve_clip_path(clip_rel)
        if existing_only and not clip_path.is_file():
            continue

        items.append(FslNumberClipRow(clip_path=clip_path, id_label=id_label, label=label, digit=digit))
    return items
