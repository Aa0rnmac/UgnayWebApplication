from typing import Any
from typing import Literal

from pydantic import BaseModel, Field


class LabPredictionRequest(BaseModel):
    frame_count: int = Field(default=1, ge=1, le=300)
    metadata: dict[str, Any] | None = None


class LabPredictionResponse(BaseModel):
    prediction: str
    confidence: float
    top_candidates: list[str]


class RecognitionModeResponse(BaseModel):
    mode: Literal["alphabet", "numbers", "words"]


class AlphabetDatasetStatusResponse(BaseModel):
    datasets_root: str
    kaggle_zip_found: bool
    kaggle_zip_valid: bool
    kaggle_zip_error: str | None = None
    kaggle_zip_path: str
    kaggle_collated_found: bool
    kaggle_collated_path: str
    kaggle_classes: list[str]
    kaggle_total_images: int
    github_model_found: bool
    github_scaler_found: bool
    github_model_path: str
    github_scaler_path: str
    supported_labels: list[str]
    ready_for_alphabet_mode: bool


class AlphabetModelStatusResponse(BaseModel):
    model_found: bool
    model_path: str
    classes: list[str]
    confidence_threshold: float
    min_top2_margin: float
    ready: bool


class NumbersDatasetStatusResponse(BaseModel):
    dataset_path: str
    dataset_found: bool
    class_labels: list[str]
    class_counts: dict[str, int]
    missing_labels: list[str]
    total_images: int
    ready_for_training: bool


class NumbersModelStatusResponse(BaseModel):
    model_found: bool
    model_path: str
    classes: list[str]
    confidence_threshold: float
    min_top2_margin: float
    ten_motion_model_found: bool
    ten_motion_model_path: str
    ten_motion_ready: bool
    supports_ten_dynamic: bool
    ten_sequence_frames: int
    ten_min_sequence_frames: int
    motion_model_found: bool
    motion_model_path: str
    motion_ready: bool
    supports_11_100_dynamic: bool
    motion_sequence_frames: int
    motion_min_sequence_frames: int
    ready: bool


class WordsDatasetStatusResponse(BaseModel):
    dataset_root: str
    processed_path: str
    clips_root: str
    train_rows: int
    test_rows: int
    train_clips_found: int
    test_clips_found: int
    missing_train_clips: int
    missing_test_clips: int
    available_labels: list[str]
    available_label_count: int
    available_category_count: int
    excluded_categories: list[str]
    ready_for_training: bool


class WordsModelStatusResponse(BaseModel):
    model_found: bool
    model_path: str
    classes: list[str]
    confidence_threshold: float
    min_top2_margin: float
    force_best_prediction: bool
    sequence_frames: int
    min_sequence_frames: int
    ready: bool
