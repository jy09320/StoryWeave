"""Character tools for the LangChain fixed tool chain."""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from app.models.project import Project

logger = logging.getLogger(__name__)


async def get_character_context(*, db: AsyncSession, project: "Project") -> dict:
    """Step 1: Read current project characters into a context dict."""
    linked = [
        {
            "name": pc.character.name,
            "alias": pc.character.alias,
            "role_label": pc.role_label,
            "summary": pc.summary or pc.character.description,
            "tags": pc.character.tags,
        }
        for pc in (project.project_characters or [])
        if pc.character
    ]

    return {
        "project_title": project.title,
        "project_description": project.description,
        "linked_characters": linked[:30],
        "linked_names": [c["name"] for c in linked],
    }


async def propose_character_patch(
    *,
    db: AsyncSession,
    project: "Project",
    owner_id: str,
    context: dict,
    source_text: str | None,
    command: str | None,
    message: str,
    guidance: str | None,
) -> tuple[list[dict], list[str]]:
    """Step 2: Call LLM and return (actions, notes)."""
    from app.services.ai_service import ai_service

    instruction = _build_instruction(context, guidance=guidance)
    input_text = _build_input(source_text=source_text, command=command, message=message)

    raw = await ai_service.generate_text(
        db,
        project_id=project.id,
        chapter_id=None,
        text=input_text,
        instruction=instruction,
        model_provider=None,
        model_id=None,
        temperature=0.3,
        max_tokens=3000,
        owner_id=owner_id,
    )

    try:
        payload = _extract_json(raw)
    except Exception as exc:
        raise ValueError(f"LLM returned non-JSON response: {exc}\n\nRaw:\n{raw[:500]}") from exc

    raw_actions = payload.get("actions", [])
    actions = [_normalize_character_action(action) for action in raw_actions if isinstance(action, dict)]
    notes = payload.get("notes", [])
    return actions, notes


def _build_instruction(context: dict, *, guidance: str | None) -> str:
    linked_names = ", ".join(context["linked_names"][:10]) if context["linked_names"] else "暂无"
    guidance_line = f"\n额外约束：{guidance}" if guidance else ""

    return (
        f"你是小说项目角色管理助手。当前项目：{context['project_title']}。\n"
        f"项目已绑定角色：{linked_names}{guidance_line}\n\n"
        "请根据用户提供的资料与指令，生成角色动作建议。\n"
        "严格输出 JSON，不要输出解释、标题或 Markdown。\n"
        'JSON 结构必须为：{"actions":[{"action":"create_and_attach|update_project_character",'
        '"name":"","alias":null,"description":null,"profile":null,"personality":null,'
        '"background":null,"relationship_notes":null,"tags":null,'
        '"role_label":null,"summary":null}],"notes":[""]}\n'
        "要求："
        "1. 优先遵循用户明确要求；"
        "2. 已在项目中的角色使用 update_project_character；"
        "3. 新角色使用 create_and_attach；"
        "4. 字段无法确定时可以设为 null；"
        "5. 但对于 create_and_attach，新建角色必须尽量补全 description、profile、personality、background 四个核心字段；"
        "6. 其中 profile 不是一句摘要，而是可直接展示在“人物档案”中的角色档案，至少要包含身份/阵营、核心动机、能力或特征、与项目主线的作用；"
        "7. 如果用户明确要求新增、补全、设计角色，即使资料不足，也要基于项目标题、简介、既有角色和世界观上下文生成合理候选，不要因为资料不足直接返回空 actions；"
        "8. notes 用于记录推断点和待确认项，明确标注哪些内容是基于上下文补全的；"
        "9. 保持与现有项目风格、命名体系、角色层级和关系网络一致；"
        "10. 必须始终输出合法 JSON。"
    )


def _build_input(*, source_text: str | None, command: str | None, message: str) -> str:
    parts = []
    if message.strip():
        parts.append(f"用户消息：{message.strip()}")
    if source_text:
        parts.append(f"资料：\n{source_text[:6000]}")
    if command:
        parts.append(f"指令：{command.strip()}")
    return "\n\n".join(parts) or "请基于当前项目上下文补充一组合理的角色建议，并生成可写入动作。"


def _normalize_character_action(action: dict) -> dict:
    normalized = dict(action)
    action_type = str(normalized.get("action") or "").strip()

    if action_type == "create_and_attach" and not _clean_text(normalized.get("profile")):
        generated_profile = _build_profile_fallback(normalized)
        if generated_profile:
            normalized["profile"] = generated_profile

    return normalized


def _build_profile_fallback(action: dict) -> str | None:
    identity_parts = [
        _clean_text(action.get("role_label")),
        _clean_text(action.get("alias")),
        _clean_text(action.get("tags")),
    ]
    identity = "，".join(part for part in identity_parts if part)

    description = _clean_text(action.get("description"))
    summary = _clean_text(action.get("summary"))
    personality = _clean_text(action.get("personality"))
    background = _clean_text(action.get("background"))

    segments: list[str] = []
    if identity:
        segments.append(f"身份定位：{identity}。")
    if summary:
        segments.append(f"角色作用：{summary}")
        if not summary.endswith(("。", "！", "？")):
            segments[-1] += "。"
    if description:
        segments.append(f"核心特征：{description}")
        if not description.endswith(("。", "！", "？")):
            segments[-1] += "。"
    if personality:
        segments.append(f"性格倾向：{personality}")
        if not personality.endswith(("。", "！", "？")):
            segments[-1] += "。"
    if background:
        segments.append(f"背景补充：{background}")
        if not background.endswith(("。", "！", "？")):
            segments[-1] += "。"

    profile = "".join(segments).strip()
    return profile or None


def _clean_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _extract_json(raw: str) -> dict:
    stripped = raw.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            stripped = "\n".join(lines[1:-1]).strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("No JSON object found")
    return json.loads(stripped[start : end + 1])
