"""add story memory tables

Revision ID: 0006_add_story_memory_tables
Revises: 0005_add_project_profile_fields
Create Date: 2026-05-07 18:30:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0006_add_story_memory_tables"
down_revision: str | None = "0005_add_project_profile_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chapter_memories",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("project_id", sa.String(length=26), nullable=False),
        sa.Column("chapter_id", sa.String(length=26), nullable=False),
        sa.Column("summary_short", sa.Text(), nullable=True),
        sa.Column("summary_long", sa.Text(), nullable=True),
        sa.Column("key_events", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("character_state_changes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("relationship_changes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("open_loops", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("resolved_loops", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("timeline_markers", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("important_objects", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("knowledge_state_changes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chapter_id", name="uq_chapter_memories_chapter_id"),
    )
    op.create_index("ix_chapter_memories_project_id", "chapter_memories", ["project_id"], unique=False)

    op.create_table(
        "project_story_memories",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("project_id", sa.String(length=26), nullable=False),
        sa.Column("global_plot_summary", sa.Text(), nullable=True),
        sa.Column("active_conflicts", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("resolved_conflicts", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("character_arcs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("global_open_loops", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("timeline_constraints", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("world_rules_active", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("updated_from_chapter_id", sa.String(length=26), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_from_chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", name="uq_project_story_memories_project_id"),
    )
    op.create_index("ix_project_story_memories_updated_from_chapter_id", "project_story_memories", ["updated_from_chapter_id"], unique=False)

    op.create_table(
        "memory_evidence_links",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("memory_kind", sa.String(length=50), nullable=False),
        sa.Column("memory_owner_id", sa.String(length=26), nullable=False),
        sa.Column("source_chapter_id", sa.String(length=26), nullable=False),
        sa.Column("source_excerpt", sa.Text(), nullable=True),
        sa.Column("source_offset_start", sa.Integer(), nullable=True),
        sa.Column("source_offset_end", sa.Integer(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["source_chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_evidence_links_memory_owner", "memory_evidence_links", ["memory_kind", "memory_owner_id"], unique=False)
    op.create_index("ix_memory_evidence_links_source_chapter_id", "memory_evidence_links", ["source_chapter_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_memory_evidence_links_source_chapter_id", table_name="memory_evidence_links")
    op.drop_index("ix_memory_evidence_links_memory_owner", table_name="memory_evidence_links")
    op.drop_table("memory_evidence_links")

    op.drop_index("ix_project_story_memories_updated_from_chapter_id", table_name="project_story_memories")
    op.drop_table("project_story_memories")

    op.drop_index("ix_chapter_memories_project_id", table_name="chapter_memories")
    op.drop_table("chapter_memories")
