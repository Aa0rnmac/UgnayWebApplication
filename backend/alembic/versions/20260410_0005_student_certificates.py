"""add student certificate tracking

Revision ID: 20260410_0005
Revises: 20260410_0004
Create Date: 2026-04-10 13:00:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260410_0005"
down_revision = "20260410_0004"
branch_labels = None
depends_on = None


def _bind():
    return op.get_bind()


def _inspector():
    return sa.inspect(_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in set(_inspector().get_table_names())


def upgrade() -> None:
    if _table_exists("student_certificates"):
        return

    op.create_table(
        "student_certificates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("certificate_reference", sa.String(length=80), nullable=False),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("decided_by_user_id", sa.Integer(), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "snapshot_target_required_modules",
            sa.Integer(),
            nullable=False,
            server_default="12",
        ),
        sa.Column(
            "snapshot_effective_required_modules",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "snapshot_completed_required_modules",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "snapshot_average_best_score",
            sa.Float(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("snapshot_module_details", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["decided_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("student_id", name="uq_student_certificates_student"),
        sa.UniqueConstraint("certificate_reference"),
    )
    op.create_index(
        "ix_student_certificates_student_id",
        "student_certificates",
        ["student_id"],
        unique=False,
    )
    op.create_index(
        "ix_student_certificates_decided_by_user_id",
        "student_certificates",
        ["decided_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    if not _table_exists("student_certificates"):
        return
    op.drop_index("ix_student_certificates_decided_by_user_id", table_name="student_certificates")
    op.drop_index("ix_student_certificates_student_id", table_name="student_certificates")
    op.drop_table("student_certificates")
