"""add users table and owner_id to projects/characters/ai_runtime_settings

Revision ID: 0004_add_users_and_owner_ids
Revises: 0003_add_characters_and_world_settings
Create Date: 2026-05-05 00:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0004_add_users_and_owner_ids"
down_revision: str | None = "0003_add_characters_and_world_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.add_column("projects", sa.Column("owner_id", sa.String(length=26), nullable=True))
    op.create_foreign_key("fk_projects_owner_id", "projects", "users", ["owner_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"], unique=False)

    op.add_column("characters", sa.Column("owner_id", sa.String(length=26), nullable=True))
    op.create_foreign_key("fk_characters_owner_id", "characters", "users", ["owner_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_characters_owner_id", "characters", ["owner_id"], unique=False)

    op.add_column("ai_runtime_settings", sa.Column("owner_id", sa.String(length=26), nullable=True))
    op.create_foreign_key("fk_ai_runtime_settings_owner_id", "ai_runtime_settings", "users", ["owner_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_ai_runtime_settings_owner_id", "ai_runtime_settings", ["owner_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_runtime_settings_owner_id", table_name="ai_runtime_settings")
    op.drop_constraint("fk_ai_runtime_settings_owner_id", "ai_runtime_settings", type_="foreignkey")
    op.drop_column("ai_runtime_settings", "owner_id")

    op.drop_index("ix_characters_owner_id", table_name="characters")
    op.drop_constraint("fk_characters_owner_id", "characters", type_="foreignkey")
    op.drop_column("characters", "owner_id")

    op.drop_index("ix_projects_owner_id", table_name="projects")
    op.drop_constraint("fk_projects_owner_id", "projects", type_="foreignkey")
    op.drop_column("projects", "owner_id")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
