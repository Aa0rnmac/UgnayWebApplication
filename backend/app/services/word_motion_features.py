from __future__ import annotations

from pathlib import Path

import numpy as np
from typing import Any

try:
    import cv2
except ImportError:  # pragma: no cover - depends on local ML setup
    cv2 = None

try:
    import mediapipe as mp
except ImportError:  # pragma: no cover - depends on local ML setup
    mp = None

from app.core.config import settings

LANDMARK_DIM = 21 * 3


def _ensure_motion_dependencies() -> None:
    if cv2 is None or mp is None:
        raise RuntimeError(
            "Motion-based lab recognition requires optional OpenCV and MediaPipe dependencies."
        )


def normalize_landmarks(landmarks: np.ndarray) -> np.ndarray | None:
    if landmarks.shape != (21, 3):
        return None
    centered = landmarks - landmarks[0]
    scale = float(np.max(np.linalg.norm(centered[:, :2], axis=1)))
    if scale <= 1e-9:
        return None
    normalized = centered / scale
    return normalized.flatten().astype(np.float32)


def _extract_landmarks(result: object) -> np.ndarray | None:
    multi = getattr(result, "multi_hand_landmarks", None)
    if not multi:
        return None
    points = multi[0].landmark
    return np.array([[item.x, item.y, item.z] for item in points], dtype=np.float32)


def _hand_crop_bbox(
    frame_shape: tuple[int, int, int],
    landmarks: np.ndarray,
    padding: float,
    min_side_ratio: float,
) -> tuple[int, int, int, int] | None:
    if landmarks.shape != (21, 3):
        return None

    height, width = frame_shape[:2]
    if width < 2 or height < 2:
        return None

    xs = np.clip(landmarks[:, 0], 0.0, 1.0)
    ys = np.clip(landmarks[:, 1], 0.0, 1.0)
    x_min = float(np.min(xs))
    x_max = float(np.max(xs))
    y_min = float(np.min(ys))
    y_max = float(np.max(ys))

    box_w = max(1.0, (x_max - x_min) * width)
    box_h = max(1.0, (y_max - y_min) * height)
    side = max(box_w, box_h)
    min_side = max(32.0, min(width, height) * max(0.05, float(min_side_ratio)))
    half = max((side * 0.5) + (side * max(0.0, float(padding))), min_side * 0.5)

    center_x = ((x_min + x_max) * 0.5) * width
    center_y = ((y_min + y_max) * 0.5) * height

    x1 = max(0, int(round(center_x - half)))
    x2 = min(width, int(round(center_x + half)))
    y1 = max(0, int(round(center_y - half)))
    y2 = min(height, int(round(center_y + half)))
    if x2 - x1 < 8 or y2 - y1 < 8:
        return None
    return x1, y1, x2, y2


def _extract_feature_from_frame(
    frame_bgr: np.ndarray, hands: Any
) -> np.ndarray | None:
    _ensure_motion_dependencies()
    if frame_bgr is None or frame_bgr.size == 0:
        return None
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    result = hands.process(frame_rgb)
    landmarks = _extract_landmarks(result)
    if landmarks is None:
        return None

    if settings.mediapipe_focus_on_hand_crop:
        bbox = _hand_crop_bbox(
            frame_shape=frame_bgr.shape,
            landmarks=landmarks,
            padding=settings.mediapipe_hand_crop_padding,
            min_side_ratio=settings.mediapipe_hand_crop_min_side_ratio,
        )
        if bbox is not None:
            x1, y1, x2, y2 = bbox
            crop = frame_bgr[y1:y2, x1:x2]
            if crop.size > 0:
                crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
                crop_result = hands.process(crop_rgb)
                crop_landmarks = _extract_landmarks(crop_result)
                if crop_landmarks is not None:
                    landmarks = crop_landmarks

    return normalize_landmarks(landmarks)


def _resample_sequence(sequence: np.ndarray, target_frames: int) -> np.ndarray:
    if sequence.shape[0] == target_frames:
        return sequence.astype(np.float32, copy=False)

    old_positions = np.linspace(0.0, 1.0, sequence.shape[0])
    new_positions = np.linspace(0.0, 1.0, target_frames)
    resampled = np.zeros((target_frames, sequence.shape[1]), dtype=np.float32)
    for dim in range(sequence.shape[1]):
        resampled[:, dim] = np.interp(new_positions, old_positions, sequence[:, dim])
    return resampled


def extract_sequence_from_video(
    video_path: Path,
    target_frames: int,
    min_valid_frames: int,
    max_sampled_frames: int = 45,
) -> np.ndarray | None:
    _ensure_motion_dependencies()
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        return None

    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    frame_stride = 1
    if total_frames > 0 and max_sampled_frames > 0:
        frame_stride = max(1, total_frames // max_sampled_frames)

    extracted: list[np.ndarray] = []
    sampled = 0
    frame_index = 0
    try:
        with mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=settings.mediapipe_detection_confidence,
            min_tracking_confidence=0.5,
            model_complexity=settings.mediapipe_model_complexity,
        ) as hands:
            while True:
                ok, frame = capture.read()
                if not ok:
                    break

                if frame_index % frame_stride != 0:
                    frame_index += 1
                    continue

                sampled += 1
                feature = _extract_feature_from_frame(frame, hands)
                if feature is not None:
                    extracted.append(feature)

                frame_index += 1
                if max_sampled_frames > 0 and sampled >= max_sampled_frames:
                    break
    finally:
        capture.release()

    if len(extracted) < min_valid_frames:
        return None
    sequence = np.stack(extracted)
    return _resample_sequence(sequence, target_frames)


def extract_sequence_from_frame_bytes(
    frame_bytes: list[bytes],
    target_frames: int,
    min_valid_frames: int,
) -> np.ndarray | None:
    _ensure_motion_dependencies()
    extracted: list[np.ndarray] = []
    with mp.solutions.hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        min_detection_confidence=settings.mediapipe_detection_confidence,
        min_tracking_confidence=0.5,
        model_complexity=settings.mediapipe_model_complexity,
    ) as hands:
        for payload in frame_bytes:
            if not payload:
                continue
            frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                continue
            feature = _extract_feature_from_frame(frame, hands)
            if feature is not None:
                extracted.append(feature)

    if len(extracted) < min_valid_frames:
        return None
    sequence = np.stack(extracted)
    return _resample_sequence(sequence, target_frames)


def mirror_sequence(sequence: np.ndarray) -> np.ndarray:
    mirrored = sequence.copy()
    mirrored[:, 0::3] *= -1.0
    return mirrored


def sequence_to_feature_vector(sequence: np.ndarray) -> np.ndarray:
    if sequence.ndim != 2 or sequence.shape[1] != LANDMARK_DIM:
        raise ValueError("Invalid sequence shape for word features.")
    deltas = np.diff(sequence, axis=0)
    flattened = np.concatenate([sequence.reshape(-1), deltas.reshape(-1)])
    return flattened.astype(np.float32, copy=False)
