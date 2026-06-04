from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.project import Project, StoryEntity, StoryEvent, StoryOpenLoop, StoryRelation
from app.models.user import User
from app.schemas.project import StoryGraphResponse

router = APIRouter()


async def _require_project(project_id: str, user_id: str, db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}/story-graph", response_model=StoryGraphResponse)
async def get_story_graph(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_project(project_id, user.id, db)

    entities_result = await db.execute(
        select(StoryEntity)
        .where(StoryEntity.project_id == project_id)
        .order_by(StoryEntity.mention_count.desc())
    )
    entities = entities_result.scalars().all()

    events_result = await db.execute(
        select(StoryEvent)
        .where(StoryEvent.project_id == project_id)
        .order_by(StoryEvent.chapter_order)
    )
    events = events_result.scalars().all()

    relations_result = await db.execute(
        select(StoryRelation)
        .where(StoryRelation.project_id == project_id)
        .order_by(StoryRelation.chapter_order)
    )
    relations = relations_result.scalars().all()

    loops_result = await db.execute(
        select(StoryOpenLoop)
        .where(StoryOpenLoop.project_id == project_id)
        .order_by(StoryOpenLoop.mention_count.desc())
    )
    open_loops = loops_result.scalars().all()

    return StoryGraphResponse(
        entities=entities,
        events=events,
        relations=relations,
        open_loops=open_loops,
    )
