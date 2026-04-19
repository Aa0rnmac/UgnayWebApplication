"""main-first backend and database foundation

Revision ID: 20260409_0001
Revises:
Create Date: 2026-04-09 11:00:00.000000

"""

from __future__ import annotations

import re

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260409_0001"
down_revision = None
branch_labels = None
depends_on = None


def _bind():
    return op.get_bind()


def _inspector():
    return sa.inspect(_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in set(_inspector().get_table_names())


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in _inspector().get_indexes(table_name)}


def _unique_constraint_columns(table_name: str) -> set[tuple[str, ...]]:
    return {
        tuple(constraint.get("column_names") or [])
        for constraint in _inspector().get_unique_constraints(table_name)
    }


def _fk_names(table_name: str) -> set[str]:
    return {fk["name"] for fk in _inspector().get_foreign_keys(table_name) if fk.get("name")}


def _create_index_if_missing(name: str, table_name: str, columns: list[str], *, unique: bool = False) -> None:
    if unique and tuple(columns) in _unique_constraint_columns(table_name):
        return
    if name not in _index_names(table_name):
        op.create_index(name, table_name, columns, unique=unique)


def _create_fk_if_missing(
    name: str,
    source_table: str,
    referent_table: str,
    local_cols: list[str],
    remote_cols: list[str],
    *,
    ondelete: str | None = None,
) -> None:
    if _bind().dialect.name == "sqlite":
        return
    if name not in _fk_names(source_table):
        op.create_foreign_key(
            name,
            source_table,
            referent_table,
            local_cols,
            remote_cols,
            ondelete=ondelete,
        )


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if column.name not in _column_names(table_name):
        op.add_column(table_name, column)


def _normalize_batch_code(value: str) -> str:
    normalized = re.sub(r"[^A-Z0-9-]+", "-", (value or "").strip().upper())
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    return normalized or "BATCH"


