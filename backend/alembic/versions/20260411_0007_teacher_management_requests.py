"""add teacher management request fields to enrollments

Revision ID: 20260411_0007
Revises: 20260410_0006
Create Date: 2026-04-11 12:00:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260411_0007"
down_revision = "20260410_0006"
branch_labels = None
depends_on = None


def _bind():
    return op.get_bind()


def _inspector():
    return sa.inspect(_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in set(_inspector().get_table_names())


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return column_name in {column["name"] for column in _inspector().get_columns(table_name)}


def upgrade() -> None:
    if not _table_exists("enrollments"):
        return

    if not _column_exists("enrollments", "requested_teacher_id"):
        op.add_column("enrollments", sa.Column("requested_teacher_id", sa.Integer(), nullable=True))

    if not _column_exists("enrollments", "teacher_assignment_request_status"):
        op.add_column(
            "enrollments",
            sa.Column(
                "teacher_assignment_request_status",
                sa.String(length=20),
                nullable=False,
                server_default="none",
            ),
        )
        op.execute(
            sa.text(
                """
                UPDATE enrollments
                SET teacher_assignment_request_status = 'none'
                WHERE teacher_assignment_request_status IS NULL
                """
            )
        )

    if not _column_exists("enrollments", "teacher_assignment_request_note"):
        op.add_column(
            "enrollments",
            sa.Column("teacher_assignment_request_note", sa.Text(), nullable=True),
        )

    if not _column_exists("enrollments", "teacher_assignment_requested_at"):
        op.add_column(
            "enrollments",
            sa.Column("teacher_assignment_requested_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _column_exists("enrollments", "teacher_assignment_reviewed_at"):
        op.add_column(
            "enrollments",
            sa.Column("teacher_assignment_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _column_exists("enrollments", "teacher_assignment_reviewed_by_user_id"):
        op.add_column(
            "enrollments",
            sa.Column("teacher_assignment_reviewed_by_user_id", sa.Integer(), nullable=True),
        )

    if not _column_exists("enrollments", "teacher_assignment_decision_note"):
        op.add_column(
            "enrollments",
            sa.Column("teacher_assignment_decision_note", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    pass
