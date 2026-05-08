from __future__ import annotations

import re
from collections import OrderedDict

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import (
    Chapter,
    ChapterMemory,
    Character,
    ProjectCharacter,
    StoryEntity,
    StoryEvent,
    StoryOpenLoop,
    StoryRelation,
)

_GENERIC_EVENT_TITLE_RE = re.compile(r"^(事件\d+|.+-event-\d+)$")
_CHARACTER_ROLE_HINTS = ("主角", "配角", "反派", "关键", "重要", "主视角")
_OBJECT_HINTS = ("剑", "刀", "枪", "匙", "印", "盒", "令", "符", "药", "卷", "册", "佩", "簪", "珠")
_LOCATION_HINTS = ("楼", "阁", "堂", "殿", "宫", "寺", "城", "街", "巷", "桥", "坊", "院", "门", "栈", "铺")
_DISCOVERY_HINTS = ("发现", "看到", "听见", "得知", "认出", "察觉", "意识到")
_CONFLICT_HINTS = ("交手", "冲突", "争执", "逼问", "对峙", "追击", "拦下")
_DECISION_HINTS = ("决定", "安排", "计划", "答应", "转身", "动身", "前往")
_INVESTIGATION_TAGS = ("调查", "线索", "追查", "试探", "疑点", "暗线", "命案", "货栈", "后堂")
_RELATION_CANONICAL_MAP = {
    "和解": "缓和",
    "合作": "协作",
    "联手": "协作",
    "信任": "信任提升",
    "保护": "保护",
    "怀疑": "怀疑",
    "敌对": "敌对",
    "争执": "冲突",
    "背叛": "背离",
    "告白": "情感推进",
}


