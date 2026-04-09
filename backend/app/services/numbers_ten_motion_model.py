from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import joblib
import numpy as np

from app.core.config import settings
from app.services.model_paths import resolve_model_artifact_path
from app.services.word_motion_features import (
    extract_sequence_from_frame_bytes,
    sequence_to_feature_vector,
)


@dataclass
class TenMotionPrediction:
    is_ten: bool
    ten_confidence: float
    top_candidates: list[str]


class NumbersTenMotionModelService:
    def __init__(self) -> None:
        self._loaded = False
        self._model: Any | None = None
        self._classes: list[str] = []
        self._model_path = resolve_model_artifact_path(settings.numbers_ten_model_path)

    def _load_if_needed(self) -> None:
        if self._loaded:
            return
        self._loaded = True

        if not self._model_path.exists():
            return

        artifact = joblib.load(self._model_path)
        model = artifact.get("model")
        classes = artifact.get("classes", [])
        if model is None or not classes:
            return
        self._model = model
        self._classes = list(classes)

    def status(self) -> dict[str, object]:
        self._load_if_needed()
        return {
            "model_found": self._model_path.exists(),
            "model_path": str(self._model_path),
            "classes": self._classes,
            "confidence_threshold": settings.numbers_ten_confidence_threshold,
            "min_top2_margin": settings.numbers_ten_min_top2_margin,
            "sequence_frames": settings.numbers_ten_sequence_frames,
            "min_sequence_frames": settings.numbers_ten_min_sequence_frames,
            "ready": self._model is not None and bool(self._classes),
        }

    def predict_from_frame_bytes(self, frame_bytes: list[bytes]) -> TenMotionPrediction:
        self._load_if_needed()
        if self._model is None:
            raise RuntimeError("Numbers ten-motion model is not available. Train model first.")
        if len(frame_bytes) < settings.numbers_ten_min_sequence_frames:
            raise ValueError(
                f"Need at least {settings.numbers_ten_min_sequence_frames} frames to detect 10."
            )

        sequence = extract_sequence_from_frame_bytes(
            frame_bytes,
            target_frames=settings.numbers_ten_sequence_frames,
            min_valid_frames=settings.numbers_ten_min_sequence_frames,
        )
        if sequence is None:
            raise ValueError("No clear hand sequence detected for ten gesture.")

        vector = sequence_to_feature_vector(sequence)
        probs = self._model.predict_proba(vector.reshape(1, -1))[0]
        classes = [str(item) for item in self._model.classes_]

        top_idx = np.argsort(probs)[::-1][:2]
        best_idx = int(top_idx[0])
        second_idx = int(top_idx[1]) if len(top_idx) > 1 else best_idx
        best_label = classes[best_idx]
        best_confidence = float(probs[best_idx])
        second_confidence = float(probs[second_idx]) if second_idx != best_idx else 0.0
        margin = best_confidence - second_confidence

        ten_index = classes.index("TEN") if "TEN" in classes else best_idx
        ten_confidence = float(probs[ten_index]) if "TEN" in classes else 0.0

        is_ten = (
            best_label == "TEN"
            and best_confidence >= settings.numbers_ten_confidence_threshold
            and margin >= settings.numbers_ten_min_top2_margin
        )
        top_candidates = [classes[index] for index in top_idx]
        return TenMotionPrediction(
            is_ten=is_ten,
            ten_confidence=round(ten_confidence, 4),
            top_candidates=top_candidates,
        )


_SERVICE = NumbersTenMotionModelService()


def get_numbers_ten_motion_model_service() -> NumbersTenMotionModelService:
    return _SERVICE
