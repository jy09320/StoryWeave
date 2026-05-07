from __future__ import annotations

import json
import logging
import re
from collections import OrderedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import (
    Chapter,
    ChapterMemory,
    Character,
    MemoryEvidenceLink,
    Project,
    ProjectCharacter,
)
from app.services.ai_service import ai_service

logger = logging.getLogger(__name__)

_MEMORY_EXTRACTION_PROMPT = """你是小说章节记忆抽取器。请从给定章节正文中提取适合长篇续写的结构化记忆。

只输出 JSON 对象，字段固定为：
{
  "summary_short": "",
  "summary_long": "",
  "key_events": [
    {
      "title": "",
      "summary": "",
      "actors": [],
      "location": "",
      "impact": ""
    }
  ],
  "character_state_changes": [
    {
      "character_id_or_name": "",
      "before": "",
      "after": "",
      "reason": ""
    }
  ],
  "relationship_changes": [
    {
      "entity_a": "",
      "entity_b": "",
      "change": "",
      "status_after": ""
    }
  ],
  "open_loops": [
    {
      "label": "",
      "description": "",
      "priority": "high|medium|low"
    }
  ],
  "resolved_loops": [
    {
      "label": "",
      "resolution": ""
    }
  ],
  "timeline_markers": [
    {
      "time": "",
      "location": "",
      "scene": ""
    }
  ],
  "important_objects": [
    {
      "name": "",
      "state": "",
      "owner": ""
    }
  ],
  "knowledge_state_changes": [
    {
      "subject": "",
      "learned_fact": "",
      "visibility": "private|group|public"
    }
  ]
}

要求：
1. 只输出 JSON，不要附加解释。
2. summary_short 控制在 120 字以内。
3. summary_long 控制在 400 字以内。
4. 数组元素优先使用简洁对象，不要返回空字符串字段。
5. 只保留对后续续写真正重要的信息。
6. 如果无法判断，返回空数组。"""

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[。！？!?；;])")
_TIME_MARKERS = (
    "清晨",
    "早晨",
    "上午",
    "中午",
    "午后",
    "傍晚",
    "夜里",
    "深夜",
    "凌晨",
    "当天",
    "当晚",
    "次日",
    "第二天",
    "第三天",
    "几小时后",
    "片刻后",
    "不久后",
)
_OPEN_LOOP_HINTS = ("?", "？", "却", "但是", "然而", "未", "没有", "不知", "能否", "是否", "等待", "必须", "决定")
_RESOLUTION_HINTS = ("终于", "成功", "解决", "结束", "完成", "证实", "确认", "和解", "交代", "答应", "找回")
_EMOTION_HINTS = ("愤怒", "紧张", "恐惧", "悲伤", "释然", "坚定", "犹豫", "震惊", "怀疑", "后悔", "决心", "冷静")
_RELATION_HINTS = ("和解", "联手", "合作", "决裂", "争执", "怀疑", "信任", "保护", "背叛", "告白", "敌对")
_KNOWLEDGE_HINTS = ("得知", "发现", "意识到", "明白", "知道", "确认", "听说", "看到", "察觉", "想起")
_OBJECT_HINTS = ("剑", "刀", "枪", "钥匙", "戒指", "玉佩", "地图", "信", "手札", "盒子", "令牌", "药", "卷轴", "项链")
_LOCATION_HINTS = ("在", "来到", "返回", "赶到", "进入", "抵达", "停在", "身处")


