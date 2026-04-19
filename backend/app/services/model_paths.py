from pathlib import Path

from app.core.config import settings


def resolve_model_artifact_path(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path

    if path.parts and path.parts[0] == "artifacts":
        relative_to_artifacts = Path(*path.parts[1:]) if len(path.parts) > 1 else Path()
        return (settings.artifacts_root_path / relative_to_artifacts).resolve()

    backend_root = Path(__file__).resolve().parents[2]
    return (backend_root / path).resolve()
