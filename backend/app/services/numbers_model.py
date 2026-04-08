from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import joblib
import numpy as np

from app.core.config import settings
from app.services.numbers_motion_model import get_numbers_motion_model_service
from app.services.numbers_ten_motion_model import get_numbers_ten_motion_model_service


@dataclass
class NumbersPrediction:
    prediction: str
    confidence: float
    top_candidates: list[str]


class NumbersModelService:
    def __init__(self) -> None:
        self._pipeline: Any | None = None
        self._classes: list[str] = []
        self._model_path = settings.resolve_artifact_path(settings.numbers_model_path)
        self._artifact_mtime_ns: int | None = None

    def _reset_loaded_state(self) -> None:
        self._pipeline = None
        self._classes = []

    def _load_if_needed(self) -> None:
        if not self._model_path.exists():
            self._reset_loaded_state()
            self._artifact_mtime_ns = None
            return

        current_mtime_ns = self._model_path.stat().st_mtime_ns
        if (
            self._artifact_mtime_ns == current_mtime_ns
            and self._pipeline is not None
            and bool(self._classes)
        ):
            return

        self._reset_loaded_state()
        artifact = joblib.load(self._model_path)
        pipeline = artifact.get("pipeline")
        classes = artifact.get("classes") or list(getattr(pipeline, "classes_", []))
        if pipeline is None or not classes:
            self._artifact_mtime_ns = current_mtime_ns
            return

        self._pipeline = pipeline
        self._classes = [str(item) for item in classes]
        self._artifact_mtime_ns = current_mtime_ns

    def status(self) -> dict[str, object]:
        self._load_if_needed()
        ten_status = get_numbers_ten_motion_model_service().status()
        motion_status = get_numbers_motion_model_service().status()
        return {
            "model_found": self._model_path.exists(),
            "model_path": str(self._model_path),
            "classes": self._classes,
            "confidence_threshold": settings.numbers_confidence_threshold,
            "min_top2_margin": settings.numbers_min_top2_margin,
            "ten_motion_model_found": bool(ten_status["model_found"]),
            "ten_motion_model_path": str(ten_status["model_path"]),
            "ten_motion_ready": bool(ten_status["ready"]),
            "supports_ten_dynamic": bool(ten_status["ready"]),
            "ten_sequence_frames": int(ten_status["sequence_frames"]),
            "ten_min_sequence_frames": int(ten_status["min_sequence_frames"]),
            "motion_model_found": bool(motion_status["model_found"]),
            "motion_model_path": str(motion_status["model_path"]),
            "motion_ready": bool(motion_status["ready"]),
            "supports_11_100_dynamic": bool(motion_status["ready"]),
            "motion_sequence_frames": int(motion_status["sequence_frames"]),
            "motion_min_sequence_frames": int(motion_status["min_sequence_frames"]),
            "ready": self._pipeline is not None and bool(self._classes),
        }

    def _predict_single(self, features: np.ndarray) -> NumbersPrediction:
        if self._pipeline is None:
            raise RuntimeError("Numbers model is not loaded.")

        probs = self._pipeline.predict_proba(features.reshape(1, -1))[0]
        classes = list(self._pipeline.classes_)
        top_idx = np.argsort(probs)[::-1][:3]

        top_candidates = [str(classes[idx]) for idx in top_idx]
        best_idx = int(top_idx[0])
        confidence = float(probs[best_idx])
        second_confidence = float(probs[int(top_idx[1])]) if len(top_idx) > 1 else 0.0
        margin = confidence - second_confidence

        label = str(classes[best_idx])
        if (
            confidence < settings.numbers_confidence_threshold
            or margin < settings.numbers_min_top2_margin
        ):
            label = "UNSURE"

        return NumbersPrediction(
            prediction=label,
            confidence=round(confidence, 4),
            top_candidates=top_candidates,
        )

    def predict_best_of_candidates(self, features: list[np.ndarray]) -> NumbersPrediction:
        self._load_if_needed()
        if self._pipeline is None:
            raise RuntimeError("Numbers model is not available. Train the model first.")

        if not features:
            raise ValueError("No hand landmarks detected in image.")

        predictions = [self._predict_single(feature) for feature in features]
        return max(predictions, key=lambda item: item.confidence)


_SERVICE = NumbersModelService()


def get_numbers_model_service() -> NumbersModelService:
    return _SERVICE
