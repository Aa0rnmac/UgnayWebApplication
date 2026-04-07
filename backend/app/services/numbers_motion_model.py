from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from app.core.config import settings
from app.services.word_motion_features import (
    LANDMARK_DIM,
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
        self._feature_dim: int | None = None
        self._sequence_frames = settings.numbers_motion_sequence_frames
        self._min_sequence_frames = settings.numbers_motion_min_sequence_frames
        self._model_path = self._resolve_model_path(settings.numbers_motion_model_path)

    @staticmethod
    def _resolve_model_path(path_value: str) -> Path:
        path = Path(path_value)
        if path.is_absolute():
            return path
        backend_root = Path(__file__).resolve().parents[2]
        return (backend_root / path).resolve()

    @staticmethod
    def _infer_sequence_frames(feature_dim: int | None) -> int | None:
        if not feature_dim or feature_dim <= 0:
            return None
        if feature_dim % LANDMARK_DIM != 0:
            return None

        # sequence_to_feature_vector = concat(sequence, deltas)
        # dims = (frames + (frames - 1)) * LANDMARK_DIM = (2*frames - 1) * LANDMARK_DIM
        units = feature_dim // LANDMARK_DIM
        if units < 1 or units % 2 == 0:
            return None
        return (units + 1) // 2

    @staticmethod
    def _positive_int(value: object) -> int | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value if value > 0 else None
        if isinstance(value, float):
            parsed = int(value)
            return parsed if parsed > 0 else None
        return None

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

        self._feature_dim = self._positive_int(artifact.get("feature_dim"))
        if self._feature_dim is None:
            self._feature_dim = self._positive_int(getattr(model, "n_features_in_", None))

        sequence_frames = self._positive_int(artifact.get("sequence_frames"))
        if sequence_frames is None:
            sequence_frames = self._infer_sequence_frames(self._feature_dim)
        if sequence_frames is not None:
            self._sequence_frames = sequence_frames

        min_sequence_frames = self._positive_int(artifact.get("min_valid_frames"))
        if min_sequence_frames is not None:
            self._min_sequence_frames = min_sequence_frames
        if self._min_sequence_frames > self._sequence_frames:
            self._min_sequence_frames = self._sequence_frames

    def status(self) -> dict[str, object]:
        self._load_if_needed()
        return {
            "model_found": self._model_path.exists(),
            "model_path": str(self._model_path),
            "classes": self._classes,
            "confidence_threshold": settings.numbers_motion_confidence_threshold,
            "min_top2_margin": settings.numbers_motion_min_top2_margin,
            "sequence_frames": self._sequence_frames,
            "min_sequence_frames": self._min_sequence_frames,
            "ready": self._model is not None and bool(self._classes),
        }

    def predict_from_frame_bytes(
        self, frame_bytes: list[bytes], allowed_labels: set[str] | None = None
    ) -> NumbersMotionPrediction:
        self._load_if_needed()
        if self._model is None:
            raise RuntimeError("Numbers motion model is not available. Train model first.")
        if len(frame_bytes) < self._min_sequence_frames:
            raise ValueError(
                f"Need at least {self._min_sequence_frames} frames for numbers mode."
            )

        sequence = extract_sequence_from_frame_bytes(
            frame_bytes,
            target_frames=self._sequence_frames,
            min_valid_frames=self._min_sequence_frames,
        )
        if sequence is None:
            raise ValueError("No clear hand sequence detected for numbers gesture.")

        vector = sequence_to_feature_vector(sequence)
        expected_features = self._positive_int(getattr(self._model, "n_features_in_", None))
        if expected_features is None:
            expected_features = self._feature_dim

        if expected_features is not None and vector.shape[0] != expected_features:
            inferred_frames = self._infer_sequence_frames(expected_features)
            if inferred_frames is not None and inferred_frames != self._sequence_frames:
                fallback_sequence = extract_sequence_from_frame_bytes(
                    frame_bytes,
                    target_frames=inferred_frames,
                    min_valid_frames=min(self._min_sequence_frames, inferred_frames),
                )
                if fallback_sequence is not None:
                    fallback_vector = sequence_to_feature_vector(fallback_sequence)
                    if fallback_vector.shape[0] == expected_features:
                        self._sequence_frames = inferred_frames
                        vector = fallback_vector

        if expected_features is not None and vector.shape[0] != expected_features:
            raise ValueError(
                "Numbers motion model feature mismatch. "
                f"Model expects {expected_features} features, but extracted {vector.shape[0]}. "
                "Retrain scripts/train_numbers_motion_model.py or use a compatible model artifact."
            )

        try:
            probs = self._model.predict_proba(vector.reshape(1, -1))[0]
        except ValueError as exc:
            raise ValueError(
                "Numbers motion prediction failed due to model/input feature mismatch. "
                "Retrain scripts/train_numbers_motion_model.py with current extraction settings."
            ) from exc
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
