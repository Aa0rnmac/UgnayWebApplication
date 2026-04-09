from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import joblib
import numpy as np

from app.core.config import settings
from app.services.model_paths import resolve_model_artifact_path


@dataclass
class AlphabetPrediction:
    prediction: str
    confidence: float
    top_candidates: list[str]


class AlphabetModelService:
    def __init__(self) -> None:
        self._loaded = False
        self._pipeline: Any | None = None
        self._classes: list[str] = []
        self._model_path = resolve_model_artifact_path(settings.alphabet_model_path)

    def _load_if_needed(self) -> None:
        if self._loaded:
            return
        self._loaded = True

        if not self._model_path.exists():
            return

        artifact = joblib.load(self._model_path)
        pipeline = artifact.get("pipeline")
        classes = artifact.get("classes", [])
        if pipeline is None or not classes:
            return

        self._pipeline = pipeline
        self._classes = list(classes)

    def status(self) -> dict[str, object]:
        self._load_if_needed()
        return {
            "model_found": self._model_path.exists(),
            "model_path": str(self._model_path),
            "classes": self._classes,
            "confidence_threshold": settings.alphabet_confidence_threshold,
            "min_top2_margin": settings.alphabet_min_top2_margin,
            "ready": self._pipeline is not None and bool(self._classes),
        }

    def _predict_single(self, features: np.ndarray) -> AlphabetPrediction:
        if self._pipeline is None:
            raise RuntimeError("Alphabet model is not loaded.")

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
            confidence < settings.alphabet_confidence_threshold
            or margin < settings.alphabet_min_top2_margin
        ):
            label = "UNSURE"

        return AlphabetPrediction(
            prediction=label,
            confidence=round(confidence, 4),
            top_candidates=top_candidates,
        )

    def predict_best_of_pair(
        self, original: np.ndarray | None, mirrored: np.ndarray | None
    ) -> AlphabetPrediction:
        self._load_if_needed()
        if self._pipeline is None:
            raise RuntimeError("Alphabet model is not available. Train the model first.")

        candidates: list[AlphabetPrediction] = []
        if original is not None:
            candidates.append(self._predict_single(original))
        if mirrored is not None:
            candidates.append(self._predict_single(mirrored))

        if not candidates:
            raise ValueError("No hand landmarks detected in image.")

        return max(candidates, key=lambda item: item.confidence)

    def predict_best_of_candidates(self, features: list[np.ndarray]) -> AlphabetPrediction:
        self._load_if_needed()
        if self._pipeline is None:
            raise RuntimeError("Alphabet model is not available. Train the model first.")

        if not features:
            raise ValueError("No hand landmarks detected in image.")

        predictions = [self._predict_single(feature) for feature in features]
        return max(predictions, key=lambda item: item.confidence)


_SERVICE = AlphabetModelService()


def get_alphabet_model_service() -> AlphabetModelService:
    return _SERVICE
