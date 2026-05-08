"""add story graph tables

Revision ID: 0008_add_story_graph_tables
Revises: 0007_add_document_chunks
Create Date: 2026-05-08 19:40:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0008_add_story_graph_tables"
down_revision: str | None = "0007_add_document_chunks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "story_entities",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("project_id", sa.String(length=26), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False, server_default="concept"),
        sa.Column("canonical_name", sa.String(length=200), nullable=False),
        sa.Column("aliases", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("first_seen_chapter_id", sa.String(length=26), nullable=True),
        sa.Column("last_seen_chapter_id", sa.String(length=26), nullable=True),
        sa.Column("first_seen_chapter_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_seen_chapter_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("mention_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["first_seen_chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["last_seen_chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_story_entities_project_id", "story_entities", ["project_id"], unique=False)
    op.create_index("ix_story_entities_name", "story_entities", ["project_id", "canonical_name"], unique=False)

    op.create_table(
        "story_events",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("project_id", sa.String(length=26), nullable=False),
        sa.Column("chapter_id", sa.String(length=26), nullable=True),
        sa.Column("chapter_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("event_type", sa.String(length=50), nullable=False, server_default="scene"),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("participants", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_story_events_project_id", "story_events", ["project_id"], unique=False)
    op.create_index("ix_story_events_chapter_id", "story_events", ["chapter_id"], unique=False)
    op.create_index("ix_story_events_chapter_order", "story_events", ["chapter_order"], unique=False)

    op.create_table(
        "story_relations",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("project_id", sa.String(length=26), nullable=False),
        sa.Column("source_entity_name", sa.String(length=200), nullable=False),
        sa.Column("target_entity_name", sa.String(length=200), nullable=False),
        sa.Column("relation_type", sa.String(length=100), nullable=False),
        sa.Column("status_after", sa.Text(), nullable=True),
        sa.Column("chapter_id", sa.String(length=26), nullable=True),
        sa.Column("chapter_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_story_relations_project_id", "story_relations", ["project_id"], unique=False)
    op.create_index("ix_story_relations_chapter_id", "story_relations", ["chapter_id"], unique=False)
    op.create_index("ix_story_relations_pair", "story_relations", ["project_id", "source_entity_name", "target_entity_name"], unique=False)

    op.create_table(
        "story_open_loops",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("project_id", sa.String(length=26), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(length=20), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("related_entities", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("first_seen_chapter_id", sa.String(length=26), nullable=True),
        sa.Column("last_seen_chapter_id", sa.String(length=26), nullable=True),
        sa.Column("first_seen_chapter_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_seen_chapter_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("mention_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["first_seen_chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["last_seen_chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_story_open_loops_project_id", "story_open_loops", ["project_id"], unique=False)
    op.create_index("ix_story_open_loops_label", "story_open_loops", ["project_id", "label"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_story_open_loops_label", table_name="story_open_loops")
    op.drop_index("ix_story_open_loops_project_id", table_name="story_open_loops")
    op.drop_table("story_open_loops")

    op.drop_index("ix_story_relations_pair", table_name="story_relations")
    op.drop_index("ix_story_relations_chapter_id", table_name="story_relations")
    op.drop_index("ix_story_relations_project_id", table_name="story_relations")
    op.drop_table("story_relations")

    op.drop_index("ix_story_events_chapter_order", table_name="story_events")
    op.drop_index("ix_story_events_chapter_id", table_name="story_events")
    op.drop_index("ix_story_events_project_id", table_name="story_events")
    op.drop_table("story_events")

    op.drop_index("ix_story_entities_name", table_name="story_entities")
    op.drop_index("ix_story_entities_project_id", table_name="story_entities")
    op.drop_table("story_entities")
