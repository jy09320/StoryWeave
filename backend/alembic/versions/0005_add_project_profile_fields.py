"""add project profile fields

Revision ID: 0005_add_project_profile_fields
Revises: 0004_add_users_and_owner_ids
Create Date: 2026-05-07 00:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0005_add_project_profile_fields"
down_revision: str | None = "0004_add_users_and_owner_ids"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("channel", sa.String(length=20), nullable=True))
    op.add_column("projects", sa.Column("genres", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.add_column("projects", sa.Column("tropes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.add_column("projects", sa.Column("premise", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "premise")
    op.drop_column("projects", "tropes")
    op.drop_column("projects", "genres")
    op.drop_column("projects", "channel")
