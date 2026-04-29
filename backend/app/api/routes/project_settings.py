import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.project import Character, Project, ProjectCharacter, WorldSetting
from app.schemas.project import (
    ProjectImportAnalysisResult,
    ProjectImportRequest,
    ProjectImportResponse,
    ProjectWorldAutoCompleteRequest,
    ProjectWorldAutoCompleteResponse,
    ProjectCharacterCreate,
    ProjectCharacterResponse,
    ProjectCharacterUpdate,
    WorldSettingResponse,
    WorldSettingUpsert,
)
from app.services.ai_service import ai_service

router = APIRouter()


def _extract_json_object(raw_text: str) -> dict:
    stripped = raw_text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            stripped = "\n".join(lines[1:-1]).strip()

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start < 0 or end < 0 or end < start:
        raise ValueError("AI response does not contain a valid JSON object")

    return json.loads(stripped[start : end + 1])


def _apply_character_details(character: Character, payload: dict[str, str | None]) -> bool:
    changed = False
    for key, value in payload.items():
        if value is None:
            continue
        if getattr(character, key) != value:
            setattr(character, key, value)
            changed = True
    return changed


def _apply_project_link_details(link: ProjectCharacter, *, role_label: str | None, summary: str | None) -> bool:
    changed = False
    if role_label is not None and link.role_label != role_label:
        link.role_label = role_label
        changed = True
    if summary is not None and link.summary != summary:
        link.summary = summary
        changed = True
    return changed


def _build_world_autocomplete_instruction(project: Project, data: ProjectWorldAutoCompleteRequest) -> str:
    world_title = project.world_setting.title if project.world_setting else f"{project.title}世界观设定"
    mode_guidance = {
        "import": "基于用户导入的资料补全世界观，优先提炼可直接落库的设定。",
        "command": "基于用户的明确指令补全世界观，可以在不违背现有设定的前提下进行合理创造。",
        "hybrid": "综合用户导入资料与补充指令补全世界观，优先保证资料事实，其次进行合理扩写。",
    }
    completion_requirement = (
        "请严格输出 JSON 对象，不要输出解释、标题或 Markdown。"
        'JSON 结构必须为：{"world_setting":{"title":"","overview":"","rules":"","factions":"","locations":"","timeline":"","extra_notes":""},'
        '"notes":[""],"applied_sources":[""]}。'
        "要求：1. world_setting 中所有字段都应尽量补全；"
        "2. 若某字段无法从资料直接得出，可依据现有项目设定与用户指令做低冲突、可自洽的合理补全；"
        "3. 不要改写已明确给出的核心事实；"
        "4. notes 记录不确定点、推断点与建议人工确认项；"
        "5. applied_sources 仅枚举本次使用的信息来源，例如：导入资料、用户指令、现有项目设定。"
    )

    input_sections: list[str] = []
    if data.source_text:
        input_sections.append(f"导入资料：\n{data.source_text}")
    if data.command:
        input_sections.append(f"用户补全指令：\n{data.command}")
    if data.guidance:
        input_sections.append(f"额外要求：\n{data.guidance}")

    return (
        f"你是小说项目的世界观设定架构师。当前项目标题：{project.title}。\n"
        f"目标世界观标题：{world_title}。\n"
        f"任务模式：{mode_guidance[data.mode]}\n"
        f"{completion_requirement}\n\n"
        "请优先参考项目已有角色、现有世界观、项目简介与来源作品，补全结果要适合直接写入数据库。\n\n"
        + "\n\n".join(input_sections)
    )


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


