from __future__ import annotations

import re
from collections import OrderedDict
from collections.abc import Iterable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Chapter, ChapterMemory, DocumentChunk, ProjectStoryMemory

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


class ContextRetrievalService:
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
            "metadata": {
                "source": source,
                "requested_limit": limit,
                "returned_chunk_count": min(len(ranked_chunks), max(limit, 1)),
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
