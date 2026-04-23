"""two-step password reset flow

Revision ID: 20260409_0003
Revises: 20260409_0002
Create Date: 2026-04-09 15:05:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260409_0003"
down_revision = "20260409_0002"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in set(_inspector().get_table_names())


def _column_names(table_name: str) -> set[str]:
    if not _table_exists(table_name):
        return set()
    return {column["name"] for column in _inspector().get_columns(table_name)}


def upgrade() -> None:
    if "verified_at" not in _column_names("password_reset_otps"):
        op.add_column(
            "password_reset_otps",
            sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "reset_token_hash" not in _column_names("password_reset_otps"):
        op.add_column(
            "password_reset_otps",
            sa.Column("reset_token_hash", sa.String(length=255), nullable=True),
        )


def downgrade() -> None:
    columns = _column_names("password_reset_otps")
    if "reset_token_hash" in columns:
        op.drop_column("password_reset_otps", "reset_token_hash")
    if "verified_at" in columns:
        op.drop_column("password_reset_otps", "verified_at")
