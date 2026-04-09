from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import joblib
import numpy as np

from app.core.config import settings
from app.services.word_motion_features import (
    extract_sequence_from_frame_bytes,
    sequence_to_feature_vector,
)


@dataclass
class WordsPrediction:
    prediction: str
    confidence: float
    top_candidates: list[str]


class WordsModelService:
    def __init__(self) -> None:
        self._loaded = False
        self._model: Any | None = None
        self._classes: list[str] = []
        self._model_path = self._resolve_model_path(settings.words_model_path)

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
        self._classes = list(classes)

    @staticmethod
    def _decode_frame(payload: bytes) -> np.ndarray | None:
        if not payload:
            return None
        return cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)

    @classmethod
    def _mirror_payloads(cls, frame_bytes: list[bytes]) -> list[bytes]:
        mirrored: list[bytes] = []
        for payload in frame_bytes:
            frame = cls._decode_frame(payload)
            if frame is None:
                continue
            flipped = cv2.flip(frame, 1)
            ok, encoded = cv2.imencode(".jpg", flipped)
            if ok:
                mirrored.append(encoded.tobytes())
        return mirrored

    @staticmethod
    def _build_frame_variants(frame_bytes: list[bytes], min_frames: int) -> list[list[bytes]]:
        total = len(frame_bytes)
        variants: list[list[bytes]] = []

        def add(candidate: list[bytes]) -> None:
            if len(candidate) < min_frames:
                return
            variants.append(candidate)

        add(frame_bytes)
        add(frame_bytes[::2])
        add(frame_bytes[1::2])

        if total >= min_frames + 2:
            left_trim = max(1, total // 10)
            right_trim = total - left_trim
            add(frame_bytes[left_trim:right_trim])

        if total >= min_frames + 4:
            cut = max(min_frames, int(total * 0.85))
            add(frame_bytes[:cut])
            add(frame_bytes[total - cut :])

        if total >= min_frames + 6:
            third = max(1, total // 3)
            add(frame_bytes[: total - third])
            add(frame_bytes[third:])

        # De-duplicate by length + first/last object identity snapshot
        deduped: list[list[bytes]] = []
        seen: set[tuple[int, int, int]] = set()
        for candidate in variants:
            key = (len(candidate), hash(candidate[0]), hash(candidate[-1]))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(candidate)
        return deduped

    def _predict_probs(self, feature_vector: np.ndarray) -> tuple[list[str], np.ndarray]:
        if self._model is None:
            raise RuntimeError("Words model is not loaded.")
        probs = self._model.predict_proba(feature_vector.reshape(1, -1))[0]
        classes = [str(item) for item in self._model.classes_]
        return classes, probs

    def status(self) -> dict[str, object]:
        self._load_if_needed()
        return {
            "model_found": self._model_path.exists(),
            "model_path": str(self._model_path),
            "classes": self._classes,
            "confidence_threshold": settings.words_confidence_threshold,
            "min_top2_margin": settings.words_min_top2_margin,
            "force_best_prediction": settings.words_force_best_prediction,
            "sequence_frames": settings.words_sequence_frames,
            "min_sequence_frames": settings.words_min_sequence_frames,
            "ready": self._model is not None and bool(self._classes),
        }

    def _predict_single_feature(self, feature_vector: np.ndarray) -> WordsPrediction:
        classes, probs = self._predict_probs(feature_vector)
        top_idx = np.argsort(probs)[::-1][:3]

        top_candidates = [str(classes[idx]) for idx in top_idx]
        best_idx = int(top_idx[0])
        confidence = float(probs[best_idx])
        second_confidence = float(probs[int(top_idx[1])]) if len(top_idx) > 1 else 0.0
        margin = confidence - second_confidence

        label = str(classes[best_idx])
        is_unsure = (
            confidence < settings.words_confidence_threshold
            or margin < settings.words_min_top2_margin
        )
        if is_unsure and not settings.words_force_best_prediction:
            label = "UNSURE"

        return WordsPrediction(
            prediction=label,
            confidence=round(confidence, 4),
            top_candidates=top_candidates,
        )

    @staticmethod
    def _build_segment_windows(frame_bytes: list[bytes], min_frames: int) -> list[list[bytes]]:
        total = len(frame_bytes)
        if total < min_frames + 2:
            return []

        windows: list[list[bytes]] = []

        def add(candidate: list[bytes]) -> None:
            if len(candidate) < min_frames:
                return
            windows.append(candidate)

        half = total // 2
        if half >= min_frames and total - half >= min_frames:
            add(frame_bytes[:half])
            add(frame_bytes[half:])

        span = max(min_frames, int(total * 0.66))
        if span < total:
            add(frame_bytes[:span])
            add(frame_bytes[total - span :])

        if total >= min_frames * 3:
            one_third = total // 3
            add(frame_bytes[one_third : total - one_third])

        deduped: list[list[bytes]] = []
        seen: set[tuple[int, int, int]] = set()
        for candidate in windows:
            key = (len(candidate), hash(candidate[0]), hash(candidate[-1]))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(candidate)
        return deduped

    def _collect_segment_predictions(
        self, frame_bytes: list[bytes], allowed_labels: set[str] | None = None
    ) -> list[WordsPrediction]:
        segment_predictions: list[WordsPrediction] = []
        windows = self._build_segment_windows(frame_bytes, settings.words_min_sequence_frames)
        for window in windows:
            try:
                segment_predictions.append(
                    self._predict_with_ensemble(window, allowed_labels=allowed_labels)
                )
            except ValueError:
                continue
        return segment_predictions

    @staticmethod
    def _prediction_confidence_for_label(predictions: list[WordsPrediction], label: str) -> float:
        matching = [item.confidence for item in predictions if item.prediction == label]
        if not matching:
            return 0.0
        return float(max(matching))

    def _apply_context_rules(
        self,
        prediction: WordsPrediction,
        segment_predictions: list[WordsPrediction],
        allowed_labels: set[str] | None = None,
    ) -> WordsPrediction:
        if not allowed_labels:
            return prediction

        result = prediction
        label_set = set(allowed_labels)

        def seen(label: str) -> bool:
            if label == result.prediction:
                return True
            if label in result.top_candidates:
                return True
            return any(item.prediction == label for item in segment_predictions)

        # Composite FAMILY sign: PARENTS is often predicted as FATHER or MOTHER only.
        if {"PARENTS", "FATHER", "MOTHER"} <= label_set:
            father_seen = seen("FATHER")
            mother_seen = seen("MOTHER")
            if father_seen and mother_seen and result.confidence <= 0.9:
                father_conf = self._prediction_confidence_for_label(segment_predictions, "FATHER")
                mother_conf = self._prediction_confidence_for_label(segment_predictions, "MOTHER")
                merged_conf = max(result.confidence, 0.63, ((father_conf + mother_conf) * 0.5) + 0.12)
                result = WordsPrediction(
                    prediction="PARENTS",
                    confidence=round(min(0.96, float(merged_conf)), 4),
                    top_candidates=["PARENTS", "FATHER", "MOTHER"],
                )

        # AUNTIE vs DAUGHTER confusion adjustment (reported frequent swap).
        if {"AUNTIE", "DAUGHTER"} <= label_set and result.prediction in {"AUNTIE", "DAUGHTER"}:
            aunt_score = (result.confidence if result.prediction == "AUNTIE" else 0.0) + (
                self._prediction_confidence_for_label(segment_predictions, "AUNTIE") * 0.9
            )
            daughter_score = (result.confidence if result.prediction == "DAUGHTER" else 0.0) + (
                self._prediction_confidence_for_label(segment_predictions, "DAUGHTER") * 0.9
            )
            if "AUNTIE" in result.top_candidates:
                aunt_score += 0.08
            if "DAUGHTER" in result.top_candidates:
                daughter_score += 0.08

            # Slight correction bias toward DAUGHTER because AUNTIE is currently over-predicted.
            daughter_score += 0.05
            if daughter_score > aunt_score + 0.05 and result.confidence < 0.85:
                result = WordsPrediction(
                    prediction="DAUGHTER",
                    confidence=round(min(0.92, max(result.confidence, 0.58, daughter_score * 0.45)), 4),
                    top_candidates=["DAUGHTER", "AUNTIE", *[item for item in result.top_candidates if item not in {"DAUGHTER", "AUNTIE"}]][:3],
                )

        # Composite RELATIONSHIPS sign: DEAF BLIND often gets stuck in DEAF or BLIND only.
        if {"DEAF BLIND", "DEAF", "BLIND"} <= label_set:
            deaf_seen = seen("DEAF")
            blind_seen = seen("BLIND")
            if deaf_seen and blind_seen and result.confidence <= 0.9:
                deaf_conf = self._prediction_confidence_for_label(segment_predictions, "DEAF")
                blind_conf = self._prediction_confidence_for_label(segment_predictions, "BLIND")
                merged_conf = max(result.confidence, 0.64, ((deaf_conf + blind_conf) * 0.5) + 0.13)
                result = WordsPrediction(
                    prediction="DEAF BLIND",
                    confidence=round(min(0.96, float(merged_conf)), 4),
                    top_candidates=["DEAF BLIND", "DEAF", "BLIND"],
                )

        # PEOPLE disambiguation: MAN can overshadow WOMAN/GIRL/BOY.
        people_labels = {"MAN", "WOMAN", "GIRL", "BOY"} & label_set
        if len(people_labels) >= 3 and result.prediction in people_labels:
            scores = {label: 0.0 for label in people_labels}
            scores[result.prediction] += result.confidence
            for index, candidate in enumerate(result.top_candidates[:3]):
                if candidate in scores:
                    scores[candidate] += 0.28 - (index * 0.08)

            for item in segment_predictions:
                if item.prediction in scores:
                    scores[item.prediction] += item.confidence * 0.38
                for index, candidate in enumerate(item.top_candidates[:2]):
                    if candidate in scores:
                        scores[candidate] += 0.10 - (index * 0.04)

            if result.prediction == "MAN" and result.confidence < 0.78:
                scores["MAN"] -= 0.12

            ranked = sorted(scores.items(), key=lambda pair: pair[1], reverse=True)
            if len(ranked) >= 2 and ranked[0][0] != result.prediction:
                if ranked[0][1] > ranked[1][1] + 0.04:
                    chosen = ranked[0][0]
                    boosted_conf = max(result.confidence * 0.9, min(0.92, 0.45 + ranked[0][1] * 0.22))
                    result = WordsPrediction(
                        prediction=chosen,
                        confidence=round(float(boosted_conf), 4),
                        top_candidates=[chosen, *[label for label, _ in ranked if label != chosen]][:3],
                    )

        return result

    def _predict_with_ensemble(
        self, frame_bytes: list[bytes], allowed_labels: set[str] | None = None
    ) -> WordsPrediction:
        variants = self._build_frame_variants(frame_bytes, settings.words_min_sequence_frames)
        if not variants:
            raise ValueError("No valid frame variants for words inference.")

        active_labels = list(self._classes)
        if allowed_labels:
            active_labels = [label for label in self._classes if label in allowed_labels]
        if not active_labels:
            raise ValueError("Selected words category has no labels available in the trained model.")

        all_predictions: list[tuple[str, float, float, list[str], float]] = []
        score_by_label: dict[str, float] = {label: 0.0 for label in active_labels}
        count_by_label: dict[str, int] = {}
        total_weight = 0.0
        total_labels = max(1, len(active_labels))
        random_floor = 1.0 / total_labels

        for variant in variants:
            sequence = extract_sequence_from_frame_bytes(
                variant,
                target_frames=settings.words_sequence_frames,
                min_valid_frames=settings.words_min_sequence_frames,
            )
            if sequence is None:
                continue

            feature_vector = sequence_to_feature_vector(sequence)
            classes, probs = self._predict_probs(feature_vector)
            class_to_index = {str(label): index for index, label in enumerate(classes)}
            candidate_indices = [
                class_to_index[label] for label in active_labels if label in class_to_index
            ]
            if not candidate_indices:
                continue

            candidate_classes = [str(classes[index]) for index in candidate_indices]
            candidate_probs = probs[candidate_indices].astype(np.float64, copy=False)
            candidate_total = float(candidate_probs.sum())
            if candidate_total <= 1e-9:
                continue
            candidate_probs = candidate_probs / candidate_total

            top_idx = np.argsort(candidate_probs)[::-1][:3]
            top_label = str(candidate_classes[int(top_idx[0])])
            top_prob = float(candidate_probs[int(top_idx[0])])
            second_prob = float(candidate_probs[int(top_idx[1])]) if len(top_idx) > 1 else 0.0
            margin = top_prob - second_prob
            top_candidates = [str(candidate_classes[index]) for index in top_idx]

            # Variant weight combines confidence, separation margin, and clip coverage.
            coverage = len(variant) / max(1, len(frame_bytes))
            variant_weight = (
                0.70
                + 0.45 * max(0.0, top_prob - random_floor)
                + 0.35 * max(0.0, margin)
                + 0.20 * coverage
            )
            variant_weight = max(0.5, float(variant_weight))

            # Aggregate full class probabilities, not only top-1 labels.
            for index, label in enumerate(candidate_classes):
                score_by_label[str(label)] = score_by_label.get(str(label), 0.0) + (
                    float(candidate_probs[index]) * variant_weight
                )

            count_by_label[top_label] = count_by_label.get(top_label, 0) + 1
            total_weight += variant_weight
            all_predictions.append((top_label, top_prob, margin, top_candidates, variant_weight))

        if not all_predictions:
            raise ValueError("No clear hand sequence detected from captured frames.")

        if total_weight <= 1e-9:
            raise ValueError("Invalid ensemble weights for words inference.")

        normalized_scores = {
            label: score / total_weight
            for label, score in score_by_label.items()
        }
        ranked_labels = sorted(
            normalized_scores.items(),
            key=lambda item: (item[1], count_by_label.get(item[0], 0)),
            reverse=True,
        )
        best_label = ranked_labels[0][0]

        best_score = float(ranked_labels[0][1])
        second_score = float(ranked_labels[1][1]) if len(ranked_labels) > 1 else 0.0
        score_margin = max(0.0, best_score - second_score)
        norm_denominator = max(1e-9, 1.0 - random_floor)
        normalized_best = max(0.0, min(1.0, (best_score - random_floor) / norm_denominator))
        normalized_margin = max(0.0, min(1.0, score_margin / norm_denominator))
        vote_ratio = count_by_label.get(best_label, 0) / len(all_predictions)

        ensemble_confidence = (
            0.54 * normalized_best
            + 0.26 * normalized_margin
            + 0.20 * vote_ratio
        )
        if vote_ratio >= 0.70:
            ensemble_confidence += 0.04
        ensemble_confidence = min(0.99, max(0.01, ensemble_confidence))

        top_candidates = [label for label, _ in ranked_labels[:3]]
        is_unsure = (
            ensemble_confidence < settings.words_confidence_threshold
            and not settings.words_force_best_prediction
        )
        return WordsPrediction(
            prediction="UNSURE" if is_unsure else best_label,
            confidence=round(float(ensemble_confidence), 4),
            top_candidates=top_candidates,
        )

    def predict_from_frame_bytes(
        self, frame_bytes: list[bytes], allowed_labels: set[str] | None = None
    ) -> WordsPrediction:
        self._load_if_needed()
        if self._model is None:
            raise RuntimeError("Words model is not available. Train the model first.")
        if len(frame_bytes) < settings.words_min_sequence_frames:
            raise ValueError(
                f"Need at least {settings.words_min_sequence_frames} frames for words mode."
            )

        base_prediction: WordsPrediction | None = None

        # 1) Try ensemble over multiple temporal crops.
        try:
            base_prediction = self._predict_with_ensemble(frame_bytes, allowed_labels=allowed_labels)
        except ValueError:
            base_prediction = None

        # 2) Fallback to mirrored sequence path.
        mirrored_prediction: WordsPrediction | None = None
        mirrored = self._mirror_payloads(frame_bytes)
        if mirrored:
            try:
                mirrored_prediction = self._predict_with_ensemble(
                    mirrored, allowed_labels=allowed_labels
                )
            except ValueError:
                mirrored_prediction = None

        if base_prediction and mirrored_prediction:
            if base_prediction.prediction == mirrored_prediction.prediction:
                merged_candidates: list[str] = []
                for item in [
                    base_prediction.prediction,
                    *base_prediction.top_candidates,
                    *mirrored_prediction.top_candidates,
                ]:
                    if item not in merged_candidates:
                        merged_candidates.append(item)
                merged_confidence = min(
                    0.99,
                    ((base_prediction.confidence + mirrored_prediction.confidence) / 2.0) + 0.06,
                )
                merged = WordsPrediction(
                    prediction=base_prediction.prediction,
                    confidence=round(float(merged_confidence), 4),
                    top_candidates=merged_candidates[:3],
                )
                segments = self._collect_segment_predictions(frame_bytes, allowed_labels=allowed_labels)
                return self._apply_context_rules(merged, segments, allowed_labels=allowed_labels)
            return (
                base_prediction
                if base_prediction.confidence >= mirrored_prediction.confidence
                else mirrored_prediction
            )

        if base_prediction:
            segments = self._collect_segment_predictions(frame_bytes, allowed_labels=allowed_labels)
            return self._apply_context_rules(base_prediction, segments, allowed_labels=allowed_labels)
        if mirrored_prediction:
            segments = self._collect_segment_predictions(frame_bytes, allowed_labels=allowed_labels)
            return self._apply_context_rules(
                mirrored_prediction, segments, allowed_labels=allowed_labels
            )

        raise ValueError("No clear hand sequence detected from captured frames.")


_SERVICE = WordsModelService()


def get_words_model_service() -> WordsModelService:
    return _SERVICE
