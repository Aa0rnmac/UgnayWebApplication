from __future__ import annotations

import csv
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

from app.core.config import settings
from app.services.custom_words_dataset import load_custom_word_clip_rows


@dataclass(frozen=True)
class WordClipRow:
    clip_path: Path
    id_label: str
    label: str
    category: str


def _dataset_root() -> Path:
    return settings.datasets_root_path / "fsl_105"


def _processed_path() -> Path:
    return _dataset_root() / "processed"


def _clips_root() -> Path:
    return _dataset_root() / "clips_raw"


def _normalize_label(value: str) -> str:
    return " ".join(value.strip().upper().split())


WORD_GROUP_CATEGORY_MAP: dict[str, set[str]] = {
    "greeting": {"GREETING"},
    "responses": {"SURVIVAL"},
    "date": {"DAYS"},
    "family": {"FAMILY"},
    "relationship": {"RELATIONSHIPS"},
    "color": {"COLOR"},
}
WORD_GROUP_KEYS = {"all", *WORD_GROUP_CATEGORY_MAP.keys()}
WORD_GROUP_EXTRA_LABELS: dict[str, set[str]] = {
    "responses": {"I LOVE YOU"},
}


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


def _excluded_categories() -> set[str]:
    raw = settings.words_excluded_categories or ""
    return {
        _normalize_label(item)
        for item in raw.split(",")
        if _normalize_label(item)
    }


def _load_number_exclusions() -> tuple[set[str], set[str]]:
    numbers_path = _processed_path() / "labels_numbers.csv"
    rows = _read_csv_rows(numbers_path)
    ids: set[str] = set()
    labels: set[str] = set()
    for row in rows:
        id_label = (row.get("id") or row.get("id_label") or "").strip()
        label = _normalize_label(row.get("label", ""))
        if id_label:
            ids.add(id_label)
        if label:
            labels.add(label)
    return ids, labels


def load_word_clip_rows(
    split: Literal["train", "test", "all"], existing_only: bool = True
) -> list[WordClipRow]:
    filename_map = {
        "train": "train_words.csv",
        "test": "test_words.csv",
        "all": "all_words.csv",
    }
    csv_path = _processed_path() / filename_map[split]
    rows = _read_csv_rows(csv_path)
    excluded_ids, excluded_labels = _load_number_exclusions()
    excluded_categories = _excluded_categories()

    items: list[WordClipRow] = []
    for row in rows:
        id_label = (row.get("id_label") or row.get("id") or "").strip()
        label = _normalize_label(row.get("label", ""))
        category = _normalize_label(row.get("category", ""))
        clip_rel = (row.get("vid_path") or "").strip()
        if not id_label or not label or not clip_rel:
            continue
        if id_label in excluded_ids or label in excluded_labels:
            continue
        if category in excluded_categories:
            continue

        clip_path = _resolve_clip_path(clip_rel)
        if existing_only and not clip_path.is_file():
            continue

        items.append(
            WordClipRow(clip_path=clip_path, id_label=id_label, label=label, category=category)
        )
    return items


def get_words_dataset_status() -> dict[str, object]:
    train_all = load_word_clip_rows("train", existing_only=False)
    test_all = load_word_clip_rows("test", existing_only=False)
    train_found = [item for item in train_all if item.clip_path.is_file()]
    test_found = [item for item in test_all if item.clip_path.is_file()]

    available_labels = sorted({item.label for item in [*train_found, *test_found]})
    category_count = len({item.category for item in [*train_found, *test_found] if item.category})

    return {
        "dataset_root": str(_dataset_root()),
        "processed_path": str(_processed_path()),
        "clips_root": str(_clips_root()),
        "train_rows": len(train_all),
        "test_rows": len(test_all),
        "train_clips_found": len(train_found),
        "test_clips_found": len(test_found),
        "missing_train_clips": max(0, len(train_all) - len(train_found)),
        "missing_test_clips": max(0, len(test_all) - len(test_found)),
        "available_labels": available_labels,
        "available_label_count": len(available_labels),
        "available_category_count": category_count,
        "excluded_categories": sorted(_excluded_categories()),
        "ready_for_training": len(train_found) > 0 and len(available_labels) >= 2,
    }


@lru_cache(maxsize=2)
def _cached_word_group_labels(existing_only: bool) -> dict[str, tuple[str, ...]]:
    groups: dict[str, set[str]] = {key: set() for key in WORD_GROUP_KEYS}
    rows = load_word_clip_rows("all", existing_only=existing_only)
    for row in rows:
        groups["all"].add(row.label)
        for group, categories in WORD_GROUP_CATEGORY_MAP.items():
            if row.category in categories:
                groups[group].add(row.label)

    custom_labels = {row.label for row in load_custom_word_clip_rows(existing_only=existing_only)}
    groups["all"].update(custom_labels)
    for group, labels in WORD_GROUP_EXTRA_LABELS.items():
        if group not in groups:
            continue
        for label in labels:
            if label in groups["all"]:
                groups[group].add(label)
    return {key: tuple(sorted(value)) for key, value in groups.items()}


def normalize_word_group(value: str | None) -> str:
    if not value:
        return "all"
    normalized = value.strip().lower()
    aliases = {
        "common": "greeting",
        "greetings": "greeting",
        "survival": "responses",
        "response": "responses",
        "dates": "date",
        "relation": "relationship",
        "relations": "relationship",
        "relationships": "relationship",
        "colors": "color",
    }
    normalized = aliases.get(normalized, normalized)
    return normalized if normalized in WORD_GROUP_KEYS else "all"


def resolve_word_group_labels(value: str | None, existing_only: bool = True) -> set[str]:
    group = normalize_word_group(value)
    groups = _cached_word_group_labels(existing_only)
    labels = groups.get(group) or groups.get("all") or ()
    return set(labels)
