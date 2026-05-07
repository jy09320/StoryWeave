import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.project import Chapter, Project, ProjectCharacter, WorldSetting
from app.models.user import User
from app.schemas.project import (
    ProjectCreate,
    ProjectDetailResponse,
    ProjectDraftRequest,
    ProjectDraftResponse,
    ProjectResponse,
    ProjectUpdate,
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


def _pick_primary_genre(genres: list[str]) -> str:
    return genres[0] if genres else "原创"


def _build_world_setting_payload(data: ProjectCreate) -> dict[str, str | None]:
    if data.ai_draft:
        notes = data.ai_draft.notes[:4]
        return {
            "title": data.ai_draft.world_setting_title,
            "overview": data.ai_draft.world_setting_overview,
            "rules": data.ai_draft.world_setting_rules,
            "factions": data.ai_draft.world_setting_factions,
            "locations": data.ai_draft.world_setting_locations,
            "timeline": data.ai_draft.world_setting_timeline,
            "extra_notes": "\n".join(notes) if notes else "这是基于 AI 项目草案生成的初始设定，可继续细化。",
        }

    primary_genre = _pick_primary_genre(data.genres)
    trope_text = "、".join(data.tropes[:4]) if data.tropes else "待补充"
    genre_text = "、".join(data.genres[:3]) if data.genres else "待补充"
    channel_text = {"male": "男频", "female": "女频", "general": "通用"}.get(data.channel or "", "未限定")
    premise = data.premise or "待补充故事核心设定"

    if primary_genre in {"仙侠", "玄幻"}:
        rules = "补充修炼体系、境界划分、资源获取方式，以及主角成长的限制条件。"
        factions = "补充宗门、世家、王朝或异族势力，并明确各方利益冲突。"
        locations = "补充主城、宗门驻地、秘境禁地和关键试炼场景。"
    elif primary_genre in {"科幻", "游戏", "无限流"}:
        rules = "补充系统规则、科技层级、任务机制或副本约束。"
        factions = "补充组织、公司、阵营、玩家势力及其对抗关系。"
        locations = "补充主城、站点、舰船、副本或关键作战区域。"
    elif primary_genre in {"历史", "言情"}:
        rules = "补充礼法秩序、家族规则、权力结构以及社会约束。"
        factions = "补充家族、朝堂、门阀、商会或宫廷势力。"
        locations = "补充府邸、都城、边地、闺阁或关键社交场景。"
    else:
        rules = "补充世界运行规则、关键资源、主要冲突来源和创作边界。"
        factions = "补充主要势力、合作关系与竞争关系。"
        locations = "补充故事高频发生地点与阶段性地图。"

    return {
        "title": f"{data.title}世界观设定",
        "overview": (
            f"频道：{channel_text}\n"
            f"题材：{genre_text}\n"
            f"风格/套路：{trope_text}\n"
            f"故事核心：{premise}\n\n"
            "建议继续细化时代背景、主角处境、关键冲突和长期目标。"
        ),
        "rules": rules,
        "factions": factions,
        "locations": locations,
        "timeline": "建议按开篇建立处境、前中期冲突升级、阶段性高潮与阶段目标达成来规划时间线。",
        "extra_notes": "这是根据创建时标签生成的初始骨架，可在项目设定页继续补充。",
    }


def _build_starter_chapters(data: ProjectCreate) -> list[dict[str, str | int | None]]:
    if data.ai_draft and data.ai_draft.opening_chapters:
        chapters: list[dict[str, str | int | None]] = []
        for index, title in enumerate(data.ai_draft.opening_chapters[:3], start=1):
            chapters.append(
                {
                    "title": title,
                    "order_index": index,
                    "notes": f"来自 AI 项目草案的开篇建议，第 {index} 章。",
                }
            )
        return chapters

    primary_genre = _pick_primary_genre(data.genres)
    premise = data.premise or "待补充故事核心设定"
    trope_text = "、".join(data.tropes[:4]) if data.tropes else "待补充"

    chapter_one_notes = (
        f"开篇目标：用一章建立主角当前处境、核心欲望和第一个冲突。\n"
        f"题材提示：{primary_genre}\n"
        f"套路提示：{trope_text}\n"
        f"故事核心：{premise}"
    )
    chapter_two_notes = "推进方向：让主角第一次主动应对冲突，明确阶段目标，并抛出下一轮更大的压力。"
    chapter_three_notes = "阶段节点：安排一次阶段性成果或反转，明确继续写下去的主线钩子。"

    return [
        {
            "title": "第1章 开篇引子",
            "order_index": 1,
            "notes": chapter_one_notes,
        },
        {
            "title": "第2章 冲突升级",
            "order_index": 2,
            "notes": chapter_two_notes,
        },
        {
            "title": "第3章 阶段目标",
            "order_index": 3,
            "notes": chapter_three_notes,
        },
    ]


def _build_project_draft_instruction(data: ProjectDraftRequest) -> str:
    genre_text = "、".join(data.genres[:3]) if data.genres else "未限定"
    trope_text = "、".join(data.tropes[:4]) if data.tropes else "未限定"
    channel_text = {"male": "男频", "female": "女频", "general": "通用"}.get(data.channel or "", "未限定")
    source_text = data.source_work or "原创"
    premise = data.premise or "未提供一句话故事，请基于标签生成一个可执行的创作方向。"

    return (
        "你是网文项目创建助手。请根据用户提供的项目标题、频道、题材、套路和一句话故事，"
        "生成一版适合直接进入创作的项目草案。"
        "你必须只输出 JSON，不要输出解释、标题或 Markdown。\n"
        'JSON 结构必须为：{"summary":"","world_setting_title":"","world_setting_overview":"","world_setting_rules":"","world_setting_factions":"","world_setting_locations":"","world_setting_timeline":"","opening_chapters":["","",""],"notes":[""]}\n'
        "要求：\n"
        "1. summary 用 80-140 字概括项目方向、卖点和主线冲突；\n"
        "2. world_setting_title 要像真实设定页标题；\n"
        "3. world_setting_overview 用 120-220 字输出开局可用的世界观/故事背景；\n"
        "4. world_setting_rules / factions / locations / timeline 分别输出 40-120 字，尽量结构化、可直接落库；\n"
        "5. opening_chapters 固定输出 3 条，每条是一个起始章节标题，适合直接建章；\n"
        "6. notes 输出 2-4 条创建建议，聚焦还需要补哪些设定；\n"
        "7. 内容要与用户标签一致，不要泛泛而谈。\n\n"
        f"项目标题：{data.title}\n"
        f"项目类型：{data.type}\n"
        f"来源作品：{source_text}\n"
        f"频道：{channel_text}\n"
        f"题材：{genre_text}\n"
        f"风格/套路：{trope_text}\n"
        f"一句话故事：{premise}\n"
        f"项目简介：{data.description or '无'}"
    )


@router.post("/draft", response_model=ProjectDraftResponse)
async def generate_project_draft(
    data: ProjectDraftRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai_raw = await ai_service.generate_plain_text(
        db,
        text=data.premise or data.title,
        instruction=_build_project_draft_instruction(data),
        model_provider=data.model_provider,
        model_id=data.model_id,
        temperature=0.6,
        max_tokens=1800,
        owner_id=current_user.id,
    )

    try:
        payload = _extract_json_object(ai_raw)
        payload["opening_chapters"] = [item.strip() for item in payload.get("opening_chapters", []) if isinstance(item, str) and item.strip()]
        payload["notes"] = [item.strip() for item in payload.get("notes", []) if isinstance(item, str) and item.strip()]
        return ProjectDraftResponse.model_validate(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI project draft parsing failed: {exc}") from exc


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Project).where(Project.owner_id == current_user.id).order_by(Project.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=ProjectResponse)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project_payload = data.model_dump(exclude={"ai_draft"})
    if data.ai_draft and not project_payload.get("description"):
        project_payload["description"] = data.ai_draft.summary

    project = Project(**project_payload, owner_id=current_user.id)
    db.add(project)
    await db.flush()

    world_setting = WorldSetting(project_id=project.id, **_build_world_setting_payload(data))
    db.add(world_setting)

    for chapter_payload in _build_starter_chapters(data):
        db.add(Chapter(project_id=project.id, **chapter_payload))

    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.chapters),
            selectinload(Project.project_characters).selectinload(ProjectCharacter.character),
            selectinload(Project.world_setting),
        )
        .where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await db.commit()
    return {"detail": "Deleted"}
