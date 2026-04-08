from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://fsl_app:admin123@localhost:5432/fsl_learning_hub"
    datasets_root: str = "datasets"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    session_hours: int = 24
    password_reset_otp_minutes: int = 10
    password_reset_max_attempts: int = 5
    teacher_validation_key: str = "teacher123"
    teacher_invite_signing_secret: str = "change-me-teacher-invite-secret"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
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


settings = Settings()
