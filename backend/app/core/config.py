from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = PROJECT_ROOT / "backend"
ENV_FILE = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "postgresql+psycopg://fsl_app:admin123@localhost:5432/fsl_learning_hub"
    datasets_root: str = "datasets"
    artifacts_root: str = "artifacts"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    session_hours: int = 24
    teacher_validation_key: str = "teacher123"
    alphabet_model_path: str = "artifacts/alphabet_model.joblib"
    alphabet_confidence_threshold: float = 0.45
    alphabet_min_top2_margin: float = 0.08
    numbers_model_path: str = "artifacts/numbers_model.joblib"
    numbers_confidence_threshold: float = 0.5
    numbers_min_top2_margin: float = 0.08
    numbers_ten_model_path: str = "artifacts/numbers_ten_motion_model.joblib"
    numbers_ten_confidence_threshold: float = 0.5
    numbers_ten_min_top2_margin: float = 0.0
    numbers_ten_sequence_frames: int = 16
    numbers_ten_min_sequence_frames: int = 8
    numbers_motion_model_path: str = "artifacts/numbers_motion_model.joblib"
    numbers_motion_confidence_threshold: float = 0.2
    numbers_motion_min_top2_margin: float = 0.0
    numbers_motion_sequence_frames: int = 14
    numbers_motion_min_sequence_frames: int = 7
    words_model_path: str = "artifacts/words_model.joblib"
    words_confidence_threshold: float = 0.2
    words_min_top2_margin: float = 0.0
    words_force_best_prediction: bool = True
    words_sequence_frames: int = 20
    words_min_sequence_frames: int = 8
    words_excluded_categories: str = "FOOD,DRINK"
    mediapipe_detection_confidence: float = 0.5
    mediapipe_model_complexity: int = 1
    mediapipe_focus_on_hand_crop: bool = False
    mediapipe_hand_crop_padding: float = 0.28
    mediapipe_hand_crop_min_side_ratio: float = 0.2

    @property
    def datasets_root_path(self) -> Path:
        configured = Path(self.datasets_root).expanduser()
        if configured.is_absolute():
            return configured
        return (PROJECT_ROOT / configured).resolve()

    @property
    def artifacts_root_path(self) -> Path:
        configured = Path(self.artifacts_root).expanduser()
        if configured.is_absolute():
            return configured
        return (PROJECT_ROOT / configured).resolve()

    def resolve_artifact_path(self, path_value: str) -> Path:
        path = Path(path_value).expanduser()
        if path.is_absolute():
            return path

        parts = list(path.parts)
        if parts and parts[0].lower() == "artifacts":
            path = Path(*parts[1:]) if len(parts) > 1 else Path()

        return (self.artifacts_root_path / path).resolve()


settings = Settings()