def _create_base_tables() -> None:
    json_type = sa.JSON()

    if not _table_exists("modules"):
        op.create_table(
            "modules",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("slug", sa.String(length=120), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("order_index", sa.Integer(), nullable=False),
            sa.Column("lessons", json_type, nullable=False),
            sa.Column("assessments", json_type, nullable=False),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
        )
        _create_index_if_missing("ix_modules_slug", "modules", ["slug"], unique=True)
        _create_index_if_missing("ix_modules_order_index", "modules", ["order_index"])

    if not _table_exists("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("username", sa.String(length=120), nullable=False),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("first_name", sa.String(length=120), nullable=True),
            sa.Column("middle_name", sa.String(length=120), nullable=True),
            sa.Column("last_name", sa.String(length=120), nullable=True),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("phone_number", sa.String(length=40), nullable=True),
            sa.Column("address", sa.Text(), nullable=True),
            sa.Column("birth_date", sa.Date(), nullable=True),
            sa.Column("profile_image_path", sa.String(length=500), nullable=True),
            sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("role", sa.String(length=20), nullable=False, server_default="student"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )
        _create_index_if_missing("ix_users_username", "users", ["username"], unique=True)
        _create_index_if_missing("ix_users_email", "users", ["email"])

    if not _table_exists("user_sessions"):
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token", sa.String(length=255), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
        _create_index_if_missing("ix_user_sessions_token", "user_sessions", ["token"], unique=True)

    if not _table_exists("password_reset_otps"):
        op.create_table(
            "password_reset_otps",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("otp_hash", sa.String(length=255), nullable=False),
            sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
        _create_index_if_missing("ix_password_reset_otps_user_id", "password_reset_otps", ["user_id"])

    if not _table_exists("assessment_reports"):
        op.create_table(
            "assessment_reports",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("module_id", sa.Integer(), nullable=False),
            sa.Column("module_title", sa.String(length=255), nullable=False),
            sa.Column("assessment_id", sa.String(length=120), nullable=False),
            sa.Column("assessment_title", sa.String(length=255), nullable=False),
            sa.Column("right_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("wrong_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_items", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("score_percent", sa.Float(), nullable=False, server_default="0"),
            sa.Column("improvement_areas", json_type, nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
        _create_index_if_missing("ix_assessment_reports_user_id", "assessment_reports", ["user_id"])
        _create_index_if_missing("ix_assessment_reports_module_id", "assessment_reports", ["module_id"])

    if not _table_exists("user_module_progress"):
        op.create_table(
            "user_module_progress",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("module_id", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="locked"),
            sa.Column("progress_percent", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("completed_lessons", json_type, nullable=False),
            sa.Column("completed_assessments", json_type, nullable=False),
            sa.Column("assessment_score", sa.Float(), nullable=True),
            sa.Column("assessment_right_count", sa.Integer(), nullable=True),
            sa.Column("assessment_wrong_count", sa.Integer(), nullable=True),
            sa.Column("assessment_total_items", sa.Integer(), nullable=True),
            sa.Column("assessment_label", sa.String(length=255), nullable=True),
            sa.Column("improvement_areas", json_type, nullable=False),
            sa.Column("report_sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("user_id", "module_id", name="uq_user_module"),
        )

    if not _table_exists("registrations"):
        op.create_table(
            "registrations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("first_name", sa.String(length=120), nullable=False),
            sa.Column("middle_name", sa.String(length=120), nullable=True),
            sa.Column("last_name", sa.String(length=120), nullable=False),
            sa.Column("birth_date", sa.Date(), nullable=True),
            sa.Column("address", sa.Text(), nullable=True),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("phone_number", sa.String(length=40), nullable=False),
            sa.Column("reference_number", sa.String(length=120), nullable=False),
            sa.Column("reference_image_path", sa.String(length=500), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("validated_by", sa.String(length=120), nullable=True),
            sa.Column("linked_user_id", sa.Integer(), nullable=True),
            sa.Column("issued_username", sa.String(length=120), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["linked_user_id"], ["users.id"]),
        )
        _create_index_if_missing("ix_registrations_email", "registrations", ["email"])
        _create_index_if_missing("ix_registrations_reference_number", "registrations", ["reference_number"])

    if not _table_exists("teacher_invites"):
        op.create_table(
            "teacher_invites",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("invite_code", sa.String(length=120), nullable=False),
            sa.Column("label", sa.String(length=255), nullable=True),
            sa.Column("passkey_hash", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_use_count", sa.Integer(), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_by_user_id", sa.Integer(), nullable=True),
            sa.Column("revoked_reason", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["revoked_by_user_id"], ["users.id"]),
        )
        _create_index_if_missing("ix_teacher_invites_invite_code", "teacher_invites", ["invite_code"], unique=True)


def _upgrade_batches() -> None:
    bind = _bind()
    dialect_name = bind.dialect.name
    if not _table_exists("batches"):
        op.create_table(
            "batches",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(length=60), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("start_date", sa.Date(), nullable=True),
            sa.Column("end_date", sa.Date(), nullable=True),
            sa.Column("capacity", sa.Integer(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        )
    else:
        existing_columns = _column_names("batches")
        if "code" not in existing_columns:
            op.add_column("batches", sa.Column("code", sa.String(length=60), nullable=True))
            rows = bind.execute(sa.text("SELECT id, name FROM batches ORDER BY id ASC")).mappings()
            used_codes: set[str] = set()
            for row in rows:
                base_code = _normalize_batch_code(str(row["name"] or f"BATCH-{row['id']}"))
                candidate = base_code
                suffix = 1
                while candidate in used_codes:
                    suffix += 1
                    candidate = f"{base_code}-{suffix}"
                used_codes.add(candidate)
                bind.execute(
                    sa.text("UPDATE batches SET code = :code WHERE id = :id"),
                    {"code": candidate, "id": row["id"]},
                )
            if dialect_name != "sqlite":
                op.alter_column("batches", "code", existing_type=sa.String(length=60), nullable=False)
        _add_column_if_missing(
            "batches",
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        )
        _add_column_if_missing("batches", sa.Column("start_date", sa.Date(), nullable=True))
        _add_column_if_missing("batches", sa.Column("end_date", sa.Date(), nullable=True))
        _add_column_if_missing("batches", sa.Column("capacity", sa.Integer(), nullable=True))
        _add_column_if_missing("batches", sa.Column("notes", sa.Text(), nullable=True))
        _add_column_if_missing("batches", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
        _add_column_if_missing(
            "batches",
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )
        _create_fk_if_missing(
            "fk_batches_created_by_user_id_users",
            "batches",
            "users",
            ["created_by_user_id"],
            ["id"],
        )

    _create_index_if_missing("ix_batches_code", "batches", ["code"], unique=True)
    _create_index_if_missing("ix_batches_name", "batches", ["name"], unique=True)


def _upgrade_existing_tables() -> None:
    if _table_exists("modules") and "is_published" not in _column_names("modules"):
        op.add_column(
            "modules",
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
        )

    if _table_exists("user_module_progress") and "completed_assessments" not in _column_names("user_module_progress"):
        op.add_column("user_module_progress", sa.Column("completed_assessments", sa.JSON(), nullable=True))
        _bind().execute(
            sa.text(
                "UPDATE user_module_progress SET completed_assessments = :payload WHERE completed_assessments IS NULL"
            ),
            {"payload": "[]"},
        )
        if _bind().dialect.name != "sqlite":
            op.alter_column(
                "user_module_progress",
                "completed_assessments",
                existing_type=sa.JSON(),
                nullable=False,
            )

    if _table_exists("teacher_invites"):
        _add_column_if_missing("teacher_invites", sa.Column("max_use_count", sa.Integer(), nullable=True))
        _add_column_if_missing("teacher_invites", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
        _add_column_if_missing("teacher_invites", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
        _add_column_if_missing("teacher_invites", sa.Column("revoked_by_user_id", sa.Integer(), nullable=True))
        _add_column_if_missing("teacher_invites", sa.Column("revoked_reason", sa.Text(), nullable=True))
        _create_fk_if_missing(
            "fk_teacher_invites_revoked_by_user_id_users",
            "teacher_invites",
            "users",
            ["revoked_by_user_id"],
            ["id"],
        )


def _create_main_first_tables() -> None:
    json_type = sa.JSON()

    if not _table_exists("enrollments"):
        op.create_table(
            "enrollments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("registration_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("batch_id", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("payment_review_status", sa.String(length=20), nullable=False, server_default="submitted"),
            sa.Column("review_notes", sa.Text(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("approved_by_user_id", sa.Integer(), nullable=True),
            sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("rejected_by_user_id", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["batch_id"], ["batches.id"]),
            sa.ForeignKeyConstraint(["registration_id"], ["registrations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["rejected_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.UniqueConstraint("registration_id", name="uq_enrollments_registration"),
        )
        _create_index_if_missing("ix_enrollments_registration_id", "enrollments", ["registration_id"])
        _create_index_if_missing("ix_enrollments_user_id", "enrollments", ["user_id"])
        _create_index_if_missing("ix_enrollments_batch_id", "enrollments", ["batch_id"])

    if not _table_exists("module_activities"):
        op.create_table(
            "module_activities",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("module_id", sa.Integer(), nullable=False),
            sa.Column("activity_key", sa.String(length=120), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("activity_type", sa.String(length=60), nullable=False),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("instructions", sa.Text(), nullable=True),
            sa.Column("definition", json_type, nullable=False),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("module_id", "activity_key", name="uq_module_activity_key"),
        )
        _create_index_if_missing("ix_module_activities_module_id", "module_activities", ["module_id"])
        _create_index_if_missing("ix_module_activities_activity_key", "module_activities", ["activity_key"])

    if not _table_exists("activity_attempts"):
        op.create_table(
            "activity_attempts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("module_id", sa.Integer(), nullable=False),
            sa.Column("module_activity_id", sa.Integer(), nullable=False),
            sa.Column("activity_key", sa.String(length=120), nullable=False),
            sa.Column("activity_title", sa.String(length=255), nullable=False),
            sa.Column("activity_type", sa.String(length=60), nullable=False),
            sa.Column("right_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("wrong_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_items", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("score_percent", sa.Float(), nullable=False, server_default="0"),
            sa.Column("improvement_areas", json_type, nullable=False),
            sa.Column("ai_metadata", json_type, nullable=False),
            sa.Column("source", sa.String(length=30), nullable=False, server_default="api"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "submitted_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["module_activity_id"], ["module_activities.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
        _create_index_if_missing("ix_activity_attempts_user_id", "activity_attempts", ["user_id"])
        _create_index_if_missing("ix_activity_attempts_module_id", "activity_attempts", ["module_id"])
        _create_index_if_missing("ix_activity_attempts_module_activity_id", "activity_attempts", ["module_activity_id"])
        _create_index_if_missing("ix_activity_attempts_activity_key", "activity_attempts", ["activity_key"])

    if not _table_exists("activity_attempt_items"):
        op.create_table(
            "activity_attempt_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("attempt_id", sa.Integer(), nullable=False),
            sa.Column("item_key", sa.String(length=120), nullable=False),
            sa.Column("prompt", sa.Text(), nullable=True),
            sa.Column("expected_answer", sa.Text(), nullable=True),
            sa.Column("student_answer", sa.Text(), nullable=True),
            sa.Column("is_correct", sa.Boolean(), nullable=True),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("ai_metadata", json_type, nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["attempt_id"], ["activity_attempts.id"], ondelete="CASCADE"),
        )
        _create_index_if_missing("ix_activity_attempt_items_attempt_id", "activity_attempt_items", ["attempt_id"])
        _create_index_if_missing("ix_activity_attempt_items_item_key", "activity_attempt_items", ["item_key"])


def upgrade() -> None:
    _create_base_tables()
    _upgrade_batches()
    _upgrade_existing_tables()
    _create_main_first_tables()


def downgrade() -> None:
    for table_name in [
        "activity_attempt_items",
        "activity_attempts",
        "module_activities",
        "enrollments",
    ]:
        if _table_exists(table_name):
            op.drop_table(table_name)
