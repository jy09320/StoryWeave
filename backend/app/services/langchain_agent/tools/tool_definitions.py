"""LangChain tool definitions for the conversational asset agent.

Tools are created via a factory so that db and project can be injected
as closures without polluting the tool signatures (LLM only sees the
documented parameters).
"""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from langchain_core.tools import tool

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.models.project import Project

logger = logging.getLogger(__name__)


def make_asset_tools(*, db: "AsyncSession", project: "Project") -> list[Any]:
    """Return the four asset tools with db/project captured in closures."""
    owner_id = getattr(project, "owner_id", None)

    @tool
    async def query_world_setting() -> str:
        """查询当前项目的世界观设定信息。当需要了解项目现有世界观内容时调用此工具。"""
        from app.services.langchain_agent.tools.world_setting_tools import get_world_setting_context
        ctx = await get_world_setting_context(db=db, project=project)
        return json.dumps(ctx, ensure_ascii=False)

    @tool
    async def query_characters() -> str:
        """查询当前项目已绑定的角色列表。当需要了解项目现有角色信息时调用此工具。"""
        from app.services.langchain_agent.tools.character_tools import get_character_context
        ctx = await get_character_context(db=db, project=project)
        return json.dumps(ctx, ensure_ascii=False)

    @tool
    async def draft_world_setting_update(message: str, command: str = "", guidance: str = "") -> str:
        """根据用户的描述或资料，生成世界观设定的修改建议（draft）。
        返回的是建议内容，不会直接写入数据库，需要用户确认后才会生效。
        当用户提供了世界观相关资料、明确要求更新世界观设定，或对话中需要生成具体世界观建议时调用此工具。

        Args:
            message: 用户的主要描述或请求内容
            command: 具体指令，例如"补全规则"、"完善势力"（可为空）
            guidance: 额外约束，例如"保持奇幻风格"（可为空）
        """
        from app.services.langchain_agent.tools.world_setting_tools import (
            get_world_setting_context,
            propose_world_setting_patch,
        )
        context = await get_world_setting_context(db=db, project=project)
        patch_raw, notes, applied_sources = await propose_world_setting_patch(
            db=db,
            project=project,
            owner_id=owner_id or "",
            context=context,
            source_text=None,
            command=command or None,
            message=message,
            guidance=guidance or None,
        )
        result = {
            "patch": patch_raw,
            "notes": notes,
            "applied_sources": applied_sources,
        }
        return json.dumps(result, ensure_ascii=False)

    @tool
    async def draft_character_actions(message: str, command: str = "", guidance: str = "") -> str:
        """根据用户的描述或资料，生成角色创建/更新的建议动作列表（draft）。
        返回的是建议内容，不会直接写入数据库，需要用户确认后才会生效。
        当用户提供了角色相关资料、明确要求创建或更新角色，或对话中需要生成具体角色建议时调用此工具。

        Args:
            message: 用户的主要描述或角色信息
            command: 具体指令，例如"创建主角"、"补全背景"（可为空）
            guidance: 额外约束，例如"风格偏阴暗"（可为空）
        """
        from app.services.langchain_agent.tools.character_tools import (
            get_character_context,
            propose_character_patch,
        )
        context = await get_character_context(db=db, project=project)
        actions_raw, notes = await propose_character_patch(
            db=db,
            project=project,
            owner_id=owner_id or "",
            context=context,
            source_text=None,
            command=command or None,
            message=message,
            guidance=guidance or None,
        )
        result = {
            "actions": actions_raw,
            "notes": notes,
        }
        return json.dumps(result, ensure_ascii=False)

    return [query_world_setting, query_characters, draft_world_setting_update, draft_character_actions]
