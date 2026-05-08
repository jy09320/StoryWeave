from __future__ import annotations

import argparse
import asyncio
import json
import re
from types import SimpleNamespace
from datetime import datetime
from pathlib import Path
from time import perf_counter
from typing import Any

from app.core.database import async_session
from app.services.ai_service import ai_service
from app.services.continuation_planner_service import continuation_planner_service
from app.services.continuation_pipeline_service import continuation_pipeline_service
from app.services.continuity_checker_service import continuity_checker_service

DEFAULT_DATASET = Path("/app/app/benchmarks/datasets/continuation/live.huaiyun.v1.json")
DEFAULT_REPORT_DIR = Path("/app/app/benchmarks/reports")
VARIANTS = {"baseline", "pipeline", "pipeline-debug"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run StoryWeave live continuation benchmarks inside the backend container.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument("--variant", action="append", dest="variants", choices=sorted(VARIANTS))
    parser.add_argument("--sample-id", action="append", dest="sample_ids")
    parser.add_argument("--no-write", action="store_true")
    return parser.parse_args()


def load_dataset(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise RuntimeError("Dataset root must be a JSON array")
    return payload


def build_payload(sample: dict[str, Any]) -> dict[str, Any]:
    request = sample["request"]
    live_request = sample.get("live_request") or {}
    return {
        "project_id": live_request.get("project_id") or f"snapshot:{sample['id']}",
        "chapter_id": live_request.get("chapter_id"),
        "owner_id": live_request.get("owner_id"),
        "text": request.get("text", ""),
        "instruction": request["instruction"],
        "model_provider": request.get("model_provider"),
        "model_id": request.get("model_id"),
        "temperature": float(request.get("temperature", 0.8)),
        "max_tokens": int(request.get("max_tokens", 2000)),
    }


def normalize_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split()).strip()


def extract_terms(value: str) -> set[str]:
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


def split_paragraphs(value: str) -> list[str]:
    paragraphs = [item.strip() for item in re.split(r"\n\s*\n+", value) if item.strip()]
    if paragraphs:
        return paragraphs
    sentences = [item.strip() for item in re.split(r"(?<=[。！？!?])", value) if item.strip()]
    if not sentences:
        return []
    return ["".join(sentences[:2]).strip(), "".join(sentences[2:4]).strip()]


def get_leading_excerpt(value: str, max_paragraphs: int = 2, max_chars: int = 240) -> str:
    paragraphs = split_paragraphs(value)
    excerpt = "\n\n".join(paragraphs[:max_paragraphs]).strip() if paragraphs else value.strip()
    return excerpt[:max_chars]


def extract_focus_tail(value: str, max_chars: int = 48) -> str:
    normalized = normalize_text(value)
    return normalized[-max_chars:] if normalized else ""


def pick_previous_tail(sample: dict[str, Any]) -> str:
    chapters = sample.get("project_snapshot", {}).get("chapters", [])
    for chapter in reversed(chapters):
        if isinstance(chapter, dict) and isinstance(chapter.get("tail_excerpt"), str) and chapter["tail_excerpt"].strip():
            return strip_reader_only_tail(chapter["tail_excerpt"])
    return ""


def strip_reader_only_tail(value: str) -> str:
    normalized = normalize_text(value)
    for marker in ("而她不知道的是", "她不知道的是", "而他不知道的是", "他不知道的是"):
        index = normalized.find(marker)
        if index > 0:
            return normalized[:index].rstrip()
    return normalized


def contains_dialogue_start(generated_text: str) -> bool:
    return contains_any(generated_text[:180], ("“", "\"", "说道", "开口", "低声", "声音", "终于开口"))


def continues_imminent_speech(anchor_text: str, generated_text: str) -> bool:
    anchor = normalize_text(anchor_text)
    leading = normalize_text(get_leading_excerpt(generated_text, max_paragraphs=2, max_chars=220))
    if not anchor or not leading:
        return False
    tension_ready = contains_any(anchor, ("盯着", "收紧", "攥", "拽住", "没催", "等她自己开口", "终于下定了决心"))
    speech_release = contains_any(
        leading,
        (
            "喉结动",
            "咽回去",
            "松开",
            "吸了口气",
            "沉默了",
            "顿了一下",
            "终于开口",
            "声音更低",
            "不是我不告诉你",
            "她的声音",
            "她开口",
            "他说",
            "她说",
        ),
    )
    return tension_ready and contains_dialogue_start(leading) and speech_release


def carries_same_beat(anchor_text: str, generated_text: str) -> bool:
    anchor = normalize_text(anchor_text)
    leading = normalize_text(get_leading_excerpt(generated_text, max_paragraphs=2, max_chars=220))
    if not anchor or not leading:
        return False
    anchor_state = contains_any(anchor, ("盯着", "收紧", "攥", "拽住", "旧画面", "终于下定了决心"))
    continued_state = contains_any(
        leading,
        ("纸角", "便签", "喉结", "别开脸", "动作很慢", "给她留出", "望着", "沉默", "声音更低"),
    )
    return anchor_state and continued_state


def continues_encounter_setup(anchor_text: str, generated_text: str) -> bool:
    anchor = normalize_text(anchor_text)
    leading = normalize_text(get_leading_excerpt(generated_text, max_paragraphs=2, max_chars=220))
    if not anchor or not leading:
        return False
    encounter_anchor = contains_any(anchor, ("看见", "从办公室出来", "阴影边上", "安全灯坏了", "忽明忽暗"))
    encounter_follow = contains_any(
        leading,
        ("反手带上门", "钥匙", "看见她", "还没走", "这么晚", "朝她走了两步", "半张脸", "坏掉的灯"),
    )
    return encounter_anchor and encounter_follow


def build_anchor_metrics(anchor_text: str, generated_text: str) -> dict[str, Any]:
    leading_excerpt = get_leading_excerpt(generated_text)
    anchor_terms = extract_terms(normalize_text(anchor_text))
    leading_terms = extract_terms(normalize_text(leading_excerpt))
    overlap = anchor_terms & leading_terms

    focus_terms = extract_terms(extract_focus_tail(anchor_text))
    focus_overlap = focus_terms & leading_terms

    anchor_ratio = round(len(overlap) / max(1, len(anchor_terms)), 3)
    focus_ratio = round(len(focus_overlap) / max(1, len(focus_terms)), 3)
    semantic_followed = (
        continues_imminent_speech(anchor_text, generated_text)
        or carries_same_beat(anchor_text, generated_text)
        or continues_encounter_setup(anchor_text, generated_text)
    )
    followed = (
        (len(overlap) >= 4 and anchor_ratio >= 0.08)
        or (len(focus_overlap) >= 2 and focus_ratio >= 0.12)
        or semantic_followed
    )

    return {
        "followed": followed,
        "overlap_count": len(overlap),
        "overlap_ratio": anchor_ratio,
        "focus_overlap_count": len(focus_overlap),
        "focus_overlap_ratio": focus_ratio,
        "leading_excerpt": leading_excerpt,
        "semantic_followed": semantic_followed,
    }


def phrase_match_metrics(phrase: str, generated_terms: set[str], generated_text: str) -> dict[str, Any]:
    normalized_phrase = normalize_text(phrase)
    phrase_terms = extract_terms(normalized_phrase)
    overlap = phrase_terms & generated_terms
    overlap_ratio = round(len(overlap) / max(1, len(phrase_terms)), 3)
    direct_hit = bool(normalized_phrase and len(normalized_phrase) >= 8 and normalized_phrase[:8] in generated_text)
    return {
        "overlap_count": len(overlap),
        "overlap_ratio": overlap_ratio,
        "direct_hit": direct_hit,
    }


def contains_any(value: str, phrases: tuple[str, ...]) -> bool:
    return any(phrase in value for phrase in phrases)


def matches_open_loop_phrase(phrase: str, generated_text: str, generated_terms: set[str]) -> bool:
    normalized = normalize_text(phrase)
    metrics = phrase_match_metrics(normalized, generated_terms, generated_text)
    if metrics["direct_hit"] or (metrics["overlap_count"] >= 2 and metrics["overlap_ratio"] >= 0.12):
        return True
    if "通向哪里" in normalized or "去哪里" in normalized:
        moved = contains_any(generated_text, ("往下", "往前", "转弯", "消失在", "绕过", "沿着", "摸下去"))
        place = contains_any(generated_text, ("坡底", "阴影里", "岩石", "乱石", "雪沟", "尽头"))
        return moved and place
    if "属于谁" in normalized or "由谁保管" in normalized or "谁保管" in normalized:
        return contains_any(generated_text, ("那个人", "经办人", "缩写", "编号", "原件", "归档", "档案编号"))
    if "为什么回避" in normalized or "为何回避" in normalized:
        return contains_any(generated_text, ("我以前试过", "不太愿意提", "别查了", "欠他一条命", "不告诉你名字"))
    if "到底是谁" in normalized or "异常资金" in normalized:
        return contains_any(generated_text, ("渠道", "统筹账户", "协调过了", "没有正面回答", "转开", "只说到这儿"))
    return False


def is_controlled_dialogue(generated_text: str) -> bool:
    return contains_any(generated_text, ("没有追问", "没有催", "没有逼问", "只是等", "只是看着", "只问了一句", "顺着问", "轻声"))


def is_observe_then_act(generated_text: str) -> bool:
    observe = contains_any(generated_text, ("没有立刻", "先看", "先观察", "打量", "侧耳", "停住", "屏住呼吸", "确认"))
    act = contains_any(generated_text, ("走近", "靠近", "迈步", "蹲下", "伸手", "继续往前"))
    return observe and act


def reveals_more_without_name(generated_text: str) -> bool:
    reveal_cues = contains_any(generated_text, ("不是不肯", "后来", "他说", "告诉他", "藏了", "原始编号", "不敢信", "给了之后"))
    naming_cues = contains_any(generated_text, ("保管人叫", "就是", "正是", "原来是"))
    return reveal_cues and not naming_cues


def preserves_pressure(generated_text: str) -> bool:
    pressure_cues = ("忽明忽暗", "阴影", "停住", "沉默", "顿了顿", "安静", "视线", "压低", "笑了笑", "没有立刻回答")
    return sum(1 for cue in pressure_cues if cue in generated_text) >= 2


def matches_imminent_speech_progress(phrase: str, generated_text: str) -> bool:
    normalized = normalize_text(phrase)
    if "即将开口" not in normalized and "直接承接" not in normalized:
        return False
    return contains_dialogue_start(generated_text) and contains_any(
        generated_text,
        ("喉结动", "咽回去", "松开", "终于开口", "声音更低", "她说", "不是我不告诉你"),
    )


def matches_soft_probe_exchange(phrase: str, generated_text: str) -> bool:
    normalized = normalize_text(phrase)
    if "旁敲侧击" in normalized:
        return "？" in generated_text and contains_any(generated_text, ("刚开完会", "对账", "渠道", "统筹账户", "审批", "资金", "赞助款"))
    if "回避" in normalized or "转移话题" in normalized:
        return contains_any(generated_text, ("算不上", "数字比台词难记", "不用担心审批", "已经协调过了", "不打算停留"))
    return False


def matches_include_phrase(phrase: str, generated_text: str, generated_terms: set[str]) -> bool:
    metrics = phrase_match_metrics(phrase, generated_terms, generated_text)
    normalized = normalize_text(phrase)
    if metrics["direct_hit"] or (metrics["overlap_count"] >= 2 and metrics["overlap_ratio"] >= 0.15):
        return True
    if "保持克制" in normalized:
        return is_controlled_dialogue(generated_text)
    if "先观察判断" in normalized:
        return is_observe_then_act(generated_text)
    if "透露更多信息" in normalized and "不点名" in normalized:
        return reveals_more_without_name(generated_text)
    if "试探张力" in normalized or "压迫感" in normalized:
        return preserves_pressure(generated_text)
    return False


def matches_soft_finance_loop(phrase: str, generated_text: str) -> bool:
    normalized = normalize_text(phrase)
    if "匿名资助人" in normalized or "异常资金" in normalized:
        return contains_any(generated_text, ("对账", "数字", "财务", "钥匙", "月底", "办公室", "统筹账户", "协调过了"))
    return False


def is_explicit_identity_link(normalized_phrase: str, generated_text: str) -> bool:
    names = re.findall(r"[\u4e00-\u9fff]{2,4}", normalized_phrase)
    identity_terms = ("身份", "资助人", "保管人", "幕后人", "匿名", "真凶", "内鬼")
    copula_terms = ("就是", "正是", "原来是", "果然是", "难道是", "是不是")
    if not contains_any(normalized_phrase, identity_terms):
        return False
    for name in names:
        if name in {"直接说出", "真实身份", "匿名资助", "资助人", "保管人"}:
            continue
        if name in generated_text:
            window_index = generated_text.find(name)
            window = generated_text[max(0, window_index - 24): window_index + 32]
            if contains_any(window, identity_terms) and contains_any(window, copula_terms):
                return True
    return False


def matches_avoid_phrase(phrase: str, generated_text: str, generated_terms: set[str]) -> bool:
    normalized = normalize_text(phrase)
    metrics = phrase_match_metrics(normalized, generated_terms, generated_text)
    if is_explicit_identity_link(normalized, generated_text):
        return True
    if "切到其他角色视角" in normalized:
        return contains_any(generated_text, ("与此同时", "另一边", "镜头转到", "他不知道的是", "她不知道的是"))
    if "直接揭示" in normalized or "直接揭晓" in normalized or "坦白真实身份" in normalized:
        return metrics["direct_hit"] or (metrics["overlap_count"] >= 6 and metrics["overlap_ratio"] >= 0.55)
    return metrics["direct_hit"] or (metrics["overlap_count"] >= 5 and metrics["overlap_ratio"] >= 0.5)


def build_open_loop_metrics(sample: dict[str, Any], generated_text: str, generated_terms: set[str]) -> dict[str, Any]:
    expectations = sample.get("expectations") or {}
    expected_open_loops = [
        normalize_text(item) for item in expectations.get("expected_open_loops", []) if isinstance(item, str)
    ]
    loop_details: list[dict[str, Any]] = []
    loop_hits = 0
    for item in expected_open_loops:
        metrics = phrase_match_metrics(item, generated_terms, generated_text)
        matched = matches_open_loop_phrase(item, generated_text, generated_terms) or matches_soft_finance_loop(item, generated_text)
        loop_hits += int(matched)
        loop_details.append({"phrase": item, **metrics, "matched": matched})

    suspense_cues = (
        "异样",
        "异动",
        "视线",
        "窥视",
        "盯着",
        "盯上",
        "跟踪",
        "危险",
        "冷意",
        "寒意",
        "发凉",
        "破空声",
        "脚步声",
        "太安静",
        "不对劲",
        "静悄悄",
    )
    suspense_hits = [cue for cue in suspense_cues if cue in generated_text]
    progressed = loop_hits > 0 or len(suspense_hits) >= 2
    return {
        "progressed": progressed,
        "loop_hits": loop_hits,
        "loop_details": loop_details,
        "suspense_hits": suspense_hits,
    }


def build_rule_score(sample: dict[str, Any], generated_text: str) -> dict[str, Any]:
    expectations = sample.get("expectations") or {}
    generated = normalize_text(generated_text)
    generated_terms = extract_terms(generated)
    must_avoid = [normalize_text(item) for item in expectations.get("must_avoid", []) if isinstance(item, str)]
    must_include = [normalize_text(item) for item in expectations.get("must_include", []) if isinstance(item, str)]

    include_hits = 0
    include_details: list[dict[str, Any]] = []
    for item in must_include:
        metrics = phrase_match_metrics(item, generated_terms, generated)
        matched = (
            matches_include_phrase(item, generated, generated_terms)
            or matches_imminent_speech_progress(item, generated)
            or matches_soft_probe_exchange(item, generated)
        )
        include_hits += int(matched)
        include_details.append({"phrase": item, **metrics, "matched": matched})

    avoid_hits = 0
    avoid_details: list[dict[str, Any]] = []
    for item in must_avoid:
        metrics = phrase_match_metrics(item, generated_terms, generated)
        matched = matches_avoid_phrase(item, generated, generated_terms)
        avoid_hits += int(matched)
        avoid_details.append({"phrase": item, **metrics, "matched": matched})
    leading_excerpt = get_leading_excerpt(generated)
    sample_group = normalize_text(sample.get("group"))
    forbidden_conflicts = [normalize_text(item) for item in expectations.get("forbidden_conflicts", []) if isinstance(item, str)]
    boundary_hits = 0
    boundary_clean = 1
    if sample_group == "knowledge_boundary":
        boundary_hits = sum(1 for item in avoid_details if item["matched"])
        boundary_clean = 1 if boundary_hits == 0 else 0
    request_text = normalize_text(sample.get("request", {}).get("text", ""))
    anchor_mode = "current" if request_text or sample_group == "current_chapter_continuation" else "previous"
    anchor_source = request_text if anchor_mode == "current" else pick_previous_tail(sample)
    anchor_metrics = build_anchor_metrics(anchor_source, generated_text)
    open_loop_metrics = build_open_loop_metrics(sample, generated, generated_terms)
    normalized_anchor = normalize_text(anchor_source)
    repeated_anchor = bool(normalized_anchor and normalized_anchor[:60] and normalized_anchor[:60] in leading_excerpt)

    subscores: dict[str, int] = {
        "must_include_progress": 1 if include_hits > 0 else 0,
        "open_loop_progress": 1 if open_loop_metrics["progressed"] else 0,
        "avoid_conflict_clean": 1 if avoid_hits == 0 else 0,
        "no_prefix_repetition": 1 if not repeated_anchor else 0,
        "knowledge_boundary_clean": boundary_clean if sample_group == "knowledge_boundary" else 1,
    }
    if anchor_mode == "current":
        subscores["current_tail_followed"] = 1 if anchor_metrics["followed"] else 0
    else:
        subscores["previous_tail_followed"] = 1 if anchor_metrics["followed"] else 0
    score = sum(subscores.values())

    return {
        "score": score,
        "max_score": len(subscores),
        "subscores": subscores,
        "anchor_mode": anchor_mode,
        "anchor_overlap": anchor_metrics["overlap_count"],
        "anchor_overlap_ratio": anchor_metrics["overlap_ratio"],
        "anchor_focus_overlap": anchor_metrics["focus_overlap_count"],
        "anchor_focus_overlap_ratio": anchor_metrics["focus_overlap_ratio"],
        "must_include_hits": include_hits,
        "must_avoid_hits": avoid_hits,
        "must_include_details": include_details,
        "must_avoid_details": avoid_details,
        "open_loop_hits": open_loop_metrics["loop_hits"],
        "open_loop_details": open_loop_metrics["loop_details"],
        "suspense_hits": open_loop_metrics["suspense_hits"],
        "repeated_anchor_prefix": repeated_anchor,
        "boundary_term_hits": boundary_hits,
        "forbidden_conflict_targets": forbidden_conflicts,
        "leading_excerpt": leading_excerpt,
    }


def sample_has_live_request(sample: dict[str, Any]) -> bool:
    live_request = sample.get("live_request")
    return isinstance(live_request, dict) and bool(live_request.get("project_id"))


def _make_namespace(**kwargs: Any) -> SimpleNamespace:
    return SimpleNamespace(**kwargs)


def build_snapshot_loaded_context(sample: dict[str, Any]) -> dict[str, Any]:
    snapshot = sample.get("project_snapshot") or {}
    request = sample.get("request") or {}
    chapters = snapshot.get("chapters") or []
    request_chapter_id = request.get("chapter_id")

    chapter_objects: list[SimpleNamespace] = []
    current_chapter: SimpleNamespace | None = None
    for index, chapter in enumerate(chapters, start=1):
        current_text = chapter.get("current_text")
        tail_excerpt = chapter.get("tail_excerpt")
        plain_text = current_text if isinstance(current_text, str) else tail_excerpt if isinstance(tail_excerpt, str) else None
        obj = _make_namespace(
            id=chapter.get("id") or (request_chapter_id if current_text is not None and current_chapter is None else f"snapshot-chapter-{index}"),
            title=chapter.get("title") or f"第{index}章",
            summary=chapter.get("summary"),
            notes=chapter.get("notes"),
            plain_text=plain_text,
            content=plain_text,
            order_index=index,
        )
        chapter_objects.append(obj)
        if request_chapter_id and obj.id == request_chapter_id:
            current_chapter = obj
        elif current_chapter is None and current_text is not None:
            current_chapter = obj

    if current_chapter is None and chapter_objects:
        current_chapter = chapter_objects[-1]

    previous_chapter: SimpleNamespace | None = None
    if current_chapter is not None:
        for obj in chapter_objects:
            if obj.order_index < current_chapter.order_index:
                previous_chapter = obj

    character_links = []
    for index, item in enumerate(snapshot.get("characters") or [], start=1):
        character = _make_namespace(
            name=item.get("name") or f"角色{index}",
            alias=item.get("alias"),
            description=item.get("description"),
            personality="；".join(item.get("constraints") or []) if isinstance(item.get("constraints"), list) else item.get("personality"),
            background=item.get("background"),
            relationship_notes=item.get("relationship_notes"),
            tags=item.get("tags"),
        )
        character_links.append(
            _make_namespace(
                character=character,
                role_label=item.get("role"),
                summary="；".join(item.get("constraints") or []) if isinstance(item.get("constraints"), list) else item.get("summary"),
            )
        )

    world_items = snapshot.get("worldbook") or []
    world_setting = None
    if world_items:
        world_setting = _make_namespace(
            title="世界观设定",
            overview=snapshot.get("project_summary"),
            rules="\n".join(item.get("rule", "") for item in world_items if isinstance(item, dict) and item.get("rule")) or None,
            factions=None,
            locations="\n".join(item.get("topic", "") for item in world_items if isinstance(item, dict) and item.get("topic")) or None,
            timeline=None,
            extra_notes="\n".join(snapshot.get("notes") or []) or None,
        )

    story_memory_raw = snapshot.get("story_memory") or {}
    story_memory = _make_namespace(
        global_plot_summary=story_memory_raw.get("global_plot_summary"),
        active_conflicts=[{"label": item, "description": item} if isinstance(item, str) else item for item in story_memory_raw.get("global_open_loops", [])],
        resolved_conflicts=[],
        character_arcs=[],
        global_open_loops=[{"label": item, "description": item} if isinstance(item, str) else item for item in story_memory_raw.get("global_open_loops", [])],
        timeline_constraints=[],
        world_rules_active=[],
    )

    recent_memories = []
    for item in snapshot.get("recent_memories") or []:
        summary = item.get("summary")
        recent_memories.append(
            _make_namespace(
                summary_short=summary,
                summary_long=summary,
                key_events=[],
                open_loops=[],
                character_state_changes=[],
                timeline_markers=[],
            )
        )

    project = _make_namespace(
        id=f"snapshot:{sample['id']}",
        title=snapshot.get("project_title") or sample.get("name") or "Snapshot Project",
        description=snapshot.get("project_summary"),
        premise=None,
        project_characters=character_links,
        world_setting=world_setting,
        story_memory=story_memory if story_memory.global_plot_summary or story_memory.global_open_loops else None,
    )

    return {
        "project": project,
        "chapter": current_chapter,
        "previous_chapter": previous_chapter,
        "recent_memories": recent_memories,
        "story_memory": project.story_memory,
    }


def build_snapshot_context_bundle(sample: dict[str, Any], plan: dict[str, Any], loaded_context: dict[str, Any]) -> dict[str, Any]:
    request = sample.get("request") or {}
    snapshot = sample.get("project_snapshot") or {}
    project = loaded_context.get("project")
    chapter = loaded_context.get("chapter")
    previous_chapter = loaded_context.get("previous_chapter")
    story_memory = loaded_context.get("story_memory")
    current_tail = continuation_pipeline_service._build_current_chapter_tail(chapter)
    previous_tail = continuation_pipeline_service._clip_text(getattr(previous_chapter, "plain_text", None), limit=800) if previous_chapter else None
    previous_reader_only_tail = continuation_pipeline_service._extract_reader_only_tail(previous_tail)
    previous_tail_clean = continuation_pipeline_service._strip_reader_only_tail(previous_tail) if previous_tail else None
    current_tail_focus = continuation_pipeline_service._build_tail_focus_excerpt(current_tail, limit=180)
    previous_tail_focus = continuation_pipeline_service._build_tail_focus_excerpt(previous_tail_clean, limit=180)
    preferred_anchor = current_tail_focus or current_tail or request.get("text") or previous_tail_focus or previous_tail_clean

    retrieved_chunks = []
    for index, item in enumerate(snapshot.get("chapters") or [], start=1):
        content = item.get("current_text") or item.get("tail_excerpt")
        title = item.get("title") or f"第{index}章"
        if not isinstance(content, str) or not content.strip():
            continue
        if chapter and title == getattr(chapter, "title", None):
            continue
        retrieved_chunks.append(
            {
                "chunk_id": f"snapshot:{sample['id']}:{index}",
                "chapter_id": f"snapshot-chapter-{index}",
                "chapter_order": index,
                "chunk_index": 0,
                "scene_label": title,
                "content": content,
                "content_short": content[:180],
                "characters": [],
                "tags": ["snapshot"],
                "start_offset": None,
                "end_offset": None,
            }
        )

    return {
        "project_summary": continuation_pipeline_service._build_project_summary(project),
        "story_memory_summary": getattr(story_memory, "global_plot_summary", None) if story_memory else None,
        "current_chapter_summary": continuation_pipeline_service._build_current_chapter_summary(chapter),
        "current_chapter_tail": current_tail,
        "current_tail_focus": current_tail_focus,
        "previous_chapter_tail": None if current_tail else previous_tail_clean,
        "previous_tail_focus": None if current_tail else previous_tail_focus,
        "preferred_continuation_anchor": preferred_anchor,
        "recent_memories": [continuation_pipeline_service._serialize_recent_memory(memory) for memory in (loaded_context.get("recent_memories") or [])[:3]],
        "retrieved_chunks": retrieved_chunks[:4],
        "graph_evidence": [],
        "character_context": continuation_pipeline_service._serialize_character_context(project),
        "world_context": continuation_pipeline_service._serialize_world_context(project),
        "query_terms": extract_terms(normalize_text((request.get("instruction") or "") + " " + (request.get("text") or ""))),
        "token_budget_report": {"estimated_tokens": 0, "trimmed_sections": [], "section_lengths": {}},
        "metadata": {
            "source": "snapshot",
            "previous_reader_only_tail": previous_reader_only_tail,
        },
    }


async def run_snapshot_variant(sample: dict[str, Any], variant: str) -> dict[str, Any]:
    request = sample["request"]
    started = perf_counter()
    loaded_context = build_snapshot_loaded_context(sample)
    runtime_owner_id = sample.get("runtime_owner_id") or request.get("owner_id")
    request_payload = {
        "project_id": f"snapshot:{sample['id']}",
        "chapter_id": request.get("chapter_id"),
        "owner_id": runtime_owner_id,
        "user_text": request.get("text", ""),
        "user_instruction": request["instruction"],
        "model_provider": request.get("model_provider"),
        "model_id": request.get("model_id"),
        "temperature": float(request.get("temperature", 0.8)),
        "max_tokens": int(request.get("max_tokens", 2000)),
    }
    try:
        async with async_session() as db:
            if variant == "baseline":
                final_content = await ai_service.generate_plain_text(
                    db,
                    text=request_payload["user_text"],
                    instruction=request_payload["user_instruction"],
                    model_provider=request_payload["model_provider"],
                    model_id=request_payload["model_id"],
                    temperature=request_payload["temperature"],
                    max_tokens=request_payload["max_tokens"],
                    owner_id=runtime_owner_id,
                )
                result: dict[str, Any] = {
                    "final_content": final_content,
                    "continuity_report": {},
                    "warnings": [],
                    "fallbacks": [],
                    "metadata": {"path": "snapshot-baseline"},
                }
                plan = {"metadata": {"source": "baseline"}}
                context_bundle = {}
                draft = {"content": final_content}
            else:
                plan = continuation_planner_service.build_default_plan(request=request_payload, loaded_context=loaded_context)
                context_bundle = build_snapshot_context_bundle(sample, plan, loaded_context)
                writer_prompt = continuation_pipeline_service._build_writer_prompt(
                    user_instruction=request_payload["user_instruction"],
                    user_text=request_payload["user_text"],
                    plan=plan,
                    context_bundle=context_bundle,
                )
                final_content = await ai_service.generate_plain_text(
                    db,
                    text=writer_prompt,
                    instruction="你是长篇小说续写写作者。请基于给定的续写计划和上下文包生成单个候选正文。\n\n要求：\n1. 优先承接当前章节已写内容\n2. 优先承接自然\n3. 优先保持角色一致性和世界设定一致性\n4. 不要输出解释、提纲或说明\n5. 只输出最终正文",
                    model_provider=request_payload["model_provider"],
                    model_id=request_payload["model_id"],
                    temperature=request_payload["temperature"],
                    max_tokens=request_payload["max_tokens"],
                    owner_id=runtime_owner_id,
                )
                draft = {"content": final_content, "used_sections": ["snapshot"], "generation_notes": ["snapshot-mode"]}
                continuity_report = await continuity_checker_service.check(
                    db,
                    request=request_payload,
                    plan=plan,
                    context_bundle=context_bundle,
                    draft_content=final_content,
                )
                result = {
                    "final_content": final_content,
                    "continuity_report": continuity_report,
                    "warnings": continuation_pipeline_service._collect_warnings(continuity_report),
                    "fallbacks": ["snapshot-mode"],
                    "metadata": {"path": "snapshot-pipeline"},
                }
    except Exception as exc:
        return {
            "benchmark_id": sample["id"],
            "benchmark_name": sample["name"],
            "variant": variant,
            "status": "failed",
            "error": str(exc),
            "metrics": {"avg_latency_ms": round((perf_counter() - started) * 1000, 2)},
        }

    latency_ms = round((perf_counter() - started) * 1000, 2)
    artifacts: dict[str, Any] = {}
    if variant == "pipeline-debug":
        artifacts["plan"] = plan
        artifacts["context_bundle"] = context_bundle
        artifacts["draft"] = draft
        artifacts["continuity_report"] = result.get("continuity_report", {})
    elif variant == "pipeline":
        artifacts["continuity_report"] = result.get("continuity_report", {})
    rule_score = build_rule_score(sample, result.get("final_content", ""))

    return {
        "benchmark_id": sample["id"],
        "benchmark_name": sample["name"],
        "variant": variant,
        "status": "completed",
        "generated_text": result.get("final_content", ""),
        "warnings": result.get("warnings", []),
        "fallbacks": result.get("fallbacks", []),
        "metrics": {
            "avg_latency_ms": latency_ms,
            "warning_count": len(result.get("warnings", [])),
            "fallback_count": len(result.get("fallbacks", [])),
            "rule_score": rule_score["score"],
            "rule_score_max": rule_score["max_score"],
        },
        "artifacts": {**artifacts, "rule_score": rule_score},
    }


async def run_variant(sample: dict[str, Any], variant: str) -> dict[str, Any]:
    if not sample_has_live_request(sample):
        return await run_snapshot_variant(sample, variant)
    payload = build_payload(sample)
    started = perf_counter()
    try:
        async with async_session() as db:
            if variant == "baseline":
                final_content = await ai_service.generate_text(
                    db,
                    project_id=payload["project_id"],
                    chapter_id=payload["chapter_id"],
                    text=payload["text"],
                    instruction=payload["instruction"],
                    model_provider=payload["model_provider"],
                    model_id=payload["model_id"],
                    temperature=payload["temperature"],
                    max_tokens=payload["max_tokens"],
                    owner_id=payload["owner_id"],
                )
                result: dict[str, Any] = {
                    "final_content": final_content,
                    "continuity_report": {},
                    "warnings": [],
                    "fallbacks": [],
                    "metadata": {"path": "baseline"},
                }
            else:
                result = await continuation_pipeline_service.run(
                    db,
                    project_id=payload["project_id"],
                    chapter_id=payload["chapter_id"],
                    user_text=payload["text"],
                    user_instruction=payload["instruction"],
                    model_provider=payload["model_provider"],
                    model_id=payload["model_id"],
                    temperature=payload["temperature"],
                    max_tokens=payload["max_tokens"],
                    owner_id=payload["owner_id"],
                    debug=(variant == "pipeline-debug"),
                )
    except Exception as exc:
        return {
            "benchmark_id": sample["id"],
            "benchmark_name": sample["name"],
            "variant": variant,
            "status": "failed",
            "error": str(exc),
            "metrics": {"avg_latency_ms": round((perf_counter() - started) * 1000, 2)},
        }

    latency_ms = round((perf_counter() - started) * 1000, 2)
    artifacts: dict[str, Any] = {}
    if variant == "pipeline-debug":
        artifacts["plan"] = result.get("plan", {})
        artifacts["context_bundle"] = result.get("context_bundle", {})
        artifacts["draft"] = result.get("draft", {})
        artifacts["continuity_report"] = result.get("continuity_report", {})
    elif variant == "pipeline":
        artifacts["continuity_report"] = result.get("continuity_report", {})
    rule_score = build_rule_score(sample, result.get("final_content", ""))

    return {
        "benchmark_id": sample["id"],
        "benchmark_name": sample["name"],
        "variant": variant,
        "status": "completed",
        "generated_text": result.get("final_content", ""),
        "warnings": result.get("warnings", []),
        "fallbacks": result.get("fallbacks", []),
        "metrics": {
            "avg_latency_ms": latency_ms,
            "warning_count": len(result.get("warnings", [])),
            "fallback_count": len(result.get("fallbacks", [])),
            "rule_score": rule_score["score"],
            "rule_score_max": rule_score["max_score"],
        },
        "artifacts": {
            **artifacts,
            "rule_score": rule_score,
        },
    }


async def main_async(args: argparse.Namespace) -> dict[str, Any]:
    samples = load_dataset(args.dataset)
    enabled_samples = [sample for sample in samples if sample.get("enabled", False)]
    if args.sample_ids:
        enabled_samples = [sample for sample in enabled_samples if sample.get("id") in set(args.sample_ids)]
    variants = args.variants or ["baseline", "pipeline"]

    results: list[dict[str, Any]] = []
    for sample in enabled_samples:
        for variant in variants:
            results.append(await run_variant(sample, variant))

    report = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "dataset_path": str(args.dataset),
        "sample_count": len(enabled_samples),
        "variant_count": len(variants),
        "result_count": len(results),
        "results": results,
    }
    report["summary"] = build_report_summary(results)
    return report


