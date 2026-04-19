"""student account archive flow

Revision ID: 20260409_0002
Revises: 20260409_0001
Create Date: 2026-04-09 14:10:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260409_0002"
down_revision = "20260409_0001"
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


def _index_names(table_name: str) -> set[str]:
    if not _table_exists(table_name):
        return set()
    return {index["name"] for index in _inspector().get_indexes(table_name)}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if column.name not in _column_names(table_name):
        op.add_column(table_name, column)


def _create_index_if_missing(name: str, table_name: str, columns: list[str], *, unique: bool = False) -> None:
    if name not in _index_names(table_name):
        op.create_index(name, table_name, columns, unique=unique)


def upgrade() -> None:
    _add_column_if_missing(
        "users",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )

    if not _table_exists("archived_student_accounts"):
        op.create_table(
            "archived_student_accounts",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("original_user_id", sa.Integer(), nullable=False),
            sa.Column("original_username", sa.String(length=120), nullable=False),
            sa.Column("original_email", sa.String(length=255), nullable=True),
            sa.Column("first_name", sa.String(length=120), nullable=True),
            sa.Column("middle_name", sa.String(length=120), nullable=True),
            sa.Column("last_name", sa.String(length=120), nullable=True),
            sa.Column("phone_number", sa.String(length=40), nullable=True),
            sa.Column("address", sa.Text(), nullable=True),
            sa.Column("birth_date", sa.Date(), nullable=True),
            sa.Column("profile_image_path", sa.String(length=500), nullable=True),
            sa.Column("role", sa.String(length=20), nullable=False, server_default="student"),
            sa.Column("enrollment_id", sa.Integer(), nullable=True),
            sa.Column("registration_id", sa.Integer(), nullable=True),
            sa.Column("batch_id", sa.Integer(), nullable=True),
            sa.Column("archive_reason", sa.String(length=120), nullable=True),
            sa.Column(
                "archived_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["original_user_id"], ["users.id"]),
            sa.UniqueConstraint("original_user_id", name="uq_archived_student_accounts_original_user_id"),
        )

    _create_index_if_missing("ix_users_archived_at", "users", ["archived_at"])
    _create_index_if_missing(
        "ix_archived_student_accounts_original_user_id",
        "archived_student_accounts",
        ["original_user_id"],
        unique=True,
    )
    _create_index_if_missing(
        "ix_archived_student_accounts_archived_at",
        "archived_student_accounts",
        ["archived_at"],
    )


def downgrade() -> None:
    if "ix_archived_student_accounts_archived_at" in _index_names("archived_student_accounts"):
        op.drop_index("ix_archived_student_accounts_archived_at", table_name="archived_student_accounts")
    if "ix_archived_student_accounts_original_user_id" in _index_names("archived_student_accounts"):
        op.drop_index("ix_archived_student_accounts_original_user_id", table_name="archived_student_accounts")
    if _table_exists("archived_student_accounts"):
        op.drop_table("archived_student_accounts")

    if "ix_users_archived_at" in _index_names("users"):
        op.drop_index("ix_users_archived_at", table_name="users")

    if "archived_at" in _column_names("users"):
        op.drop_column("users", "archived_at")
