"""World setting tools for the LangChain fixed tool chain."""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from app.models.project import Project

logger = logging.getLogger(__name__)


async def get_world_setting_context(*, db: AsyncSession, project: "Project") -> dict:
    """Step 1: Read current world setting and project characters into a context dict."""
    ws = project.world_setting
    characters = [
        {
            "name": pc.character.name,
            "role_label": pc.role_label,
            "summary": pc.summary or pc.character.description,
        }
        for pc in (project.project_characters or [])
        if pc.character
    ]

    return {
        "project_title": project.title,
        "project_description": project.description,
        "world_setting": {
            "title": ws.title if ws else None,
            "overview": ws.overview if ws else None,
            "rules": ws.rules if ws else None,
            "factions": ws.factions if ws else None,
            "locations": ws.locations if ws else None,
            "timeline": ws.timeline if ws else None,
            "extra_notes": ws.extra_notes if ws else None,
        } if ws else None,
        "characters": characters[:20],  # cap to avoid oversized prompts
    }


async def propose_world_setting_patch(
    *,
    db: AsyncSession,
    project: "Project",
    context: dict,
    source_text: str | None,
    command: str | None,
    message: str,
    guidance: str | None,
) -> tuple[dict, list[str], list[str]]:
    """Step 2: Call LLM with context + inputs → return (patch_dict, notes, applied_sources)."""
    from app.services.ai_service import ai_service

    instruction = _build_instruction(context, source_text=source_text, command=command, guidance=guidance)
    input_text = _build_input(source_text=source_text, command=command, message=message)

    raw = await ai_service.generate_text(
        db,
        project_id=project.id,
        chapter_id=None,
        text=input_text,
        instruction=instruction,
        model_provider=None,
        model_id=None,
        temperature=0.4,
        max_tokens=4000,
    )

    try:
        payload = _extract_json(raw)
    except Exception as exc:
        raise ValueError(f"LLM returned non-JSON response: {exc}\n\nRaw:\n{raw[:500]}") from exc

    ws_patch = payload.get("world_setting", {})
    notes = payload.get("notes", [])
    applied_sources = payload.get("applied_sources", [])

    return ws_patch, notes, applied_sources


def _build_instruction(context: dict, *, source_text: str | None, command: str | None, guidance: str | None) -> str:
    ws_summary = ""
    if context.get("world_setting"):
        ws = context["world_setting"]
        fields = [(k, v) for k, v in ws.items() if v]
        if fields:
            ws_summary = "现有世界观：\n" + "\n".join(f"  {k}: {str(v)[:200]}" for k, v in fields[:4])

    char_summary = ""
    if context.get("characters"):
        names = [c["name"] for c in context["characters"][:8]]
        char_summary = f"已绑定角色：{', '.join(names)}"

    guidance_line = f"\n额外约束：{guidance}" if guidance else ""

    return (
        f"你是小说项目世界观设定架构师。当前项目：{context['project_title']}。\n"
        f"{ws_summary}\n{char_summary}{guidance_line}\n\n"
        "请根据用户提供的资料与指令，生成结构化世界观字段建议。\n"
        "严格输出 JSON，不要输出解释或 Markdown。\n"
        'JSON 结构：{"world_setting":{"title":"","overview":"","rules":"","factions":"","locations":"","timeline":"","extra_notes":""},'
        '"notes":[""],"applied_sources":[""]}。\n'
        "要求：1. 尽量补全所有字段；2. 不要改写现有核心事实；"
        "3. notes 记录不确定点和推断；4. applied_sources 列出本次参考的信息来源；"
        "5. 无论是否有资料，必须始终输出合法 JSON，资料不足时 world_setting 各字段保持空字符串，在 notes 中说明原因，禁止输出任何非 JSON 内容。"
    )


def _build_input(*, source_text: str | None, command: str | None, message: str) -> str:
    parts = []
    if message.strip():
        parts.append(f"用户消息：{message.strip()}")
    if source_text:
        parts.append(f"资料：\n{source_text[:6000]}")
    if command:
        parts.append(f"指令：{command.strip()}")
    return "\n\n".join(parts) or "请基于当前项目信息补全世界观。"


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
