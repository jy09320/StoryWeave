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
    """Step 2: Call LLM → return (actions, notes)."""
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

    actions = payload.get("actions", [])
    notes = payload.get("notes", [])
    return actions, notes


def _build_instruction(context: dict, *, guidance: str | None) -> str:
    linked_names = ", ".join(context["linked_names"][:10]) if context["linked_names"] else "暂无"
    guidance_line = f"\n额外约束：{guidance}" if guidance else ""

    return (
        f"你是小说项目角色管理助手。当前项目：{context['project_title']}。\n"
        f"项目已绑定角色：{linked_names}{guidance_line}\n\n"
        "请根据用户提供的资料与指令，生成角色动作建议。\n"
        "严格输出 JSON，不要输出解释或 Markdown。\n"
        'JSON 结构：{"actions":[{"action":"create_and_attach|update_project_character",'
        '"name":"","alias":null,"description":null,"profile":null,"personality":null,'
        '"background":null,"relationship_notes":null,"tags":null,'
        '"role_label":null,"summary":null}],"notes":[""]}。\n'
        "要求：1. 优先遵循用户明确要求；2. 已在项目中的角色使用 update_project_character；"
        "3. 新角色使用 create_and_attach；4. 字段无法确定时设为 null；"
        "5. 如果用户明确要求新增、补充、设计角色，即使资料不足，也要基于项目标题、简介、已有角色和世界观上下文生成候选角色建议；"
        "6. 不要因为资料不足就默认返回空数组，除非用户输入完全无法判断任务意图；"
        "7. notes 记录歧义、推断点和待确认项，明确标注哪些内容是基于上下文创作的；"
        "8. 保持与现有项目风格、命名体系、角色层级和关系网络一致；"
        "9. 必须始终输出合法 JSON，禁止输出任何非 JSON 内容。"
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
    return json.loads(stripped[start:end + 1])
