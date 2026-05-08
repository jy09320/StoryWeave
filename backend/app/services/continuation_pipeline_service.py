from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import ChapterMemory, Project, ProjectStoryMemory
from app.services.ai_service import ai_service
from app.services.context_retrieval_service import context_retrieval_service
from app.services.continuation_planner_service import continuation_planner_service
from app.services.continuity_checker_service import continuity_checker_service

logger = logging.getLogger(__name__)

_WRITER_SYSTEM_PROMPT = """你是长篇小说续写写作者。请基于给定的续写计划和上下文包生成单个候选正文。

要求：
1. 优先承接当前章节已写内容
2. 优先承接自然
3. 优先保持角色一致性和世界设定一致性
4. 不要输出解释、提纲或说明
5. 只输出最终正文"""


class ContinuationPipelineService:
    async def run(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter_id: str | None,
        user_text: str,
        user_instruction: str,
        model_provider: str | None,
        model_id: str | None,
        temperature: float,
        max_tokens: int,
        owner_id: str | None = None,
        debug: bool = False,
    ) -> dict[str, Any]:
        request = {
            "project_id": project_id,
            "chapter_id": chapter_id,
            "user_text": user_text,
            "user_instruction": user_instruction,
            "model_provider": model_provider,
            "model_id": model_id,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "owner_id": owner_id,
        }
        fallbacks: list[str] = []

        loaded_context = await ai_service.load_generation_context(
            db,
            project_id=project_id,
            chapter_id=chapter_id,
            owner_id=owner_id,
        )
        if not loaded_context:
            raise RuntimeError("Project generation context not found")

        plan = await continuation_planner_service.plan(
            db,
            request=request,
            loaded_context=loaded_context,
        )
        if (plan.get("metadata") or {}).get("source") == "default":
            fallbacks.append("planner:default")

        context_bundle = await self._build_context_bundle(
            db,
            request=request,
            loaded_context=loaded_context,
            plan=plan,
            fallbacks=fallbacks,
        )
        draft = await self._write_draft(
            db,
            request=request,
            plan=plan,
            context_bundle=context_bundle,
        )

        continuity_report = await continuity_checker_service.check(
            db,
            request=request,
            plan=plan,
            context_bundle=context_bundle,
            draft_content=draft["content"],
        )
        if continuity_report.get("check_status") != "completed":
            fallbacks.append("checker:skipped")

        return {
            "plan": plan if debug else {"metadata": plan.get("metadata", {})},
            "context_bundle": context_bundle if debug else {"token_budget_report": context_bundle.get("token_budget_report", {})},
            "draft": draft if debug else {"used_sections": draft.get("used_sections", []), "generation_notes": draft.get("generation_notes", [])},
            "continuity_report": continuity_report,
            "final_content": draft["content"],
            "warnings": self._collect_warnings(continuity_report),
            "fallbacks": fallbacks,
            "metadata": {
                "planner_used": True,
                "retriever_used": True,
                "checker_used": True,
                "debug": debug,
            },
        }

    async def _build_context_bundle(
        self,
        db: AsyncSession,
        *,
        request: dict[str, Any],
        loaded_context: dict[str, Any],
        plan: dict[str, Any],
        fallbacks: list[str],
    ) -> dict[str, Any]:
        project: Project = loaded_context["project"]
        chapter = loaded_context.get("chapter")
        previous_chapter = loaded_context.get("previous_chapter")
        recent_memories: list[ChapterMemory] = loaded_context.get("recent_memories") or []
        story_memory: ProjectStoryMemory | None = loaded_context.get("story_memory")

        retrieval_limit = 6
        retrieval_text = "\n".join(
            piece for piece in [request.get("user_text") or "", plan.get("writing_goal") or ""] if piece
        )
        retrieval_instruction = "\n".join(
            [
                request.get("user_instruction") or "",
                *(plan.get("must_include") or []),
                *(plan.get("relevant_open_loops") or []),
            ]
        )

        try:
            retrieval = await context_retrieval_service.retrieve_for_generation(
                db,
                project_id=request["project_id"],
                chapter=chapter,
                text=retrieval_text,
                instruction=retrieval_instruction,
                recent_memories=recent_memories,
                story_memory=story_memory,
                limit=retrieval_limit,
            )
        except Exception as exc:
            logger.warning("Continuation retrieval failed, using empty chunk result: %s", exc)
            fallbacks.append("retriever:empty_chunks")
            retrieval = {
                "query_terms": [],
                "chunks": [],
                "metadata": {"source": "empty_fallback", "returned_chunk_count": 0},
            }

        current_chapter_tail = self._build_current_chapter_tail(chapter)
        bundle = {
            "project_summary": self._build_project_summary(project),
            "story_memory_summary": self._safe_text(story_memory.global_plot_summary) if story_memory else None,
            "current_chapter_summary": self._build_current_chapter_summary(chapter),
            "current_chapter_tail": current_chapter_tail,
            "previous_chapter_tail": self._clip_text(previous_chapter.plain_text[-1500:], limit=1500)
            if previous_chapter and previous_chapter.plain_text
            else None,
            "recent_memories": [self._serialize_recent_memory(memory) for memory in recent_memories[:3]],
            "retrieved_chunks": retrieval.get("chunks", []),
            "graph_evidence": [],
            "character_context": self._serialize_character_context(project),
            "world_context": self._serialize_world_context(project),
            "query_terms": retrieval.get("query_terms", []),
            "token_budget_report": self._build_token_budget_report(
                project_summary=self._build_project_summary(project),
                story_memory_summary=self._safe_text(story_memory.global_plot_summary) if story_memory else None,
                current_chapter_summary=self._build_current_chapter_summary(chapter),
                current_chapter_tail=current_chapter_tail,
                previous_chapter_tail=previous_chapter.plain_text[-1500:] if previous_chapter and previous_chapter.plain_text else None,
                recent_memories=recent_memories,
                retrieved_chunks=retrieval.get("chunks", []),
            ),
            "metadata": retrieval.get("metadata", {}),
        }
        return bundle

    async def _write_draft(
        self,
        db: AsyncSession,
        *,
        request: dict[str, Any],
        plan: dict[str, Any],
        context_bundle: dict[str, Any],
    ) -> dict[str, Any]:
        writer_prompt = self._build_writer_prompt(
            user_instruction=request.get("user_instruction") or "",
            user_text=request.get("user_text") or "",
            plan=plan,
            context_bundle=context_bundle,
        )

        content = await ai_service.generate_plain_text(
            db,
            text=writer_prompt,
            instruction=_WRITER_SYSTEM_PROMPT,
            model_provider=request.get("model_provider"),
            model_id=request.get("model_id"),
            temperature=float(request.get("temperature") or 0.8),
            max_tokens=int(request.get("max_tokens") or 2000),
            owner_id=request.get("owner_id"),
        )
        return {
            "content": content,
            "model_provider": request.get("model_provider") or "",
            "model_id": request.get("model_id") or "",
            "generation_notes": [],
            "used_sections": [
                "plan",
                "project_summary",
                "story_memory_summary",
                "current_chapter_summary",
                "current_chapter_tail",
                "recent_memories",
                "retrieved_chunks",
                "character_context",
                "world_context",
                "user_text",
            ],
        }

    def _build_writer_prompt(
        self,
        *,
        user_instruction: str,
        user_text: str,
        plan: dict[str, Any],
        context_bundle: dict[str, Any],
    ) -> str:
        parts: list[str] = []
        parts.append(f"用户任务：{user_instruction}")
        parts.append(f"续写承接点：{plan.get('scene_continuation_point') or ''}")
        parts.append(f"写作目标：{plan.get('writing_goal') or ''}")

        for label, values in (
            ("必须包含", plan.get("must_include") or []),
            ("必须避免", plan.get("must_avoid") or []),
            ("相关伏笔", plan.get("relevant_open_loops") or []),
            ("角色约束", plan.get("character_constraints") or []),
            ("时间线约束", plan.get("timeline_constraints") or []),
            ("风格要求", plan.get("style_notes") or []),
        ):
            if values:
                parts.append(f"{label}：\n" + "\n".join(f"- {item}" for item in values if isinstance(item, str)))

        for label, value in (
            ("项目摘要", context_bundle.get("project_summary")),
            ("长期主线记忆", context_bundle.get("story_memory_summary")),
            ("当前章节摘要", context_bundle.get("current_chapter_summary")),
            ("当前章节已写尾部", context_bundle.get("current_chapter_tail")),
            ("上一章结尾", context_bundle.get("previous_chapter_tail")),
        ):
            if isinstance(value, str) and value.strip():
                parts.append(f"{label}：\n{value.strip()}")

        recent_memories = context_bundle.get("recent_memories") or []
        if recent_memories:
            parts.append("近期章节记忆：")
            for index, item in enumerate(recent_memories, start=1):
                parts.append(f"{index}. {item}")

        retrieved_chunks = context_bundle.get("retrieved_chunks") or []
        if retrieved_chunks:
            lines = []
            for index, chunk in enumerate(retrieved_chunks[:4], start=1):
                scene_label = self._safe_text(chunk.get("scene_label")) or f"chunk-{index}"
                content = self._safe_text(chunk.get("content_short") or chunk.get("content")) or ""
                lines.append(f"{index}. {scene_label}: {content}")
            parts.append("相关历史正文片段：\n" + "\n".join(lines))

        character_context = context_bundle.get("character_context") or []
        if character_context:
            parts.append("角色上下文：\n" + "\n".join(f"- {item}" for item in character_context))

        world_context = context_bundle.get("world_context") or []
        if world_context:
            parts.append("世界观上下文：\n" + "\n".join(f"- {item}" for item in world_context))

        parts.append("用户输入正文：")
        parts.append(user_text)
        return "\n\n".join(part for part in parts if part)

    def _serialize_recent_memory(self, memory: ChapterMemory) -> str:
        lines: list[str] = []
        summary = self._safe_text(memory.summary_short or memory.summary_long)
        if summary:
            lines.append(summary)
        for item in memory.open_loops[:2]:
            description = self._safe_text(item.get("description") or item.get("label"))
            if description:
                lines.append(f"伏笔：{description}")
        return " | ".join(lines[:3])

    def _serialize_character_context(self, project: Project) -> list[str]:
        items: list[str] = []
        for link in project.project_characters[:6]:
            parts = [link.character.name]
            for value in (link.role_label, link.summary, link.character.personality):
                cleaned = self._safe_text(value)
                if cleaned:
                    parts.append(cleaned)
            items.append(" / ".join(parts[:4]))
        return items

    def _serialize_world_context(self, project: Project) -> list[str]:
        world = project.world_setting
        if world is None:
            return []
        items: list[str] = []
        for label, value in (
            ("概览", world.overview),
            ("规则", world.rules),
            ("势力", world.factions),
            ("地点", world.locations),
            ("时间线", world.timeline),
        ):
            cleaned = self._clip_text(value, limit=220)
            if cleaned:
                items.append(f"{label}：{cleaned}")
        return items[:5]

    def _build_project_summary(self, project: Project) -> str:
        parts = [project.title]
        for value in (project.description, project.premise):
            cleaned = self._clip_text(value, limit=220)
            if cleaned:
                parts.append(cleaned)
        return " / ".join(parts[:3])

    def _build_current_chapter_summary(self, chapter: Any) -> str | None:
        if chapter is None:
            return None
        parts = [
            self._safe_text(chapter.title),
            self._clip_text(chapter.summary, limit=200),
            self._clip_text(chapter.notes, limit=160),
        ]
        clean = [item for item in parts if item]
        return " / ".join(clean) if clean else None

    def _build_current_chapter_tail(self, chapter: Any) -> str | None:
        if chapter is None:
            return None
        source = self._safe_text(getattr(chapter, "plain_text", None)) or self._safe_text(getattr(chapter, "content", None))
        if not source:
            return None
        return self._clip_text(source[-1200:], limit=800)

    def _build_token_budget_report(
        self,
        *,
        project_summary: str | None,
        story_memory_summary: str | None,
        current_chapter_summary: str | None,
        current_chapter_tail: str | None,
        previous_chapter_tail: str | None,
        recent_memories: list[ChapterMemory],
        retrieved_chunks: list[dict[str, Any]],
    ) -> dict[str, Any]:
        section_lengths = {
            "project_summary": len(project_summary or ""),
            "story_memory_summary": len(story_memory_summary or ""),
            "current_chapter_summary": len(current_chapter_summary or ""),
            "current_chapter_tail": len(current_chapter_tail or ""),
            "previous_chapter_tail": len(previous_chapter_tail or ""),
            "recent_memories": sum(len(memory.summary_short or memory.summary_long or "") for memory in recent_memories[:3]),
            "retrieved_chunks": sum(len(str(item.get("content_short") or item.get("content") or "")) for item in retrieved_chunks[:4]),
        }
        estimated_tokens = sum(section_lengths.values()) // 2
        return {
            "estimated_tokens": estimated_tokens,
            "trimmed_sections": [],
            "section_lengths": section_lengths,
        }

    def _collect_warnings(self, continuity_report: dict[str, Any]) -> list[str]:
        warnings: list[str] = []
        if continuity_report.get("severity") in {"medium", "high"}:
            warnings.append(continuity_report.get("summary") or "存在连续性风险")
        if continuity_report.get("check_status") != "completed":
            warnings.append("连续性检查未完整执行")
        return warnings

    def _safe_text(self, value: object) -> str | None:
        if not isinstance(value, str):
            return None
        cleaned = " ".join(value.split()).strip()
        return cleaned or None

    def _clip_text(self, value: str | None, *, limit: int) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            return None
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[:limit].rstrip()}..."


continuation_pipeline_service = ContinuationPipelineService()
