"""add name column to ai_runtime_settings

Revision ID: 0009_add_name_to_ai_runtime_settings
Revises: 0008_add_story_graph_tables
Create Date: 2026-06-04 00:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0009_add_name_to_ai_runtime_settings"
down_revision: str | None = "0008_add_story_graph_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("ai_runtime_settings", sa.Column("name", sa.String(length=100), nullable=False, server_default="默认配置"))
    op.alter_column("ai_runtime_settings", "name", server_default=None)
    op.create_unique_constraint("uq_ai_runtime_settings_owner_name", "ai_runtime_settings", ["owner_id", "name"])


def downgrade() -> None:
    op.drop_constraint("uq_ai_runtime_settings_owner_name", "ai_runtime_settings", type_="unique")
    op.drop_column("ai_runtime_settings", "name")
