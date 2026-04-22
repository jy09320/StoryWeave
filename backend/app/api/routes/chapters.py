from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.project import Chapter, ChapterVersion, Project
from app.schemas.project import ChapterCreate, ChapterReorderItem, ChapterResponse, ChapterUpdate

router = APIRouter()


@router.get("/by-project/{project_id}", response_model=list[ChapterResponse])
async def list_chapters(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Chapter).where(Chapter.project_id == project_id).order_by(Chapter.order_index)
    )
    return result.scalars().all()


@router.post("/", response_model=ChapterResponse)
async def create_chapter(data: ChapterCreate, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, data.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

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
    return chapter


@router.get("/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(chapter_id: str, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


@router.put("/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(chapter_id: str, data: ChapterUpdate, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

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
    return chapter


@router.put("/reorder/{project_id}", response_model=list[ChapterResponse])
async def reorder_chapters(
    project_id: str,
    data: list[ChapterReorderItem],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Chapter).where(Chapter.project_id == project_id))
    chapters = {chapter.id: chapter for chapter in result.scalars().all()}

    if len(chapters) != len(data):
        raise HTTPException(status_code=400, detail="Reorder payload does not match chapter count")

    for item in data:
        chapter = chapters.get(item.id)
        if not chapter:
            raise HTTPException(status_code=404, detail=f"Chapter not found: {item.id}")
        chapter.order_index = item.order_index

    await db.commit()

    updated = await db.execute(
        select(Chapter).where(Chapter.project_id == project_id).order_by(Chapter.order_index)
    )
    return updated.scalars().all()


@router.delete("/{chapter_id}")
async def delete_chapter(chapter_id: str, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

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
