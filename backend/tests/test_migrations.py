from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
import sqlalchemy as sa


def test_alembic_upgrade_preserves_existing_core_data(tmp_path):
    db_path = tmp_path / "migration-smoke.db"
    database_url = f"sqlite:///{db_path.as_posix()}"
    engine = sa.create_engine(database_url)
    metadata = sa.MetaData()

    sa.Table(
        "modules",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("lessons", sa.JSON(), nullable=False),
        sa.Column("assessments", sa.JSON(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, default=True),
    )
    sa.Table(
        "batches",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("current_week_number", sa.Integer(), nullable=False, default=1),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    sa.Table(
        "users",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=120), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="student"),
        sa.Column("first_name", sa.String(length=120), nullable=True),
        sa.Column("middle_name", sa.String(length=120), nullable=True),
        sa.Column("last_name", sa.String(length=120), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone_number", sa.String(length=40), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("profile_image_path", sa.String(length=500), nullable=True),
        sa.Column("batch_id", sa.Integer(), nullable=True),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    sa.Table(
        "user_module_progress",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("module_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, default="locked"),
        sa.Column("progress_percent", sa.Integer(), nullable=False, default=0),
        sa.Column("completed_lessons", sa.JSON(), nullable=False),
        sa.Column("assessment_score", sa.Float(), nullable=True),
        sa.Column("assessment_right_count", sa.Integer(), nullable=True),
        sa.Column("assessment_wrong_count", sa.Integer(), nullable=True),
        sa.Column("assessment_total_items", sa.Integer(), nullable=True),
        sa.Column("assessment_label", sa.String(length=255), nullable=True),
        sa.Column("improvement_areas", sa.JSON(), nullable=False),
        sa.Column("report_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("user_id", "module_id", name="uq_user_module"),
    )
    sa.Table(
        "registrations",
        metadata,
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
        sa.Column("requested_batch_name", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, default="pending"),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validated_by", sa.String(length=120), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_by", sa.String(length=120), nullable=True),
        sa.Column("linked_user_id", sa.Integer(), nullable=True),
        sa.Column("batch_id", sa.Integer(), nullable=True),
        sa.Column("issued_username", sa.String(length=120), nullable=True),
        sa.Column("credential_email_status", sa.String(length=30), nullable=True),
        sa.Column("credential_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("credential_email_error", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    sa.Table(
        "teacher_invites",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invite_code", sa.String(length=120), nullable=False, unique=True),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("passkey_hash", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
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
    )
    sa.Table(
        "assessment_reports",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("module_id", sa.Integer(), nullable=False),
        sa.Column("module_title", sa.String(length=255), nullable=False),
        sa.Column("assessment_id", sa.String(length=120), nullable=False),
        sa.Column("assessment_title", sa.String(length=255), nullable=False),
        sa.Column("right_count", sa.Integer(), nullable=False, default=0),
        sa.Column("wrong_count", sa.Integer(), nullable=False, default=0),
        sa.Column("total_items", sa.Integer(), nullable=False, default=0),
        sa.Column("score_percent", sa.Float(), nullable=False, default=0),
        sa.Column("improvement_areas", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(
            sa.text(
                """
                INSERT INTO modules (id, slug, title, description, order_index, lessons, assessments, is_published)
                VALUES (1, 'legacy-module', 'Legacy Module', 'Legacy description', 1, '[]', '[]', 1)
                """
            )
        )
        connection.execute(
            sa.text(
                """
                INSERT INTO users (id, username, password_hash, role, email, must_change_password)
                VALUES (1, 'legacy.student', 'hashed-password', 'student', 'legacy@student.test', 0)
                """
            )
        )
        connection.execute(
            sa.text(
                """
                INSERT INTO registrations (id, first_name, last_name, email, phone_number, reference_number, status)
                VALUES (1, 'Legacy', 'Student', 'legacy@student.test', '09123456789', 'REF-LEGACY', 'pending')
                """
            )
        )
        connection.execute(
            sa.text(
                """
                INSERT INTO teacher_invites (id, invite_code, label, passkey_hash, status, use_count)
                VALUES (1, 'legacy-invite', 'Legacy Invite', 'hash', 'active', 0)
                """
            )
        )
        connection.execute(
            sa.text(
                """
                INSERT INTO user_module_progress (
                    id, user_id, module_id, status, progress_percent, completed_lessons, improvement_areas
                )
                VALUES (1, 1, 1, 'in_progress', 50, '[]', '[]')
                """
            )
        )

    alembic_config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    alembic_config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    alembic_config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(alembic_config, "head")

    inspector = sa.inspect(engine)
    tables = set(inspector.get_table_names())
    assert "module_activities" in tables
    assert "activity_attempts" in tables
    assert "activity_attempt_items" in tables
    assert "enrollments" in tables
    assert "password_reset_otps" in tables
    assert "user_sessions" in tables
    assert "completed_assessments" in {column["name"] for column in inspector.get_columns("user_module_progress")}
    assert "max_use_count" in {column["name"] for column in inspector.get_columns("teacher_invites")}
    assert "code" in {column["name"] for column in inspector.get_columns("batches")}

    with engine.connect() as connection:
        user_count = connection.execute(sa.text("SELECT COUNT(*) FROM users")).scalar_one()
        registration_count = connection.execute(sa.text("SELECT COUNT(*) FROM registrations")).scalar_one()
        assert user_count == 1
        assert registration_count == 1
