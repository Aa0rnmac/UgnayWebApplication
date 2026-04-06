import argparse
import os
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


def normalize_label_to_dir(label: str) -> str:
    return "_".join(label.strip().upper().replace("-", " ").split())


def draw_overlay(
    frame,
    label: str,
    saved_count: int,
    target_count: int,
    capturing: bool,
    capture_index: int,
    frames_per_sample: int,
) -> None:
    status = "CAPTURING" if capturing else "READY"
    lines = [
        f"Label: {label}",
        f"Saved samples: {saved_count}/{target_count}",
        f"Mode: {status}",
        "SPACE = capture sample",
        "Q = quit",
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
            0.6,
            (40, 255, 180),
            2,
            cv2.LINE_AA,
        )
        y += 28


def save_video(sample_frames, path: Path, fps: int) -> None:
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect custom phrase clips from webcam.")
    parser.add_argument("--label", type=str, default="I LOVE YOU")
    parser.add_argument("--samples", type=int, default=60)
    parser.add_argument("--frames-per-sample", type=int, default=20)
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--backend", type=str, default="auto")
    parser.add_argument("--fps", type=int, default=15)
    parser.add_argument("--width", type=int, default=960)
    parser.add_argument("--height", type=int, default=540)
    parser.add_argument("--output-root", type=str, default=None)
    args = parser.parse_args()

    label_dir_name = normalize_label_to_dir(args.label)
    output_root = resolve_cli_path(args.output_root) if args.output_root else resolve_datasets_root() / "custom_words"
    output_dir = output_root / label_dir_name
    output_dir.mkdir(parents=True, exist_ok=True)

    existing = sorted(output_dir.glob("*.mp4"))
    saved_count = len(existing)
    print(f"Collecting label: {args.label}")
    print(f"Output folder: {output_dir}")
    print(f"Existing samples: {saved_count}")

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
    capture_frames = []
    capture_index = 0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                continue

            preview = frame.copy()
            draw_overlay(
                preview,
                label=args.label,
                saved_count=saved_count,
                target_count=args.samples,
                capturing=capturing,
                capture_index=capture_index,
                frames_per_sample=args.frames_per_sample,
            )
            cv2.imshow("Custom Phrase Collector", preview)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break

            if key == ord(" ") and not capturing and saved_count < args.samples:
                capturing = True
                capture_frames = []
                capture_index = 0

            if capturing:
                capture_frames.append(frame.copy())
                capture_index += 1
                if capture_index >= args.frames_per_sample:
                    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                    filename = f"{label_dir_name}_{saved_count + 1:04d}_{stamp}.mp4"
                    save_video(capture_frames, output_dir / filename, fps=args.fps)
                    saved_count += 1
                    capturing = False
                    capture_frames = []
                    capture_index = 0
                    print(f"Saved sample {saved_count}: {filename}")

            if saved_count >= args.samples:
                print("Target sample count reached.")
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()

    print("Collection finished.")
    print(f"Total saved samples for {args.label}: {saved_count}")


if __name__ == "__main__":
    main()
