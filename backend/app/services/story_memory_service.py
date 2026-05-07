from __future__ import annotations

from collections import OrderedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Chapter, ChapterMemory, MemoryEvidenceLink, ProjectStoryMemory


class StoryMemoryService:
    """Phase 1 project-level memory aggregation."""

    async def refresh_for_project(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        updated_from_chapter_id: str | None = None,
    ) -> ProjectStoryMemory | None:
        result = await db.execute(
            select(ChapterMemory, Chapter)
            .join(Chapter, Chapter.id == ChapterMemory.chapter_id)
            .where(ChapterMemory.project_id == project_id)
            .order_by(Chapter.order_index)
        )
        rows = result.all()
        if not rows:
            await self._delete_story_memory_if_exists(db, project_id=project_id)
            return None

        chapter_memories = [row[0] for row in rows]
        chapter_index_map = {row[0].chapter_id: row[1].order_index for row in rows}
        payload = self._build_story_payload(chapter_memories, chapter_index_map=chapter_index_map)

        current = await db.execute(
            select(ProjectStoryMemory).where(ProjectStoryMemory.project_id == project_id)
        )
        story_memory = current.scalar_one_or_none()
        if story_memory is None:
            story_memory = ProjectStoryMemory(project_id=project_id)
            db.add(story_memory)

        story_memory.global_plot_summary = payload["global_plot_summary"]
        story_memory.active_conflicts = payload["active_conflicts"]
        story_memory.resolved_conflicts = payload["resolved_conflicts"]
        story_memory.character_arcs = payload["character_arcs"]
        story_memory.global_open_loops = payload["global_open_loops"]
        story_memory.timeline_constraints = payload["timeline_constraints"]
        story_memory.world_rules_active = payload["world_rules_active"]
        story_memory.updated_from_chapter_id = updated_from_chapter_id

        await db.flush()
        await self._replace_evidence_links(
            db,
            memory_owner_id=story_memory.id,
            chapter_memories=chapter_memories,
            summary=payload["global_plot_summary"],
        )
        await db.commit()
        await db.refresh(story_memory)
        return story_memory

    async def _delete_story_memory_if_exists(self, db: AsyncSession, *, project_id: str) -> None:
        result = await db.execute(
            select(ProjectStoryMemory).where(ProjectStoryMemory.project_id == project_id)
        )
        story_memory = result.scalar_one_or_none()
        if story_memory is None:
            return

        evidence = await db.execute(
            select(MemoryEvidenceLink).where(
                MemoryEvidenceLink.memory_kind == "project_story_memory",
                MemoryEvidenceLink.memory_owner_id == story_memory.id,
            )
        )
        for item in evidence.scalars().all():
            await db.delete(item)
        await db.delete(story_memory)
        await db.commit()

    def _build_story_payload(
        self,
        chapter_memories: list[ChapterMemory],
        *,
        chapter_index_map: dict[str, int],
    ) -> dict:
        recent = chapter_memories[-5:]
        summary_parts = [item.summary_short or item.summary_long for item in recent if item.summary_short or item.summary_long]
        global_plot_summary = self._compose_plot_summary(summary_parts)

        global_open_loops = self._merge_open_loops(chapter_memories, chapter_index_map=chapter_index_map)
        active_conflicts = [item for item in global_open_loops if item.get("status") != "resolved"][:12]
        resolved_conflicts = self._merge_resolved_loops(chapter_memories, chapter_index_map=chapter_index_map)
        character_arcs = self._merge_character_arcs(chapter_memories, chapter_index_map=chapter_index_map)
        timeline_constraints = self._merge_timeline_constraints(chapter_memories, chapter_index_map=chapter_index_map)
        world_rules_active = self._merge_world_rules(chapter_memories)

        return {
            "global_plot_summary": global_plot_summary,
            "active_conflicts": active_conflicts,
            "resolved_conflicts": resolved_conflicts,
            "character_arcs": character_arcs,
            "global_open_loops": global_open_loops,
            "timeline_constraints": timeline_constraints,
            "world_rules_active": world_rules_active,
        }

    def _compose_plot_summary(self, summary_parts: list[str]) -> str | None:
        if not summary_parts:
            return None
        ordered: list[str] = []
        for part in summary_parts:
            cleaned = self._clip_text(part, limit=160)
            if cleaned and cleaned not in ordered:
                ordered.append(cleaned)
        combined = " ".join(ordered)
        return self._clip_text(combined, limit=800)

    def _merge_open_loops(
        self,
        chapter_memories: list[ChapterMemory],
        *,
        chapter_index_map: dict[str, int],
    ) -> list[dict]:
        merged: OrderedDict[str, dict] = OrderedDict()
        resolved_markers = {
            self._normalize_loop_label(item.get("label"))
            for memory in chapter_memories
            for item in memory.resolved_loops
            if isinstance(item, dict)
        }
        for memory in chapter_memories:
            chapter_order = chapter_index_map.get(memory.chapter_id, 0)
            for item in memory.open_loops:
                marker = self._normalize_loop_label(item.get("label") or item.get("description"))
                if not marker:
                    continue
                current = merged.get(marker)
                payload = {
                    "label": item.get("label") or marker,
                    "description": item.get("description") or item.get("label") or marker,
                    "priority": item.get("priority") or "medium",
                    "first_seen_chapter_order": chapter_order if current is None else current["first_seen_chapter_order"],
                    "last_seen_chapter_order": chapter_order,
                    "mention_count": 1 if current is None else current["mention_count"] + 1,
                    "status": "resolved" if marker in resolved_markers else "open",
                }
                merged[marker] = payload
        return list(merged.values())[:20]

    def _merge_resolved_loops(
        self,
        chapter_memories: list[ChapterMemory],
        *,
        chapter_index_map: dict[str, int],
    ) -> list[dict]:
        resolved: OrderedDict[str, dict] = OrderedDict()
        for memory in chapter_memories[-8:]:
            chapter_order = chapter_index_map.get(memory.chapter_id, 0)
            for item in memory.resolved_loops:
                marker = self._normalize_loop_label(item.get("label") or item.get("resolution"))
                if not marker:
                    continue
                resolved[marker] = {
                    "label": item.get("label") or marker,
                    "resolution": item.get("resolution") or item.get("label") or marker,
                    "resolved_in_chapter_order": chapter_order,
                }
        return list(resolved.values())[:12]

    def _merge_character_arcs(
        self,
        chapter_memories: list[ChapterMemory],
        *,
        chapter_index_map: dict[str, int],
    ) -> list[dict]:
        arcs: dict[str, dict] = {}
        for memory in chapter_memories[-8:]:
            chapter_order = chapter_index_map.get(memory.chapter_id, 0)
            for item in memory.character_state_changes:
                name = (
                    item.get("character_id_or_name")
                    or item.get("character")
                    or item.get("name")
                )
                if not isinstance(name, str) or not name.strip():
                    continue
                current = arcs.get(name)
                before = item.get("before") or (current.get("latest_state") if current else "未明示")
                after = item.get("after") or item.get("reason") or "状态推进"
                reason = item.get("reason") or ""
                if current is None:
                    arcs[name] = {
                        "character": name,
                        "arc_start": before,
                        "latest_state": after,
                        "latest_reason": reason,
                        "last_updated_chapter_order": chapter_order,
                        "progression": [self._clip_text(after, limit=60)],
                    }
                    continue
                current["latest_state"] = after
                current["latest_reason"] = reason
                current["last_updated_chapter_order"] = chapter_order
                step = self._clip_text(after, limit=60)
                if step and step not in current["progression"]:
                    current["progression"].append(step)

        results: list[dict] = []
        for item in arcs.values():
            results.append(
                {
                    "character": item["character"],
                    "arc_start": item["arc_start"],
                    "latest_state": item["latest_state"],
                    "latest_reason": item["latest_reason"],
                    "last_updated_chapter_order": item["last_updated_chapter_order"],
                    "progression": item["progression"][:4],
                }
            )
        results.sort(key=lambda item: item["last_updated_chapter_order"], reverse=True)
        return results[:12]

    def _merge_timeline_constraints(
        self,
        chapter_memories: list[ChapterMemory],
        *,
        chapter_index_map: dict[str, int],
    ) -> list[dict]:
        constraints: OrderedDict[str, dict] = OrderedDict()
        for memory in chapter_memories[-8:]:
            chapter_order = chapter_index_map.get(memory.chapter_id, 0)
            for item in memory.timeline_markers:
                time = self._safe_text(item.get("time")) or "未明示"
                location = self._safe_text(item.get("location")) or "未明示"
                scene = self._safe_text(item.get("scene")) or ""
                marker = f"{time}|{location}|{scene}"
                constraints[marker] = {
                    "time": time,
                    "location": location,
                    "scene": scene,
                    "chapter_order": chapter_order,
                }
        values = list(constraints.values())
        values.sort(key=lambda item: item["chapter_order"], reverse=True)
        return values[:12]

    def _merge_world_rules(self, chapter_memories: list[ChapterMemory]) -> list[dict]:
        rules: OrderedDict[str, dict] = OrderedDict()
        for memory in chapter_memories[-8:]:
            for item in memory.knowledge_state_changes:
                visibility = self._safe_text(item.get("visibility")) or "private"
                fact = self._safe_text(item.get("learned_fact"))
                if visibility not in {"group", "public"} or not fact:
                    continue
                marker = fact
                rules[marker] = {
                    "rule": fact,
                    "visibility": visibility,
                    "subject": self._safe_text(item.get("subject")) or "未知主体",
                }
        return list(rules.values())[:10]

    async def _replace_evidence_links(
        self,
        db: AsyncSession,
        *,
        memory_owner_id: str,
        chapter_memories: list[ChapterMemory],
        summary: str | None,
    ) -> None:
        result = await db.execute(
            select(MemoryEvidenceLink).where(
                MemoryEvidenceLink.memory_kind == "project_story_memory",
                MemoryEvidenceLink.memory_owner_id == memory_owner_id,
            )
        )
        for item in result.scalars().all():
            await db.delete(item)

        recent = chapter_memories[-3:]
        for index, memory in enumerate(recent):
            excerpt = memory.summary_short or memory.summary_long or summary
            excerpt = self._clip_text(excerpt, limit=180)
            db.add(
                MemoryEvidenceLink(
                    memory_kind="project_story_memory",
                    memory_owner_id=memory_owner_id,
                    source_chapter_id=memory.chapter_id,
                    source_excerpt=excerpt,
                    source_offset_start=None,
                    source_offset_end=None,
                    confidence=max(0.45, 0.75 - index * 0.1),
                )
            )

    def _normalize_loop_label(self, value: object) -> str:
        if not isinstance(value, str):
            return ""
        return " ".join(value.split()).strip().lower()

    def _safe_text(self, value: object) -> str | None:
        if not isinstance(value, str):
            return None
        cleaned = " ".join(value.split()).strip()
        return cleaned or None

    def _clip_text(self, value: str | None, *, limit: int = 160) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            return None
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[:limit].rstrip()}..."


story_memory_service = StoryMemoryService()
