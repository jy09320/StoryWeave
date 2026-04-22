from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.database import Base, engine
from app.models.project import Project, Chapter, ChapterVersion


async def init_db(async_engine: AsyncEngine | None = None) -> None:
    target_engine = async_engine or engine

    async with target_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
