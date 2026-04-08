from __future__ import annotations

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


def _ensure_lab_dependencies() -> None:
    if cv2 is None or mp is None:
        raise RuntimeError(
            "Lab image recognition requires optional OpenCV and MediaPipe dependencies."
        )


def _normalize_landmarks(landmarks: np.ndarray) -> np.ndarray | None:
    if landmarks.shape != (21, 3):
        return None

    centered = landmarks - landmarks[0]
    scale = float(np.max(np.linalg.norm(centered[:, :2], axis=1)))
    if scale <= 1e-9:
        return None
    normalized = centered / scale
    return normalized.flatten().astype(np.float32)


def _extract_from_bgr_image(
    image_bgr: np.ndarray, hands: Any
) -> np.ndarray | None:
    if image_bgr is None or image_bgr.size == 0:
        return None

    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    result = hands.process(image_rgb)

    if not result.multi_hand_landmarks:
        return None

    raw = result.multi_hand_landmarks[0].landmark
    landmarks = np.array([[item.x, item.y, item.z] for item in raw], dtype=np.float32)
    return _normalize_landmarks(landmarks)


def _decode_image(image_bytes: bytes) -> np.ndarray | None:
    _ensure_lab_dependencies()
    data = np.frombuffer(image_bytes, dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def _build_image_variants(image_bgr: np.ndarray) -> list[np.ndarray]:
    variants: list[np.ndarray] = [image_bgr]

    ycrcb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2YCrCb)
    y_channel, cr_channel, cb_channel = cv2.split(ycrcb)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    y_equalized = clahe.apply(y_channel)
    equalized = cv2.merge((y_equalized, cr_channel, cb_channel))
    equalized_bgr = cv2.cvtColor(equalized, cv2.COLOR_YCrCb2BGR)
    variants.append(equalized_bgr)

    denoised = cv2.GaussianBlur(equalized_bgr, (3, 3), 0)
    variants.append(denoised)
    return variants


def extract_landmark_feature_candidates(image_bytes: bytes) -> list[np.ndarray]:
    _ensure_lab_dependencies()
    image_bgr = _decode_image(image_bytes)
    if image_bgr is None:
        return []

    variants = _build_image_variants(image_bgr)
    candidates: list[np.ndarray] = []

    with mp.solutions.hands.Hands(
        static_image_mode=True,
        max_num_hands=1,
        min_detection_confidence=settings.mediapipe_detection_confidence,
        model_complexity=settings.mediapipe_model_complexity,
    ) as hands:
        for variant in variants:
            for frame in (variant, cv2.flip(variant, 1)):
                feature = _extract_from_bgr_image(frame, hands)
                if feature is not None:
                    candidates.append(feature)

    unique: list[np.ndarray] = []
    seen: set[tuple[float, ...]] = set()
    for feature in candidates:
        key = tuple(np.round(feature, 3).tolist())
        if key in seen:
            continue
        seen.add(key)
        unique.append(feature)
    return unique


def extract_landmark_features_pair(image_bytes: bytes) -> tuple[np.ndarray | None, np.ndarray | None]:
    candidates = extract_landmark_feature_candidates(image_bytes)
    if not candidates:
        return None, None
    if len(candidates) == 1:
        return candidates[0], None
    return candidates[0], candidates[1]
