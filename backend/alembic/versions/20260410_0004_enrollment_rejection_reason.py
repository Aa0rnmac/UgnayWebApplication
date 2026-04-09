"""split enrollment rejection reason from internal notes

Revision ID: 20260410_0004
Revises: 20260409_0003
Create Date: 2026-04-10 09:30:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260410_0004"
down_revision = "20260409_0003"
branch_labels = None
depends_on = None


def _bind():
    return op.get_bind()


def _inspector():
    return sa.inspect(_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in set(_inspector().get_table_names())


def _column_names(table_name: str) -> set[str]:
    if not _table_exists(table_name):
        return set()
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if column.name not in _column_names(table_name):
        op.add_column(table_name, column)


def upgrade() -> None:
    _add_column_if_missing(
        "enrollments",
        sa.Column("rejection_reason_code", sa.String(length=40), nullable=True),
    )
    _add_column_if_missing(
        "enrollments",
        sa.Column("rejection_reason_detail", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    if "rejection_reason_detail" in _column_names("enrollments"):
        op.drop_column("enrollments", "rejection_reason_detail")
    if "rejection_reason_code" in _column_names("enrollments"):
        op.drop_column("enrollments", "rejection_reason_code")
