from __future__ import annotations

import re
from collections import OrderedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Chapter, Character, DocumentChunk, ProjectCharacter

_SCENE_BREAK_HINTS = ("场景", "转场", "与此同时", "另一边", "片刻后", "次日", "几个时辰后")
_TIME_HINTS = ("清晨", "早晨", "上午", "中午", "午后", "傍晚", "夜里", "深夜", "凌晨", "次日", "第二天", "第三天")
_EMOTION_HINTS = ("对峙", "冲突", "追逐", "发现", "坦白", "争执", "伏击", "调查", "谈判", "回忆", "告别", "决意")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[。！？!?；;])")


class ChapterChunkService:
    """Split chapter plain text into retrieval-friendly chunks."""

    async def refresh_for_chapter(self, db: AsyncSession, *, chapter_id: str) -> list[DocumentChunk]:
        result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
        chapter = result.scalar_one_or_none()
        if chapter is None:
            return []

        plain_text = (chapter.plain_text or "").strip()
        if not plain_text:
            await self._delete_chunks_for_chapter(db, chapter_id=chapter.id)
            return []

        character_names = await self._load_project_character_names(db, project_id=chapter.project_id)
        chunk_payloads = self._build_chunk_payloads(
            plain_text=plain_text,
            chapter_title=chapter.title,
            chapter_order=chapter.order_index,
            character_names=character_names,
        )

        existing_result = await db.execute(select(DocumentChunk).where(DocumentChunk.chapter_id == chapter.id))
        for item in existing_result.scalars().all():
            await db.delete(item)
        await db.flush()

        created_chunks: list[DocumentChunk] = []
        for payload in chunk_payloads:
            chunk = DocumentChunk(
                project_id=chapter.project_id,
                chapter_id=chapter.id,
                chapter_order=chapter.order_index,
                chunk_index=payload["chunk_index"],
                scene_label=payload["scene_label"],
                content=payload["content"],
                content_short=payload["content_short"],
                characters=payload["characters"],
                tags=payload["tags"],
                start_offset=payload["start_offset"],
                end_offset=payload["end_offset"],
            )
            db.add(chunk)
            created_chunks.append(chunk)

        await db.commit()
        for chunk in created_chunks:
            await db.refresh(chunk)
        return created_chunks

    async def _delete_chunks_for_chapter(self, db: AsyncSession, *, chapter_id: str) -> None:
        result = await db.execute(select(DocumentChunk).where(DocumentChunk.chapter_id == chapter_id))
        for item in result.scalars().all():
            await db.delete(item)
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
        return names[:40]

    def _build_chunk_payloads(
        self,
        *,
        plain_text: str,
        chapter_title: str,
        chapter_order: int,
        character_names: list[str],
    ) -> list[dict]:
        paragraphs = [item.strip() for item in plain_text.splitlines() if item.strip()]
        blocks = self._group_paragraphs(paragraphs)
        if not blocks:
            blocks = [plain_text]

        payloads: list[dict] = []
        search_offset = 0
        for block_index, block in enumerate(blocks):
            for piece in self._split_long_block(block):
                content = self._normalize_space(piece)
                if not content:
                    continue
                start_offset = plain_text.find(piece, search_offset)
                if start_offset < 0:
                    start_offset = plain_text.find(content[:20]) if len(content) >= 20 else None
                end_offset = (start_offset + len(piece)) if isinstance(start_offset, int) and start_offset >= 0 else None
                if isinstance(start_offset, int) and start_offset >= 0:
                    search_offset = start_offset + len(piece)

                payloads.append(
                    {
                        "chunk_index": len(payloads),
                        "scene_label": self._build_scene_label(
                            content=content,
                            chapter_title=chapter_title,
                            block_index=block_index,
                            chapter_order=chapter_order,
                        ),
                        "content": content,
                        "content_short": self._clip_text(content, limit=180),
                        "characters": self._extract_characters(content, character_names),
                        "tags": self._extract_tags(content),
                        "start_offset": start_offset if isinstance(start_offset, int) and start_offset >= 0 else None,
                        "end_offset": end_offset,
                    }
                )
        return payloads[:24]

    def _group_paragraphs(self, paragraphs: list[str]) -> list[str]:
        blocks: list[str] = []
        current: list[str] = []
        current_length = 0

        for paragraph in paragraphs:
            paragraph_length = len(paragraph)
            should_break = (
                current
                and (
                    current_length + paragraph_length > 900
                    or self._contains_hint(paragraph, _SCENE_BREAK_HINTS)
                )
            )
            if should_break:
                blocks.append("\n".join(current))
                current = [paragraph]
                current_length = paragraph_length
                continue
            current.append(paragraph)
            current_length += paragraph_length

        if current:
            blocks.append("\n".join(current))
        return blocks

    def _split_long_block(self, block: str) -> list[str]:
        normalized = block.strip()
        if len(normalized) <= 900:
            return [normalized]

        sentences = [item.strip() for item in _SENTENCE_SPLIT_RE.split(normalized) if item.strip()]
        if not sentences:
            return [normalized]

        parts: list[str] = []
        current: list[str] = []
        current_length = 0
        for sentence in sentences:
            sentence_length = len(sentence)
            if current and current_length + sentence_length > 700:
                parts.append("".join(current))
                current = [sentence]
                current_length = sentence_length
                continue
            current.append(sentence)
            current_length += sentence_length
        if current:
            parts.append("".join(current))
        return parts

    def _build_scene_label(self, *, content: str, chapter_title: str, block_index: int, chapter_order: int) -> str:
        time_label = next((item for item in _TIME_HINTS if item in content), None)
        action_label = next((item for item in _EMOTION_HINTS if item in content), None)
        label_parts = [f"第{chapter_order}章", chapter_title or f"chunk-{block_index + 1}"]
        if time_label:
            label_parts.append(time_label)
        if action_label:
            label_parts.append(action_label)
        return " / ".join(label_parts[:3])

    def _extract_characters(self, content: str, character_names: list[str]) -> list[str]:
        matches: list[str] = []
        for name in character_names:
            if name in content and name not in matches:
                matches.append(name)
        return matches[:6]

    def _extract_tags(self, content: str) -> list[str]:
        tags = OrderedDict()
        for hint in _TIME_HINTS:
            if hint in content:
                tags[f"time:{hint}"] = True
        for hint in _EMOTION_HINTS:
            if hint in content:
                tags[f"event:{hint}"] = True
        if "？" in content or "?" in content:
            tags["question"] = True
        if "秘密" in content or "真相" in content:
            tags["reveal"] = True
        if "计划" in content or "决定" in content:
            tags["decision"] = True
        return list(tags.keys())[:8]

    def _contains_hint(self, text: str, hints: tuple[str, ...]) -> bool:
        return any(hint in text for hint in hints)

    def _normalize_space(self, value: str) -> str:
        return re.sub(r"\s+", " ", value).strip()

    def _clip_text(self, value: str | None, *, limit: int) -> str | None:
        if value is None:
            return None
        normalized = self._normalize_space(value)
        if not normalized:
            return None
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[:limit].rstrip()}..."


chapter_chunk_service = ChapterChunkService()
