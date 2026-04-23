import ulid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def generate_ulid() -> str:
    return str(ulid.new())


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="original")
    source_work: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    default_model_provider: Mapped[str | None] = mapped_column(String(20))
    default_model_id: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    chapters: Mapped[list["Chapter"]] = relationship(back_populates="project", cascade="all, delete-orphan", order_by="Chapter.order_index")
    project_characters: Mapped[list["ProjectCharacter"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    world_setting: Mapped["WorldSetting | None"] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        uselist=False,
    )


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    project_id: Mapped[str] = mapped_column(String(26), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[str | None] = mapped_column(Text)
    plain_text: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="chapters")
    versions: Mapped[list["ChapterVersion"]] = relationship(back_populates="chapter", cascade="all, delete-orphan")


class ChapterVersion(Base):
    __tablename__ = "chapter_versions"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    chapter_id: Mapped[str] = mapped_column(String(26), ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    plain_text: Mapped[str | None] = mapped_column(Text)
    word_count: Mapped[int | None] = mapped_column(Integer)
    change_note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    chapter: Mapped["Chapter"] = relationship(back_populates="versions")


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    alias: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    profile: Mapped[str | None] = mapped_column(Text)
    personality: Mapped[str | None] = mapped_column(Text)
    background: Mapped[str | None] = mapped_column(Text)
    relationship_notes: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project_links: Mapped[list["ProjectCharacter"]] = relationship(
        back_populates="character",
        cascade="all, delete-orphan",
    )


class ProjectCharacter(Base):
    __tablename__ = "project_characters"
    __table_args__ = (UniqueConstraint("project_id", "character_id", name="uq_project_characters_project_id_character_id"),)

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    project_id: Mapped[str] = mapped_column(String(26), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    character_id: Mapped[str] = mapped_column(String(26), ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    role_label: Mapped[str | None] = mapped_column(String(100))
    summary: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="project_characters")
    character: Mapped["Character"] = relationship(back_populates="project_links")


class WorldSetting(Base):
    __tablename__ = "world_settings"
    __table_args__ = (UniqueConstraint("project_id", name="uq_world_settings_project_id"),)

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    project_id: Mapped[str] = mapped_column(String(26), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="世界观设定")
    overview: Mapped[str | None] = mapped_column(Text)
    rules: Mapped[str | None] = mapped_column(Text)
    factions: Mapped[str | None] = mapped_column(Text)
    locations: Mapped[str | None] = mapped_column(Text)
    timeline: Mapped[str | None] = mapped_column(Text)
    extra_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="world_setting")


class AIRuntimeSetting(Base):
    __tablename__ = "ai_runtime_settings"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="openai")
    model_id: Mapped[str] = mapped_column(String(100), nullable=False, default="gpt-4o")
    base_url: Mapped[str | None] = mapped_column(String(500))
    api_key: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
