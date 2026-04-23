from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.project import Character, Project, ProjectCharacter, WorldSetting
from app.schemas.project import (
    ProjectCharacterCreate,
    ProjectCharacterResponse,
    ProjectCharacterUpdate,
    WorldSettingResponse,
    WorldSettingUpsert,
)

router = APIRouter()


@router.get("/{project_id}/characters", response_model=list[ProjectCharacterResponse])
async def list_project_characters(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(ProjectCharacter)
        .options(selectinload(ProjectCharacter.character))
        .where(ProjectCharacter.project_id == project_id)
        .order_by(ProjectCharacter.sort_order.asc(), ProjectCharacter.created_at.asc())
    )
    return result.scalars().all()


@router.post("/{project_id}/characters", response_model=ProjectCharacterResponse)
async def attach_project_character(
    project_id: str,
    data: ProjectCharacterCreate,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    character = await db.get(Character, data.character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    existing = await db.execute(
        select(ProjectCharacter).where(
            ProjectCharacter.project_id == project_id,
            ProjectCharacter.character_id == data.character_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Character already linked to project")

    payload = data.model_dump()
    if payload["sort_order"] == 0:
        order_result = await db.execute(
            select(ProjectCharacter.sort_order)
            .where(ProjectCharacter.project_id == project_id)
            .order_by(ProjectCharacter.sort_order.desc())
            .limit(1)
        )
        last_order = order_result.scalar_one_or_none()
        payload["sort_order"] = 1 if last_order is None else last_order + 1

    project_character = ProjectCharacter(project_id=project_id, **payload)
    db.add(project_character)
    await db.commit()

    result = await db.execute(
        select(ProjectCharacter)
        .options(selectinload(ProjectCharacter.character))
        .where(ProjectCharacter.id == project_character.id)
    )
    return result.scalar_one()


@router.put("/{project_id}/characters/{link_id}", response_model=ProjectCharacterResponse)
async def update_project_character(
    project_id: str,
    link_id: str,
    data: ProjectCharacterUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectCharacter)
        .options(selectinload(ProjectCharacter.character))
        .where(ProjectCharacter.id == link_id, ProjectCharacter.project_id == project_id)
    )
    project_character = result.scalar_one_or_none()
    if not project_character:
        raise HTTPException(status_code=404, detail="Project character link not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(project_character, key, value)

    await db.commit()
    await db.refresh(project_character, attribute_names=["character"])
    return project_character


@router.delete("/{project_id}/characters/{link_id}")
async def delete_project_character(project_id: str, link_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ProjectCharacter).where(ProjectCharacter.id == link_id, ProjectCharacter.project_id == project_id)
    )
    project_character = result.scalar_one_or_none()
    if not project_character:
        raise HTTPException(status_code=404, detail="Project character link not found")

    await db.delete(project_character)
    await db.commit()
    return {"detail": "Deleted"}


@router.get("/{project_id}/world-setting", response_model=WorldSettingResponse | None)
async def get_project_world_setting(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(select(WorldSetting).where(WorldSetting.project_id == project_id))
    return result.scalar_one_or_none()


@router.put("/{project_id}/world-setting", response_model=WorldSettingResponse)
async def upsert_project_world_setting(
    project_id: str,
    data: WorldSettingUpsert,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(select(WorldSetting).where(WorldSetting.project_id == project_id))
    world_setting = result.scalar_one_or_none()

    if not world_setting:
        world_setting = WorldSetting(project_id=project_id, **data.model_dump())
        db.add(world_setting)
    else:
        for key, value in data.model_dump().items():
            setattr(world_setting, key, value)

    await db.commit()
    await db.refresh(world_setting)
    return world_setting
