from __future__ import annotations

from collections.abc import AsyncIterator
import logging
from typing import Any

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.project import Chapter, ChapterMemory, Project, ProjectCharacter, ProjectStoryMemory
from app.services.context_retrieval_service import context_retrieval_service
from app.services.runtime_ai_config import runtime_ai_config_service

logger = logging.getLogger(__name__)


class AIService:
    def __init__(self):
        self._openai_clients: dict[tuple[str | None, str | None], AsyncOpenAI] = {}
        self._anthropic_clients: dict[tuple[str | None, str | None], AsyncAnthropic] = {}

    def get_openai_client(self, api_key: str | None, base_url: str | None) -> AsyncOpenAI:
        cache_key = (api_key, base_url)
        client = self._openai_clients.get(cache_key)
        if client is None:
            client = AsyncOpenAI(api_key=api_key, base_url=base_url)
            self._openai_clients[cache_key] = client
        return client

    def get_anthropic_client(self, api_key: str | None, base_url: str | None) -> AsyncAnthropic:
        cache_key = (api_key, base_url)
        client = self._anthropic_clients.get(cache_key)
        if client is None:
            client = AsyncAnthropic(api_key=api_key, base_url=base_url)
            self._anthropic_clients[cache_key] = client
        return client

    def _clip_text(self, value: str | None, limit: int = 400) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            return None
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[:limit].rstrip()}..."

    def _detect_generation_intent(self, instruction: str, text: str) -> str:
        signal = f"{instruction}\n{text}".lower()

        consistency_keywords = (
            "一致性",
            "冲突",
            "检查",
            "风险",
            "证据",
            "角色设定",
            "世界观规则",
            "时间线",
        )
        rewrite_keywords = (
            "改写",
            "润色",
            "优化表达",
            "文风",
            "对白",
            "语气",
            "节奏",
        )
        continue_keywords = (
            "续写",
            "继续写",
            "补一段",
            "补全",
            "扩写",
            "承接",
        )

        if any(keyword in signal for keyword in consistency_keywords):
            return "consistency"
        if any(keyword in signal for keyword in rewrite_keywords):
            return "rewrite"
        if any(keyword in signal for keyword in continue_keywords):
            return "continue"
        return "general"

    def _build_project_summary_section(self, project: Project) -> str | None:
        lines = [f"项目标题：{project.title}"]
        if project.type:
            lines.append(f"项目类型：{project.type}")
        if project.source_work:
            lines.append(f"来源作品：{project.source_work}")
        if project.description:
            lines.append(f"项目简介：{self._clip_text(project.description, 500)}")
        return "\n".join(lines)

    def _build_chapter_context_section(self, chapter: Chapter | None, *, include_notes: bool) -> str | None:
        if not chapter:
            return None

        lines = [f"当前章节：{chapter.title}"]
        if chapter.summary:
            lines.append(f"章节摘要：{self._clip_text(chapter.summary, 500)}")
        if include_notes and chapter.notes:
            lines.append(f"章节备注：{self._clip_text(chapter.notes, 500)}")
        return "\n".join(lines)

    def _build_chapter_memory_section(self, memory: ChapterMemory | None, *, label: str) -> str | None:
        if not memory:
            return None

        lines = [label]
        if memory.summary_short:
            lines.append(f"简要摘要：{self._clip_text(memory.summary_short, 180)}")
        if memory.summary_long:
            lines.append(f"详细摘要：{self._clip_text(memory.summary_long, 420)}")

        key_events = memory.key_events[:4] if memory.key_events else []
        if key_events:
            lines.append("关键事件：")
            for item in key_events:
                summary = self._clip_text(item.get("summary") or item.get("title"), 140)
                if summary:
                    lines.append(f"- {summary}")

        open_loops = memory.open_loops[:3] if memory.open_loops else []
        if open_loops:
            lines.append("待推进线索：")
            for item in open_loops:
                summary = self._clip_text(item.get("description") or item.get("label"), 120)
                if summary:
                    lines.append(f"- {summary}")

        return "\n".join(lines) if len(lines) > 1 else None

    def _build_story_memory_section(self, story_memory: ProjectStoryMemory | None) -> str | None:
        if not story_memory:
            return None

        lines = ["长篇主体记忆"]
        if story_memory.global_plot_summary:
            lines.append(f"主线进度：{self._clip_text(story_memory.global_plot_summary, 500)}")

        active_conflicts = story_memory.active_conflicts[:4] if story_memory.active_conflicts else []
        if active_conflicts:
            lines.append("当前冲突：")
            for item in active_conflicts:
                summary = self._clip_text(item.get("description") or item.get("label"), 120)
                if summary:
                    lines.append(f"- {summary}")

        character_arcs = story_memory.character_arcs[:4] if story_memory.character_arcs else []
        if character_arcs:
            lines.append("角色状态变化：")
            for item in character_arcs:
                summary = self._clip_text(
                    item.get("latest_state")
                    or item.get("after")
                    or item.get("summary")
                    or item.get("character")
                    or item.get("character_id_or_name")
                    or item.get("name"),
                    120,
                )
                if summary:
                    lines.append(f"- {summary}")

        global_open_loops = story_memory.global_open_loops[:5] if story_memory.global_open_loops else []
        if global_open_loops:
            lines.append("未回收主要伏笔：")
            for item in global_open_loops:
                summary = self._clip_text(item.get("description") or item.get("label"), 120)
                if summary:
                    lines.append(f"- {summary}")

        return "\n".join(lines) if len(lines) > 1 else None

    def _build_previous_chapter_tail_section(self, previous_chapter: Chapter | None) -> str | None:
        if not previous_chapter or not previous_chapter.plain_text:
            return None

        tail = previous_chapter.plain_text.strip()
        if not tail:
            return None

        excerpt = tail[-1500:]
        return f"上一章结尾原文（{previous_chapter.title}）：\n{excerpt}"

    def _build_current_chapter_tail_section(self, chapter: Chapter | None) -> str | None:
        if not chapter or not chapter.plain_text:
            return None

        tail = chapter.plain_text.strip()
        if not tail:
            return None

        excerpt = tail[-1800:]
        return f"当前章节已写尾部（{chapter.title}）：\n{excerpt}"

    def _build_retrieved_chunks_section(self, retrieval: dict[str, Any] | None) -> str | None:
        if not retrieval:
            return None
        chunks = retrieval.get("chunks") or []
        if not chunks:
            return None

        lines = ["相关历史正文片段"]
        for index, item in enumerate(chunks[:4], start=1):
            scene_label = self._clip_text(item.get("scene_label"), 80) or f"chunk-{index}"
            lines.append(f"{index}. {scene_label}")
            content = self._clip_text(item.get("content_short") or item.get("content"), 220)
            if content:
                lines.append(f"   片段：{content}")
            reasons = item.get("match_reasons") or []
            if reasons:
                lines.append(f"   命中原因：{' | '.join(reasons[:2])}")
        return "\n".join(lines)

    def _build_character_context_section(self, project: Project, *, detail_level: str) -> str | None:
        if not project.project_characters:
            return None

        character_lines = []
        max_items = 8 if detail_level == "full" else 5
        for link in project.project_characters[:max_items]:
            character = link.character
            parts = [character.name]
            if link.role_label:
                parts.append(f"角色定位：{self._clip_text(link.role_label, 80)}")
            if link.summary:
                parts.append(f"项目摘要：{self._clip_text(link.summary, 160 if detail_level == 'full' else 100)}")
            if character.alias and detail_level == "full":
                parts.append(f"别名：{self._clip_text(character.alias, 80)}")
            if character.description:
                parts.append(f"描述：{self._clip_text(character.description, 160 if detail_level == 'full' else 100)}")
            if character.personality:
                parts.append(f"性格：{self._clip_text(character.personality, 160 if detail_level == 'full' else 100)}")
            if detail_level == "full" and character.background:
                parts.append(f"背景：{self._clip_text(character.background, 160)}")
            if detail_level == "full" and character.relationship_notes:
                parts.append(f"关系备注：{self._clip_text(character.relationship_notes, 160)}")
            if character.tags:
                parts.append(f"标签：{self._clip_text(character.tags, 120 if detail_level == 'full' else 80)}")
            character_lines.append(f"- {'；'.join(parts)}")

        if not character_lines:
            return None
        return "项目角色：\n" + "\n".join(character_lines)

    def _build_world_context_section(self, project: Project, *, detail_level: str) -> str | None:
        world_setting = project.world_setting
        if not world_setting:
            return None

        lines = [f"世界观标题：{world_setting.title}"]
        if world_setting.overview:
            lines.append(f"概述：{self._clip_text(world_setting.overview, 500 if detail_level == 'full' else 280)}")
        if world_setting.rules:
            lines.append(f"规则：{self._clip_text(world_setting.rules, 400 if detail_level == 'full' else 240)}")
        if world_setting.factions and detail_level in {"full", "medium"}:
            lines.append(f"势力：{self._clip_text(world_setting.factions, 300 if detail_level == 'full' else 180)}")
        if world_setting.locations and detail_level == "full":
            lines.append(f"地点：{self._clip_text(world_setting.locations, 300)}")
        if world_setting.timeline:
            lines.append(f"时间线：{self._clip_text(world_setting.timeline, 300 if detail_level == 'full' else 180)}")
        if world_setting.extra_notes and detail_level == "full":
            lines.append(f"补充说明：{self._clip_text(world_setting.extra_notes, 300)}")
        return "\n".join(lines)

    def _build_intent_guide(self, intent: str) -> str:
        return {
            "continue": "当前任务偏向生成续写，请优先延续已有情节、角色口吻与章节节奏。",
            "rewrite": "当前任务偏向改写润色，请优先保留既有剧情事实，只调整表达、节奏和语气。",
            "consistency": "当前任务偏向一致性检查，请优先识别角色设定、世界观规则、叙事逻辑和时间线冲突，并给出证据与建议。",
            "general": "请将以下项目上下文作为约束与参考，避免脱离既有设定。",
        }[intent]

    async def _load_generation_context(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter_id: str | None,
        owner_id: str | None = None,
    ) -> dict[str, Any] | None:
        project_query = (
            select(Project)
            .options(
                selectinload(Project.project_characters).selectinload(ProjectCharacter.character),
                selectinload(Project.world_setting),
                selectinload(Project.story_memory),
            )
            .where(Project.id == project_id)
        )
        if owner_id:
            project_query = project_query.where(Project.owner_id == owner_id)

        result = await db.execute(project_query)
        project = result.scalar_one_or_none()
        if not project:
            return None

        chapter: Chapter | None = None
        previous_chapter: Chapter | None = None
        recent_memories: list[ChapterMemory] = []
        if chapter_id:
            chapter_result = await db.execute(
                select(Chapter).where(Chapter.id == chapter_id, Chapter.project_id == project_id)
            )
            chapter = chapter_result.scalar_one_or_none()
            if chapter:
                previous_result = await db.execute(
                    select(Chapter)
                    .where(Chapter.project_id == project_id, Chapter.order_index < chapter.order_index)
                    .order_by(Chapter.order_index.desc())
                    .limit(1)
                )
                previous_chapter = previous_result.scalar_one_or_none()

                memory_result = await db.execute(
                    select(ChapterMemory)
                    .join(Chapter, Chapter.id == ChapterMemory.chapter_id)
                    .where(
                        ChapterMemory.project_id == project_id,
                        Chapter.order_index < chapter.order_index,
                    )
                    .order_by(Chapter.order_index.desc())
                    .limit(3)
                )
                recent_memories = memory_result.scalars().all()

        return {
            "project": project,
            "chapter": chapter,
            "previous_chapter": previous_chapter,
            "recent_memories": recent_memories,
            "story_memory": project.story_memory,
        }

    async def load_generation_context(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter_id: str | None,
        owner_id: str | None = None,
    ) -> dict[str, Any] | None:
        return await self._load_generation_context(
            db,
            project_id=project_id,
            chapter_id=chapter_id,
            owner_id=owner_id,
        )

    async def build_generation_context_preview(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter_id: str | None,
        text: str,
        instruction: str,
        owner_id: str | None = None,
    ) -> dict[str, Any]:
        loaded = await self._load_generation_context(
            db,
            project_id=project_id,
            chapter_id=chapter_id,
            owner_id=owner_id,
        )
        intent = self._detect_generation_intent(instruction, text)
        if not loaded:
            return {
                "intent": intent,
                "sections": [],
                "final_instruction": instruction,
                "metadata": {"project_found": False, "chapter_found": False},
            }

        project = loaded["project"]
        chapter = loaded["chapter"]
        previous_chapter = loaded["previous_chapter"]
        recent_memories = loaded["recent_memories"]
        story_memory = loaded["story_memory"]
        retrieval = await context_retrieval_service.retrieve_for_generation(
            db,
            project_id=project_id,
            chapter=chapter,
            text=text,
            instruction=instruction,
            recent_memories=recent_memories,
            story_memory=story_memory,
            limit=6,
        )

        sections: list[dict[str, str]] = []

        def add_section(title: str, content: str | None) -> None:
            if content and content.strip():
                sections.append({"title": title, "content": content})

        add_section("项目摘要", self._build_project_summary_section(project))
        add_section("长篇主体记忆", self._build_story_memory_section(story_memory))
        add_section(
            "当前章节",
            self._build_chapter_context_section(chapter, include_notes=intent in {"continue", "consistency"}),
        )
        add_section("当前章节已写尾部", self._build_current_chapter_tail_section(chapter))
        for index, memory in enumerate(recent_memories, start=1):
            add_section(
                f"近期剧情记忆 {index}",
                self._build_chapter_memory_section(memory, label=f"近期剧情记忆 {index}"),
            )
        add_section("相关历史正文片段", self._build_retrieved_chunks_section(retrieval))
        add_section("上一章结尾原文", self._build_previous_chapter_tail_section(previous_chapter))
        add_section(
            "角色上下文",
            self._build_character_context_section(project, detail_level="full" if intent == "consistency" else "medium"),
        )
        add_section(
            "世界观上下文",
            self._build_world_context_section(project, detail_level="full" if intent == "consistency" else "medium"),
        )

        context_block = "\n\n".join(section["content"] for section in sections)
        if context_block:
            final_instruction = (
                f"{instruction}\n\n"
                "如果当前章节已经存在未写完的正文，请优先紧接当前章节已写尾部继续写；只有在当前章节尾部信息不足时，才把上一章结尾当作补充参考。\n"
                f"{self._build_intent_guide(intent)}\n"
                "如果生成内容与上下文冲突，优先保持角色设定、世界观规则、章节记忆、检索片段与长期主线一致。\n\n"
                f"{context_block}"
            )
        else:
            final_instruction = instruction

        return {
            "intent": intent,
            "sections": sections,
            "final_instruction": final_instruction,
            "metadata": {
                "project_found": True,
                "chapter_found": chapter is not None,
                "recent_memory_count": len(recent_memories),
                "retrieved_chunk_count": len(retrieval.get("chunks", [])),
                "retrieval_query_terms": retrieval.get("query_terms", []),
                "has_current_chapter_tail": chapter is not None and bool(chapter.plain_text and chapter.plain_text.strip()),
                "has_previous_chapter_tail": previous_chapter is not None and bool(previous_chapter.plain_text),
                "has_story_memory": story_memory is not None,
            },
        }

    async def build_generation_instruction(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter_id: str | None,
        text: str,
        instruction: str,
        owner_id: str | None = None,
    ) -> str:
        preview = await self.build_generation_context_preview(
            db,
            project_id=project_id,
            chapter_id=chapter_id,
            text=text,
            instruction=instruction,
            owner_id=owner_id,
        )
        return str(preview["final_instruction"])

    async def resolve_runtime_config(
        self,
        db: AsyncSession,
        requested_provider: str | None,
        requested_model_id: str | None,
        owner_id: str | None = None,
    ) -> dict[str, str | None]:
        config = await runtime_ai_config_service.get_effective_config(db, owner_id or "")
        provider = requested_provider or str(config["provider"] or "openai")
        model_id = requested_model_id or str(config["model_id"] or "gpt-4o")

        if provider == "anthropic":
            return {
                "provider": provider,
                "model_id": model_id,
                "api_key": settings.ANTHROPIC_API_KEY,
                "base_url": settings.ANTHROPIC_BASE_URL,
            }

        return {
            "provider": provider,
            "model_id": model_id,
            "api_key": str(config["api_key"] or settings.OPENAI_API_KEY),
            "base_url": str(config["base_url"] or settings.OPENAI_BASE_URL) if (config["base_url"] or settings.OPENAI_BASE_URL) else None,
        }

    def _extract_openai_delta_text(self, chunk: object) -> list[str]:
        choices = getattr(chunk, "choices", None) or []
        if not choices:
            return []

        texts: list[str] = []
        for choice in choices:
            delta = getattr(choice, "delta", None)
            if delta is None:
                continue

            content = getattr(delta, "content", None)
            if isinstance(content, str):
                if content:
                    texts.append(content)
                continue

            if isinstance(content, list):
                for item in content:
                    if isinstance(item, str):
                        if item:
                            texts.append(item)
                        continue

                    text_value = getattr(item, "text", None)
                    if isinstance(text_value, str) and text_value:
                        texts.append(text_value)
        return texts

    async def _generate_openai_stream_chunks(
        self,
        *,
        api_key: str | None,
        base_url: str | None,
        text: str,
        instruction: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> AsyncIterator[str]:
        client = self.get_openai_client(api_key, base_url)
        stream = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": text},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )

        async for chunk in stream:
            texts = self._extract_openai_delta_text(chunk)
            if texts:
                for item in texts:
                    yield item
                continue

            choices = getattr(chunk, "choices", None) or []
            logger.debug(
                "Skipped OpenAI-compatible stream chunk without text: chunk_type=%s choices=%s",
                type(chunk).__name__,
                len(choices),
            )

    async def _generate_openai_non_stream_text(
        self,
        *,
        api_key: str | None,
        base_url: str | None,
        text: str,
        instruction: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        client = self.get_openai_client(api_key, base_url)
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": text},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
        )

        choices = getattr(response, "choices", None) or []
        if not choices:
            raise RuntimeError("OpenAI Compatible 响应中未返回 choices")

        message = getattr(choices[0], "message", None)
        if message is None:
            raise RuntimeError("OpenAI Compatible 响应中未返回 message")

        content = getattr(message, "content", None)
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            texts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    if item:
                        texts.append(item)
                    continue

                text_value = getattr(item, "text", None)
                if isinstance(text_value, str) and text_value:
                    texts.append(text_value)
            if texts:
                return "".join(texts)

        raise RuntimeError("OpenAI Compatible 响应内容为空或格式不受支持")

    async def generate_stream_openai(
        self,
        *,
        api_key: str | None,
        base_url: str | None,
        text: str,
        instruction: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ):
        streamed_any = False
        try:
            async for chunk_text in self._generate_openai_stream_chunks(
                api_key=api_key,
                base_url=base_url,
                text=text,
                instruction=instruction,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            ):
                streamed_any = True
                yield chunk_text
        except Exception as exc:
            logger.warning(
                "OpenAI-compatible stream failed, fallback to non-stream mode: model=%s base_url=%s error=%s",
                model,
                base_url,
                exc,
            )
            fallback_text = await self._generate_openai_non_stream_text(
                api_key=api_key,
                base_url=base_url,
                text=text,
                instruction=instruction,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            if fallback_text:
                yield fallback_text
            return

        if streamed_any:
            return

        logger.warning(
            "OpenAI-compatible stream returned no text chunks, fallback to non-stream mode: model=%s base_url=%s",
            model,
            base_url,
        )
        fallback_text = await self._generate_openai_non_stream_text(
            api_key=api_key,
            base_url=base_url,
            text=text,
            instruction=instruction,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if fallback_text:
            yield fallback_text

    async def generate_stream_anthropic(
        self,
        *,
        api_key: str | None,
        base_url: str | None,
        text: str,
        instruction: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ):
        client = self.get_anthropic_client(api_key, base_url)
        async with client.messages.stream(
            model=model,
            system=instruction,
            messages=[{"role": "user", "content": text}],
            temperature=temperature,
            max_tokens=max_tokens,
        ) as stream:
            async for text_chunk in stream.text_stream:
                yield text_chunk

    async def generate_text_anthropic(
        self,
        *,
        api_key: str | None,
        base_url: str | None,
        text: str,
        instruction: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        client = self.get_anthropic_client(api_key, base_url)
        response = await client.messages.create(
            model=model,
            system=instruction,
            messages=[{"role": "user", "content": text}],
            temperature=temperature,
            max_tokens=max_tokens,
        )

        content = getattr(response, "content", None) or []
        texts: list[str] = []
        for item in content:
            text_value = getattr(item, "text", None)
            if isinstance(text_value, str) and text_value:
                texts.append(text_value)

        if texts:
            return "".join(texts)

        raise RuntimeError("Anthropic response content is empty")

    async def generate_stream(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter_id: str | None,
        text: str,
        instruction: str,
        model_provider: str,
        model_id: str,
        temperature: float,
        max_tokens: int,
        owner_id: str | None = None,
    ):
        instruction = await self.build_generation_instruction(
            db,
            project_id=project_id,
            chapter_id=chapter_id,
            text=text,
            instruction=instruction,
            owner_id=owner_id,
        )
        runtime_config = await self.resolve_runtime_config(db, model_provider, model_id, owner_id)
        provider = str(runtime_config["provider"])
        resolved_model_id = str(runtime_config["model_id"])
        api_key = runtime_config["api_key"]
        base_url = runtime_config["base_url"]

        if provider == "anthropic":
            async for chunk in self.generate_stream_anthropic(
                api_key=api_key,
                base_url=base_url,
                text=text,
                instruction=instruction,
                model=resolved_model_id,
                temperature=temperature,
                max_tokens=max_tokens,
            ):
                yield chunk
            return

        async for chunk in self.generate_stream_openai(
            api_key=api_key,
            base_url=base_url,
            text=text,
            instruction=instruction,
            model=resolved_model_id,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            yield chunk

    async def generate_text(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter_id: str | None,
        text: str,
        instruction: str,
        model_provider: str | None,
        model_id: str | None,
        temperature: float,
        max_tokens: int,
        owner_id: str | None = None,
    ) -> str:
        resolved_instruction = await self.build_generation_instruction(
            db,
            project_id=project_id,
            chapter_id=chapter_id,
            text=text,
            instruction=instruction,
            owner_id=owner_id,
        )
        runtime_config = await self.resolve_runtime_config(db, model_provider, model_id, owner_id)
        provider = str(runtime_config["provider"])
        resolved_model_id = str(runtime_config["model_id"])
        api_key = runtime_config["api_key"]
        base_url = runtime_config["base_url"]

        if provider == "anthropic":
            return await self.generate_text_anthropic(
                api_key=api_key,
                base_url=base_url,
                text=text,
                instruction=resolved_instruction,
                model=resolved_model_id,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        return await self._generate_openai_non_stream_text(
            api_key=api_key,
            base_url=base_url,
            text=text,
            instruction=resolved_instruction,
            model=resolved_model_id,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    async def generate_plain_text(
        self,
        db: AsyncSession,
        *,
        text: str,
        instruction: str,
        model_provider: str | None,
        model_id: str | None,
        temperature: float,
        max_tokens: int,
        owner_id: str | None = None,
    ) -> str:
        runtime_config = await self.resolve_runtime_config(db, model_provider, model_id, owner_id)
        provider = str(runtime_config["provider"])
        resolved_model_id = str(runtime_config["model_id"])
        api_key = runtime_config["api_key"]
        base_url = runtime_config["base_url"]

        if provider == "anthropic":
            return await self.generate_text_anthropic(
                api_key=api_key,
                base_url=base_url,
                text=text,
                instruction=instruction,
                model=resolved_model_id,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        return await self._generate_openai_non_stream_text(
            api_key=api_key,
            base_url=base_url,
            text=text,
            instruction=instruction,
            model=resolved_model_id,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    async def generate_runtime_probe_text(
        self,
        db: AsyncSession,
        *,
        owner_id: str,
        requested_provider: str | None = None,
        requested_model_id: str | None = None,
        instruction: str,
        text: str,
        temperature: float = 0,
        max_tokens: int = 300,
    ) -> dict[str, Any]:
        runtime_config = await self.resolve_runtime_config(db, requested_provider, requested_model_id, owner_id)
        provider = str(runtime_config["provider"])
        resolved_model_id = str(runtime_config["model_id"])
        api_key = runtime_config["api_key"]
        base_url = runtime_config["base_url"]

        if not api_key:
            raise RuntimeError("当前运行时未配置可用的 API Key")

        if provider == "anthropic":
            content = await self.generate_text_anthropic(
                api_key=api_key,
                base_url=base_url,
                text=text,
                instruction=instruction,
                model=resolved_model_id,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        else:
            content = await self._generate_openai_non_stream_text(
                api_key=api_key,
                base_url=base_url,
                text=text,
                instruction=instruction,
                model=resolved_model_id,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        return {
            "provider": provider,
            "model_id": resolved_model_id,
            "content": content,
        }


ai_service = AIService()
