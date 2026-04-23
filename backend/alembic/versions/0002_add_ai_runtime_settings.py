"""add ai runtime settings

Revision ID: 0002_add_ai_runtime_settings
Revises: 0001_initial_schema
Create Date: 2026-04-23 14:18:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002_add_ai_runtime_settings"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_runtime_settings",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("model_id", sa.String(length=100), nullable=False),
        sa.Column("base_url", sa.String(length=500), nullable=True),
        sa.Column("api_key", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_runtime_settings_is_active", "ai_runtime_settings", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_runtime_settings_is_active", table_name="ai_runtime_settings")
    op.drop_table("ai_runtime_settings")
