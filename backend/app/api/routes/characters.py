from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.project import Character
from app.models.user import User
from app.schemas.project import CharacterCreate, CharacterResponse, CharacterUpdate
from app.services.portrait_service import portrait_service
from app.services.runtime_ai_config import runtime_ai_config_service

router = APIRouter()


class PortraitRequest(BaseModel):
    model_id: str | None = None


@router.get("/", response_model=list[CharacterResponse])
async def list_characters(
    keyword: str | None = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Character)
        .where(Character.owner_id == current_user.id)
        .order_by(Character.updated_at.desc(), Character.created_at.desc())
    )

    if keyword:
        search = f"%{keyword.strip()}%"
        if search != "%%":
            stmt = stmt.where(
                or_(
                    Character.name.ilike(search),
                    Character.alias.ilike(search),
                    Character.tags.ilike(search),
                )
            )

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=CharacterResponse)
async def create_character(
    data: CharacterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    character = Character(**data.model_dump(), owner_id=current_user.id)
    db.add(character)
    await db.commit()
    await db.refresh(character)
    return character


@router.get("/portrait-models")
async def list_portrait_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return available image model IDs from the user's runtime config."""
    config = await runtime_ai_config_service.get_effective_config(db, current_user.id)
    api_key = config.get("api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="请先在设置中心配置 API Key。")

    base_url = config.get("base_url")
    models = await portrait_service.get_available_models(api_key=api_key, base_url=base_url)
    return {"models": models}


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    return character


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: str,
    data: CharacterUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(character, key, value)

    await db.commit()
    await db.refresh(character)
    return character


@router.post("/{character_id}/enhance-description")
async def enhance_description(
    character_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """用 AI 增强角色外貌描述（用于非原创项目）。"""
    from app.services.description_enhancement_service import description_enhancement_service

    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # 查询角色关联的项目
    from app.models.project import Project, ProjectCharacter
    project_result = await db.execute(
        select(Project)
        .join(ProjectCharacter, ProjectCharacter.project_id == Project.id)
        .where(ProjectCharacter.character_id == character_id)
        .limit(1)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=400, detail="角色未关联到任何项目")

    if project.type == "original":
        raise HTTPException(status_code=400, detail="原创项目无需增强外貌描述")

    if not project.source_work:
        raise HTTPException(status_code=400, detail="请先在项目设置中填写原作名称")

    try:
        enhanced_description = await description_enhancement_service.enhance(
            character_name=character.name,
            current_description=character.description,
            source_work=project.source_work,
            project_type=project.type,
            db=db,
            owner_id=current_user.id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "enhanced_description": enhanced_description,
        "source_work": project.source_work,
        "character_name": character.name,
    }


@router.post("/{character_id}/portrait", response_model=CharacterResponse)
async def generate_portrait(
    character_id: str,
    body: PortraitRequest = PortraitRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # Look up the project this character belongs to (for source_work info)
    from app.models.project import Project, ProjectCharacter
    project_result = await db.execute(
        select(Project)
        .join(ProjectCharacter, ProjectCharacter.project_id == Project.id)
        .where(ProjectCharacter.character_id == character_id)
        .limit(1)
    )
    project = project_result.scalar_one_or_none()
    source_work = project.source_work if project and project.type != "original" else None

    # Get API key from runtime config
    config = await runtime_ai_config_service.get_effective_config(db, current_user.id)
    api_key = config.get("api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="请先在设置中心配置 API Key 后再生成形象。")

    base_url = config.get("base_url")

    try:
        portrait_url = await portrait_service.generate(
            character_id=character.id,
            character_name=character.name,
            character_description=character.description,
            character_personality=character.personality,
            character_profile=character.profile,
            source_work=source_work,
            api_key=api_key,
            base_url=base_url,
            model_id=body.model_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"形象生成失败：{e}")

    character.portrait_url = portrait_url
    await db.commit()
    await db.refresh(character)
    return character


@router.delete("/{character_id}")
async def delete_character(
    character_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    await db.delete(character)
    await db.commit()
    return {"detail": "Deleted"}
