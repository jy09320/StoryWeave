from __future__ import annotations

import inspect
import logging
import re
from datetime import UTC, datetime
from time import perf_counter
from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import ChapterMemory, Project, ProjectStoryMemory
from app.services.ai_service import ai_service
from app.services.context_retrieval_service import context_retrieval_service
from app.services.continuation_planner_service import continuation_planner_service
from app.services.continuity_checker_service import continuity_checker_service

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[dict[str, Any]], Awaitable[None] | None]

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
        progress_callback: ProgressCallback | None = None,
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
        trace: list[dict[str, Any]] = []

        loaded_context = await ai_service.load_generation_context(
            db,
            project_id=project_id,
            chapter_id=chapter_id,
            owner_id=owner_id,
        )
        if not loaded_context:
            raise RuntimeError("Project generation context not found")

        planner_started = perf_counter()
        planner_started_at = self._trace_timestamp()
        await self._emit_progress(
            progress_callback,
            trace=self._build_running_trace(trace, step_key="planner", label="分析承接点", started_at=planner_started_at),
            step_key="planner",
            status="running",
        )
        plan = await continuation_planner_service.plan(
            db,
            request=request,
            loaded_context=loaded_context,
        )
        planner_fallbacks: list[str] = []
        if (plan.get("metadata") or {}).get("source") == "default":
            planner_fallbacks.append("planner:default")
            fallbacks.extend(planner_fallbacks)
        trace.append(
            self._build_trace_step(
                step_key="planner",
                label="分析承接点",
                status="completed",
                started_at=planner_started_at,
                finished_at=self._trace_timestamp(),
                duration_ms=self._elapsed_ms(planner_started),
                input_summary={
                    "has_user_text": bool(self._safe_text(user_text)),
                    "instruction_length": len(user_instruction or ""),
                },
                output_summary=self._summarize_plan(plan),
                fallbacks=planner_fallbacks,
                payload_ref="plan",
            )
        )
        await self._emit_progress(progress_callback, trace=trace, step_key="planner", status=trace[-1]["status"])

        retriever_started = perf_counter()
        retriever_started_at = self._trace_timestamp()
        await self._emit_progress(
            progress_callback,
            trace=self._build_running_trace(trace, step_key="retriever", label="检索相关剧情", started_at=retriever_started_at),
            step_key="retriever",
            status="running",
        )
        retrieval = await self._retrieve_context_materials(
            db,
            request=request,
            loaded_context=loaded_context,
            plan=plan,
            fallbacks=fallbacks,
        )
        retrieval_fallbacks = [item for item in fallbacks if item.startswith("retriever:")]
        trace.append(
            self._build_trace_step(
                step_key="retriever",
                label="检索相关剧情",
                status="completed" if retrieval.get("chunks") or retrieval.get("query_terms") else "skipped",
                started_at=retriever_started_at,
                finished_at=self._trace_timestamp(),
                duration_ms=self._elapsed_ms(retriever_started),
                input_summary={
                    "writing_goal": self._clip_text(self._safe_text(plan.get("writing_goal")), limit=120),
                },
                output_summary=self._summarize_retrieval(retrieval),
                fallbacks=retrieval_fallbacks,
                warnings=["未召回到正文片段"] if not retrieval.get("chunks") else [],
                payload_ref="context_bundle.retrieved_chunks",
            )
        )
        await self._emit_progress(progress_callback, trace=trace, step_key="retriever", status=trace[-1]["status"])

        bundle_started = perf_counter()
        bundle_started_at = self._trace_timestamp()
        await self._emit_progress(
            progress_callback,
            trace=self._build_running_trace(trace, step_key="context_bundle", label="整理角色与伏笔", started_at=bundle_started_at),
            step_key="context_bundle",
            status="running",
        )
        context_bundle = self._build_context_bundle(
            request=request,
            loaded_context=loaded_context,
            retrieval=retrieval,
        )
        trace.append(
            self._build_trace_step(
                step_key="context_bundle",
                label="整理角色与伏笔",
                status="completed",
                started_at=bundle_started_at,
                finished_at=self._trace_timestamp(),
                duration_ms=self._elapsed_ms(bundle_started),
                input_summary={
                    "recent_memory_count": len(loaded_context.get("recent_memories") or []),
                    "has_story_memory": loaded_context.get("story_memory") is not None,
                },
                output_summary=self._summarize_context_bundle(context_bundle),
                payload_ref="context_bundle",
            )
        )
        await self._emit_progress(progress_callback, trace=trace, step_key="context_bundle", status=trace[-1]["status"])

        writer_started = perf_counter()
        writer_started_at = self._trace_timestamp()
        await self._emit_progress(
            progress_callback,
            trace=self._build_running_trace(trace, step_key="writer", label="生成正文", started_at=writer_started_at),
            step_key="writer",
            status="running",
        )
        draft = await self._write_draft(
            db,
            request=request,
            plan=plan,
            context_bundle=context_bundle,
            progress_callback=progress_callback,
        )
        trace.append(
            self._build_trace_step(
                step_key="writer",
                label="生成正文",
                status="completed",
                started_at=writer_started_at,
                finished_at=self._trace_timestamp(),
                duration_ms=self._elapsed_ms(writer_started),
                input_summary={
                    "used_sections": len(draft.get("used_sections") or []),
                },
                output_summary=self._summarize_draft(draft),
                payload_ref="draft",
            )
        )
        await self._emit_progress(progress_callback, trace=trace, step_key="writer", status=trace[-1]["status"])

        checker_started = perf_counter()
        checker_started_at = self._trace_timestamp()
        await self._emit_progress(
            progress_callback,
            trace=self._build_running_trace(trace, step_key="checker", label="检查连续性", started_at=checker_started_at),
            step_key="checker",
            status="running",
        )
        continuity_report = await continuity_checker_service.check(
            db,
            request=request,
            plan=plan,
            context_bundle=context_bundle,
            draft_content=draft["content"],
        )
        checker_status = "completed" if continuity_report.get("check_status") == "completed" else "skipped"
        checker_fallbacks: list[str] = []
        if continuity_report.get("check_status") != "completed":
            checker_fallbacks.append("checker:skipped")
            fallbacks.extend(checker_fallbacks)
        trace.append(
            self._build_trace_step(
                step_key="checker",
                label="检查连续性",
                status=checker_status,
                started_at=checker_started_at,
                finished_at=self._trace_timestamp(),
                duration_ms=self._elapsed_ms(checker_started),
                input_summary={
                    "draft_length": len(draft.get("content") or ""),
                },
                output_summary=self._summarize_continuity_report(continuity_report),
                warnings=self._collect_warnings(continuity_report),
                fallbacks=checker_fallbacks,
                payload_ref="continuity_report",
            )
        )
        await self._emit_progress(progress_callback, trace=trace, step_key="checker", status=trace[-1]["status"])

        fallback_finished_at = self._trace_timestamp()
        trace.append(
            self._build_trace_step(
                step_key="fallback_decision",
                label="整理回退与告警",
                status="completed",
                started_at=fallback_finished_at,
                finished_at=fallback_finished_at,
                duration_ms=0,
                output_summary={
                    "fallback_count": len(fallbacks),
                    "warning_count": len(self._collect_warnings(continuity_report)),
                },
                warnings=self._collect_warnings(continuity_report),
                fallbacks=fallbacks,
                payload_ref="fallbacks",
            )
        )
        await self._emit_progress(progress_callback, trace=trace, step_key="fallback_decision", status="completed")
        final_finished_at = self._trace_timestamp()
        await self._emit_progress(
            progress_callback,
            trace=self._build_running_trace(trace, step_key="final_output", label="完成", started_at=final_finished_at),
            step_key="final_output",
            status="running",
        )
        trace.append(
            self._build_trace_step(
                step_key="final_output",
                label="完成",
                status="completed",
                started_at=final_finished_at,
                finished_at=final_finished_at,
                duration_ms=0,
                output_summary={
                    "final_content_length": len(draft["content"] or ""),
                    "severity": continuity_report.get("severity") or "unknown",
                },
                warnings=self._collect_warnings(continuity_report),
                fallbacks=fallbacks,
                payload_ref="final_content",
            )
        )
        await self._emit_progress(progress_callback, trace=trace, step_key="final_output", status="completed")

        warnings = self._collect_warnings(continuity_report)

        return {
            "plan": plan if debug else {"metadata": plan.get("metadata", {})},
            "context_bundle": context_bundle if debug else {"token_budget_report": context_bundle.get("token_budget_report", {})},
            "draft": draft if debug else {"used_sections": draft.get("used_sections", []), "generation_notes": draft.get("generation_notes", [])},
            "continuity_report": continuity_report,
            "final_content": draft["content"],
            "warnings": warnings,
            "fallbacks": fallbacks,
            "trace": trace,
            "metadata": {
                "planner_used": True,
                "retriever_used": True,
                "checker_used": True,
                "debug": debug,
                "trace_available": True,
            },
        }

    async def _emit_progress(
        self,
        progress_callback: ProgressCallback | None,
        *,
        trace: list[dict[str, Any]],
        step_key: str,
        status: str,
    ) -> None:
        if progress_callback is None:
            return
        payload = {
            "type": "trace",
            "trace": trace,
            "step_key": step_key,
            "status": status,
        }
        result = progress_callback(payload)
        if inspect.isawaitable(result):
            await result

    def _build_running_trace(
        self,
        trace: list[dict[str, Any]],
        *,
        step_key: str,
        label: str,
        started_at: str,
    ) -> list[dict[str, Any]]:
        return [
            *trace,
            {
                "step_key": step_key,
                "label": label,
                "status": "running",
                "started_at": started_at,
                "finished_at": None,
                "duration_ms": None,
                "input_summary": {},
                "output_summary": {},
                "warnings": [],
                "fallbacks": [],
                "payload_ref": None,
            },
        ]

    async def _retrieve_context_materials(
        self,
        db: AsyncSession,
        *,
        request: dict[str, Any],
        loaded_context: dict[str, Any],
        plan: dict[str, Any],
        fallbacks: list[str],
    ) -> dict[str, Any]:
        chapter = loaded_context.get("chapter")
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
        return retrieval

    def _build_context_bundle(
        self,
        *,
        request: dict[str, Any],
        loaded_context: dict[str, Any],
        retrieval: dict[str, Any],
    ) -> dict[str, Any]:
        project: Project = loaded_context["project"]
        chapter = loaded_context.get("chapter")
        previous_chapter = loaded_context.get("previous_chapter")
        recent_memories: list[ChapterMemory] = loaded_context.get("recent_memories") or []
        story_memory: ProjectStoryMemory | None = loaded_context.get("story_memory")

        current_chapter_tail = self._build_current_chapter_tail(chapter)
        previous_chapter_tail_raw = (
            self._clip_text(previous_chapter.plain_text[-1500:], limit=1500)
            if previous_chapter and previous_chapter.plain_text
            else None
        )
        previous_reader_only_tail = self._extract_reader_only_tail(previous_chapter_tail_raw)
        previous_chapter_tail = self._strip_reader_only_tail(previous_chapter_tail_raw)
        current_tail_focus = self._build_tail_focus_excerpt(current_chapter_tail, limit=180)
        previous_tail_focus = self._build_tail_focus_excerpt(previous_chapter_tail, limit=180)
        preferred_anchor = self._choose_preferred_anchor(
            user_text=self._safe_text(request.get("user_text")),
            current_tail_focus=current_tail_focus,
            current_chapter_tail=current_chapter_tail,
            previous_tail_focus=previous_tail_focus,
            previous_chapter_tail=previous_chapter_tail,
        )
        retrieved_chunks = retrieval.get("chunks", [])
        graph_evidence = retrieval.get("graph_evidence", [])
        if current_chapter_tail:
            retrieved_chunks = retrieved_chunks[:2]
        bundle = {
            "project_summary": self._build_project_summary(project),
            "story_memory_summary": self._safe_text(story_memory.global_plot_summary) if story_memory else None,
            "current_chapter_summary": self._build_current_chapter_summary(chapter),
            "current_chapter_tail": current_chapter_tail,
            "current_tail_focus": current_tail_focus,
            "previous_chapter_tail": None if current_chapter_tail else previous_chapter_tail,
            "previous_tail_focus": None if current_chapter_tail else previous_tail_focus,
            "preferred_continuation_anchor": preferred_anchor,
            "recent_memories": [self._serialize_recent_memory(memory) for memory in recent_memories[:3]],
            "retrieved_chunks": retrieved_chunks,
            "graph_evidence": graph_evidence[:4],
            "character_context": self._serialize_character_context(project),
            "world_context": self._serialize_world_context(project),
            "query_terms": retrieval.get("query_terms", []),
            "token_budget_report": self._build_token_budget_report(
                project_summary=self._build_project_summary(project),
                story_memory_summary=self._safe_text(story_memory.global_plot_summary) if story_memory else None,
                current_chapter_summary=self._build_current_chapter_summary(chapter),
                current_chapter_tail=current_tail_focus or current_chapter_tail,
                previous_chapter_tail=previous_tail_focus or previous_chapter_tail,
                recent_memories=recent_memories,
                retrieved_chunks=retrieved_chunks,
            ),
            "metadata": {
                **(retrieval.get("metadata", {}) or {}),
                "previous_reader_only_tail": previous_reader_only_tail,
            },
        }
        return bundle

    async def _write_draft(
        self,
        db: AsyncSession,
        *,
        request: dict[str, Any],
        plan: dict[str, Any],
        context_bundle: dict[str, Any],
        progress_callback: ProgressCallback | None = None,
    ) -> dict[str, Any]:
        writer_prompt = self._build_writer_prompt(
            user_instruction=request.get("user_instruction") or "",
            user_text=request.get("user_text") or "",
            plan=plan,
            context_bundle=context_bundle,
        )

        chunks: list[str] = []
        chapter_completion_requested = bool((plan.get("metadata") or {}).get("chapter_completion_requested"))
        effective_max_tokens = int(request.get("max_tokens") or 2000)
        if chapter_completion_requested and effective_max_tokens < 4000:
            effective_max_tokens = 4000
        async for chunk in ai_service.generate_plain_text_stream(
            db,
            text=writer_prompt,
            instruction=_WRITER_SYSTEM_PROMPT,
            model_provider=request.get("model_provider"),
            model_id=request.get("model_id"),
            temperature=float(request.get("temperature") or 0.8),
            max_tokens=effective_max_tokens,
            owner_id=request.get("owner_id"),
        ):
            chunks.append(chunk)
            if progress_callback is not None:
                payload = {"type": "content_chunk", "chunk": chunk}
                result = progress_callback(payload)
                if inspect.isawaitable(result):
                    await result

        content = "".join(chunks)
        return {
            "content": content,
            "model_provider": request.get("model_provider") or "",
            "model_id": request.get("model_id") or "",
            "generation_notes": [
                "anchor:current_chapter_tail"
                if context_bundle.get("current_chapter_tail")
                else "anchor:previous_chapter_tail"
                if context_bundle.get("previous_chapter_tail")
                else "anchor:user_text"
            ],
            "used_sections": [
                "plan",
                "project_summary",
                "story_memory_summary",
                "current_chapter_summary",
                "current_tail_focus",
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
        preferred_anchor = context_bundle.get("preferred_continuation_anchor") or user_text
        anchor_focus = context_bundle.get("current_tail_focus") or context_bundle.get("previous_tail_focus") or preferred_anchor
        previous_reader_only_tail = self._safe_text((context_bundle.get("metadata") or {}).get("previous_reader_only_tail"))
        plan_metadata = plan.get("metadata") or {}
        chapter_title = self._safe_text(plan_metadata.get("chapter_title"))
        chapter_completion_requested = bool(plan_metadata.get("chapter_completion_requested"))
        parts.append("承接优先级：当前章节已写尾部 > 用户输入正文 > 上一章结尾。如果当前章节已写尾部存在，必须先承接它。")
        parts.append("开头硬约束：前两句必须直接延续承接点最后一个动作、情绪或场景位置，不得重新改写更早发生过的对话、相遇、解释或铺垫。")
        parts.append("禁止回退：如果承接点已经写到‘她转身离开’‘他已经走了’‘她朝城北走去’这类状态，开头不能再把赵怀真拉回面前说话，不能再回到醉红楼铺内重新演一遍刚才的对话。")
        parts.append("只输出新增正文，不要输出章节标题、小标题、说明文字。")
        parts.append("不要复述用户输入或当前章节已写内容的原句；从它们的结尾继续写。首句不要直接重复承接点里的原句、整段尾句或同义改写版尾句。")
        parts.append("首句完整性硬约束：第一句必须是能独立成立的完整句，不要用‘连着’‘却’‘而’‘但’‘只是’‘如果’这类承接词直接起句，也不要省略主语或动作让句子像丢了上半句。")
        parts.append("首段场景硬约束：前 120 到 180 字必须停留在当前同一现场、同一视角、同一时间切片，先写承接点之后立刻发生的动作、感官或反应。")
        parts.append("开头禁止立刻跳到线索总结、案情复盘、组织猜测、下一步规划；这些只能在当前场景站稳之后再慢慢转入。")
        parts.append("结尾完整性硬约束：最后一句也必须是完整句，不要用‘如果’‘可’‘而’‘却’这类悬空转折收尾，不要停在半截判断、半截动作或明显没说完的推理上。")
        parts.append("检索片段、伏笔、角色设定只能作为补充约束，不能拿来重开场景，更不能照抄成开头。")
        parts.append("视角硬约束：只能写当前视角角色此刻能直接看到、听到、闻到、推断到的信息。不要把只属于读者、幕后人物或后堂暗线的信息写成云缨已经知道。")
        parts.append("禁止句式：不要写“她不知道的是”“而她不知道的是”“他不知道的是”“镜头转到”“与此同时在暗处”这类切到幕后旁白视角的句子。")
        parts.append("信息来源硬约束：不要写云缨“听见了后堂对话”“看见了窗后黑影”“认出了暗处盯梢者”这类她并未亲历获得的信息；如果要表现危险临近，只能写她的直觉、异样感、可疑动静或现场可见线索。")
        if previous_reader_only_tail:
            parts.append(f"读者专属暗线信息（禁止改写成云缨已知）：{previous_reader_only_tail}")
        if context_bundle.get("current_chapter_tail"):
            parts.append("首段结构硬约束：先写当前尾句之后立刻发生的动作、反应或观察，再推进到下一步线索。不要把视角拉回当前尾句之前的街头对话、铺内盘问或人物重新出场。")
        elif context_bundle.get("previous_tail_focus"):
            parts.append("首段结构硬约束：先写云缨承接上一章结尾后的动作或情绪，再写她朝城北货栈前进，之后才能切到货栈环境或新线索。不要一上来直接做全景场景介绍。")
        parts.append(f"用户任务：{user_instruction}")
        if chapter_title:
            parts.append(f"当前章节标题：{chapter_title}")
        if chapter_completion_requested:
            parts.append("本次任务要求：写到本章结束。结尾必须形成一个明确的本章收束点，而不是停在松散的中途过渡。")
        parts.append(f"开头必须咬住的尾部焦点：{anchor_focus}")
        parts.append(f"必须直接承接的锚点：{preferred_anchor}")
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
            ("尾部焦点摘录", context_bundle.get("current_tail_focus") or context_bundle.get("previous_tail_focus")),
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

        graph_evidence = context_bundle.get("graph_evidence") or []
        if graph_evidence:
            lines = []
            for index, item in enumerate(graph_evidence[:4], start=1):
                evidence_type = self._safe_text(item.get("type")) or "graph"
                label = self._safe_text(item.get("label")) or f"graph-{index}"
                summary = self._safe_text(item.get("summary")) or ""
                lines.append(f"{index}. [{evidence_type}] {label}: {summary}")
            parts.append("剧情图谱证据：\n" + "\n".join(lines))

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
        source = self._safe_text(getattr(chapter, "plain_text", None)) or self._strip_html(getattr(chapter, "content", None))
        if not source:
            return None
        return self._clip_text(source[-1200:], limit=800)

    def _build_tail_focus_excerpt(self, tail: str | None, *, limit: int) -> str | None:
        cleaned = self._safe_text(tail)
        if not cleaned:
            return None
        cleaned = self._strip_reader_only_tail(cleaned)
        sentences = re.split(r"(?<=[。！？!?])", cleaned)
        focused = "".join(part.strip() for part in sentences[-2:] if part.strip())
        candidate = focused or cleaned[-limit:]
        if len(candidate) <= limit:
            return candidate
        return candidate[-limit:]

    def _choose_preferred_anchor(
        self,
        *,
        user_text: str | None,
        current_tail_focus: str | None,
        current_chapter_tail: str | None,
        previous_tail_focus: str | None,
        previous_chapter_tail: str | None,
    ) -> str | None:
        if user_text:
            if self._text_overlaps(user_text, current_tail_focus) or self._text_overlaps(user_text, current_chapter_tail):
                return user_text
            if self._text_overlaps(user_text, previous_tail_focus) or self._text_overlaps(user_text, previous_chapter_tail):
                return user_text
        return current_tail_focus or current_chapter_tail or user_text or previous_tail_focus or previous_chapter_tail

    def _text_overlaps(self, left: str | None, right: str | None) -> bool:
        left_clean = self._safe_text(left)
        right_clean = self._safe_text(right)
        if not left_clean or not right_clean:
            return False
        left_terms = self._extract_terms(left_clean)
        right_terms = self._extract_terms(right_clean)
        return bool(left_terms and right_terms and len(left_terms & right_terms) >= 2)

    def _extract_terms(self, value: str) -> set[str]:
        terms: set[str] = set()
        for token in re.findall(r"[\u4e00-\u9fff]+|[A-Za-z0-9]+", value.lower()):
            if re.fullmatch(r"[A-Za-z0-9]+", token):
                if len(token) >= 2:
                    terms.add(token)
                continue
            if len(token) == 1:
                terms.add(token)
                continue
            for size in (2, 3):
                if len(token) < size:
                    continue
                for index in range(len(token) - size + 1):
                    terms.add(token[index : index + size])
        return terms

    def _strip_reader_only_tail(self, value: str) -> str:
        markers = ("而她不知道的是", "她不知道的是", "而他不知道的是", "他不知道的是")
        for marker in markers:
            index = value.find(marker)
            if index > 0:
                return value[:index].rstrip()
        return value

    def _extract_reader_only_tail(self, value: str | None) -> str | None:
        if not value:
            return None
        markers = ("而她不知道的是", "她不知道的是", "而他不知道的是", "他不知道的是")
        for marker in markers:
            index = value.find(marker)
            if index >= 0:
                return value[index:].strip()
        return None

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

    def _trace_timestamp(self) -> str:
        return datetime.now(UTC).isoformat()

    def _elapsed_ms(self, started_at: float) -> int:
        return max(0, int((perf_counter() - started_at) * 1000))

    def _build_trace_step(
        self,
        *,
        step_key: str,
        label: str,
        status: str,
        started_at: str,
        finished_at: str,
        duration_ms: int,
        input_summary: dict[str, Any] | None = None,
        output_summary: dict[str, Any] | None = None,
        warnings: list[str] | None = None,
        fallbacks: list[str] | None = None,
        payload_ref: str | None = None,
    ) -> dict[str, Any]:
        return {
            "step_key": step_key,
            "label": label,
            "status": status,
            "started_at": started_at,
            "finished_at": finished_at,
            "duration_ms": duration_ms,
            "input_summary": input_summary or {},
            "output_summary": output_summary or {},
            "warnings": warnings or [],
            "fallbacks": fallbacks or [],
            "payload_ref": payload_ref,
        }

    def _summarize_plan(self, plan: dict[str, Any]) -> dict[str, Any]:
        return {
            "writing_goal": self._clip_text(self._safe_text(plan.get("writing_goal")), limit=120),
            "must_include_count": len(plan.get("must_include") or []),
            "must_avoid_count": len(plan.get("must_avoid") or []),
            "open_loop_count": len(plan.get("relevant_open_loops") or []),
            "source": (plan.get("metadata") or {}).get("source") or "unknown",
        }

    def _summarize_retrieval(self, retrieval: dict[str, Any]) -> dict[str, Any]:
        metadata = retrieval.get("metadata") or {}
        return {
            "query_terms": (retrieval.get("query_terms") or [])[:6],
            "chunk_count": len(retrieval.get("chunks") or []),
            "graph_evidence_count": len(retrieval.get("graph_evidence") or []),
            "source": metadata.get("source") or "default",
            "returned_chunk_count": metadata.get("returned_chunk_count"),
        }

    def _summarize_context_bundle(self, context_bundle: dict[str, Any]) -> dict[str, Any]:
        return {
            "has_current_chapter_tail": bool(context_bundle.get("current_chapter_tail")),
            "has_previous_chapter_tail": bool(context_bundle.get("previous_chapter_tail")),
            "recent_memory_count": len(context_bundle.get("recent_memories") or []),
            "retrieved_chunk_count": len(context_bundle.get("retrieved_chunks") or []),
            "graph_evidence_count": len(context_bundle.get("graph_evidence") or []),
            "estimated_tokens": ((context_bundle.get("token_budget_report") or {}).get("estimated_tokens")),
        }

    def _summarize_draft(self, draft: dict[str, Any]) -> dict[str, Any]:
        return {
            "content_length": len(draft.get("content") or ""),
            "used_sections": draft.get("used_sections") or [],
            "generation_notes": draft.get("generation_notes") or [],
            "model_id": draft.get("model_id") or "",
        }

    def _summarize_continuity_report(self, continuity_report: dict[str, Any]) -> dict[str, Any]:
        return {
            "severity": continuity_report.get("severity") or "unknown",
            "check_status": continuity_report.get("check_status") or "unknown",
            "timeline_conflicts": len(continuity_report.get("timeline_conflicts") or []),
            "character_conflicts": len(continuity_report.get("character_conflicts") or []),
            "world_rule_conflicts": len(continuity_report.get("world_rule_conflicts") or []),
            "knowledge_boundary_conflicts": len(continuity_report.get("knowledge_boundary_conflicts") or []),
            "open_loop_misalignment": len(continuity_report.get("open_loop_misalignment") or []),
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

    def _strip_html(self, value: object) -> str | None:
        if not isinstance(value, str):
            return None
        stripped = re.sub(r"<[^>]+>", " ", value)
        return self._safe_text(stripped)

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
