import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.project import Chapter, ChapterVersion, DocumentChunk, Project
from app.models.user import User
from app.schemas.project import (
    ChapterCreate,
    ChapterReorderItem,
    ChapterResponse,
    ChapterUpdate,
    ChapterVersionResponse,
)
from app.services.chapter_chunk_service import chapter_chunk_service
from app.services.chapter_memory_service import chapter_memory_service
from app.services.story_memory_service import story_memory_service

router = APIRouter()
logger = logging.getLogger(__name__)


async def _require_project(project_id: str, user_id: str, db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _require_chapter(chapter_id: str, user_id: str, db: AsyncSession) -> Chapter:
    result = await db.execute(
        select(Chapter)
        .join(Project, Project.id == Chapter.project_id)
        .where(Chapter.id == chapter_id, Project.owner_id == user_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


async def _refresh_story_memory_for_chapter(db: AsyncSession, chapter: Chapter) -> None:
    try:
        await chapter_chunk_service.refresh_for_chapter(db, chapter_id=chapter.id)
        memory = await chapter_memory_service.refresh_for_chapter(db, chapter_id=chapter.id)
        await story_memory_service.refresh_for_project(
            db,
            project_id=chapter.project_id,
            updated_from_chapter_id=chapter.id if memory is not None else None,
        )
    except Exception:
        # Context refresh is best-effort in Phase 2 and should not block chapter writes.
        logger.exception("Context refresh failed for chapter=%s", chapter.id)
        return


@router.get("/by-project/{project_id}", response_model=list[ChapterResponse])
async def list_chapters(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_project(project_id, current_user.id, db)
    result = await db.execute(
        select(Chapter).where(Chapter.project_id == project_id).order_by(Chapter.order_index)
    )
    return result.scalars().all()


@router.post("/", response_model=ChapterResponse)
async def create_chapter(
    data: ChapterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_project(data.project_id, current_user.id, db)

    payload = data.model_dump()
    if payload["order_index"] == 0:
        result = await db.execute(
            select(Chapter.order_index)
            .where(Chapter.project_id == data.project_id)
            .order_by(Chapter.order_index.desc())
            .limit(1)
        )
        last_index = result.scalar_one_or_none()
        payload["order_index"] = 1 if last_index is None else last_index + 1

    chapter = Chapter(**payload)
    if data.plain_text:
        chapter.word_count = len(data.plain_text)
    db.add(chapter)
    await db.commit()
    await db.refresh(chapter)
    await _refresh_story_memory_for_chapter(db, chapter)
    await db.refresh(chapter)
    return chapter


@router.get("/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(
    chapter_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _require_chapter(chapter_id, current_user.id, db)


@router.put("/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(
    chapter_id: str,
    data: ChapterUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chapter = await _require_chapter(chapter_id, current_user.id, db)

    update_data = data.model_dump(exclude_unset=True)
    if "plain_text" in update_data and update_data["plain_text"]:
        update_data["word_count"] = len(update_data["plain_text"])

    if chapter.content and "content" in update_data and update_data["content"] != chapter.content:
        version = ChapterVersion(
            chapter_id=chapter_id,
            content=chapter.content,
            plain_text=chapter.plain_text,
            word_count=chapter.word_count,
            change_note="Auto-saved before update",
        )
        db.add(version)

    for key, value in update_data.items():
        setattr(chapter, key, value)

    await db.commit()
    await db.refresh(chapter)
    if any(field in update_data for field in {"content", "plain_text", "summary", "notes", "status", "title"}):
        await _refresh_story_memory_for_chapter(db, chapter)
        await db.refresh(chapter)
    return chapter


@router.put("/reorder/{project_id}", response_model=list[ChapterResponse])
async def reorder_chapters(
    project_id: str,
    data: list[ChapterReorderItem],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_project(project_id, current_user.id, db)

    result = await db.execute(select(Chapter).where(Chapter.project_id == project_id))
    chapters = {chapter.id: chapter for chapter in result.scalars().all()}

    if len(chapters) != len(data):
        raise HTTPException(status_code=400, detail="Reorder payload does not match chapter count")

    for item in data:
        chapter = chapters.get(item.id)
        if not chapter:
            raise HTTPException(status_code=404, detail=f"Chapter not found: {item.id}")
        chapter.order_index = item.order_index

        chunk_result = await db.execute(select(DocumentChunk).where(DocumentChunk.chapter_id == item.id))
        for chunk in chunk_result.scalars().all():
            chunk.chapter_order = item.order_index

    await db.commit()

    updated = await db.execute(
        select(Chapter).where(Chapter.project_id == project_id).order_by(Chapter.order_index)
    )
    return updated.scalars().all()


@router.get("/{chapter_id}/versions", response_model=list[ChapterVersionResponse])
async def list_chapter_versions(
    chapter_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_chapter(chapter_id, current_user.id, db)

    result = await db.execute(
        select(ChapterVersion)
        .where(ChapterVersion.chapter_id == chapter_id)
        .order_by(ChapterVersion.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/{chapter_id}")
async def delete_chapter(
    chapter_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chapter = await _require_chapter(chapter_id, current_user.id, db)

    project_id = chapter.project_id
    await db.delete(chapter)
    await db.commit()

    result = await db.execute(
        select(Chapter).where(Chapter.project_id == project_id).order_by(Chapter.order_index)
    )
    chapters = result.scalars().all()
    for index, item in enumerate(chapters, start=1):
        item.order_index = index
    await db.commit()

    return {"detail": "Deleted"}
