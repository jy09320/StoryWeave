from __future__ import annotations

import re
from collections import OrderedDict
from collections.abc import Iterable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Chapter, ChapterMemory, DocumentChunk, ProjectStoryMemory, StoryEntity, StoryEvent, StoryOpenLoop, StoryRelation

_TOKEN_RE = re.compile(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]{1,8}")
_STOP_WORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "then",
    "have",
    "will",
    "your",
    "about",
    "please",
    "story",
    "scene",
    "chapter",
    "continue",
    "rewrite",
    "write",
    "project",
    "character",
    "world",
    "plot",
    "内容",
    "继续",
    "续写",
    "描写",
    "写作",
    "剧情",
    "章节",
    "场景",
    "角色",
    "设定",
    "世界观",
    "故事",
    "项目",
    "当前",
    "下面",
    "保持",
    "风格",
    "一致",
}
_GRAPH_TERM_BLACKLIST = {
    "继续写这一段",
    "优先承接",
    "动作和情绪",
    "不要立刻揭晓真相",
    "命运的红线悄然缠绕",
    "她不知道的是",
    "而她不知道的是",
    "青衫书生神色淡然",
    "剧情继续推进线索",
    "哪里还有人回应",
    "你到底什么意思",
}
_READER_ONLY_MARKERS = ("她不知道的是", "而她不知道的是", "他不知道的是", "而他不知道的是")


