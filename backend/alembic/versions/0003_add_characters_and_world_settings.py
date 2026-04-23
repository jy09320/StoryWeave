"""add characters and world settings

Revision ID: 0003_add_characters_and_world_settings
Revises: 0002_add_ai_runtime_settings
Create Date: 2026-04-23 19:20:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0003_add_characters_and_world_settings"
down_revision: str | None = "0002_add_ai_runtime_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "characters",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("alias", sa.String(length=200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("profile", sa.Text(), nullable=True),
        sa.Column("personality", sa.Text(), nullable=True),
        sa.Column("background", sa.Text(), nullable=True),
        sa.Column("relationship_notes", sa.Text(), nullable=True),
        sa.Column("tags", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_characters_name", "characters", ["name"], unique=False)

    op.create_table(
        "project_characters",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("project_id", sa.String(length=26), nullable=False),
        sa.Column("character_id", sa.String(length=26), nullable=False),
        sa.Column("role_label", sa.String(length=100), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "character_id", name="uq_project_characters_project_id_character_id"),
    )
    op.create_index("ix_project_characters_project_id", "project_characters", ["project_id"], unique=False)
    op.create_index("ix_project_characters_character_id", "project_characters", ["character_id"], unique=False)

    op.create_table(
        "world_settings",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("project_id", sa.String(length=26), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False, server_default="世界观设定"),
        sa.Column("overview", sa.Text(), nullable=True),
        sa.Column("rules", sa.Text(), nullable=True),
        sa.Column("factions", sa.Text(), nullable=True),
        sa.Column("locations", sa.Text(), nullable=True),
        sa.Column("timeline", sa.Text(), nullable=True),
        sa.Column("extra_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", name="uq_world_settings_project_id"),
    )
    op.create_index("ix_world_settings_project_id", "world_settings", ["project_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_world_settings_project_id", table_name="world_settings")
    op.drop_table("world_settings")
    op.drop_index("ix_project_characters_character_id", table_name="project_characters")
    op.drop_index("ix_project_characters_project_id", table_name="project_characters")
    op.drop_table("project_characters")
    op.drop_index("ix_characters_name", table_name="characters")
    op.drop_table("characters")
