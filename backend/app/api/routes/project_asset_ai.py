"""Project asset AI routes: file upload, world-setting analyze/apply, character analyze/apply."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.project import Character, Project, ProjectCharacter, WorldSetting
from app.schemas.project_asset_ai import (
    ProjectAssetFileUploadResponse,
    WorldSettingAnalyzeRequest,
    WorldSettingAnalyzeResponse,
    WorldSettingApplyRequest,
    CharacterAnalyzeRequest,
    CharacterAnalyzeResponse,
    CharacterApplyRequest,
    CharacterApplyResponse,
)
from app.services.langchain_agent.orchestrator import agent_orchestrator

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory file store (session-scoped, no persistence needed for phase 1)
# ---------------------------------------------------------------------------
_file_store: dict[str, str] = {}  # file_id -> extracted_text

_ALLOWED_MIME = {"text/plain", "text/markdown", "text/x-markdown"}
_ALLOWED_EXT = {".txt", ".md"}
_MAX_BYTES = 500_000  # 500 KB


@router.post("/{project_id}/ai-assets/files", response_model=ProjectAssetFileUploadResponse)
async def upload_project_asset_file(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    filename = file.filename or ""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=415, detail="Only .txt and .md files are supported in this version")

    content = await file.read()
    if len(content) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 500 KB)")

    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = content.decode("gbk")
        except UnicodeDecodeError:
            raise HTTPException(status_code=422, detail="Cannot decode file — please use UTF-8 or GBK encoding")

    text = text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="File is empty")

    import tiktoken
    try:
        enc = tiktoken.get_encoding("cl100k_base")
        token_estimate = len(enc.encode(text))
    except Exception:
        token_estimate = len(text) // 4

    file_id = str(uuid.uuid4())
    _file_store[file_id] = text

    return ProjectAssetFileUploadResponse(
        file_id=file_id,
        filename=filename,
        extracted_text=text,
        preview=text[:500],
        token_estimate=token_estimate,
    )


# ---------------------------------------------------------------------------
# World setting analyze (LangChain fixed chain → streaming via SSE)
# ---------------------------------------------------------------------------

@router.post("/{project_id}/ai-assets/world-setting/analyze", response_model=WorldSettingAnalyzeResponse)
async def analyze_world_setting(
    project_id: str,
    data: WorldSettingAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.project_characters).selectinload(ProjectCharacter.character),
            selectinload(Project.world_setting),
        )
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    source_parts: list[str] = []
    if data.source_text:
        source_parts.append(data.source_text.strip())
    for fid in (data.file_ids or []):
        stored = _file_store.get(fid)
        if stored:
            source_parts.append(stored)
    combined_source = "\n\n".join(source_parts) if source_parts else None

    try:
        response = await agent_orchestrator.analyze_world_setting(
            db=db,
            project=project,
            message=data.message,
            source_text=combined_source,
            command=data.command,
            guidance=data.guidance,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {exc}") from exc

    return response


# ---------------------------------------------------------------------------
# World setting apply (confirm-write)
# ---------------------------------------------------------------------------

@router.post("/{project_id}/ai-assets/world-setting/apply")
async def apply_world_setting_patch(
    project_id: str,
    data: WorldSettingApplyRequest,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(select(WorldSetting).where(WorldSetting.project_id == project_id))
    world_setting = result.scalar_one_or_none()

    patch = data.patch
    world_setting_updated = False

    if not world_setting:
        world_setting = WorldSetting(project_id=project_id, **patch.model_dump())
        db.add(world_setting)
        world_setting_updated = True
    else:
        for field, value in patch.model_dump().items():
            if value is not None and getattr(world_setting, field) != value:
                setattr(world_setting, field, value)
                world_setting_updated = True

    await db.commit()
    await db.refresh(world_setting)

    return {"world_setting_updated": world_setting_updated, "world_setting": world_setting}


# ---------------------------------------------------------------------------
# Character analyze
# ---------------------------------------------------------------------------

@router.post("/{project_id}/ai-assets/characters/analyze", response_model=CharacterAnalyzeResponse)
async def analyze_characters(
    project_id: str,
    data: CharacterAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.project_characters).selectinload(ProjectCharacter.character),
            selectinload(Project.world_setting),
        )
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    source_parts: list[str] = []
    if data.source_text:
        source_parts.append(data.source_text.strip())
    for fid in (data.file_ids or []):
        stored = _file_store.get(fid)
        if stored:
            source_parts.append(stored)
    combined_source = "\n\n".join(source_parts) if source_parts else None

    try:
        response = await agent_orchestrator.analyze_characters(
            db=db,
            project=project,
            message=data.message,
            source_text=combined_source,
            command=data.command,
            guidance=data.guidance,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {exc}") from exc

    return response


# ---------------------------------------------------------------------------
# Character apply (confirm-write)
# ---------------------------------------------------------------------------

@router.post("/{project_id}/ai-assets/characters/apply", response_model=CharacterApplyResponse)
async def apply_character_patch(
    project_id: str,
    data: CharacterApplyRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.project_characters).selectinload(ProjectCharacter.character),
        )
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    linked_by_name = {
        item.character.name.strip().lower(): item
        for item in project.project_characters
        if item.character and item.character.name.strip()
    }

    max_sort = max((item.sort_order for item in project.project_characters), default=0)
    applied: list[str] = []
    errors: list[str] = []

    for action in data.actions:
        name = action.name.strip()
        normalized = name.lower()
        try:
            if action.action == "create_and_attach":
                char = Character(
                    name=name,
                    alias=action.alias,
                    description=action.description,
                    profile=action.profile,
                    personality=action.personality,
                    background=action.background,
                    relationship_notes=action.relationship_notes,
                    tags=action.tags,
                )
                db.add(char)
                await db.flush()
                max_sort += 1
                link = ProjectCharacter(
                    project_id=project_id,
                    character_id=char.id,
                    role_label=action.role_label,
                    summary=action.summary,
                    sort_order=max_sort,
                )
                db.add(link)
                await db.flush()
                applied.append(f"已创建并绑定角色：{name}")

            elif action.action == "update_project_character":
                existing_link = linked_by_name.get(normalized)
                if not existing_link:
                    errors.append(f"角色未找到：{name}")
                    continue
                if action.role_label is not None:
                    existing_link.role_label = action.role_label
                if action.summary is not None:
                    existing_link.summary = action.summary
                char = existing_link.character
                for field in ("alias", "description", "profile", "personality", "background", "relationship_notes", "tags"):
                    val = getattr(action, field, None)
                    if val is not None:
                        setattr(char, field, val)
                applied.append(f"已更新角色：{name}")

            else:
                errors.append(f"未知动作类型：{action.action}（角色：{name}）")

        except Exception as exc:
            errors.append(f"处理 {name} 时出错：{exc}")

    await db.commit()

    return CharacterApplyResponse(applied=applied, errors=errors)
