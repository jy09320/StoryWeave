from collections.abc import AsyncIterator
import json
import logging

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.project import Chapter, Project, ProjectCharacter
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

    def _build_project_context_block(
        self,
        *,
        project: Project,
        chapter: Chapter | None,
        intent: str,
    ) -> str | None:
        sections: list[str] = []

        project_summary = self._build_project_summary_section(project)
        if project_summary:
            sections.append(project_summary)

        if intent == "continue":
            chapter_section = self._build_chapter_context_section(chapter, include_notes=True)
            if chapter_section:
                sections.append(chapter_section)
            character_section = self._build_character_context_section(project, detail_level="medium")
            if character_section:
                sections.append(character_section)
            world_section = self._build_world_context_section(project, detail_level="medium")
            if world_section:
                sections.append(world_section)
        elif intent == "rewrite":
            chapter_section = self._build_chapter_context_section(chapter, include_notes=False)
            if chapter_section:
                sections.append(chapter_section)
            character_section = self._build_character_context_section(project, detail_level="medium")
            if character_section:
                sections.append(character_section)
        elif intent == "consistency":
            chapter_section = self._build_chapter_context_section(chapter, include_notes=True)
            if chapter_section:
                sections.append(chapter_section)
            character_section = self._build_character_context_section(project, detail_level="full")
            if character_section:
                sections.append(character_section)
            world_section = self._build_world_context_section(project, detail_level="full")
            if world_section:
                sections.append(world_section)
        else:
            chapter_section = self._build_chapter_context_section(chapter, include_notes=False)
            if chapter_section:
                sections.append(chapter_section)
            character_section = self._build_character_context_section(project, detail_level="medium")
            if character_section:
                sections.append(character_section)
            world_section = self._build_world_context_section(project, detail_level="medium")
            if world_section:
                sections.append(world_section)

        context = "\n\n".join(section for section in sections if section.strip())
        return context or None

    async def build_generation_instruction(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter_id: str | None,
        text: str,
        instruction: str,
    ) -> str:
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
            return instruction

        chapter: Chapter | None = None
        if chapter_id:
            chapter = await db.get(Chapter, chapter_id)
            if chapter and chapter.project_id != project_id:
                chapter = None

        intent = self._detect_generation_intent(instruction, text)
        context_block = self._build_project_context_block(project=project, chapter=chapter, intent=intent)
        if not context_block:
            return instruction

        intent_guide = {
            "continue": "当前任务偏向生成续写，请优先延续已有情节、角色口吻与章节节奏。",
            "rewrite": "当前任务偏向改写润色，请优先保留既有剧情事实，只调整表达、节奏和语气。",
            "consistency": "当前任务偏向一致性检查，请优先识别角色设定、世界观规则、叙事逻辑和时间线冲突，并给出证据与建议。",
            "general": "请将以下项目上下文作为约束与参考，避免脱离既有设定。",
        }
        return (
            f"{instruction}\n\n"
            f"{intent_guide[intent]}\n"
            "若生成内容与上下文冲突，优先保持角色设定、世界观规则、章节信息一致。\n"
            f"{context_block}"
        )

    async def resolve_runtime_config(self, db: AsyncSession, requested_provider: str, requested_model_id: str) -> dict[str, str | None]:
        config = await runtime_ai_config_service.get_effective_config(db)
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
    ):
        instruction = await self.build_generation_instruction(
            db,
            project_id=project_id,
            chapter_id=chapter_id,
            text=text,
            instruction=instruction,
        )
        runtime_config = await self.resolve_runtime_config(db, model_provider, model_id)
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


ai_service = AIService()
