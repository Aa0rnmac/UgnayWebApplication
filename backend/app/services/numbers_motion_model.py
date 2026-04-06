from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from app.core.config import settings
from app.services.word_motion_features import (
    extract_sequence_from_frame_bytes,
    sequence_to_feature_vector,
)


@dataclass
class NumbersMotionPrediction:
    prediction: str
    confidence: float
    top_candidates: list[str]


class NumbersMotionModelService:
    def __init__(self) -> None:
        self._loaded = False
        self._model: Any | None = None
        self._classes: list[str] = []
        self._model_path = self._resolve_model_path(settings.numbers_motion_model_path)

    @staticmethod
    def _resolve_model_path(path_value: str) -> Path:
        path = Path(path_value)
        if path.is_absolute():
            return path
        backend_root = Path(__file__).resolve().parents[2]
        return (backend_root / path).resolve()

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
        self._classes = [str(item) for item in classes]

    def status(self) -> dict[str, object]:
        self._load_if_needed()
        return {
            "model_found": self._model_path.exists(),
            "model_path": str(self._model_path),
            "classes": self._classes,
            "confidence_threshold": settings.numbers_motion_confidence_threshold,
            "min_top2_margin": settings.numbers_motion_min_top2_margin,
            "sequence_frames": settings.numbers_motion_sequence_frames,
            "min_sequence_frames": settings.numbers_motion_min_sequence_frames,
            "ready": self._model is not None and bool(self._classes),
        }

    def predict_from_frame_bytes(
        self, frame_bytes: list[bytes], allowed_labels: set[str] | None = None
    ) -> NumbersMotionPrediction:
        self._load_if_needed()
        if self._model is None:
            raise RuntimeError("Numbers motion model is not available. Train model first.")
        if len(frame_bytes) < settings.numbers_motion_min_sequence_frames:
            raise ValueError(
                f"Need at least {settings.numbers_motion_min_sequence_frames} frames for numbers mode."
            )

        sequence = extract_sequence_from_frame_bytes(
            frame_bytes,
            target_frames=settings.numbers_motion_sequence_frames,
            min_valid_frames=settings.numbers_motion_min_sequence_frames,
        )
        if sequence is None:
            raise ValueError("No clear hand sequence detected for numbers gesture.")

        vector = sequence_to_feature_vector(sequence)
        probs = self._model.predict_proba(vector.reshape(1, -1))[0]
        classes = [str(item) for item in self._model.classes_]

        candidate_indices = list(range(len(classes)))
        if allowed_labels:
            candidate_indices = [idx for idx, label in enumerate(classes) if label in allowed_labels]
            if not candidate_indices:
                raise ValueError("Selected numbers group has no labels available in trained model.")

        candidate_probs = probs[candidate_indices]
        total = float(np.sum(candidate_probs))
        if total <= 1e-9:
            raise ValueError("Invalid probability output for numbers motion model.")
        candidate_probs = candidate_probs / total
        candidate_classes = [classes[idx] for idx in candidate_indices]

        top_idx = np.argsort(candidate_probs)[::-1][:3]
        best_idx = int(top_idx[0])
        confidence = float(candidate_probs[best_idx])
        second_confidence = float(candidate_probs[int(top_idx[1])]) if len(top_idx) > 1 else 0.0
        margin = confidence - second_confidence

        label = str(candidate_classes[best_idx])
        if (
            confidence < settings.numbers_motion_confidence_threshold
            or margin < settings.numbers_motion_min_top2_margin
        ):
            label = "UNSURE"

        top_candidates = [str(candidate_classes[idx]) for idx in top_idx]
        return NumbersMotionPrediction(
            prediction=label,
            confidence=round(confidence, 4),
            top_candidates=top_candidates,
        )


_SERVICE = NumbersMotionModelService()


def get_numbers_motion_model_service() -> NumbersMotionModelService:
    return _SERVICE