def build_report_summary(results: list[dict[str, Any]]) -> dict[str, Any]:
    variant_groups: dict[str, list[dict[str, Any]]] = {}
    benchmark_groups: dict[str, list[dict[str, Any]]] = {}

    for item in results:
        variant_groups.setdefault(str(item.get("variant") or "unknown"), []).append(item)
        benchmark_groups.setdefault(str(item.get("benchmark_id") or "unknown"), []).append(item)

    variant_summaries: list[dict[str, Any]] = []
    for variant, items in sorted(variant_groups.items()):
        completed_items = [item for item in items if item.get("status") == "completed"]
        failed_items = [item for item in items if item.get("status") == "failed"]
        skipped_items = [item for item in items if item.get("status") == "skipped"]
        latencies = [float(item.get("metrics", {}).get("avg_latency_ms", 0.0)) for item in completed_items]
        rule_scores = [int(item.get("metrics", {}).get("rule_score", 0)) for item in completed_items]
        rule_score_maxes = [int(item.get("metrics", {}).get("rule_score_max", 0)) for item in completed_items]
        warning_counts = [int(item.get("metrics", {}).get("warning_count", 0)) for item in completed_items]
        fallback_counts = [int(item.get("metrics", {}).get("fallback_count", 0)) for item in completed_items]
        passed = sum(1 for score, max_score in zip(rule_scores, rule_score_maxes) if max_score > 0 and score == max_score)

        variant_summaries.append(
            {
                "variant": variant,
                "completed": len(completed_items),
                "failed": len(failed_items),
                "skipped": len(skipped_items),
                "avg_latency_ms": round(sum(latencies) / len(latencies), 2) if latencies else None,
                "avg_rule_score": round(sum(rule_scores) / len(rule_scores), 2) if rule_scores else None,
                "avg_rule_score_max": round(sum(rule_score_maxes) / len(rule_score_maxes), 2) if rule_score_maxes else None,
                "avg_warning_count": round(sum(warning_counts) / len(warning_counts), 2) if warning_counts else None,
                "avg_fallback_count": round(sum(fallback_counts) / len(fallback_counts), 2) if fallback_counts else None,
                "pass_rate": round(passed / len(completed_items), 3) if completed_items else None,
            }
        )

    benchmark_summaries: list[dict[str, Any]] = []
    for benchmark_id, items in sorted(benchmark_groups.items()):
        benchmark_summaries.append(
            {
                "benchmark_id": benchmark_id,
                "benchmark_name": items[0].get("benchmark_name"),
                "variants": [
                    {
                        "variant": item.get("variant"),
                        "status": item.get("status"),
                        "rule_score": item.get("metrics", {}).get("rule_score"),
                        "rule_score_max": item.get("metrics", {}).get("rule_score_max"),
                        "avg_latency_ms": item.get("metrics", {}).get("avg_latency_ms"),
                        "warning_count": item.get("metrics", {}).get("warning_count"),
                        "fallback_count": item.get("metrics", {}).get("fallback_count"),
                    }
                    for item in sorted(items, key=lambda value: str(value.get("variant") or ""))
                ],
            }
        )

    return {
        "variants": variant_summaries,
        "benchmarks": benchmark_summaries,
    }


