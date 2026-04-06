import argparse
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import cv2


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


def parse_batch(batch_text: str) -> tuple[int, int]:
    raw = batch_text.strip().replace(" ", "")
    if "-" not in raw:
        raise ValueError("Batch must be formatted like 11-20.")
    start_text, end_text = raw.split("-", 1)
    start = int(start_text)
    end = int(end_text)
    if start < 11 or end > 100:
        raise ValueError("Batch range must stay within 11-100.")
    if start > end:
        raise ValueError("Batch start cannot be greater than end.")
    return start, end


@dataclass(frozen=True)
class LabelPlan:
    value: int
    output_dir: Path


def video_extensions() -> set[str]:
    return {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def count_existing_samples(label_dir: Path) -> int:
    if not label_dir.exists() or not label_dir.is_dir():
        return 0
    exts = video_extensions()
    return len([item for item in label_dir.iterdir() if item.is_file() and item.suffix.lower() in exts])


def save_video(sample_frames: list, path: Path, fps: int) -> None:
    if not sample_frames:
        return
    height, width = sample_frames[0].shape[:2]
    writer = cv2.VideoWriter(
        str(path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        float(fps),
        (width, height),
    )
    try:
        for frame in sample_frames:
            writer.write(frame)
    finally:
        writer.release()


def _backend_code(name: str) -> int:
    normalized = name.strip().lower()
    if normalized == "dshow":
        return cv2.CAP_DSHOW
    if normalized == "msmf":
        return cv2.CAP_MSMF
    if normalized == "default":
        return cv2.CAP_ANY
    raise ValueError(f"Unsupported backend '{name}'. Use auto, dshow, msmf, or default.")


def open_camera(camera_index: int, backend: str):
    normalized_backend = backend.strip().lower()
    backends = ["dshow", "msmf", "default"] if normalized_backend == "auto" else [normalized_backend]
    for item in backends:
        code = _backend_code(item)
        cap = cv2.VideoCapture(camera_index, code)
        if not cap.isOpened():
            cap.release()
            continue
        ok, _ = cap.read()
        if ok:
            return cap, item
        cap.release()
    return None, None


def find_next_incomplete(
    plans: list[LabelPlan], counts: dict[int, int], target_per_label: int, current_index: int
) -> int:
    for idx in range(current_index, len(plans)):
        label = plans[idx].value
        if counts[label] < target_per_label:
            return idx
    for idx in range(0, current_index):
        label = plans[idx].value
        if counts[label] < target_per_label:
            return idx
    return current_index


def draw_overlay(
    frame,
    batch_label: str,
    plan_index: int,
    plans: list[LabelPlan],
    counts: dict[int, int],
    target_per_label: int,
    capturing: bool,
    capture_index: int,
    frames_per_sample: int,
    auto_advance: bool,
) -> None:
    current = plans[plan_index].value
    current_count = counts[current]
    total_target = len(plans) * target_per_label
    total_count = sum(counts[item.value] for item in plans)
    status = "CAPTURING" if capturing else "READY"

    lines = [
        f"Batch: {batch_label}",
        f"Label: {current} ({plan_index + 1}/{len(plans)})",
        f"Saved for label: {current_count}/{target_per_label}",
        f"Overall progress: {total_count}/{total_target}",
        f"Mode: {status}",
        f"Auto advance: {'ON' if auto_advance else 'OFF'}",
        "SPACE=capture  N=next  P=prev",
        "S=jump to next incomplete  A=toggle auto",
        "Q=quit",
    ]
    if capturing:
        lines.append(f"Capture progress: {capture_index}/{frames_per_sample}")

    y = 28
    for line in lines:
        cv2.putText(
            frame,
            line,
            (10, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.58,
            (40, 255, 180),
            2,
            cv2.LINE_AA,
        )
        y += 26


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Collect moving-gesture number clips by batch (11-100)."
    )
    parser.add_argument("--batch", type=str, required=True, help="Range like 11-20, 21-30, ...")
    parser.add_argument("--samples-per-label", type=int, default=70)
    parser.add_argument("--frames-per-sample", type=int, default=20)
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--backend", type=str, default="auto")
    parser.add_argument("--fps", type=int, default=15)
    parser.add_argument("--width", type=int, default=960)
    parser.add_argument("--height", type=int, default=540)
    parser.add_argument("--output-root", type=str, default=None)
    parser.add_argument("--no-auto-advance", action="store_true")
    args = parser.parse_args()

    start, end = parse_batch(args.batch)
    batch_label = f"{start:02d}-{end:02d}"
    numbers = list(range(start, end + 1))

    output_root = (
        resolve_cli_path(args.output_root)
        if args.output_root
        else resolve_datasets_root() / "custom_numbers_motion"
    )
    batch_dir = output_root / batch_label
    batch_dir.mkdir(parents=True, exist_ok=True)

    plans: list[LabelPlan] = []
    counts: dict[int, int] = {}
    for number in numbers:
        label_dir = batch_dir / str(number)
        label_dir.mkdir(parents=True, exist_ok=True)
        plans.append(LabelPlan(value=number, output_dir=label_dir))
        counts[number] = count_existing_samples(label_dir)

    target_per_label = max(1, args.samples_per_label)
    plan_index = find_next_incomplete(plans, counts, target_per_label, current_index=0)
    auto_advance = not args.no_auto_advance

    print(f"Collecting batch: {batch_label}")
    print(f"Output folder: {batch_dir}")
    print(f"Labels: {numbers[0]} to {numbers[-1]} ({len(numbers)} labels)")
    print(f"Target samples per label: {target_per_label}")
    print("Current saved counts:")
    for number in numbers:
        print(f"  {number}: {counts[number]}")

    cap, backend_used = open_camera(args.camera_index, args.backend)
    if cap is None:
        raise RuntimeError(
            "Cannot open camera. Try --camera-index 0/1 and --backend dshow or --backend msmf."
        )
    print(f"Camera opened: index={args.camera_index}, backend={backend_used}")

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
    cap.set(cv2.CAP_PROP_FPS, args.fps)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))

    capturing = False
    capture_frames: list = []
    capture_index = 0

    try:
        while True:
            if all(counts[item.value] >= target_per_label for item in plans):
                print("Batch target reached for all labels.")
                break

            ok, frame = cap.read()
            if not ok:
                continue

            preview = frame.copy()
            draw_overlay(
                preview,
                batch_label=batch_label,
                plan_index=plan_index,
                plans=plans,
                counts=counts,
                target_per_label=target_per_label,
                capturing=capturing,
                capture_index=capture_index,
                frames_per_sample=args.frames_per_sample,
                auto_advance=auto_advance,
            )
            cv2.imshow("Number Batch Collector (11-100)", preview)

            key = cv2.waitKey(1) & 0xFF
            current_number = plans[plan_index].value
            current_dir = plans[plan_index].output_dir

            if key == ord("q"):
                break
            if key == ord("n") and not capturing:
                plan_index = (plan_index + 1) % len(plans)
            elif key == ord("p") and not capturing:
                plan_index = (plan_index - 1) % len(plans)
            elif key == ord("s") and not capturing:
                plan_index = find_next_incomplete(plans, counts, target_per_label, plan_index + 1)
            elif key == ord("a") and not capturing:
                auto_advance = not auto_advance
            elif (
                key == ord(" ")
                and not capturing
                and counts[current_number] < target_per_label
            ):
                capturing = True
                capture_frames = []
                capture_index = 0

            if capturing:
                capture_frames.append(frame.copy())
                capture_index += 1
                if capture_index >= args.frames_per_sample:
                    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                    next_count = counts[current_number] + 1
                    filename = f"N{current_number}_{next_count:04d}_{stamp}.mp4"
                    save_video(capture_frames, current_dir / filename, fps=args.fps)
                    counts[current_number] = next_count
                    capturing = False
                    capture_frames = []
                    capture_index = 0
                    print(f"Saved {current_number}: {filename}")

                    if auto_advance and counts[current_number] >= target_per_label:
                        plan_index = find_next_incomplete(
                            plans, counts, target_per_label, current_index=plan_index + 1
                        )
    finally:
        cap.release()
        cv2.destroyAllWindows()

    print("Collection finished.")
    for number in numbers:
        print(f"  {number}: {counts[number]}/{target_per_label}")


if __name__ == "__main__":
    main()
