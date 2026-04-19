from __future__ import annotations

import base64
import json
from datetime import datetime
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[2]
UPLOADS_ROOT = (BACKEND_ROOT / "uploads").resolve()
CERTIFICATE_TEMPLATE_DIR = (UPLOADS_ROOT / "certificate-templates").resolve()
CERTIFICATE_TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_PATH = CERTIFICATE_TEMPLATE_DIR / "admin-certificate-template-config.json"
DEFAULT_TEMPLATE_IMAGE_PATH = (
    Path(__file__).resolve().parents[1]
    / "assets"
    / "certificates"
    / "fsl-basic-course-template.png"
)


def _default_config() -> dict[str, Any]:
    return {
        "template_file_name": None,
        "template_file_path": None,
        "signatory_name": None,
        "updated_at": None,
    }


def load_admin_certificate_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return _default_config()
    try:
        loaded = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _default_config()
    if not isinstance(loaded, dict):
        return _default_config()
    resolved = _default_config()
    if "sections" in loaded and isinstance(loaded.get("sections"), dict):
        sections = loaded.get("sections") or {}
        if isinstance(sections, dict):
            latest_entry: dict[str, Any] | None = None
            latest_updated = ""
            for raw in sections.values():
                if not isinstance(raw, dict):
                    continue
                updated_at = str(raw.get("updated_at") or "")
                if latest_entry is None or updated_at >= latest_updated:
                    latest_entry = raw
                    latest_updated = updated_at
            if latest_entry:
                resolved["template_file_name"] = latest_entry.get("template_file_name")
                resolved["template_file_path"] = latest_entry.get("template_file_path")
                resolved["signatory_name"] = latest_entry.get("signature_name")
                resolved["updated_at"] = latest_entry.get("updated_at")
    else:
        resolved["template_file_name"] = loaded.get("template_file_name")
        resolved["template_file_path"] = loaded.get("template_file_path")
        resolved["signatory_name"] = loaded.get("signatory_name") or loaded.get("signature_name")
        resolved["updated_at"] = loaded.get("updated_at")
    return resolved


def save_admin_certificate_config(payload: dict[str, Any]) -> None:
    CONFIG_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=True, sort_keys=True),
        encoding="utf-8",
    )


def get_admin_certificate_template() -> dict[str, Any]:
    return load_admin_certificate_config()


def upsert_admin_certificate_template(
    *,
    template_file_name: str | None,
    template_file_path: str | None,
    signatory_name: str | None,
) -> dict[str, Any]:
    existing = load_admin_certificate_config()
    saved = {
        "template_file_name": template_file_name
        if template_file_name is not None
        else existing.get("template_file_name"),
        "template_file_path": template_file_path
        if template_file_path is not None
        else existing.get("template_file_path"),
        "signatory_name": signatory_name if signatory_name is not None else existing.get("signatory_name"),
        "updated_at": datetime.utcnow().isoformat(),
    }
    save_admin_certificate_config(saved)
    return saved


def get_admin_section_certificate_template(section_id: int) -> dict[str, Any]:
    _ = section_id
    return get_admin_certificate_template()


def upsert_admin_section_certificate_template(
    *,
    section_id: int,
    template_file_name: str | None,
    template_file_path: str | None,
    signature_name: str | None,
    signature_title: str | None,
    signature_label: str | None,
) -> dict[str, Any]:
    _ = (section_id, signature_title, signature_label)
    return upsert_admin_certificate_template(
        template_file_name=template_file_name,
        template_file_path=template_file_path,
        signatory_name=signature_name,
    )


def resolve_upload_relative_path_to_absolute(relative_path: str) -> Path:
    normalized = relative_path.replace("\\", "/").lstrip("/")
    return (BACKEND_ROOT / normalized).resolve()


def build_template_data_uri(relative_path: str | None) -> str | None:
    candidate_paths: list[Path] = []
    if relative_path:
        candidate_paths.append(resolve_upload_relative_path_to_absolute(relative_path))
    candidate_paths.append(DEFAULT_TEMPLATE_IMAGE_PATH)

    for path in candidate_paths:
        if not path.exists():
            continue
        try:
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        except OSError:
            continue
        suffix = path.suffix.lower()
        mime_type = "image/png"
        if suffix in {".jpg", ".jpeg"}:
            mime_type = "image/jpeg"
        elif suffix == ".webp":
            mime_type = "image/webp"
        return f"data:{mime_type};base64,{encoded}"
    return None