class ContextRetrievalService:
    _GRAPH_TYPE_BASE_SCORE = {
        "entity": 1.2,
        "event": 0.9,
        "relation": 1.0,
        "open_loop": 1.5,
    }

    async def retrieve_for_generation(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter: Chapter | None,
        text: str,
        instruction: str,
        recent_memories: list[ChapterMemory] | None = None,
        story_memory: ProjectStoryMemory | None = None,
        limit: int = 8,
    ) -> dict[str, Any]:
        query_terms = self._build_query_terms(
            chapter=chapter,
            text=text,
            instruction=instruction,
            recent_memories=recent_memories or [],
            story_memory=story_memory,
        )

        ranked_chunks = await self._retrieve_document_chunks(
            db,
            project_id=project_id,
            chapter=chapter,
            query_terms=query_terms,
            limit=max(limit, 1),
        )
        graph_evidence = await self._retrieve_graph_evidence(
            db,
            project_id=project_id,
            chapter=chapter,
            query_terms=query_terms,
            limit=max(3, min(limit, 6)),
        )
        source = "document_chunks"

        if not ranked_chunks:
            ranked_chunks = await self._retrieve_chapter_fallback_chunks(
                db,
                project_id=project_id,
                chapter=chapter,
                query_terms=query_terms,
                limit=max(limit, 1),
            )
            source = "chapter_fallback"

        return {
            "query_terms": query_terms,
            "chunks": ranked_chunks[: max(limit, 1)],
            "graph_evidence": graph_evidence,
            "metadata": {
                "source": source,
                "requested_limit": limit,
                "returned_chunk_count": min(len(ranked_chunks), max(limit, 1)),
                "returned_graph_count": len(graph_evidence),
                "used_story_memory": story_memory is not None,
                "used_recent_memories": bool(recent_memories),
            },
        }

    def _build_query_terms(
        self,
        *,
        chapter: Chapter | None,
        text: str,
        instruction: str,
        recent_memories: list[ChapterMemory],
        story_memory: ProjectStoryMemory | None,
    ) -> list[str]:
        ordered_terms: OrderedDict[str, None] = OrderedDict()

        for value in (instruction, text):
            self._extend_terms(ordered_terms, self._tokenize(value), max_terms=18)

        if chapter is not None:
            for value in (chapter.title, chapter.summary, chapter.notes):
                self._extend_terms(ordered_terms, self._tokenize(value), max_terms=8)

        for memory in recent_memories[:3]:
            self._extend_terms(ordered_terms, self._tokenize(memory.summary_short), max_terms=5)
            self._extend_terms(ordered_terms, self._tokenize(memory.summary_long), max_terms=5)
            for item in memory.key_events[:3]:
                self._extend_terms(
                    ordered_terms,
                    self._tokenize(self._pick_text(item, "summary", "title", "impact")),
                    max_terms=3,
                )
            for item in memory.open_loops[:3]:
                self._extend_terms(
                    ordered_terms,
                    self._tokenize(self._pick_text(item, "label", "description")),
                    max_terms=3,
                )

        if story_memory is not None:
            self._extend_terms(ordered_terms, self._tokenize(story_memory.global_plot_summary), max_terms=8)
            for item in story_memory.active_conflicts[:4]:
                self._extend_terms(
                    ordered_terms,
                    self._tokenize(self._pick_text(item, "label", "description")),
                    max_terms=3,
                )
            for item in story_memory.character_arcs[:4]:
                self._extend_terms(
                    ordered_terms,
                    self._tokenize(self._pick_text(item, "character", "latest_state", "latest_reason")),
                    max_terms=3,
                )
            for item in story_memory.global_open_loops[:4]:
                self._extend_terms(
                    ordered_terms,
                    self._tokenize(self._pick_text(item, "label", "description")),
                    max_terms=3,
                )

        return list(ordered_terms.keys())[:24]

    async def _retrieve_document_chunks(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter: Chapter | None,
        query_terms: list[str],
        limit: int,
    ) -> list[dict[str, Any]]:
        stmt = select(DocumentChunk).where(DocumentChunk.project_id == project_id)
        if chapter is not None:
            stmt = stmt.where(DocumentChunk.chapter_order <= chapter.order_index)
            stmt = stmt.where(DocumentChunk.chapter_id != chapter.id)
        stmt = stmt.order_by(DocumentChunk.chapter_order.desc(), DocumentChunk.chunk_index.desc()).limit(max(limit * 12, 24))

        result = await db.execute(stmt)
        candidates = result.scalars().all()
        ranked = self._rank_document_chunks(candidates, query_terms=query_terms)
        return ranked[:limit]

    async def _retrieve_chapter_fallback_chunks(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter: Chapter | None,
        query_terms: list[str],
        limit: int,
    ) -> list[dict[str, Any]]:
        stmt = select(Chapter).where(Chapter.project_id == project_id)
        if chapter is not None:
            stmt = stmt.where(Chapter.order_index <= chapter.order_index)
            stmt = stmt.where(Chapter.id != chapter.id)
        stmt = stmt.order_by(Chapter.order_index.desc()).limit(max(limit * 3, 6))

        result = await db.execute(stmt)
        chapters = result.scalars().all()

        pseudo_chunks: list[dict[str, Any]] = []
        for item in chapters:
            for chunk_index, content in enumerate(self._split_plain_text(item.plain_text or item.content or "")):
                payload = {
                    "chunk_id": f"fallback:{item.id}:{chunk_index}",
                    "chapter_id": item.id,
                    "chapter_order": item.order_index,
                    "chunk_index": chunk_index,
                    "scene_label": item.title,
                    "content": content,
                    "content_short": self._clip_text(content, limit=180),
                    "characters": [],
                    "tags": ["fallback"],
                    "start_offset": None,
                    "end_offset": None,
                }
                score, matched_terms, match_reasons = self._score_chunk_payload(payload, query_terms=query_terms)
                if score <= 0:
                    continue
                payload["score"] = score
                payload["matched_terms"] = matched_terms
                payload["match_reasons"] = match_reasons or ["term_overlap"]
                pseudo_chunks.append(payload)

        pseudo_chunks.sort(key=lambda item: (item["score"], item["chapter_order"], item["chunk_index"]), reverse=True)
        return pseudo_chunks[:limit]

    async def _retrieve_graph_evidence(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        chapter: Chapter | None,
        query_terms: list[str],
        limit: int,
    ) -> list[dict[str, Any]]:
        current_order = chapter.order_index if chapter is not None else None
        graph_terms = self._build_graph_query_terms(query_terms)
        if not graph_terms:
            return []
        evidence: list[dict[str, Any]] = []

        entity_stmt = select(StoryEntity).where(StoryEntity.project_id == project_id)
        if current_order is not None:
            entity_stmt = entity_stmt.where(StoryEntity.last_seen_chapter_order <= current_order)
        entity_result = await db.execute(entity_stmt)
        for item in entity_result.scalars().all():
            score, matched_terms, reasons = self._score_graph_text(
                query_terms=graph_terms,
                fields=[item.canonical_name, item.description or "", " ".join(item.tags or [])],
            )
            if score <= 0 or not self._entity_match_is_relevant(item, matched_terms=matched_terms):
                continue
            evidence.append(
                {
                    "type": "entity",
                    "label": item.canonical_name,
                    "summary": item.description,
                    "score": round(
                        score
                        + self._graph_type_bonus("entity")
                        + min(item.mention_count * 0.12, 1.2)
                        + self._entity_specific_bonus(item, matched_terms=matched_terms),
                        3,
                    ),
                    "matched_terms": matched_terms,
                    "match_reasons": reasons or ["graph:entity"],
                    "chapter_order": item.last_seen_chapter_order,
                }
            )

        event_stmt = select(StoryEvent).where(StoryEvent.project_id == project_id)
        if current_order is not None:
            event_stmt = event_stmt.where(StoryEvent.chapter_order <= current_order)
        event_result = await db.execute(event_stmt)
        for item in event_result.scalars().all():
            score, matched_terms, reasons = self._score_graph_text(
                query_terms=graph_terms,
                fields=[item.title, item.summary or "", item.location or "", " ".join(item.participants or []), " ".join(item.tags or [])],
            )
            if score <= 0:
                continue
            evidence.append(
                {
                    "type": "event",
                    "label": item.title,
                    "summary": item.summary,
                    "score": round(
                        score
                        + self._graph_type_bonus("event")
                        + min(item.chapter_order * 0.05, 1.5)
                        + self._event_specific_bonus(item, matched_terms=matched_terms),
                        3,
                    ),
                    "matched_terms": matched_terms,
                    "match_reasons": reasons or ["graph:event"],
                    "chapter_order": item.chapter_order,
                }
            )

        relation_stmt = select(StoryRelation).where(StoryRelation.project_id == project_id)
        if current_order is not None:
            relation_stmt = relation_stmt.where(StoryRelation.chapter_order <= current_order)
        relation_result = await db.execute(relation_stmt)
        for item in relation_result.scalars().all():
            score, matched_terms, reasons = self._score_graph_text(
                query_terms=graph_terms,
                fields=[item.source_entity_name, item.target_entity_name, item.relation_type, item.status_after or ""],
            )
            if score <= 0:
                continue
            evidence.append(
                {
                    "type": "relation",
                    "label": f"{item.source_entity_name} - {item.relation_type} - {item.target_entity_name}",
                    "summary": item.status_after,
                    "score": round(
                        score
                        + self._graph_type_bonus("relation")
                        + min(item.chapter_order * 0.05, 1.5)
                        + self._relation_specific_bonus(item, matched_terms=matched_terms),
                        3,
                    ),
                    "matched_terms": matched_terms,
                    "match_reasons": reasons or ["graph:relation"],
                    "chapter_order": item.chapter_order,
                }
            )

        loop_stmt = select(StoryOpenLoop).where(StoryOpenLoop.project_id == project_id)
        if current_order is not None:
            loop_stmt = loop_stmt.where(StoryOpenLoop.last_seen_chapter_order <= current_order)
        loop_result = await db.execute(loop_stmt)
        for item in loop_result.scalars().all():
            score, matched_terms, reasons = self._score_graph_text(
                query_terms=graph_terms,
                fields=[item.label, item.description or "", " ".join(item.related_entities or [])],
            )
            if score <= 0:
                continue
            evidence.append(
                {
                    "type": "open_loop",
                    "label": item.label,
                    "summary": item.description,
                    "score": round(
                        score
                        + self._graph_type_bonus("open_loop")
                        + min(item.mention_count * 0.18, 1.4)
                        + self._open_loop_specific_bonus(item, matched_terms=matched_terms),
                        3,
                    ),
                    "matched_terms": matched_terms,
                    "match_reasons": reasons or ["graph:open_loop"],
                    "chapter_order": item.last_seen_chapter_order,
                }
            )

        evidence.sort(key=lambda item: (item["score"], item.get("chapter_order") or 0), reverse=True)
        return evidence[:limit]

    def _rank_document_chunks(
        self,
        chunks: list[DocumentChunk],
        *,
        query_terms: list[str],
    ) -> list[dict[str, Any]]:
        ranked: list[dict[str, Any]] = []
        for chunk in chunks:
            payload = {
                "chunk_id": chunk.id,
                "chapter_id": chunk.chapter_id,
                "chapter_order": chunk.chapter_order,
                "chunk_index": chunk.chunk_index,
                "scene_label": chunk.scene_label,
                "content": chunk.content,
                "content_short": chunk.content_short,
                "characters": list(chunk.characters or []),
                "tags": list(chunk.tags or []),
                "start_offset": chunk.start_offset,
                "end_offset": chunk.end_offset,
            }
            score, matched_terms, match_reasons = self._score_chunk_payload(payload, query_terms=query_terms)
            if score <= 0:
                continue
            payload["score"] = score
            payload["matched_terms"] = matched_terms
            payload["match_reasons"] = match_reasons
            ranked.append(payload)

        ranked.sort(key=lambda item: (item["score"], item["chapter_order"], item["chunk_index"]), reverse=True)
        return ranked

    def _score_chunk_payload(
        self,
        payload: dict[str, Any],
        *,
        query_terms: list[str],
    ) -> tuple[float, list[str], list[str]]:
        haystacks = {
            "scene": (payload.get("scene_label") or "").lower(),
            "content": (payload.get("content") or "").lower(),
            "summary": (payload.get("content_short") or "").lower(),
            "characters": " ".join(payload.get("characters") or []).lower(),
            "tags": " ".join(payload.get("tags") or []).lower(),
        }

        score = 0.0
        matched_terms: list[str] = []
        reasons: list[str] = []

        for term in query_terms:
            lowered = term.lower()
            if not lowered:
                continue
            if lowered in haystacks["scene"]:
                score += 3.5
                matched_terms.append(term)
                reasons.append(f"scene:{term}")
                continue
            if lowered in haystacks["characters"]:
                score += 3.0
                matched_terms.append(term)
                reasons.append(f"character:{term}")
                continue
            if lowered in haystacks["tags"]:
                score += 2.5
                matched_terms.append(term)
                reasons.append(f"tag:{term}")
                continue
            if lowered in haystacks["summary"]:
                score += 2.0
                matched_terms.append(term)
                reasons.append(f"summary:{term}")
                continue
            if lowered in haystacks["content"]:
                score += 1.0
                matched_terms.append(term)
                reasons.append(f"content:{term}")

        chapter_order = payload.get("chapter_order") or 0
        score += min(float(chapter_order) * 0.05, 1.5)

        deduped_terms = self._dedupe_strings(matched_terms)[:8]
        deduped_reasons = self._dedupe_strings(reasons)[:4]
        if not deduped_reasons and deduped_terms:
            deduped_reasons = ["term_overlap"]

        return round(score, 3), deduped_terms, deduped_reasons

    def _score_graph_text(
        self,
        *,
        query_terms: list[str],
        fields: list[str],
    ) -> tuple[float, list[str], list[str]]:
        score = 0.0
        matched_terms: list[str] = []
        reasons: list[str] = []
        lowered_fields = [field.lower() for field in fields if isinstance(field, str) and field.strip()]
        for term in query_terms:
            lowered = term.lower()
            for index, field in enumerate(lowered_fields):
                if lowered not in field:
                    continue
                score += 2.5 if index == 0 else 1.5 if index == 1 else 1.0
                matched_terms.append(term)
                reasons.append(f"graph_field_{index}:{term}")
                break
        return round(score, 3), self._dedupe_strings(matched_terms)[:8], self._dedupe_strings(reasons)[:4]

    def _graph_type_bonus(self, evidence_type: str) -> float:
        return self._GRAPH_TYPE_BASE_SCORE.get(evidence_type, 0.0)

    def _build_graph_query_terms(self, query_terms: list[str]) -> list[str]:
        filtered: OrderedDict[str, None] = OrderedDict()
        for term in query_terms:
            for candidate in self._split_graph_term(term):
                if self._is_noise_graph_term(candidate):
                    continue
                filtered[candidate] = None
        return list(filtered.keys())[:18]

    def _split_graph_term(self, value: str) -> list[str]:
        cleaned = value.strip()
        if not cleaned:
            return []
        candidates: list[str] = [cleaned]
        if len(cleaned) > 8:
            for token in re.findall(r"[A-Za-z0-9_]{3,}|[\u4e00-\u9fff]{2,6}", cleaned):
                candidates.append(token)
        deduped: OrderedDict[str, None] = OrderedDict()
        for item in candidates:
            piece = item.strip()
            if piece:
                deduped[piece] = None
        return list(deduped.keys())

    def _is_noise_graph_term(self, term: str) -> bool:
        lowered = term.lower()
        if lowered in _STOP_WORDS:
            return True
        if term in _GRAPH_TERM_BLACKLIST:
            return True
        if any(marker in term for marker in _READER_ONLY_MARKERS):
            return True
        if len(term) <= 1:
            return True
        if re.fullmatch(r"[\u4e00-\u9fff]", term):
            return True
        if re.fullmatch(r"[A-Za-z0-9_]{1,2}", term):
            return True
        return False

    def _entity_specific_bonus(self, item: StoryEntity, *, matched_terms: list[str]) -> float:
        bonus = 0.0
        if any(term == item.canonical_name for term in matched_terms):
            bonus += 1.8
        if item.entity_type == "character":
            bonus += 0.6
        if item.aliases:
            bonus += 0.2
        return bonus

    def _entity_match_is_relevant(self, item: StoryEntity, *, matched_terms: list[str]) -> bool:
        if any(term == item.canonical_name for term in matched_terms):
            return True
        if any(term in (item.aliases or []) for term in matched_terms):
            return True
        if any(term in (item.tags or []) for term in matched_terms):
            return True
        return False

    def _event_specific_bonus(self, item: StoryEvent, *, matched_terms: list[str]) -> float:
        bonus = 0.0
        title = (item.title or "").strip()
        if title.startswith("事件") or title.endswith("推进情节"):
            bonus -= 1.5
        if item.participants:
            bonus += min(len(item.participants) * 0.15, 0.6)
        if item.location and any(term in item.location for term in matched_terms):
            bonus += 0.8
        if item.event_type in {"discovery", "decision", "conflict"}:
            bonus += 0.4
        if item.summary and len(item.summary) >= 18:
            bonus += 0.4
        if not item.participants and not item.location:
            bonus -= 0.6
        return bonus

    def _relation_specific_bonus(self, item: StoryRelation, *, matched_terms: list[str]) -> float:
        bonus = 0.0
        if any(term in {item.source_entity_name, item.target_entity_name} for term in matched_terms):
            bonus += 1.0
        if item.status_after:
            bonus += 0.3
        return bonus

    def _open_loop_specific_bonus(self, item: StoryOpenLoop, *, matched_terms: list[str]) -> float:
        bonus = 0.0
        if item.priority == "high":
            bonus += 1.0
        elif item.priority == "medium":
            bonus += 0.5
        if any(term in (item.related_entities or []) for term in matched_terms):
            bonus += 1.0
        if item.status == "open":
            bonus += 0.4
        if any(marker in (item.label or "") or marker in (item.description or "") for marker in _READER_ONLY_MARKERS):
            bonus -= 2.4
        return bonus

    def _split_plain_text(self, value: str) -> list[str]:
        normalized = value.strip()
        if not normalized:
            return []

        paragraphs = [item.strip() for item in normalized.splitlines() if item.strip()]
        if not paragraphs:
            paragraphs = [normalized]

        chunks: list[str] = []
        current: list[str] = []
        current_length = 0
        for paragraph in paragraphs:
            if current and current_length + len(paragraph) > 900:
                chunks.append("\n".join(current))
                current = [paragraph]
                current_length = len(paragraph)
                continue
            current.append(paragraph)
            current_length += len(paragraph)
        if current:
            chunks.append("\n".join(current))
        return chunks[:12]

    def _tokenize(self, value: str | None) -> list[str]:
        if not value:
            return []
        tokens = _TOKEN_RE.findall(value.lower())
        normalized: list[str] = []
        for token in tokens:
            cleaned = token.strip().lower()
            if not cleaned or cleaned in _STOP_WORDS:
                continue
            if len(cleaned) == 1 and not ("\u4e00" <= cleaned <= "\u9fff"):
                continue
            if cleaned not in normalized:
                normalized.append(cleaned)
        return normalized

    def _extend_terms(
        self,
        ordered_terms: OrderedDict[str, None],
        terms: Iterable[str],
        *,
        max_terms: int,
    ) -> None:
        added = 0
        for term in terms:
            if term in ordered_terms:
                continue
            ordered_terms[term] = None
            added += 1
            if added >= max_terms or len(ordered_terms) >= 32:
                break

    def _pick_text(self, value: dict[str, Any], *keys: str) -> str | None:
        for key in keys:
            current = value.get(key)
            if isinstance(current, str) and current.strip():
                return current.strip()
        return None

    def _dedupe_strings(self, values: Iterable[str]) -> list[str]:
        ordered: OrderedDict[str, None] = OrderedDict()
        for value in values:
            cleaned = value.strip()
            if cleaned and cleaned not in ordered:
                ordered[cleaned] = None
        return list(ordered.keys())

    def _clip_text(self, value: str | None, *, limit: int) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            return None
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[:limit].rstrip()}..."


context_retrieval_service = ContextRetrievalService()