@router.post("/{project_id}/import", response_model=ProjectImportResponse)
async def import_project_knowledge(
    project_id: str,
    data: ProjectImportRequest,
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

    instruction = (
        "你是小说项目资料整理助手。请从用户提供的资料中抽取当前项目可直接落库的角色与世界观信息，"
        "并严格输出 JSON 对象，不要输出解释、标题或 Markdown。"
        'JSON 结构必须为：{"characters":[{"name":"","alias":"","description":"","profile":"","personality":"",'
        '"background":"","relationship_notes":"","tags":"","role_label":"","project_summary":""}],'
        '"world_setting":{"title":"","overview":"","rules":"","factions":"","locations":"","timeline":"","extra_notes":""},'
        '"notes":[""]}。'
        "要求：1. 只保留能从资料中明确推断的信息；2. 角色名必须具体；3. tags 使用中文逗号分隔；"
        "4. project_summary 写该角色在本项目中的定位、冲突或作用；5. 若某字段无法确定则返回 null；"
        "6. 若资料不足以形成世界观，可让 world_setting 为 null；7. notes 用于记录歧义、缺失和待确认点。"
    )
    if data.guidance:
        instruction = f"{instruction}\n补充要求：{data.guidance}"

    ai_raw = await ai_service.generate_text(
        db,
        project_id=project_id,
        chapter_id=None,
        text=data.source_text,
        instruction=instruction,
        model_provider=data.model_provider,
        model_id=data.model_id,
        temperature=0.2,
        max_tokens=4000,
    )

    try:
        analysis_payload = _extract_json_object(ai_raw)
        analysis = ProjectImportAnalysisResult.model_validate(analysis_payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI import parsing failed: {exc}") from exc

    linked_by_name = {
        item.character.name.strip().lower(): item
        for item in project.project_characters
        if item.character and item.character.name.strip()
    }

    imported_names = [item.name.strip().lower() for item in analysis.characters if item.name.strip()]
    existing_global_by_name: dict[str, Character] = {}
    if imported_names:
        global_matches = await db.execute(select(Character).where(func.lower(Character.name).in_(imported_names)))
        existing_global_by_name = {
            character.name.strip().lower(): character
            for character in global_matches.scalars().all()
            if character.name.strip()
        }

    max_sort_order = max((item.sort_order for item in project.project_characters), default=0)
    imported_links: list[ProjectCharacter] = []
    created_character_count = 0
    updated_character_count = 0
    linked_character_count = 0

    for item in analysis.characters:
        normalized_name = item.name.strip().lower()
        if not normalized_name:
            continue

        character_payload = {
            "name": item.name,
            "alias": item.alias,
            "description": item.description,
            "profile": item.profile,
            "personality": item.personality,
            "background": item.background,
            "relationship_notes": item.relationship_notes,
            "tags": item.tags,
        }

        existing_link = linked_by_name.get(normalized_name)
        if existing_link:
            character_changed = _apply_character_details(existing_link.character, character_payload)
            link_changed = _apply_project_link_details(
                existing_link,
                role_label=item.role_label,
                summary=item.project_summary,
            )
            if character_changed or link_changed:
                updated_character_count += 1
            imported_links.append(existing_link)
            continue

        global_character = existing_global_by_name.get(normalized_name)
        if global_character:
            character_changed = _apply_character_details(global_character, character_payload)
            if character_changed:
                updated_character_count += 1

            max_sort_order += 1
            link = ProjectCharacter(
                project_id=project_id,
                character_id=global_character.id,
                role_label=item.role_label,
                summary=item.project_summary,
                sort_order=max_sort_order,
            )
            db.add(link)
            await db.flush()
            link.character = global_character
            imported_links.append(link)
            linked_character_count += 1
            linked_by_name[normalized_name] = link
            continue

        new_character = Character(**character_payload)
        db.add(new_character)
        await db.flush()

        max_sort_order += 1
        link = ProjectCharacter(
            project_id=project_id,
            character_id=new_character.id,
            role_label=item.role_label,
            summary=item.project_summary,
            sort_order=max_sort_order,
        )
        db.add(link)
        await db.flush()
        link.character = new_character

        created_character_count += 1
        linked_character_count += 1
        imported_links.append(link)
        linked_by_name[normalized_name] = link

    world_setting_updated = False
    world_setting = project.world_setting
    if analysis.world_setting:
        world_payload = analysis.world_setting.model_dump()
        if any(value is not None for value in world_payload.values()):
            title = world_payload["title"] or (world_setting.title if world_setting else f"{project.title}世界观设定")
            if not world_setting:
                world_setting = WorldSetting(
                    project_id=project_id,
                    title=title,
                    overview=world_payload["overview"],
                    rules=world_payload["rules"],
                    factions=world_payload["factions"],
                    locations=world_payload["locations"],
                    timeline=world_payload["timeline"],
                    extra_notes=world_payload["extra_notes"],
                )
                db.add(world_setting)
                world_setting_updated = True
            else:
                if world_setting.title != title:
                    world_setting.title = title
                    world_setting_updated = True
                for field in ("overview", "rules", "factions", "locations", "timeline", "extra_notes"):
                    value = world_payload[field]
                    if value is not None and getattr(world_setting, field) != value:
                        setattr(world_setting, field, value)
                        world_setting_updated = True

    await db.commit()

    imported_link_ids = [item.id for item in imported_links]
    refreshed_links: list[ProjectCharacter] = []
    if imported_link_ids:
        refreshed_result = await db.execute(
            select(ProjectCharacter)
            .options(selectinload(ProjectCharacter.character))
            .where(ProjectCharacter.id.in_(imported_link_ids))
            .order_by(ProjectCharacter.sort_order.asc(), ProjectCharacter.created_at.asc())
        )
        refreshed_links = refreshed_result.scalars().all()

    if world_setting:
        await db.refresh(world_setting)

    return ProjectImportResponse(
        created_character_count=created_character_count,
        updated_character_count=updated_character_count,
        linked_character_count=linked_character_count,
        imported_character_count=len(refreshed_links),
        world_setting_updated=world_setting_updated,
        notes=analysis.notes,
        characters=refreshed_links,
        world_setting=world_setting,
    )


@router.post("/{project_id}/world-setting/autocomplete", response_model=ProjectWorldAutoCompleteResponse)
async def autocomplete_project_world_setting(
    project_id: str,
    data: ProjectWorldAutoCompleteRequest,
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

    instruction = _build_world_autocomplete_instruction(project, data)
    source_chunks = [chunk for chunk in [data.source_text, data.command] if chunk and chunk.strip()]
    ai_input = "\n\n".join(source_chunks) or project.title

    ai_raw = await ai_service.generate_text(
        db,
        project_id=project_id,
        chapter_id=None,
        text=ai_input,
        instruction=instruction,
        model_provider=data.model_provider,
        model_id=data.model_id,
        temperature=0.4,
        max_tokens=4000,
    )

    try:
        analysis_payload = _extract_json_object(ai_raw)
        analysis = ProjectWorldAutoCompleteResponse.model_validate(analysis_payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI world-setting parsing failed: {exc}") from exc

    world_payload = analysis.world_setting.model_dump()
    title = world_payload["title"] or (project.world_setting.title if project.world_setting else f"{project.title}世界观设定")

    world_setting = project.world_setting
    world_setting_updated = False
    if not world_setting:
        world_setting = WorldSetting(
            project_id=project_id,
            title=title,
            overview=world_payload["overview"],
            rules=world_payload["rules"],
            factions=world_payload["factions"],
            locations=world_payload["locations"],
            timeline=world_payload["timeline"],
            extra_notes=world_payload["extra_notes"],
        )
        db.add(world_setting)
        world_setting_updated = True
    else:
        if world_setting.title != title:
            world_setting.title = title
            world_setting_updated = True
        for field in ("overview", "rules", "factions", "locations", "timeline", "extra_notes"):
            value = world_payload[field]
            if value is not None and getattr(world_setting, field) != value:
                setattr(world_setting, field, value)
                world_setting_updated = True

    await db.commit()
    await db.refresh(world_setting)

    return ProjectWorldAutoCompleteResponse(
        world_setting=world_setting,
        notes=analysis.notes,
        applied_sources=analysis.applied_sources,
        world_setting_updated=world_setting_updated,
    )
