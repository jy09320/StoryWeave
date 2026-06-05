from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "character_chat_sessions",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("owner_id", sa.String(length=26), nullable=True),
        sa.Column("character_id", sa.String(length=26), nullable=False),
        sa.Column("project_id", sa.String(length=26), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("messages", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("model_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_character_chat_sessions_owner_id", "character_chat_sessions", ["owner_id"], unique=False)
    op.create_index("ix_character_chat_sessions_character_id", "character_chat_sessions", ["character_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_character_chat_sessions_character_id", table_name="character_chat_sessions")
    op.drop_index("ix_character_chat_sessions_owner_id", table_name="character_chat_sessions")
    op.drop_table("character_chat_sessions")
