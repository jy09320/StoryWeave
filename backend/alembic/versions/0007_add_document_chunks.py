"""add document chunks

Revision ID: 0007_add_document_chunks
Revises: 0006_add_story_memory_tables
Create Date: 2026-05-07 21:20:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0007_add_document_chunks"
down_revision: str | None = "0006_add_story_memory_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "document_chunks",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("project_id", sa.String(length=26), nullable=False),
        sa.Column("chapter_id", sa.String(length=26), nullable=False),
        sa.Column("chapter_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("scene_label", sa.String(length=200), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_short", sa.Text(), nullable=True),
        sa.Column("characters", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("start_offset", sa.Integer(), nullable=True),
        sa.Column("end_offset", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_document_chunks_project_id", "document_chunks", ["project_id"], unique=False)
    op.create_index("ix_document_chunks_chapter_id", "document_chunks", ["chapter_id"], unique=False)
    op.create_index("ix_document_chunks_chapter_order", "document_chunks", ["chapter_order"], unique=False)
    op.create_index(
        "ix_document_chunks_chapter_chunk",
        "document_chunks",
        ["chapter_id", "chunk_index"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_document_chunks_chapter_chunk", table_name="document_chunks")
    op.drop_index("ix_document_chunks_chapter_order", table_name="document_chunks")
    op.drop_index("ix_document_chunks_chapter_id", table_name="document_chunks")
    op.drop_index("ix_document_chunks_project_id", table_name="document_chunks")
    op.drop_table("document_chunks")
