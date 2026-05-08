from __future__ import annotations

import json
import logging
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Chapter, ChapterMemory, Project, ProjectStoryMemory
from app.services.ai_service import ai_service

logger = logging.getLogger(__name__)

_PLANNER_SYSTEM_PROMPT = """你是小说续写规划器。你的任务不是直接续写正文，而是把本次续写任务转成结构化计划。

只输出 JSON 对象，不要输出解释，不要输出 Markdown。

JSON 结构固定为：
{
  "scene_continuation_point": "",
  "writing_goal": "",
  "must_include": [],
  "must_avoid": [],
  "relevant_open_loops": [],
  "character_constraints": [],
  "timeline_constraints": [],
  "style_notes": [],
  "risk_focus": []
}

要求：
1. 必须返回合法 JSON
2. 所有数组元素都尽量简洁
3. 不要编造上下文中完全不存在的设定
4. 如果信息不足，保守输出，不要扩写正文"""


class ContinuationPlannerService:
    async def plan(
        self,
        db: AsyncSession,
        *,
        request: dict[str, Any],
        loaded_context: dict[str, Any],
    ) -> dict[str, Any]:
        default_plan = self.build_default_plan(request=request, loaded_context=loaded_context)

        prompt = self._build_planner_prompt(
            request=request,
            loaded_context=loaded_context,
            default_plan=default_plan,
        )
        if not prompt:
            return default_plan

        try:
            raw = await ai_service.generate_plain_text(
                db,
                text=prompt,
                instruction=_PLANNER_SYSTEM_PROMPT,
                model_provider=request.get("model_provider"),
                model_id=request.get("model_id"),
                temperature=0.2,
                max_tokens=900,
                owner_id=request.get("owner_id"),
            )
        except Exception as exc:
            logger.warning("Continuation planner failed, using default plan: %s", exc)
            return default_plan

        try:
            payload = self._extract_json_payload(raw)
        except (json.JSONDecodeError, TypeError, ValueError):
            logger.warning("Continuation planner returned invalid JSON, using default plan")
            return default_plan

        normalized = self._normalize_plan(payload)
        return self._merge_with_default(default_plan=default_plan, plan=normalized)

    def build_default_plan(
        self,
        *,
        request: dict[str, Any],
        loaded_context: dict[str, Any],
    ) -> dict[str, Any]:
        project: Project | None = loaded_context.get("project")
        chapter: Chapter | None = loaded_context.get("chapter")
        previous_chapter: Chapter | None = loaded_context.get("previous_chapter")
        recent_memories: list[ChapterMemory] = loaded_context.get("recent_memories") or []
        story_memory: ProjectStoryMemory | None = loaded_context.get("story_memory")

        user_instruction = self._clip_text(request.get("user_instruction"), limit=240) or "继续写下去"
        user_text = self._clip_text(request.get("user_text"), limit=240)
        chapter_title = self._safe_text(chapter.title if chapter else None)
        chapter_completion_requested = self._is_chapter_completion_request(user_instruction)
        current_chapter_tail = self._extract_chapter_tail(chapter, source_limit=600, clip_limit=300)

        continuation_point = self._clip_text(
            self._pick_text(
                current_chapter_tail,
                user_text,
                previous_chapter.plain_text[-400:] if previous_chapter and previous_chapter.plain_text else None,
                chapter.summary if chapter else None,
                chapter.title if chapter else None,
            ),
            limit=220,
        ) or "从当前章节最后一个已知叙事位置继续"

        must_include: list[str] = []
        relevant_open_loops: list[str] = []
        character_constraints: list[str] = []
        timeline_constraints: list[str] = []

        if chapter_completion_requested:
            must_include.append("本次续写要形成明确的本章收束，而不是只写一小段过渡")

        for memory in recent_memories[:2]:
            for item in memory.open_loops[:2]:
                description = self._clip_text(self._pick_from_dict(item, "description", "label"), limit=80)
                if self._is_useful_hint(description) and description not in relevant_open_loops:
                    relevant_open_loops.append(description)
                    must_include.append(f"处理或延续：{description}")

            for item in memory.character_state_changes[:2]:
                description = self._clip_text(
                    self._pick_from_dict(item, "after", "reason", "character_id_or_name"),
                    limit=80,
                )
                if self._is_useful_hint(description) and description not in character_constraints:
                    character_constraints.append(description)

            if not current_chapter_tail:
                for item in memory.timeline_markers[:2]:
                    description = self._clip_text(
                        " / ".join(
                            piece
                            for piece in [
                                self._safe_text(item.get("time")),
                                self._safe_text(item.get("location")),
                                self._safe_text(item.get("scene")),
                            ]
                            if piece
                        ),
                        limit=100,
                    )
                    if self._is_useful_hint(description) and description not in timeline_constraints:
                        timeline_constraints.append(description)

        if story_memory is not None:
            for item in story_memory.active_conflicts[:3]:
                description = self._clip_text(self._pick_from_dict(item, "description", "label"), limit=80)
                if self._is_useful_hint(description) and description not in relevant_open_loops:
                    relevant_open_loops.append(description)

            if not current_chapter_tail:
                for item in story_memory.timeline_constraints[:3]:
                    description = self._clip_text(
                        " / ".join(
                            piece
                            for piece in [
                                self._safe_text(item.get("time")),
                                self._safe_text(item.get("location")),
                                self._safe_text(item.get("scene")),
                            ]
                            if piece
                        ),
                        limit=100,
                    )
                    if self._is_useful_hint(description) and description not in timeline_constraints:
                        timeline_constraints.append(description)

        must_avoid = [
            "无铺垫跳时间线",
            "角色口吻或立场突变",
            "提前揭露未回收伏笔的答案",
        ]
        if chapter is not None:
            must_avoid.append("脱离当前章节叙事焦点")

        style_notes = [
            "优先承接当前章节已写内容",
            "保持与现有正文风格一致",
            "优先自然承接上一段",
        ]
        if user_instruction:
            style_notes.append(f"遵循用户任务：{user_instruction}")
        if chapter_completion_requested:
            style_notes.append("这是本章收束型续写，结尾要自然落到一个阶段性完成点")

        risk_focus = ["承接自然度", "角色一致性", "时间线连续性"]
        if chapter_completion_requested:
            risk_focus.append("本章收束感")

        writing_goal = user_instruction
        if chapter_title and chapter_completion_requested:
            writing_goal = f"{user_instruction}；本次续写需要完成本章收束，推进方向应与章节标题《{chapter_title}》的主题相符。"
        elif chapter_title:
            writing_goal = f"{user_instruction}；可参考章节标题《{chapter_title}》的主题方向，但以叙事自然承接为优先。"
        elif chapter_completion_requested:
            writing_goal = f"{user_instruction}；本次续写需要完成本章收束，而不是只写一小段过渡。"

        return {
            "scene_continuation_point": continuation_point,
            "writing_goal": writing_goal,
            "must_include": must_include[:5],
            "must_avoid": must_avoid[:5],
            "relevant_open_loops": relevant_open_loops[:5],
            "character_constraints": character_constraints[:5],
            "timeline_constraints": timeline_constraints[:5],
            "style_notes": style_notes[:5],
            "risk_focus": risk_focus[:5],
            "metadata": {
                "source": "default",
                "project_title": project.title if project else None,
                "chapter_title": chapter.title if chapter else None,
                "chapter_completion_requested": chapter_completion_requested,
                "used_current_chapter_tail": bool(current_chapter_tail),
                "used_previous_chapter_tail": bool(not current_chapter_tail and previous_chapter and previous_chapter.plain_text),
                "anchor_text": current_chapter_tail
                or user_text
                or self._clip_text(previous_chapter.plain_text[-400:], limit=220)
                if previous_chapter and previous_chapter.plain_text
                else None,
            },
        }

    def _build_planner_prompt(
        self,
        *,
        request: dict[str, Any],
        loaded_context: dict[str, Any],
        default_plan: dict[str, Any],
    ) -> str:
        project: Project | None = loaded_context.get("project")
        chapter: Chapter | None = loaded_context.get("chapter")
        recent_memories: list[ChapterMemory] = loaded_context.get("recent_memories") or []
        story_memory: ProjectStoryMemory | None = loaded_context.get("story_memory")

        parts = [
            f"项目标题：{project.title}" if project else "",
            f"当前章节：{chapter.title}" if chapter else "",
            f"用户指令：{request.get('user_instruction') or ''}",
            f"用户输入：{self._clip_text(request.get('user_text'), limit=1600) or ''}",
        ]
        if self._is_chapter_completion_request(request.get("user_instruction")):
            parts.append("额外要求：用户这次不是只要续一点，而是要写到本章结束，请把“本章收束”当成硬目标。")
        chapter_tail = self._extract_chapter_tail(chapter, source_limit=1200, clip_limit=500)
        if chapter_tail:
            parts.append(f"当前章节已写尾部：{chapter_tail}")
        if chapter and chapter.summary:
            parts.append(f"章节摘要：{self._clip_text(chapter.summary, limit=400)}")
        if story_memory and story_memory.global_plot_summary:
            parts.append(f"长期主线记忆：{self._clip_text(story_memory.global_plot_summary, limit=500)}")
        if recent_memories:
            memory_lines: list[str] = []
            for index, memory in enumerate(recent_memories[:3], start=1):
                summary = self._clip_text(memory.summary_short or memory.summary_long, limit=180)
                if summary:
                    memory_lines.append(f"{index}. {summary}")
            if memory_lines:
                parts.append("近期章节记忆：\n" + "\n".join(memory_lines))
        parts.append("默认续写计划：")
        parts.append(json.dumps(default_plan, ensure_ascii=False))
        return "\n\n".join(part for part in parts if part)

    def _normalize_plan(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "scene_continuation_point": self._safe_text(payload.get("scene_continuation_point")),
            "writing_goal": self._safe_text(payload.get("writing_goal")),
            "must_include": self._normalize_string_list(payload.get("must_include"), limit=6),
            "must_avoid": self._normalize_string_list(payload.get("must_avoid"), limit=6),
            "relevant_open_loops": self._normalize_string_list(payload.get("relevant_open_loops"), limit=6),
            "character_constraints": self._normalize_string_list(payload.get("character_constraints"), limit=6),
            "timeline_constraints": self._normalize_string_list(payload.get("timeline_constraints"), limit=6),
            "style_notes": self._normalize_string_list(payload.get("style_notes"), limit=6),
            "risk_focus": self._normalize_string_list(payload.get("risk_focus"), limit=6),
            "metadata": {"source": "llm"},
        }

    def _merge_with_default(self, *, default_plan: dict[str, Any], plan: dict[str, Any]) -> dict[str, Any]:
        merged = dict(default_plan)
        anchor_text = self._safe_text((default_plan.get("metadata") or {}).get("anchor_text"))
        for key, value in plan.items():
            if key == "metadata":
                continue
            if isinstance(value, str) and value:
                if key == "scene_continuation_point" and anchor_text and not self._is_anchor_aligned(anchor_text, value):
                    continue
                merged[key] = value
            elif isinstance(value, list) and value:
                if key in {"must_avoid", "style_notes", "risk_focus"}:
                    merged[key] = self._merge_unique_string_lists(default_plan.get(key), value, limit=6)
                else:
                    merged[key] = value
        merged["metadata"] = {
            **(default_plan.get("metadata") or {}),
            **(plan.get("metadata") or {}),
        }
        return merged

    def _extract_json_payload(self, raw: object) -> dict[str, Any]:
        if not isinstance(raw, str):
            raise TypeError("Planner raw response is not a string")

        stripped = raw.strip()
        if not stripped:
            raise ValueError("Planner raw response is empty")

        try:
            payload = json.loads(stripped)
            if isinstance(payload, dict):
                return payload
        except json.JSONDecodeError:
            pass

        if stripped.startswith("```"):
            lines = stripped.splitlines()
            if len(lines) >= 3:
                stripped = "\n".join(lines[1:-1]).strip()
                try:
                    payload = json.loads(stripped)
                    if isinstance(payload, dict):
                        return payload
                except json.JSONDecodeError:
                    pass

        start = stripped.find("{")
        end = stripped.rfind("}")
        if start < 0 or end < 0 or end <= start:
            raise ValueError("No JSON object found in planner response")

        payload = json.loads(stripped[start : end + 1])
        if not isinstance(payload, dict):
            raise ValueError("Planner response JSON is not an object")
        return payload

    def _is_anchor_aligned(self, anchor_text: str, continuation_point: str) -> bool:
        anchor_terms = self._extract_terms(anchor_text)
        continuation_terms = self._extract_terms(continuation_point)
        if not anchor_terms or not continuation_terms:
            return True
        overlap = anchor_terms & continuation_terms
        return len(overlap) >= 2 or bool(overlap and len(anchor_text) < 80)

    def _is_chapter_completion_request(self, instruction: object) -> bool:
        cleaned = self._safe_text(instruction) or ""
        if not cleaned:
            return False
        markers = ("写到本章完", "写到本章结束", "本章完", "本章结束", "收住本章", "收束本章", "把这章写完", "写完整章", "写完这一章", "写完本章", "续写完本章", "完成本章", "写到章末", "写到结尾")
        return any(marker in cleaned for marker in markers)

    def _merge_unique_string_lists(self, left: object, right: object, *, limit: int) -> list[str]:
        merged: list[str] = []
        for source in (left, right):
            if not isinstance(source, list):
                continue
            for item in source:
                if not isinstance(item, str):
                    continue
                cleaned = " ".join(item.split()).strip()
                if cleaned and cleaned not in merged:
                    merged.append(cleaned)
        return merged[:limit]

    def _is_useful_hint(self, value: str | None) -> bool:
        if not value:
            return False
        cleaned = value.strip()
        if len(cleaned) < 4:
            return False
        if cleaned.startswith("#"):
            return False
        if "<p>" in cleaned or "</p>" in cleaned:
            return False
        if cleaned.count("。") > 2 and len(cleaned) > 50:
            return False
        return True

    def _normalize_string_list(self, value: object, *, limit: int) -> list[str]:
        if not isinstance(value, list):
            return []
        normalized: list[str] = []
        for item in value:
            if not isinstance(item, str):
                continue
            cleaned = " ".join(item.split()).strip()
            if cleaned and cleaned not in normalized:
                normalized.append(cleaned)
        return normalized[:limit]

    def _pick_from_dict(self, value: dict[str, Any], *keys: str) -> str | None:
        for key in keys:
            current = value.get(key)
            if isinstance(current, str) and current.strip():
                return current.strip()
        return None

    def _pick_text(self, *values: str | None) -> str | None:
        for value in values:
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    def _extract_chapter_tail(self, chapter: Chapter | None, *, source_limit: int, clip_limit: int) -> str | None:
        if chapter is None:
            return None
        source = self._safe_text(chapter.plain_text) or self._safe_text(self._strip_html(chapter.content))
        if not source:
            return None
        return self._clip_text(source[-source_limit:], limit=clip_limit)

    def _safe_text(self, value: object) -> str | None:
        if not isinstance(value, str):
            return None
        cleaned = " ".join(value.split()).strip()
        return cleaned or None

    def _extract_terms(self, value: str) -> set[str]:
        normalized = "".join(ch if ch.isalnum() else " " for ch in value)
        return {item for item in normalized.split() if len(item) >= 2}

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


continuation_planner_service = ContinuationPlannerService()