class ChapterMemoryService:
    """Phase 1 chapter memory extraction with deterministic fallback."""

    async def refresh_for_chapter(self, db: AsyncSession, *, chapter_id: str) -> ChapterMemory | None:
        result = await db.execute(
            select(Chapter, Project)
            .join(Project, Project.id == Chapter.project_id)
            .where(Chapter.id == chapter_id)
        )
        row = result.one_or_none()
        if not row:
            return None

        chapter, project = row
        source_text = (chapter.plain_text or "").strip()
        if not source_text:
            await self._delete_memory_for_empty_chapter(db, chapter_id=chapter.id)
            return None

        character_names = await self._load_project_character_names(db, project_id=project.id)
        memory_payload = await self._build_memory_payload(
            db,
            project=project,
            chapter=chapter,
            character_names=character_names,
        )

        memory_result = await db.execute(select(ChapterMemory).where(ChapterMemory.chapter_id == chapter.id))
        memory = memory_result.scalar_one_or_none()
        if memory is None:
            memory = ChapterMemory(project_id=chapter.project_id, chapter_id=chapter.id)
            db.add(memory)

        memory.summary_short = memory_payload["summary_short"]
        memory.summary_long = memory_payload["summary_long"]
        memory.key_events = memory_payload["key_events"]
        memory.character_state_changes = memory_payload["character_state_changes"]
        memory.relationship_changes = memory_payload["relationship_changes"]
        memory.open_loops = memory_payload["open_loops"]
        memory.resolved_loops = memory_payload["resolved_loops"]
        memory.timeline_markers = memory_payload["timeline_markers"]
        memory.important_objects = memory_payload["important_objects"]
        memory.knowledge_state_changes = memory_payload["knowledge_state_changes"]

        await db.flush()
        await self._replace_evidence_links(
            db,
            memory_kind="chapter_memory",
            memory_owner_id=memory.id,
            source_chapter_id=chapter.id,
            source_text=source_text,
            memory_payload=memory_payload,
        )
        await db.commit()
        await db.refresh(memory)
        return memory

    async def _delete_memory_for_empty_chapter(self, db: AsyncSession, *, chapter_id: str) -> None:
        result = await db.execute(select(ChapterMemory).where(ChapterMemory.chapter_id == chapter_id))
        memory = result.scalar_one_or_none()
        if memory is None:
            return

        evidence = await db.execute(
            select(MemoryEvidenceLink).where(
                MemoryEvidenceLink.memory_kind == "chapter_memory",
                MemoryEvidenceLink.memory_owner_id == memory.id,
            )
        )
        for item in evidence.scalars().all():
            await db.delete(item)
        await db.delete(memory)
        await db.commit()

    async def _load_project_character_names(self, db: AsyncSession, *, project_id: str) -> list[str]:
        result = await db.execute(
            select(Character.name, Character.alias)
            .join(ProjectCharacter, ProjectCharacter.character_id == Character.id)
            .where(ProjectCharacter.project_id == project_id)
            .order_by(ProjectCharacter.sort_order, Character.name)
        )
        names: list[str] = []
        for name, alias in result.all():
            for raw in (name, alias):
                if not raw:
                    continue
                for piece in re.split(r"[，,、/|；;]", raw):
                    cleaned = piece.strip()
                    if cleaned and cleaned not in names:
                        names.append(cleaned)
        return names[:30]

    async def _build_memory_payload(
        self,
        db: AsyncSession,
        *,
        project: Project,
        chapter: Chapter,
        character_names: list[str],
    ) -> dict:
        ai_payload = await self._try_extract_with_ai(
            db,
            project=project,
            chapter=chapter,
            character_names=character_names,
        )
        if ai_payload:
            return self._normalize_payload(ai_payload, chapter=chapter, character_names=character_names)
        return self._build_fallback_payload(chapter=chapter, character_names=character_names)

    async def _try_extract_with_ai(
        self,
        db: AsyncSession,
        *,
        project: Project,
        chapter: Chapter,
        character_names: list[str],
    ) -> dict | None:
        source_text = (chapter.plain_text or "").strip()
        if len(source_text) < 200:
            return None

        prompt_text = self._build_prompt_text(
            project=project,
            chapter=chapter,
            source_text=source_text,
            character_names=character_names,
        )
        try:
            raw = await ai_service.generate_plain_text(
                db,
                text=prompt_text,
                instruction=_MEMORY_EXTRACTION_PROMPT,
                model_provider=None,
                model_id=None,
                temperature=0.2,
                max_tokens=1800,
                owner_id=project.owner_id,
            )
        except Exception as exc:
            logger.warning("Chapter memory AI extraction failed for chapter=%s: %s", chapter.id, exc)
            return None

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Chapter memory AI extraction returned invalid JSON for chapter=%s", chapter.id)
            return None

    def _build_prompt_text(
        self,
        *,
        project: Project,
        chapter: Chapter,
        source_text: str,
        character_names: list[str],
    ) -> str:
        parts = [
            f"项目标题：{project.title}",
            f"章节标题：{chapter.title}",
        ]
        if character_names:
            parts.append(f"项目角色名单：{', '.join(character_names[:20])}")
        if chapter.summary:
            parts.append(f"作者摘要：{chapter.summary}")
        if chapter.notes:
            parts.append(f"作者备注：{chapter.notes}")
        parts.append("章节正文：")
        parts.append(source_text[:8000])
        return "\n".join(parts)

    def _normalize_payload(self, payload: dict, *, chapter: Chapter, character_names: list[str]) -> dict:
        fallback = self._build_fallback_payload(chapter=chapter, character_names=character_names)
        normalized = {
            "summary_short": self._clip_text(payload.get("summary_short"), limit=120) or fallback["summary_short"],
            "summary_long": self._clip_text(payload.get("summary_long"), limit=500) or fallback["summary_long"],
            "key_events": self._normalize_list_of_dicts(payload.get("key_events")),
            "character_state_changes": self._normalize_list_of_dicts(payload.get("character_state_changes")),
            "relationship_changes": self._normalize_list_of_dicts(payload.get("relationship_changes")),
            "open_loops": self._normalize_list_of_dicts(payload.get("open_loops")),
            "resolved_loops": self._normalize_list_of_dicts(payload.get("resolved_loops")),
            "timeline_markers": self._normalize_list_of_dicts(payload.get("timeline_markers")),
            "important_objects": self._normalize_list_of_dicts(payload.get("important_objects")),
            "knowledge_state_changes": self._normalize_list_of_dicts(payload.get("knowledge_state_changes")),
        }
        for key, value in normalized.items():
            if isinstance(value, list):
                normalized[key] = value[:12] or fallback[key]
        return normalized

    def _build_fallback_payload(self, *, chapter: Chapter, character_names: list[str]) -> dict:
        plain_text = (chapter.plain_text or "").strip()
        paragraphs = [item.strip() for item in plain_text.splitlines() if item.strip()]
        sentences = self._extract_sentences(plain_text)
        first_paragraph = paragraphs[0] if paragraphs else ""
        last_paragraph = paragraphs[-1] if paragraphs else ""

        summary_short = self._clip_text(chapter.summary or first_paragraph or last_paragraph, limit=120) or chapter.title
        summary_long_parts = [part for part in [chapter.summary, first_paragraph, *sentences[:2], last_paragraph, chapter.notes] if part]
        summary_long = self._clip_text(" ".join(summary_long_parts), limit=420) or summary_short

        key_events = self._build_key_events(paragraphs=paragraphs, sentences=sentences, character_names=character_names)
        character_state_changes = self._build_character_state_changes(
            paragraphs=paragraphs,
            sentences=sentences,
            character_names=character_names,
        )
        relationship_changes = self._build_relationship_changes(sentences=sentences, character_names=character_names)
        open_loops = self._build_open_loops(paragraphs=paragraphs, sentences=sentences)
        resolved_loops = self._build_resolved_loops(sentences=sentences)
        timeline_markers = self._build_timeline_markers(paragraphs=paragraphs, chapter_title=chapter.title)
        important_objects = self._build_important_objects(sentences=sentences, character_names=character_names)
        knowledge_state_changes = self._build_knowledge_state_changes(sentences=sentences, character_names=character_names)

        return {
            "summary_short": summary_short,
            "summary_long": summary_long,
            "key_events": key_events[:6],
            "character_state_changes": character_state_changes[:8],
            "relationship_changes": relationship_changes[:6],
            "open_loops": open_loops[:6],
            "resolved_loops": resolved_loops[:6],
            "timeline_markers": timeline_markers[:6],
            "important_objects": important_objects[:6],
            "knowledge_state_changes": knowledge_state_changes[:6],
        }

    def _build_key_events(
        self,
        *,
        paragraphs: list[str],
        sentences: list[str],
        character_names: list[str],
    ) -> list[dict]:
        candidates = paragraphs[:4] if paragraphs else sentences[:4]
        events: list[dict] = []
        for index, text in enumerate(candidates, start=1):
            clipped = self._clip_text(text, limit=140)
            if not clipped:
                continue
            actors = self._find_character_mentions(text, character_names)
            events.append(
                {
                    "title": f"事件{index}",
                    "summary": clipped,
                    "actors": actors[:4],
                    "location": self._extract_location(text),
                    "impact": self._infer_impact(text),
                }
            )
        return self._dedupe_dicts(events, keys=("summary",), limit=6)

    def _build_character_state_changes(
        self,
        *,
        paragraphs: list[str],
        sentences: list[str],
        character_names: list[str],
    ) -> list[dict]:
        changes: list[dict] = []
        sources = paragraphs[:4] + sentences[-3:]
        for text in sources:
            mentions = self._find_character_mentions(text, character_names)
            if not mentions:
                continue
            emotion = self._extract_first_keyword(text, _EMOTION_HINTS)
            decision = self._extract_first_keyword(text, ("决定", "答应", "拒绝", "怀疑", "坚持", "隐瞒", "坦白"))
            if not emotion and not decision:
                continue
            after = self._clip_text(f"{emotion or ''}{'，' if emotion and decision else ''}{decision or ''}".strip("，"), limit=60)
            reason = self._clip_text(text, limit=90)
            for name in mentions[:2]:
                changes.append(
                    {
                        "character_id_or_name": name,
                        "before": "延续上一状态",
                        "after": after or "状态发生变化",
                        "reason": reason or "本章行动推动",
                    }
                )
        return self._dedupe_dicts(changes, keys=("character_id_or_name", "after"), limit=8)

    def _build_relationship_changes(self, *, sentences: list[str], character_names: list[str]) -> list[dict]:
        changes: list[dict] = []
        for text in sentences:
            mentions = self._find_character_mentions(text, character_names)
            if len(mentions) < 2:
                continue
            keyword = self._extract_first_keyword(text, _RELATION_HINTS)
            if not keyword:
                continue
            changes.append(
                {
                    "entity_a": mentions[0],
                    "entity_b": mentions[1],
                    "change": keyword,
                    "status_after": self._clip_text(text, limit=90) or keyword,
                }
            )
        return self._dedupe_dicts(changes, keys=("entity_a", "entity_b", "change"), limit=6)

    def _build_open_loops(self, *, paragraphs: list[str], sentences: list[str]) -> list[dict]:
        sources = list(paragraphs[-3:]) + list(sentences[-3:])
        loops: list[dict] = []
        for text in sources:
            if not self._contains_keyword(text, _OPEN_LOOP_HINTS):
                continue
            priority = "high" if text.endswith(("？", "?")) or "必须" in text else "medium"
            loops.append(
                {
                    "label": self._clip_text(text, limit=24) or "未决事项",
                    "description": self._clip_text(text, limit=100) or "本章留下待推进问题",
                    "priority": priority,
                }
            )
        if not loops and paragraphs:
            tail = self._clip_text(paragraphs[-1], limit=100)
            if tail:
                loops.append({"label": "chapter_tail", "description": tail, "priority": "medium"})
        return self._dedupe_dicts(loops, keys=("label", "description"), limit=6)

    def _build_resolved_loops(self, *, sentences: list[str]) -> list[dict]:
        loops: list[dict] = []
        for text in sentences:
            keyword = self._extract_first_keyword(text, _RESOLUTION_HINTS)
            if not keyword:
                continue
            loops.append(
                {
                    "label": keyword,
                    "resolution": self._clip_text(text, limit=100) or keyword,
                }
            )
        return self._dedupe_dicts(loops, keys=("label", "resolution"), limit=6)

    def _build_timeline_markers(self, *, paragraphs: list[str], chapter_title: str) -> list[dict]:
        markers: list[dict] = []
        for text in paragraphs[:4]:
            time_label = self._extract_first_keyword(text, _TIME_MARKERS)
            location = self._extract_location(text)
            if not time_label and not location:
                continue
            markers.append(
                {
                    "time": time_label or "未明示",
                    "location": location or "未明示",
                    "scene": self._clip_text(text, limit=80) or chapter_title,
                }
            )
        if not markers and chapter_title:
            markers.append({"time": "未明示", "location": "未明示", "scene": chapter_title})
        return self._dedupe_dicts(markers, keys=("time", "location", "scene"), limit=6)

    def _build_important_objects(self, *, sentences: list[str], character_names: list[str]) -> list[dict]:
        objects: list[dict] = []
        for text in sentences:
            object_name = self._extract_first_keyword(text, _OBJECT_HINTS)
            if not object_name:
                continue
            owner = self._find_character_mentions(text, character_names)
            objects.append(
                {
                    "name": object_name,
                    "state": self._clip_text(text, limit=80) or "在本章中被提及",
                    "owner": owner[0] if owner else "",
                }
            )
        return self._dedupe_dicts(objects, keys=("name", "owner"), limit=6)

    def _build_knowledge_state_changes(self, *, sentences: list[str], character_names: list[str]) -> list[dict]:
        changes: list[dict] = []
        for text in sentences:
            keyword = self._extract_first_keyword(text, _KNOWLEDGE_HINTS)
            if not keyword:
                continue
            mentions = self._find_character_mentions(text, character_names)
            changes.append(
                {
                    "subject": mentions[0] if mentions else "未知主体",
                    "learned_fact": self._clip_text(text, limit=100) or keyword,
                    "visibility": "private" if mentions else "group",
                }
            )
        return self._dedupe_dicts(changes, keys=("subject", "learned_fact"), limit=6)

    async def _replace_evidence_links(
        self,
        db: AsyncSession,
        *,
        memory_kind: str,
        memory_owner_id: str,
        source_chapter_id: str,
        source_text: str,
        memory_payload: dict,
    ) -> None:
        result = await db.execute(
            select(MemoryEvidenceLink).where(
                MemoryEvidenceLink.memory_kind == memory_kind,
                MemoryEvidenceLink.memory_owner_id == memory_owner_id,
            )
        )
        for item in result.scalars().all():
            await db.delete(item)

        excerpts = [
            memory_payload.get("summary_short"),
            *(entry.get("summary") for entry in memory_payload.get("key_events", []) if isinstance(entry, dict)),
            *(entry.get("description") for entry in memory_payload.get("open_loops", []) if isinstance(entry, dict)),
        ]
        deduped_excerpts: list[str] = []
        for excerpt in excerpts:
            clipped = self._clip_text(excerpt, limit=180)
            if clipped and clipped not in deduped_excerpts:
                deduped_excerpts.append(clipped)
        if not deduped_excerpts:
            fallback_excerpt = self._clip_text(source_text, limit=240)
            if fallback_excerpt:
                deduped_excerpts.append(fallback_excerpt)

        for index, excerpt in enumerate(deduped_excerpts[:4]):
            start = source_text.find(excerpt[:20]) if excerpt else -1
            db.add(
                MemoryEvidenceLink(
                    memory_kind=memory_kind,
                    memory_owner_id=memory_owner_id,
                    source_chapter_id=source_chapter_id,
                    source_excerpt=excerpt,
                    source_offset_start=start if start >= 0 else None,
                    source_offset_end=(start + len(excerpt)) if start >= 0 else None,
                    confidence=max(0.35, 0.7 - index * 0.1),
                )
            )

    def _normalize_list_of_dicts(self, value: object) -> list[dict]:
        if not isinstance(value, list):
            return []

        normalized: list[dict] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            cleaned = OrderedDict()
            for key, raw in item.items():
                if not isinstance(key, str):
                    continue
                if isinstance(raw, str):
                    stripped = raw.strip()
                    if stripped:
                        cleaned[key] = stripped
                elif isinstance(raw, (int, float, bool)):
                    cleaned[key] = raw
                elif isinstance(raw, list):
                    list_values = [entry.strip() for entry in raw if isinstance(entry, str) and entry.strip()]
                    if list_values:
                        cleaned[key] = list_values[:8]
            if cleaned:
                normalized.append(dict(cleaned))
        return normalized

    def _extract_sentences(self, text: str) -> list[str]:
        normalized = re.sub(r"\s+", " ", text).strip()
        if not normalized:
            return []
        parts = [item.strip() for item in _SENTENCE_SPLIT_RE.split(normalized) if item.strip()]
        return parts[:20]

    def _find_character_mentions(self, text: str, character_names: list[str]) -> list[str]:
        matches: list[str] = []
        for name in character_names:
            if name and name in text and name not in matches:
                matches.append(name)
        return matches[:4]

    def _extract_location(self, text: str) -> str:
        for hint in _LOCATION_HINTS:
            if hint not in text:
                continue
            index = text.find(hint)
            candidate = text[index : index + 18]
            return self._clip_text(candidate, limit=18) or ""
        return ""

    def _infer_impact(self, text: str) -> str:
        keyword = self._extract_first_keyword(text, _OPEN_LOOP_HINTS + _RESOLUTION_HINTS + _RELATION_HINTS)
        if keyword:
            return f"推动后续剧情：{keyword}"
        return "推进当前情节"

    def _contains_keyword(self, text: str, keywords: tuple[str, ...]) -> bool:
        return any(keyword in text for keyword in keywords)

    def _extract_first_keyword(self, text: str, keywords: tuple[str, ...]) -> str | None:
        for keyword in keywords:
            if keyword in text:
                return keyword
        return None

    def _dedupe_dicts(self, items: list[dict], *, keys: tuple[str, ...], limit: int) -> list[dict]:
        deduped: OrderedDict[str, dict] = OrderedDict()
        for item in items:
            marker = None
            for key in keys:
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    marker = f"{key}:{value.strip()}"
                    break
            if marker is None:
                marker = repr(sorted(item.items()))
            deduped[marker] = item
        return list(deduped.values())[:limit]

    def _clip_text(self, value: str | None, *, limit: int = 160) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            return None
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[:limit].rstrip()}..."


chapter_memory_service = ChapterMemoryService()