def write_report(report_dir: Path, report: dict[str, Any]) -> Path:
    report_dir.mkdir(parents=True, exist_ok=True)
    output_path = report_dir / f"live-replay-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_path


def render_markdown_report(report: dict[str, Any]) -> str:
    lines: list[str] = [
        "# StoryWeave Live Benchmark Report",
        "",
        f"- Generated at: `{report.get('generated_at')}`",
        f"- Dataset: `{report.get('dataset_path')}`",
        f"- Samples: `{report.get('sample_count')}`",
        f"- Variants: `{report.get('variant_count')}`",
        f"- Results: `{report.get('result_count')}`",
        "",
        "## Variant Summary",
        "",
        "| Variant | Completed | Failed | Skipped | Avg Rule | Avg Latency (ms) | Avg Warnings | Avg Fallbacks | Pass Rate |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]

    for item in report.get("summary", {}).get("variants", []):
        avg_rule = "-"
        if item.get("avg_rule_score") is not None and item.get("avg_rule_score_max") is not None:
            avg_rule = f"{item['avg_rule_score']}/{item['avg_rule_score_max']}"
        lines.append(
            "| {variant} | {completed} | {failed} | {skipped} | {avg_rule} | {avg_latency} | {avg_warnings} | {avg_fallbacks} | {pass_rate} |".format(
                variant=item.get("variant"),
                completed=item.get("completed"),
                failed=item.get("failed"),
                skipped=item.get("skipped"),
                avg_rule=avg_rule,
                avg_latency=item.get("avg_latency_ms") if item.get("avg_latency_ms") is not None else "-",
                avg_warnings=item.get("avg_warning_count") if item.get("avg_warning_count") is not None else "-",
                avg_fallbacks=item.get("avg_fallback_count") if item.get("avg_fallback_count") is not None else "-",
                pass_rate=item.get("pass_rate") if item.get("pass_rate") is not None else "-",
            )
        )

    lines.extend(["", "## Benchmark Summary", ""])
    for item in report.get("summary", {}).get("benchmarks", []):
        lines.append(f"### {item.get('benchmark_id')} - {item.get('benchmark_name')}")
        lines.append("")
        lines.append("| Variant | Status | Rule Score | Latency (ms) | Warnings | Fallbacks |")
        lines.append("| --- | --- | ---: | ---: | ---: | ---: |")
        for variant in item.get("variants", []):
            rule_score = "-"
            if variant.get("rule_score") is not None and variant.get("rule_score_max") is not None:
                rule_score = f"{variant['rule_score']}/{variant['rule_score_max']}"
            lines.append(
                "| {variant_name} | {status} | {rule_score} | {latency} | {warnings} | {fallbacks} |".format(
                    variant_name=variant.get("variant"),
                    status=variant.get("status"),
                    rule_score=rule_score,
                    latency=variant.get("avg_latency_ms") if variant.get("avg_latency_ms") is not None else "-",
                    warnings=variant.get("warning_count") if variant.get("warning_count") is not None else "-",
                    fallbacks=variant.get("fallback_count") if variant.get("fallback_count") is not None else "-",
                )
            )
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_markdown_report(json_report_path: Path, report: dict[str, Any]) -> Path:
    markdown_path = json_report_path.with_suffix(".md")
    markdown_path.write_text(render_markdown_report(report), encoding="utf-8")
    return markdown_path


def main() -> int:
    args = parse_args()
    report = asyncio.run(main_async(args))
    completed = sum(1 for item in report["results"] if item["status"] == "completed")
    failed = sum(1 for item in report["results"] if item["status"] == "failed")
    print(f"[live-benchmark] completed={completed} failed={failed} total={report['result_count']}")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.no_write:
        return 0
    output_path = write_report(args.report_dir, report)
    print(f"[live-benchmark] report written to: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
