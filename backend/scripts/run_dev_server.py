from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

HOST = "0.0.0.0"
PORT = 8000
HEALTHCHECK_URL = f"http://127.0.0.1:{PORT}/openapi.json"
BACKEND_ROOT = Path(__file__).resolve().parents[1]


def backend_is_healthy() -> bool:
    try:
        with urlopen(HEALTHCHECK_URL, timeout=1) as response:
            return 200 <= response.status < 300
    except URLError:
        return False
    except TimeoutError:
        return False


def run_alembic() -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_ROOT,
        check=True,
    )


def run_uvicorn(reload_enabled: bool) -> None:
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        HOST,
        "--port",
        str(PORT),
    ]
    if reload_enabled:
        command.insert(4, "--reload")

    os.execv(sys.executable, command)


def wait_forever() -> None:
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


def main() -> int:
    reload_enabled = "--reload" in sys.argv[1:]

    if backend_is_healthy():
        print(
            f"Backend is already running on port {PORT}. Reusing the existing server.",
            flush=True,
        )
        wait_forever()
        return 0

    print("Running Alembic migrations...", flush=True)
    run_alembic()
    print(f"Starting Uvicorn on {HOST}:{PORT}...", flush=True)
    run_uvicorn(reload_enabled=reload_enabled)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
