from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app


def main() -> int:
    try:
        with TestClient(app) as client:
            response = client.get("/api/health")
    except Exception as exc:  # noqa: BLE001 - this is an explicit smoke check boundary
        print(
            f"[backend-smoke] Failed to boot backend runtime or call /api/health: {exc}",
            file=sys.stderr,
        )
        return 1

    if response.status_code != 200:
        print(
            f"[backend-smoke] /api/health returned HTTP {response.status_code}.",
            file=sys.stderr,
        )
        return 1

    payload = response.json()
    if payload.get("status") != "ok":
        print(
            f"[backend-smoke] Unexpected /api/health payload: {payload}",
            file=sys.stderr,
        )
        return 1

    print("[backend-smoke] /api/health responded with status=ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