class StoryGraphService:
    """Phase 2 story graph rebuild service."""

    async def refresh_for_project(self, db: AsyncSession, *, project_id: str) -> dict[str, int]:
        chapter_result = await db.execute(
            select(ChapterMemory, Chapter)
            .join(Chapter, Chapter.id == ChapterMemory.chapter_id)
            .where(ChapterMemory.project_id == project_id)
            .order_by(Chapter.order_index)
        )
        rows = chapter_result.all()
        if not rows:
            await self._delete_existing(db, project_id=project_id)
            await db.commit()
            return {"entities": 0, "events": 0, "relations": 0, "open_loops": 0}

        character_profiles = await self._load_character_profiles(db, project_id=project_id)
        await self._delete_existing(db, project_id=project_id)

        entities = self._build_entities(rows, character_profiles=character_profiles)
        entity_names = [item.canonical_name for item in entities]
        events = self._build_events(project_id, rows, known_entity_names=entity_names)
        relations = self._build_relations(
            project_id,
            rows,
            known_entity_names=entity_names,
            character_profiles=character_profiles,
        )
        open_loops = self._build_open_loops(project_id, rows, known_entity_names=entity_names)

        for item in entities:
            db.add(item)
        for item in events:
            db.add(item)
        for item in relations:
            db.add(item)
        for item in open_loops:
            db.add(item)

        await db.commit()
        return {
            "entities": len(entities),
            "events": len(events),
            "relations": len(relations),
            "open_loops": len(open_loops),
        }

    async def _load_character_profiles(self, db: AsyncSession, *, project_id: str) -> list[dict]:
        result = await db.execute(
            select(ProjectCharacter, Character)
            .join(Character, Character.id == ProjectCharacter.character_id)
            .where(ProjectCharacter.project_id == project_id)
            .order_by(ProjectCharacter.sort_order, Character.name)
        )
        profiles: list[dict] = []
        for project_character, character in result.all():
            aliases = self._split_aliases(character.alias)
            description = self._compact_join(
                [
                    project_character.summary,
                    character.description,
                    character.personality,
                    character.background,
                ],
                limit=240,
            )
            tags = self._merge_lists(
                [project_character.role_label or ""],
                self._split_tags(character.tags),
            )
            profiles.append(
                {
                    "name": character.name,
                    "aliases": aliases,
                    "description": description,
                    "tags": tags[:8],
                    "role_label": self._safe_text(project_character.role_label),
                    "relationship_notes": self._safe_text(character.relationship_notes),
                }
            )
        return profiles

    async def _delete_existing(self, db: AsyncSession, *, project_id: str) -> None:
        await db.execute(delete(StoryRelation).where(StoryRelation.project_id == project_id))
        await db.execute(delete(StoryEvent).where(StoryEvent.project_id == project_id))
        await db.execute(delete(StoryOpenLoop).where(StoryOpenLoop.project_id == project_id))
        await db.execute(delete(StoryEntity).where(StoryEntity.project_id == project_id))
        await db.flush()

    def _build_entities(
        self,
        rows: list[tuple[ChapterMemory, Chapter]],
        *,
        character_profiles: list[dict],
    ) -> list[StoryEntity]:
        merged: OrderedDict[str, dict] = OrderedDict()

        for profile in character_profiles:
            name = self._safe_text(profile.get("name"))
            if not name:
                continue
            merged[name] = {
                "entity_type": "character",
                "canonical_name": name,
                "aliases": profile.get("aliases") or [],
                "description": self._safe_text(profile.get("description")) or "",
                "tags": profile.get("tags") or [],
                "first_seen_chapter_id": None,
                "last_seen_chapter_id": None,
                "first_seen_chapter_order": 0,
                "last_seen_chapter_order": 0,
                "mention_count": 0,
            }

        for memory, chapter in rows:
            for name in self._collect_entity_names(memory):
                payload = merged.get(name)
                if payload is None:
                    payload = {
                        "entity_type": self._infer_entity_type(name),
                        "canonical_name": name,
                        "aliases": [],
                        "description": "",
                        "tags": [],
                        "first_seen_chapter_id": chapter.id,
                        "last_seen_chapter_id": chapter.id,
                        "first_seen_chapter_order": chapter.order_index,
                        "last_seen_chapter_order": chapter.order_index,
                        "mention_count": 1,
                    }
                    merged[name] = payload
                else:
                    if payload["first_seen_chapter_id"] is None:
                        payload["first_seen_chapter_id"] = chapter.id
                        payload["first_seen_chapter_order"] = chapter.order_index
                    payload["last_seen_chapter_id"] = chapter.id
                    payload["last_seen_chapter_order"] = chapter.order_index
                    payload["mention_count"] += 1

            for item in memory.character_state_changes:
                name = self._safe_text(item.get("character_id_or_name"))
                after = self._safe_text(item.get("after") or item.get("reason"))
                if name and after and name in merged:
                    merged[name]["description"] = self._prefer_longer_text(merged[name]["description"], after)
                    merged[name]["tags"] = self._merge_lists(
                        merged[name]["tags"],
                        self._extract_tags(after),
                    )

            for item in memory.important_objects:
                name = self._safe_text(item.get("name"))
                state = self._safe_text(item.get("state"))
                owner = self._safe_text(item.get("owner"))
                if not name:
                    continue
                payload = merged.get(name)
                if payload is None:
                    payload = {
                        "entity_type": "object",
                        "canonical_name": name,
                        "aliases": [],
                        "description": state or "",
                        "tags": [owner] if owner else [],
                        "first_seen_chapter_id": chapter.id,
                        "last_seen_chapter_id": chapter.id,
                        "first_seen_chapter_order": chapter.order_index,
                        "last_seen_chapter_order": chapter.order_index,
                        "mention_count": 1,
                    }
                    merged[name] = payload
                    continue
                if payload["first_seen_chapter_id"] is None:
                    payload["first_seen_chapter_id"] = chapter.id
                    payload["first_seen_chapter_order"] = chapter.order_index
                payload["last_seen_chapter_id"] = chapter.id
                payload["last_seen_chapter_order"] = chapter.order_index
                payload["mention_count"] += 1
                payload["description"] = self._prefer_longer_text(payload["description"], state)
                payload["tags"] = self._merge_lists(payload["tags"], [owner] if owner else [])

        normalized: list[StoryEntity] = []
        for payload in merged.values():
            if payload["first_seen_chapter_id"] is None:
                payload["first_seen_chapter_id"] = rows[0][1].id
                payload["last_seen_chapter_id"] = rows[-1][1].id
                payload["first_seen_chapter_order"] = rows[0][1].order_index
                payload["last_seen_chapter_order"] = rows[-1][1].order_index
            normalized.append(StoryEntity(project_id=rows[0][1].project_id, **payload))
        return normalized

    def _build_events(
        self,
        project_id: str,
        rows: list[tuple[ChapterMemory, Chapter]],
        *,
        known_entity_names: list[str],
    ) -> list[StoryEvent]:
        events: list[StoryEvent] = []
        for memory, chapter in rows:
            for index, item in enumerate(memory.key_events):
                summary = self._safe_text(item.get("summary"))
                location = self._safe_text(item.get("location"))
                participants = self._normalize_names(
                    [
                        *self._normalize_string_list(item.get("actors")),
                        *self._find_known_entities(summary or "", known_entity_names=known_entity_names),
                    ]
                )[:6]
                raw_title = self._safe_text(item.get("title"))
                title = self._normalize_event_title(
                    raw_title=raw_title,
                    summary=summary,
                    participants=participants,
                    location=location,
                    fallback=f"{chapter.title}-事件{index + 1}",
                )
                detail_text = self._compact_join([summary, location, item.get("impact")], limit=220)
                events.append(
                    StoryEvent(
                        project_id=project_id,
                        chapter_id=chapter.id,
                        chapter_order=chapter.order_index,
                        title=title,
                        summary=detail_text or summary,
                        event_type=self._infer_event_type(detail_text or title),
                        location=location,
                        participants=participants,
                        tags=self._extract_tags(detail_text or title)[:6],
                    )
                )
        return events

    def _build_relations(
        self,
        project_id: str,
        rows: list[tuple[ChapterMemory, Chapter]],
        *,
        known_entity_names: list[str],
        character_profiles: list[dict],
    ) -> list[StoryRelation]:
        relations: list[StoryRelation] = []
        seen: set[tuple[str, str, str, int]] = set()

        for item in self._build_profile_relations(
            project_id=project_id,
            character_profiles=character_profiles,
            known_entity_names=known_entity_names,
        ):
            marker = (item.source_entity_name, item.target_entity_name, item.relation_type, item.chapter_order)
            if marker in seen:
                continue
            seen.add(marker)
            relations.append(item)

        for memory, chapter in rows:
            for item in memory.relationship_changes:
                status_after = self._safe_text(item.get("status_after"))
                source = self._safe_text(item.get("entity_a"))
                target = self._safe_text(item.get("entity_b"))
                relation_type = self._normalize_relation_type(item.get("change"), context=status_after)
                if (not source or not target) and status_after:
                    inferred = self._find_known_entities(status_after, known_entity_names=known_entity_names)
                    if len(inferred) >= 2:
                        source = source or inferred[0]
                        target = target or inferred[1]
                if not source or not target or not relation_type or source == target:
                    continue
                marker = (source, target, relation_type, chapter.order_index)
                if marker in seen:
                    continue
                seen.add(marker)
                relations.append(
                    StoryRelation(
                        project_id=project_id,
                        source_entity_name=source,
                        target_entity_name=target,
                        relation_type=relation_type,
                        status_after=status_after,
                        chapter_id=chapter.id,
                        chapter_order=chapter.order_index,
                    )
                )
        return relations

    def _build_profile_relations(
        self,
        *,
        project_id: str,
        character_profiles: list[dict],
        known_entity_names: list[str],
    ) -> list[StoryRelation]:
        relations: list[StoryRelation] = []
        for profile in character_profiles:
            source = self._safe_text(profile.get("name"))
            notes = self._safe_text(profile.get("relationship_notes"))
            if not source or not notes:
                continue
            for sentence in self._split_relation_notes(notes):
                targets = [name for name in self._find_known_entities(sentence, known_entity_names=known_entity_names) if name != source]
                relation_type = self._normalize_relation_type(None, context=sentence)
                if not relation_type:
                    relation_type = self._infer_profile_relation_type(sentence)
                if not relation_type or not targets:
                    continue
                for target in targets[:2]:
                    relations.append(
                        StoryRelation(
                            project_id=project_id,
                            source_entity_name=source,
                            target_entity_name=target,
                            relation_type=relation_type,
                            status_after=self._clip_text(sentence, limit=180),
                            chapter_id=None,
                            chapter_order=0,
                        )
                    )
        return relations

    def _split_relation_notes(self, value: str) -> list[str]:
        parts = [item.strip() for item in re.split(r"[；;。]", value) if item.strip()]
        return parts[:6]

    def _build_open_loops(
        self,
        project_id: str,
        rows: list[tuple[ChapterMemory, Chapter]],
        *,
        known_entity_names: list[str],
    ) -> list[StoryOpenLoop]:
        merged: OrderedDict[str, dict] = OrderedDict()
        resolved_labels = {
            self._normalize_label(item.get("label"))
            for memory, _chapter in rows
            for item in memory.resolved_loops
            if isinstance(item, dict)
        }
        for memory, chapter in rows:
            for item in memory.open_loops:
                label = self._safe_text(item.get("label")) or self._safe_text(item.get("description"))
                description = self._safe_text(item.get("description")) or label
                if not label or not description:
                    continue
                marker = self._normalize_label(label)
                related_entities = self._extract_related_entities(item, known_entity_names=known_entity_names)
                payload = merged.get(marker)
                if payload is None:
                    payload = {
                        "label": self._normalize_open_loop_label(label, description=description),
                        "description": description,
                        "priority": self._safe_text(item.get("priority")) or self._infer_loop_priority(description),
                        "status": "resolved" if marker in resolved_labels else "open",
                        "related_entities": related_entities,
                        "first_seen_chapter_id": chapter.id,
                        "last_seen_chapter_id": chapter.id,
                        "first_seen_chapter_order": chapter.order_index,
                        "last_seen_chapter_order": chapter.order_index,
                        "mention_count": 1,
                    }
                    merged[marker] = payload
                    continue
                payload["last_seen_chapter_id"] = chapter.id
                payload["last_seen_chapter_order"] = chapter.order_index
                payload["mention_count"] += 1
                payload["status"] = "resolved" if marker in resolved_labels else payload["status"]
                payload["related_entities"] = self._merge_lists(payload["related_entities"], related_entities)
                payload["description"] = self._prefer_longer_text(payload["description"], description)
                payload["priority"] = self._prefer_loop_priority(payload["priority"], self._infer_loop_priority(description))

        return [StoryOpenLoop(project_id=project_id, **payload) for payload in merged.values()]

    def _collect_entity_names(self, memory: ChapterMemory) -> list[str]:
        values: list[str] = []
        for item in memory.character_state_changes:
            name = self._safe_text(item.get("character_id_or_name"))
            if name:
                values.append(name)
        for item in memory.relationship_changes:
            for key in ("entity_a", "entity_b"):
                name = self._safe_text(item.get(key))
                if name:
                    values.append(name)
        for item in memory.important_objects:
            name = self._safe_text(item.get("name"))
            if name:
                values.append(name)
        for item in memory.knowledge_state_changes:
            name = self._safe_text(item.get("subject"))
            if name:
                values.append(name)
        deduped = OrderedDict()
        for value in values:
            deduped[value] = None
        return list(deduped.keys())[:80]

    def _extract_related_entities(self, item: dict, *, known_entity_names: list[str]) -> list[str]:
        text = " ".join(
            value.strip()
            for value in (self._safe_text(item.get("label")), self._safe_text(item.get("description")))
            if value
        )
        matches = self._find_known_entities(text, known_entity_names=known_entity_names)
        if matches:
            return matches[:4]
        text_matches = re.findall(r"[\u4e00-\u9fff]{2,6}", text)
        return self._merge_lists([], text_matches[:4])

    def _find_known_entities(self, text: str, *, known_entity_names: list[str]) -> list[str]:
        matches: list[str] = []
        for name in known_entity_names:
            if name and name in text and name not in matches:
                matches.append(name)
        return matches[:6]

    def _merge_lists(self, left: list[str], right: list[str]) -> list[str]:
        merged = OrderedDict()
        for value in [*left, *right]:
            cleaned = self._safe_text(value)
            if cleaned:
                merged[cleaned] = None
        return list(merged.keys())[:8]

    def _normalize_names(self, values: list[str]) -> list[str]:
        deduped = OrderedDict()
        for value in values:
            cleaned = self._safe_text(value)
            if cleaned:
                deduped[cleaned] = None
        return list(deduped.keys())

    def _normalize_event_title(
        self,
        *,
        raw_title: str | None,
        summary: str | None,
        participants: list[str],
        location: str | None,
        fallback: str,
    ) -> str:
        if raw_title and not _GENERIC_EVENT_TITLE_RE.fullmatch(raw_title):
            return raw_title
        if summary:
            action = self._extract_action_phrase(summary)
            if participants:
                return f"{participants[0]}{action}"
            if location:
                return f"{location}{action}"
            return action
        if participants:
            return f"{participants[0]}推进线索"
        return fallback

    def _extract_action_phrase(self, text: str) -> str:
        cleaned = re.sub(r"\s+", "", text)
        if not cleaned:
            return "推进情节"
        snippet = cleaned[:20]
        for keyword in (*_DISCOVERY_HINTS, *_CONFLICT_HINTS, *_DECISION_HINTS):
            if keyword in cleaned:
                index = cleaned.find(keyword)
                start = max(0, index - 4)
                end = min(len(cleaned), index + len(keyword) + 8)
                return cleaned[start:end]
        return snippet

    def _normalize_relation_type(self, value: object, *, context: str | None) -> str | None:
        text = self._safe_text(value)
        if text:
            for keyword, canonical in _RELATION_CANONICAL_MAP.items():
                if keyword in text:
                    return canonical
            return text[:40]
        if context:
            for keyword, canonical in _RELATION_CANONICAL_MAP.items():
                if keyword in context:
                    return canonical
        return None

    def _infer_profile_relation_type(self, text: str) -> str | None:
        if any(token in text for token in ("欢喜冤家", "误会", "无奈纠缠")):
            return "冲突"
        if any(token in text for token in ("包容", "安抚", "照顾", "收拾烂摊子", "打动")):
            return "信任提升"
        if any(token in text for token in ("赏识", "欣赏", "敬重", "敬畏")):
            return "敬重"
        if any(token in text for token in ("交易", "博弈", "幕后黑手", "冲突")):
            return "敌对"
        return None

    def _normalize_open_loop_label(self, label: str, *, description: str) -> str:
        cleaned = self._safe_text(label) or description
        if cleaned.endswith(("。", "！", "？", ".", "!", "?")):
            cleaned = cleaned[:-1].strip()
        if len(cleaned) <= 28:
            return cleaned
        entity_matches = re.findall(r"[\u4e00-\u9fff]{2,6}", cleaned)
        if entity_matches:
            return f"{entity_matches[0]}相关疑点"
        return (description[:28]).rstrip()

    def _infer_loop_priority(self, text: str | None) -> str:
        cleaned = self._safe_text(text) or ""
        if any(token in cleaned for token in ("必须", "立刻", "今晚", "命案", "追上", "真相")):
            return "high"
        if any(token in cleaned for token in ("能否", "为何", "是否", "去向", "线索")):
            return "medium"
        return "low"

    def _prefer_loop_priority(self, left: str, right: str) -> str:
        order = {"low": 0, "medium": 1, "high": 2}
        return left if order.get(left, 0) >= order.get(right, 0) else right

    def _infer_entity_type(self, name: str) -> str:
        if any(token in name for token in _OBJECT_HINTS):
            return "object"
        if any(token in name for token in _LOCATION_HINTS):
            return "location"
        return "character"

    def _infer_event_type(self, text: str) -> str:
        if any(token in text for token in _DISCOVERY_HINTS):
            return "discovery"
        if any(token in text for token in _CONFLICT_HINTS):
            return "conflict"
        if any(token in text for token in _DECISION_HINTS):
            return "decision"
        return "scene"

    def _extract_tags(self, text: str) -> list[str]:
        tags = []
        for token in _INVESTIGATION_TAGS:
            if token in text and token not in tags:
                tags.append(token)
        return tags

    def _split_aliases(self, value: object) -> list[str]:
        if not isinstance(value, str):
            return []
        aliases: list[str] = []
        for piece in re.split(r"[，、/,|；;\s]+", value):
            cleaned = piece.strip()
            if cleaned and cleaned not in aliases:
                aliases.append(cleaned)
        return aliases[:8]

    def _split_tags(self, value: object) -> list[str]:
        if not isinstance(value, str):
            return []
        tags: list[str] = []
        for piece in re.split(r"[，、,|；;\s]+", value):
            cleaned = piece.strip()
            if cleaned and cleaned not in tags:
                tags.append(cleaned)
        return tags[:8]

    def _normalize_string_list(self, value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        normalized: list[str] = []
        for item in value:
            cleaned = self._safe_text(item)
            if cleaned and cleaned not in normalized:
                normalized.append(cleaned)
        return normalized

    def _compact_join(self, values: list[object], *, limit: int) -> str | None:
        cleaned_values = [self._safe_text(value) for value in values]
        joined = "；".join(item for item in cleaned_values if item)
        if not joined:
            return None
        if len(joined) <= limit:
            return joined
        return joined[:limit].rstrip()

    def _prefer_longer_text(self, left: str | None, right: str | None) -> str:
        left_clean = self._safe_text(left) or ""
        right_clean = self._safe_text(right) or ""
        return right_clean if len(right_clean) > len(left_clean) else left_clean

    def _clip_text(self, value: str | None, *, limit: int) -> str | None:
        cleaned = self._safe_text(value)
        if not cleaned:
            return None
        if len(cleaned) <= limit:
            return cleaned
        return cleaned[:limit].rstrip()

    def _normalize_label(self, value: object) -> str:
        if not isinstance(value, str):
            return ""
        return " ".join(value.split()).strip().lower()

    def _safe_text(self, value: object) -> str | None:
        if not isinstance(value, str):
            return None
        cleaned = " ".join(value.split()).strip()
        return cleaned or None


story_graph_service = StoryGraphService()
