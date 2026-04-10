"""add teacher module ownership and handling sessions

Revision ID: 20260410_0006
Revises: 20260410_0005
Create Date: 2026-04-10 15:30:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260410_0006"
down_revision = "20260410_0005"
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
    if not _table_exists("teacher_presences"):
        op.create_table(
            "teacher_presences",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("teacher_id", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="offline"),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("teacher_id", name="uq_teacher_presences_teacher"),
        )

    if not _table_exists("teacher_handling_sessions"):
        op.create_table(
            "teacher_handling_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("teacher_id", sa.Integer(), nullable=False),
            sa.Column("batch_id", sa.Integer(), nullable=True),
            sa.Column("student_id", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["batch_id"], ["batches.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="SET NULL"),
        )

    if not _column_exists("modules", "module_kind"):
        op.add_column(
            "modules",
            sa.Column("module_kind", sa.String(length=20), nullable=False, server_default="system"),
        )
    if not _column_exists("modules", "owner_teacher_id"):
        op.add_column("modules", sa.Column("owner_teacher_id", sa.Integer(), nullable=True))
    if not _column_exists("modules", "source_module_id"):
        op.add_column("modules", sa.Column("source_module_id", sa.Integer(), nullable=True))
    if not _column_exists("modules", "is_shared_pool"):
        op.add_column(
            "modules",
            sa.Column("is_shared_pool", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if not _column_exists("modules", "cover_image_path"):
        op.add_column("modules", sa.Column("cover_image_path", sa.String(length=500), nullable=True))
    if not _column_exists("modules", "archived_at"):
        op.add_column("modules", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))

    if not _column_exists("batches", "primary_teacher_id"):
        op.add_column("batches", sa.Column("primary_teacher_id", sa.Integer(), nullable=True))

    if not _column_exists("activity_attempts", "module_owner_teacher_id"):
        op.add_column("activity_attempts", sa.Column("module_owner_teacher_id", sa.Integer(), nullable=True))
    if not _column_exists("activity_attempts", "handled_by_teacher_id"):
        op.add_column("activity_attempts", sa.Column("handled_by_teacher_id", sa.Integer(), nullable=True))
    if not _column_exists("activity_attempts", "handling_session_id"):
        op.add_column("activity_attempts", sa.Column("handling_session_id", sa.Integer(), nullable=True))

    if not _column_exists("assessment_reports", "module_owner_teacher_id"):
        op.add_column("assessment_reports", sa.Column("module_owner_teacher_id", sa.Integer(), nullable=True))
    if not _column_exists("assessment_reports", "handled_by_teacher_id"):
        op.add_column("assessment_reports", sa.Column("handled_by_teacher_id", sa.Integer(), nullable=True))
    if not _column_exists("assessment_reports", "handling_session_id"):
        op.add_column("assessment_reports", sa.Column("handling_session_id", sa.Integer(), nullable=True))

    op.execute(
        sa.text(
            """
            UPDATE batches
            SET primary_teacher_id = created_by_user_id
            WHERE primary_teacher_id IS NULL AND created_by_user_id IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    if _table_exists("teacher_handling_sessions"):
        op.drop_table("teacher_handling_sessions")
    if _table_exists("teacher_presences"):
        op.drop_table("teacher_presences")
