import argparse
import json
import os
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = Path(__file__).resolve().parents[2]


def resolve_datasets_root() -> Path:
    raw = (os.getenv("DATASETS_ROOT") or "datasets").strip()
    configured = Path(raw).expanduser()
    if configured.is_absolute():
        return configured
    return (WORKSPACE_ROOT / configured).resolve()


def resolve_cli_path(path_value: str) -> Path:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        return path
    return (BACKEND_ROOT / path).resolve()


def parse_batch(batch_text: str | None) -> tuple[int, int] | None:
    if not batch_text:
        return None
    raw = batch_text.strip().replace(" ", "")
    if "-" not in raw:
        raise ValueError("Batch must be formatted like 11-20.")
    start_text, end_text = raw.split("-", 1)
    start = int(start_text)
    end = int(end_text)
    if start < 11 or end > 100 or start > end:
        raise ValueError("Batch range must stay within 11-100 and start <= end.")
    return start, end


def video_extensions() -> set[str]:
    return {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def count_videos(path: Path) -> int:
    exts = video_extensions()
    return len([item for item in path.iterdir() if item.is_file() and item.suffix.lower() in exts])


def main() -> None:
    parser = argparse.ArgumentParser(description="Check collected custom motion numbers dataset.")
    parser.add_argument("--batch", type=str, default=None, help="Optional filter: 11-20")
    parser.add_argument("--root", type=str, default=None)
    args = parser.parse_args()

    root = resolve_cli_path(args.root) if args.root else resolve_datasets_root() / "custom_numbers_motion"
    batch_filter = parse_batch(args.batch)

    payload: dict[str, object] = {
        "dataset_root": str(root),
        "exists": root.exists() and root.is_dir(),
        "batches": {},
    }

    if not root.exists() or not root.is_dir():
        print(json.dumps(payload, indent=2))
        return

    batches: dict[str, object] = {}
    total_clips = 0
    total_labels = 0
    for batch_dir in sorted([item for item in root.iterdir() if item.is_dir()]):
        name = batch_dir.name
        if "-" not in name:
            continue
        try:
            start = int(name.split("-", 1)[0])
            end = int(name.split("-", 1)[1])
        except ValueError:
            continue

        if batch_filter:
            if start != batch_filter[0] or end != batch_filter[1]:
                continue

        per_label: dict[str, int] = {}
        for label_dir in sorted([item for item in batch_dir.iterdir() if item.is_dir()]):
            clips = count_videos(label_dir)
            per_label[label_dir.name] = clips
            total_clips += clips
            total_labels += 1

        batches[name] = {
            "labels_found": len(per_label),
            "clips_total": sum(per_label.values()),
            "clips_per_label": per_label,
        }

    payload["batches"] = batches
    payload["total_labels_found"] = total_labels
    payload["total_clips"] = total_clips
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
