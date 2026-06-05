"""Character AI chat routes — role-play conversation with persistent history."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.project import Character, CharacterChatSession, Chapter, ChapterMemory, ProjectCharacter, ProjectStoryMemory, StoryRelation
from app.models.user import User
from app.schemas.project import (
    CharacterChatRequest,
    CharacterChatSessionCreate,
    CharacterChatSessionResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# List sessions for a character
# ---------------------------------------------------------------------------

@router.get("/{character_id}/chat-sessions", response_model=list[CharacterChatSessionResponse])
async def list_character_chat_sessions(
    character_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Character not found")

    sessions_result = await db.execute(
        select(CharacterChatSession)
        .where(
            CharacterChatSession.character_id == character_id,
            CharacterChatSession.owner_id == current_user.id,
        )
        .order_by(CharacterChatSession.updated_at.desc())
    )
    return sessions_result.scalars().all()


# ---------------------------------------------------------------------------
# Create a new session
# ---------------------------------------------------------------------------

@router.post("/{character_id}/chat-sessions", response_model=CharacterChatSessionResponse)
async def create_character_chat_session(
    character_id: str,
    data: CharacterChatSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    char_result = await db.execute(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    character = char_result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    title = data.title or f"与 {character.name} 的对话"
    session = CharacterChatSession(
        owner_id=current_user.id,
        character_id=character_id,
        project_id=data.project_id,
        title=title,
        messages=[],
        model_id=data.model_id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


# ---------------------------------------------------------------------------
# Get a single session
# ---------------------------------------------------------------------------

@router.get("/{character_id}/chat-sessions/{session_id}", response_model=CharacterChatSessionResponse)
async def get_character_chat_session(
    character_id: str,
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CharacterChatSession).where(
            CharacterChatSession.id == session_id,
            CharacterChatSession.character_id == character_id,
            CharacterChatSession.owner_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# ---------------------------------------------------------------------------
# Delete a session
# ---------------------------------------------------------------------------

@router.delete("/{character_id}/chat-sessions/{session_id}")
async def delete_character_chat_session(
    character_id: str,
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CharacterChatSession).where(
            CharacterChatSession.id == session_id,
            CharacterChatSession.character_id == character_id,
            CharacterChatSession.owner_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    return {"detail": "Deleted"}


# ---------------------------------------------------------------------------
# Send a message (SSE streaming)
# ---------------------------------------------------------------------------

@router.post("/{character_id}/chat-sessions/{session_id}/messages")
async def send_character_chat_message(
    character_id: str,
    session_id: str,
    data: CharacterChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load session
    session_result = await db.execute(
        select(CharacterChatSession).where(
            CharacterChatSession.id == session_id,
            CharacterChatSession.character_id == character_id,
            CharacterChatSession.owner_id == current_user.id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Load character
    char_result = await db.execute(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    character = char_result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # Gather project drama context (optional)
    project_id = data.project_id or session.project_id
    drama_context = await _load_drama_context(db, character=character, project_id=project_id)

    # Build system prompt
    system_prompt = _build_character_system_prompt(character, drama_context)

    # Rebuild messages history for LLM
    history_messages = list(session.messages or [])

    async def event_generator():
        from app.services.ai_service import ai_service

        try:
            runtime = await ai_service.resolve_runtime_config(db, None, data.model_id, current_user.id)
        except Exception as exc:
            yield _sse("error", {"error": f"AI 配置加载失败：{exc}"})
            return

        provider = str(runtime["provider"])
        model_id = str(runtime["model_id"])
        api_key = runtime.get("api_key")
        base_url = runtime.get("base_url")

        # Assemble multi-turn messages
        llm_messages: list[dict] = [{"role": "system", "content": system_prompt}]
        for msg in history_messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                llm_messages.append({"role": role, "content": content})
        llm_messages.append({"role": "user", "content": data.message})

        accumulated = ""
        try:
            if provider == "anthropic":
                from anthropic import AsyncAnthropic
                client = ai_service.get_anthropic_client(api_key, base_url)
                # Anthropic: system separate, messages without system
                anthropic_messages = [m for m in llm_messages if m["role"] != "system"]
                async with client.messages.stream(
                    model=model_id,
                    system=system_prompt,
                    messages=anthropic_messages,
                    temperature=0.85,
                    max_tokens=2048,
                ) as stream:
                    async for text_chunk in stream.text_stream:
                        if text_chunk:
                            accumulated += text_chunk
                            yield _sse("text", {"content": text_chunk})
            else:
                client = ai_service.get_openai_client(api_key, base_url)
                stream = await client.chat.completions.create(
                    model=model_id,
                    messages=llm_messages,
                    temperature=0.85,
                    max_tokens=2048,
                    stream=True,
                )
                async for chunk in stream:
                    choices = getattr(chunk, "choices", None) or []
                    for choice in choices:
                        delta = getattr(choice, "delta", None)
                        if delta is None:
                            continue
                        content = getattr(delta, "content", None)
                        if isinstance(content, str) and content:
                            accumulated += content
                            yield _sse("text", {"content": content})

        except Exception as exc:
            yield _sse("error", {"error": str(exc)})
            return

        # Persist messages to DB
        now = _now_iso()
        new_messages = list(history_messages) + [
            {"role": "user", "content": data.message, "created_at": now},
            {"role": "assistant", "content": accumulated, "created_at": now},
        ]
        # SQLAlchemy JSON column requires reassignment to detect mutation
        session.messages = new_messages
        if data.model_id:
            session.model_id = data.model_id
        await db.commit()

        yield _sse("done", {})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Helper: build character system prompt
# ---------------------------------------------------------------------------

def _build_character_system_prompt(character: "Character", drama_context: dict | None) -> str:
    name = character.name
    lines: list[str] = [
        f"你现在完全扮演角色「{name}」，以第一人称口吻与用户对话。",
        "保持角色一致，不要打破第四堵墙，不要提及自己是 AI 或语言模型。",
        "所有回应都应符合该角色的性格、背景和说话风格。",
        "",
        f"【角色名称】{name}",
    ]

    if character.alias:
        lines.append(f"【别名】{character.alias}")
    if character.tags:
        lines.append(f"【标签】{character.tags}")
    if character.description:
        lines.append(f"【角色简介】\n{character.description}")
    if character.personality:
        lines.append(f"【性格特征】\n{character.personality}")
    if character.profile:
        lines.append(f"【人物档案】\n{character.profile}")
    if character.background:
        lines.append(f"【背景经历】\n{character.background}")
    if character.relationship_notes:
        lines.append(f"【关系备注】\n{character.relationship_notes}")

    if drama_context:
        lines.append("")
        lines.append("【剧情背景（来自关联项目）】")
        if drama_context.get("project_title"):
            lines.append(f"项目：{drama_context['project_title']}")
        if drama_context.get("character_arcs"):
            lines.append("角色弧线：")
            for arc in drama_context["character_arcs"][:5]:
                arc_text = arc if isinstance(arc, str) else str(arc)
                lines.append(f"  - {arc_text}")
        if drama_context.get("relations"):
            lines.append("相关关系：")
            for rel in drama_context["relations"][:10]:
                lines.append(f"  - {rel}")
        if drama_context.get("state_changes"):
            lines.append("近期状态变化：")
            for change in drama_context["state_changes"][:8]:
                change_text = change if isinstance(change, str) else str(change)
                lines.append(f"  - {change_text}")

    lines.append("")
    lines.append("请始终以角色视角回应，语言风格符合角色性格，不透露设定之外的信息。")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Helper: load drama context from project
# ---------------------------------------------------------------------------

async def _load_drama_context(
    db: AsyncSession,
    *,
    character: "Character",
    project_id: str | None,
) -> dict | None:
    if not project_id:
        return None

    from app.models.project import Project
    from sqlalchemy.orm import selectinload

    project_result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        return None

    context: dict = {"project_title": project.title}
    name = character.name

    # character_arcs from ProjectStoryMemory
    story_memory_result = await db.execute(
        select(ProjectStoryMemory).where(ProjectStoryMemory.project_id == project_id)
    )
    story_memory = story_memory_result.scalar_one_or_none()
    if story_memory and story_memory.character_arcs:
        arcs = []
        for arc in story_memory.character_arcs:
            arc_text = arc if isinstance(arc, str) else json.dumps(arc, ensure_ascii=False)
            if name in arc_text:
                arcs.append(arc_text)
        context["character_arcs"] = arcs

    # StoryRelations involving this character
    relations_result = await db.execute(
        select(StoryRelation)
        .where(
            StoryRelation.project_id == project_id,
            (StoryRelation.source_entity_name == name) | (StoryRelation.target_entity_name == name),
        )
        .order_by(StoryRelation.chapter_order.desc())
        .limit(10)
    )
    relations = relations_result.scalars().all()
    rel_lines = []
    for rel in relations:
        line = f"{rel.source_entity_name} → {rel.target_entity_name}（{rel.relation_type}）"
        if rel.status_after:
            line += f"：{rel.status_after}"
        rel_lines.append(line)
    if rel_lines:
        context["relations"] = rel_lines

    # character_state_changes from recent ChapterMemory
    recent_memories_result = await db.execute(
        select(ChapterMemory)
        .join(Chapter, Chapter.id == ChapterMemory.chapter_id)
        .where(ChapterMemory.project_id == project_id)
        .order_by(Chapter.order_index.desc())
        .limit(3)
    )
    recent_memories = recent_memories_result.scalars().all()
    state_changes = []
    for mem in recent_memories:
        for change in (mem.character_state_changes or []):
            change_text = change if isinstance(change, str) else json.dumps(change, ensure_ascii=False)
            if name in change_text:
                state_changes.append(change_text)
    if state_changes:
        context["state_changes"] = state_changes

    return context
