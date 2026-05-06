"""LangChain-based fixed tool chain orchestrator for project asset AI."""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from app.models.project import Project

logger = logging.getLogger(__name__)


class AgentOrchestrator:
    """Fixed tool chain orchestrator (phase 1).

    Executes a deterministic sequence of steps rather than a ReAct loop,
    which keeps latency predictable and the output schema stable.
    """

    async def analyze_world_setting(
        self,
        *,
        db: AsyncSession,
        project: "Project",
        owner_id: str,
        message: str,
        source_text: str | None,
        command: str | None,
        guidance: str | None,
    ):
        from app.schemas.project_asset_ai import WorldSettingAnalyzeResponse, WorldSettingPatch
        from app.services.langchain_agent.tools.world_setting_tools import (
            get_world_setting_context,
            propose_world_setting_patch,
        )

        tool_trace: list[str] = []

        # Step 1: read current world setting context
        context = await get_world_setting_context(db=db, project=project)
        tool_trace.append("get_world_setting_context → OK")

        # Step 2: call LLM to propose a patch
        patch_raw, notes, applied_sources = await propose_world_setting_patch(
            db=db,
            project=project,
            owner_id=owner_id,
            context=context,
            source_text=source_text,
            command=command,
            message=message,
            guidance=guidance,
        )
        tool_trace.append(f"propose_world_setting_patch → {len(notes)} notes, {len(applied_sources)} sources")

        return WorldSettingAnalyzeResponse(
            patch=WorldSettingPatch(**patch_raw),
            notes=notes,
            applied_sources=applied_sources,
            tool_trace=tool_trace,
        )

    async def analyze_characters(
        self,
        *,
        db: AsyncSession,
        project: "Project",
        owner_id: str,
        message: str,
        source_text: str | None,
        command: str | None,
        guidance: str | None,
    ):
        from app.schemas.project_asset_ai import CharacterAnalyzeResponse, CharacterActionItem
        from app.services.langchain_agent.tools.character_tools import (
            get_character_context,
            propose_character_patch,
        )

        tool_trace: list[str] = []

        context = await get_character_context(db=db, project=project)
        tool_trace.append("get_character_context → OK")

        actions_raw, notes = await propose_character_patch(
            db=db,
            project=project,
            owner_id=owner_id,
            context=context,
            source_text=source_text,
            command=command,
            message=message,
            guidance=guidance,
        )
        tool_trace.append(f"propose_character_patch → {len(actions_raw)} actions, {len(notes)} notes")

        actions = [CharacterActionItem(**a) for a in actions_raw]

        return CharacterAnalyzeResponse(
            actions=actions,
            notes=notes,
            tool_trace=tool_trace,
        )


agent_orchestrator = AgentOrchestrator()
