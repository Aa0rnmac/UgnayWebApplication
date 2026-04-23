from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

import psycopg
from psycopg import sql
from dotenv import load_dotenv
from sqlalchemy.engine import URL, make_url


BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BACKEND_DIR / ".env"
SHARED_DB_NAMES = {"fsl_learning_hub"}


def _repo_slug() -> str:
    return re.sub(r"[^a-z0-9]+", "_", BACKEND_DIR.parent.name.lower()).strip("_")


def _to_psycopg_dsn(url: URL) -> str:
    dsn = url.render_as_string(hide_password=False)
    if dsn.startswith("postgresql+psycopg://"):
        return "postgresql://" + dsn[len("postgresql+psycopg://") :]
    if dsn.startswith("postgresql+psycopg2://"):
        return "postgresql://" + dsn[len("postgresql+psycopg2://") :]
    return dsn


def _load_database_url() -> URL:
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE, override=False)

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is missing. Set it in backend/.env (or your shell env) before running dev_db_init."
        )

    parsed = make_url(database_url)
    if not parsed.drivername.startswith("postgresql"):
        raise RuntimeError(
            f"DATABASE_URL must be PostgreSQL for this workflow. Found '{parsed.drivername}'."
        )
    if not parsed.database:
        raise RuntimeError("DATABASE_URL must include a database name.")
    return parsed


def _enforce_repo_specific_name(database_name: str, *, allow_shared_db: bool) -> None:
    if allow_shared_db:
        return

    normalized = database_name.strip().lower()
    if normalized in SHARED_DB_NAMES:
        suggestion = f"fsl_learning_hub_{_repo_slug()}"
        raise RuntimeError(
            "DATABASE_URL is using shared database name "
            f"'{database_name}', which causes repo-switch migration conflicts.\n"
            f"Use a repo-specific name instead, for example: '{suggestion}'.\n"
            "If you intentionally need a shared database, rerun with --allow-shared-db."
        )


def _ensure_database_exists(url: URL, *, maintenance_db: str) -> None:
    target_db = url.database or ""
    maintenance_url = url.set(database=maintenance_db)
    dsn = _to_psycopg_dsn(maintenance_url)

    try:
        with psycopg.connect(dsn, autocommit=True) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target_db,))
                exists = cursor.fetchone() is not None
                if exists:
                    print(f"[dev-db-init] Database already exists: {target_db}")
                else:
                    cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(target_db)))
                    print(f"[dev-db-init] Created database: {target_db}")
    except psycopg.Error as exc:
        raise RuntimeError(
            "Failed to connect/create PostgreSQL database. "
            f"Maintenance DB='{maintenance_db}', target DB='{target_db}'.\n"
            f"Original error: {exc}"
        ) from exc


def _run_migrations() -> None:
    command = [sys.executable, "-m", "alembic", "upgrade", "head"]
    print("[dev-db-init] Running alembic upgrade head...")
    completed = subprocess.run(command, cwd=BACKEND_DIR, check=False)
    if completed.returncode != 0:
        raise RuntimeError("Alembic migration failed. Fix the migration/database error above and retry.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ensure PostgreSQL dev database exists and apply backend migrations."
    )
    parser.add_argument(
        "--maintenance-db",
        default="postgres",
        help="Database to connect to when checking/creating the target database (default: postgres).",
    )
    parser.add_argument(
        "--allow-shared-db",
        action="store_true",
        help="Allow shared database names (not recommended for multi-repo local development).",
    )
    parser.add_argument(
        "--skip-migrate",
        action="store_true",
        help="Only ensure the database exists; skip alembic upgrade.",
    )
    args = parser.parse_args()

    try:
        url = _load_database_url()
        target_db = url.database or ""
        _enforce_repo_specific_name(target_db, allow_shared_db=args.allow_shared_db)
        print(f"[dev-db-init] DATABASE_URL target: {target_db}")
        _ensure_database_exists(url, maintenance_db=args.maintenance_db)
        if not args.skip_migrate:
            _run_migrations()
        print("[dev-db-init] Done.")
        return 0
    except Exception as exc:
        print(f"[dev-db-init] ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
