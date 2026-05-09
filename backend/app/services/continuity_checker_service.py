from __future__ import annotations

import json
import logging
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai_service import ai_service

logger = logging.getLogger(__name__)

_CHECKER_SYSTEM_PROMPT = """你是长篇小说连续性检查器。你不会改写正文，只负责找出风险并输出结构化报告。

只输出 JSON 对象，不要输出解释，不要输出 Markdown。

JSON 结构固定为：
{
  "severity": "low",
  "summary": "",
  "timeline_conflicts": [],
  "character_conflicts": [],
  "world_rule_conflicts": [],
  "knowledge_boundary_conflicts": [],
  "open_loop_misalignment": []
}

每个冲突项尽量使用：
{
  "issue": "",
  "reason": "",
  "evidence": "",
  "suggestion": ""
}

要求：
1. 必须返回合法 JSON
2. 如果没有明显问题，数组返回空
3. 不要编造上下文中不存在的设定
4. 优先检查高价值冲突，不要泛泛而谈"""


class ContinuityCheckerService:
    async def check(
        self,
        db: AsyncSession,
        *,
        request: dict[str, Any],
        plan: dict[str, Any],
        context_bundle: dict[str, Any],
        draft_content: str,
    ) -> dict[str, Any]:
        base_report = self._build_rule_based_report(
            plan=plan,
            context_bundle=context_bundle,
            draft_content=draft_content,
        )

        prompt = self._build_checker_prompt(
            request=request,
            plan=plan,
            context_bundle=context_bundle,
            draft_content=draft_content,
        )
        try:
            raw = await ai_service.generate_plain_text(
                db,
                text=prompt,
                instruction=_CHECKER_SYSTEM_PROMPT,
                model_provider=request.get("model_provider"),
                model_id=request.get("model_id"),
                temperature=0.1,
                max_tokens=600,
                owner_id=request.get("owner_id"),
            )
        except Exception as exc:
            logger.warning("Continuity checker failed, using rule-based report only: %s", exc)
            base_report["check_status"] = "skipped"
            return base_report

        try:
            payload = self._extract_json_payload(raw)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            logger.warning(
                "Continuity checker returned invalid JSON, using rule-based report only: %s raw=%r",
                exc,
                (raw or "")[:400],
            )
            base_report["check_status"] = "skipped"
            return base_report

        normalized = self._normalize_report(payload)
        return self._merge_reports(base_report=base_report, llm_report=normalized)

    def _build_rule_based_report(
        self,
        *,
        plan: dict[str, Any],
        context_bundle: dict[str, Any],
        draft_content: str,
    ) -> dict[str, Any]:
        report = {
            "severity": "low",
            "summary": "未发现明显的规则级连续性冲突。",
            "timeline_conflicts": [],
            "character_conflicts": [],
            "world_rule_conflicts": [],
            "knowledge_boundary_conflicts": [],
            "open_loop_misalignment": [],
            "evidence": [],
            "check_status": "completed",
        }

        preferred_anchor = (
            self._safe_text(context_bundle.get("current_chapter_tail"))
            or self._safe_text(context_bundle.get("preferred_continuation_anchor"))
            or self._safe_text(context_bundle.get("previous_chapter_tail"))
            or ""
        )
        if preferred_anchor and draft_content and self._has_continuation_anchor_signal(preferred_anchor[-160:], draft_content[:260]) is False:
            report["timeline_conflicts"].append(
                {
                    "issue": "承接可能偏弱",
                    "reason": "候选正文开头与上一章结尾缺少明显承接。",
                    "evidence": self._clip_text(preferred_anchor[-160:], limit=160) or "",
                    "suggestion": "补一个承接动作、情绪或场景锚点。",
                }
            )

        if preferred_anchor and draft_content and self._starts_with_anchor_prefix(preferred_anchor, draft_content):
            report["timeline_conflicts"].append(
                {
                    "issue": "开头重复了承接点原句",
                    "reason": "候选正文不是顺着尾句往后写，而是直接重复或轻微改写了承接点开头，容易显得像在原地踏步。",
                    "evidence": self._clip_text(preferred_anchor[:80], limit=80) or "",
                    "suggestion": "删掉重复尾句，从尾句之后的动作、情绪或观察继续写。",
                }
            )

        first_paragraph = self._get_first_paragraph(draft_content)
        if first_paragraph and self._starts_with_fragment_connector(first_paragraph):
            report["timeline_conflicts"].append(
                {
                    "issue": "首句像断在半空中",
                    "reason": "候选正文的开头以承接词或转折词直接起句，但前面的主体或动作没有补出来，读感会像上半句丢失了。",
                    "evidence": self._clip_text(first_paragraph, limit=80) or "",
                    "suggestion": "把第一句改成完整的动作、感官或反应句，不要用‘连着’‘却’等词直接起句。",
                }
            )

        if preferred_anchor and first_paragraph and self._starts_with_early_recap(first_paragraph):
            report["timeline_conflicts"].append(
                {
                    "issue": "首段过早跳到复盘推理",
                    "reason": "候选正文虽然稍微油到了承接点，但很快就从当前场景跳到线索总结、案情判断或下一步推理，导致前后画面没有真正连上。",
                    "evidence": self._clip_text(first_paragraph, limit=140) or "",
                    "suggestion": "先写承接点之后立刻发生的动作、目光、呼吸或现场细节，等场景站稳后再进入推理。",
                }
            )

        if preferred_anchor and first_paragraph and self._looks_like_suspense_loop_stall(first_paragraph):
            report["open_loop_misalignment"].append(
                {
                    "issue": "伏笔推进空转成悬念复盘",
                    "reason": "候选正文主要在重复不安、怀疑或未解之谜，缺少新的动作、观察或交互增量，读感会像主角在原地分析悬念。",
                    "evidence": self._clip_text(first_paragraph, limit=140) or "",
                    "suggestion": "补一个新的现场观察、试探、遭遇或线索反馈，让悬念产生实质推进，而不是只保留情绪和猜测。",
                }
            )

        last_sentence = self._get_last_sentence(draft_content)
        if last_sentence and self._ends_with_fragment_connector(last_sentence):
            report["timeline_conflicts"].append(
                {
                    "issue": "尾句像断在半空中",
                    "reason": "候选正文的最后一句停在悬空转折、半截判断或没落稳的动作上，读起来像这一句还没写完。",
                    "evidence": self._clip_text(last_sentence, limit=100) or "",
                    "suggestion": "把结尾句补成完整句，要么明确落在动作完成点，要么落在情绪、判断或本章收束点上。",
                }
            )

        for item in plan.get("timeline_constraints") or []:
            if isinstance(item, str) and self._is_specific_constraint(item) and item not in draft_content:
                report["timeline_conflicts"].append(
                    {
                        "issue": "时间线约束未显式体现",
                        "reason": "规划里存在时间或地点约束，但候选正文中未明显出现。",
                        "evidence": item,
                        "suggestion": "确认该约束是否需要通过动作、地点或叙述语句保留。",
                    }
                )

        open_loops = [loop for loop in (plan.get("relevant_open_loops") or []) if isinstance(loop, str)]
        draft_terms = self._extract_terms(draft_content)
        if open_loops and not any(self._open_loop_progressed(loop, draft_content, draft_terms) for loop in open_loops):
            report["open_loop_misalignment"].append(
                {
                    "issue": "相关伏笔未被触及",
                    "reason": "本次规划要求关注的 open loop 在候选正文中没有明显推进。",
                    "evidence": self._clip_text(" / ".join(str(item) for item in open_loops[:3]), limit=140) or "",
                    "suggestion": "至少补一个关联动作、提及或悬念延续点。",
                }
            )

        reader_only_tail = self._safe_text((context_bundle.get("metadata") or {}).get("previous_reader_only_tail"))
        if reader_only_tail:
            hidden_terms = self._extract_terms(reader_only_tail)
            leaked_terms = sorted(hidden_terms & draft_terms)
            if len(leaked_terms) >= 2:
                report["knowledge_boundary_conflicts"].append(
                    {
                        "issue": "疑似泄露读者专属暗线信息",
                        "reason": "候选正文命中了上一章只给读者看的幕后尾注信息，可能把角色本不该知道的内容写进了当前视角。",
                        "evidence": self._clip_text(" / ".join(leaked_terms[:6]), limit=120) or "",
                        "suggestion": "删除或改写这些细节，只保留云缨当下可见、可闻、可推断的信息。",
                    }
                )

        backstage_markers = ("她不知道的是", "而她不知道的是", "他不知道的是", "而他不知道的是", "镜头转到", "与此同时在暗处")
        marker_hits = [marker for marker in backstage_markers if marker in draft_content]
        if marker_hits:
            report["knowledge_boundary_conflicts"].append(
                {
                    "issue": "出现幕后旁白视角切换",
                    "reason": "候选正文直接使用了切向幕后或读者专属视角的旁白句式，容易把当前角色本不该知道的信息混入正文。",
                    "evidence": self._clip_text(" / ".join(marker_hits), limit=120) or "",
                    "suggestion": "删除这些旁白句式，改成云缨当下的感受、怀疑或可观察到的异样。",
                }
            )

        witness_markers = ("后堂", "对话", "窗棂", "黑影", "盯着她", "盯梢者")
        if any(marker in draft_content for marker in ("听见", "听到", "看见", "认出")):
            witnessed_hidden = [marker for marker in witness_markers if marker in draft_content and marker != "对话"]
            if witnessed_hidden:
                report["knowledge_boundary_conflicts"].append(
                    {
                        "issue": "疑似伪造角色未亲历的见闻来源",
                        "reason": "候选正文把可能只属于读者视角或幕后暗线的信息，写成了云缨亲耳听见或亲眼看见的内容。",
                        "evidence": self._clip_text(" / ".join(witnessed_hidden[:6]), limit=120) or "",
                        "suggestion": "改成云缨当下的怀疑、直觉或现场可观察线索，不要补写她未实际经历的见闻。",
                    }
                )

        hidden_source_patterns = (
            "方才在醉红楼后堂听到",
            "在醉红楼后堂听到",
            "后堂那阵响动",
            "后堂那阵低语",
            "那批货，处理干净",
            "不能让人查到",
        )
        hidden_source_hits = [pattern for pattern in hidden_source_patterns if pattern in draft_content]
        if hidden_source_hits:
            report["knowledge_boundary_conflicts"].append(
                {
                    "issue": "把暗线信息写成了角色已掌握的事实",
                    "reason": "候选正文直接调用了只属于幕后/读者侧的后堂信息，容易把知识边界写穿。",
                    "evidence": self._clip_text(" / ".join(hidden_source_hits[:4]), limit=120) or "",
                    "suggestion": "删除这些直接信息源，改写成云缨对货源异常、气味、动静或他人反应的现场判断。",
                }
            )

        for item in plan.get("must_avoid") or []:
            if not isinstance(item, str):
                continue
            if self._looks_like_identity_boundary(item) and self._hits_identity_boundary(item, draft_content):
                report["knowledge_boundary_conflicts"].append(
                    {
                        "issue": "角色过早把隐藏身份说得过实",
                        "reason": "候选正文把仍应停留在怀疑层的隐藏身份或秘密归属，直接推进成了当面对号入座的判断。",
                        "evidence": self._clip_text(item, limit=120) or "",
                        "suggestion": "把明确指认改成试探、旁敲侧击或不完整怀疑，不要让角色提前说破。",
                    }
                )

        report["severity"] = self._compute_severity(report)
        if report["severity"] != "low":
            report["summary"] = "发现一些需要人工确认的连续性风险。"
        return report

    def _build_checker_prompt(
        self,
        *,
        request: dict[str, Any],
        plan: dict[str, Any],
        context_bundle: dict[str, Any],
        draft_content: str,
    ) -> str:
        compact_plan = {
            "scene_continuation_point": plan.get("scene_continuation_point"),
            "writing_goal": plan.get("writing_goal"),
            "relevant_open_loops": (plan.get("relevant_open_loops") or [])[:3],
            "character_constraints": (plan.get("character_constraints") or [])[:3],
            "timeline_constraints": (plan.get("timeline_constraints") or [])[:3],
            "must_avoid": (plan.get("must_avoid") or [])[:3],
        }
        compact_context = {
            "story_memory_summary": self._clip_text(self._safe_text(context_bundle.get("story_memory_summary")), limit=240),
            "current_chapter_summary": self._clip_text(self._safe_text(context_bundle.get("current_chapter_summary")), limit=220),
            "previous_chapter_tail": self._clip_text(self._safe_text(context_bundle.get("previous_chapter_tail")), limit=240),
            "recent_memories": self._compact_recent_memories(context_bundle.get("recent_memories")),
            "character_context": self._compact_string_list(context_bundle.get("character_context"), limit=3, text_limit=100),
            "world_context": self._compact_string_list(context_bundle.get("world_context"), limit=3, text_limit=100),
        }
        parts = [
            f"用户任务：{request.get('user_instruction') or ''}",
            "续写计划：",
            json.dumps(compact_plan, ensure_ascii=False),
            "核心上下文：",
            json.dumps(compact_context, ensure_ascii=False),
            "候选正文：",
            self._clip_text(draft_content, limit=1800) or "",
        ]
        return "\n\n".join(parts)

    def _normalize_report(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "severity": self._normalize_severity(payload.get("severity")),
            "summary": self._safe_text(payload.get("summary")) or "",
            "timeline_conflicts": self._normalize_issue_list(payload.get("timeline_conflicts")),
            "character_conflicts": self._normalize_issue_list(payload.get("character_conflicts")),
            "world_rule_conflicts": self._normalize_issue_list(payload.get("world_rule_conflicts")),
            "knowledge_boundary_conflicts": self._normalize_issue_list(payload.get("knowledge_boundary_conflicts")),
            "open_loop_misalignment": self._normalize_issue_list(payload.get("open_loop_misalignment")),
            "evidence": [],
            "check_status": "completed",
        }

    def _merge_reports(self, *, base_report: dict[str, Any], llm_report: dict[str, Any]) -> dict[str, Any]:
        merged = dict(base_report)
        for key in (
            "timeline_conflicts",
            "character_conflicts",
            "world_rule_conflicts",
            "knowledge_boundary_conflicts",
            "open_loop_misalignment",
        ):
            merged[key] = [*base_report.get(key, []), *llm_report.get(key, [])]

        merged["severity"] = self._compute_severity(merged, fallback=llm_report.get("severity"))
        merged["summary"] = self._compose_summary(
            report=merged,
            llm_summary=llm_report.get("summary"),
            base_summary=base_report.get("summary"),
        )
        merged["check_status"] = "completed"
        return merged

    def _compose_summary(
        self,
        *,
        report: dict[str, Any],
        llm_summary: object,
        base_summary: object,
    ) -> str:
        severity = self._normalize_severity(report.get("severity"))
        if severity == "low":
            return self._safe_text(llm_summary) or self._safe_text(base_summary) or "未发现明显的规则级连续性冲突。"

        labels: list[str] = []
        if report.get("timeline_conflicts"):
            labels.append("承接/时间线")
        if report.get("character_conflicts"):
            labels.append("角色一致性")
        if report.get("world_rule_conflicts"):
            labels.append("世界规则")
        if report.get("knowledge_boundary_conflicts"):
            labels.append("知识边界")
        if report.get("open_loop_misalignment"):
            labels.append("伏笔推进")

        lead_issue = None
        for key in (
            "timeline_conflicts",
            "knowledge_boundary_conflicts",
            "world_rule_conflicts",
            "character_conflicts",
            "open_loop_misalignment",
        ):
            items = report.get(key) or []
            if not items:
                continue
            first = items[0]
            if isinstance(first, dict):
                lead_issue = self._safe_text(first.get("issue"))
            if lead_issue:
                break

        label_text = "、".join(labels[:3]) or "连续性"
        if severity == "high":
            return f"发现较高连续性风险，主要集中在{label_text}；首要问题：{lead_issue or '需要人工复核'}。"
        return f"发现一些连续性风险，主要集中在{label_text}；首要问题：{lead_issue or '需要人工复核'}。"

    def _normalize_issue_list(self, value: object) -> list[dict[str, str]]:
        if not isinstance(value, list):
            return []
        normalized: list[dict[str, str]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            issue = self._safe_text(item.get("issue"))
            reason = self._safe_text(item.get("reason"))
            evidence = self._safe_text(item.get("evidence"))
            suggestion = self._safe_text(item.get("suggestion"))
            if not any([issue, reason, evidence, suggestion]):
                continue
            normalized.append(
                {
                    "issue": issue or "",
                    "reason": reason or "",
                    "evidence": evidence or "",
                    "suggestion": suggestion or "",
                }
            )
        return normalized[:8]

    def _extract_json_payload(self, raw: object) -> dict[str, Any]:
        if not isinstance(raw, str):
            raise TypeError("Checker raw response is not a string")

        stripped = raw.strip()
        if not stripped:
            raise ValueError("Checker raw response is empty")

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

        candidate = self._extract_balanced_json_object(stripped)
        if candidate is None:
            raise ValueError("No JSON object found in checker response")

        payload = json.loads(candidate)
        if not isinstance(payload, dict):
            raise ValueError("Checker response JSON is not an object")
        return payload

    def _extract_balanced_json_object(self, raw: str) -> str | None:
        start = raw.find("{")
        if start < 0:
            return None

        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(raw)):
            char = raw[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue

            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return raw[start : index + 1]
        return None

    def _compact_recent_memories(self, value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        compact: list[str] = []
        for item in value[:2]:
            if not isinstance(item, str):
                continue
            clipped = self._clip_text(item, limit=120)
            if clipped:
                compact.append(clipped)
        return compact

    def _compact_string_list(self, value: object, *, limit: int, text_limit: int) -> list[str]:
        if not isinstance(value, list):
            return []
        compact: list[str] = []
        for item in value[:limit]:
            if not isinstance(item, str):
                continue
            clipped = self._clip_text(item, limit=text_limit)
            if clipped:
                compact.append(clipped)
        return compact

    def _compute_severity(self, report: dict[str, Any], fallback: str | None = None) -> str:
        strong_timeline_conflicts = [
            item
            for item in report.get("timeline_conflicts", [])
            if isinstance(item, dict) and self._safe_text(item.get("issue")) != "时间线约束未显式体现"
        ]
        high_signal = len(strong_timeline_conflicts) + len(report.get("world_rule_conflicts", []))
        medium_signal = (
            (len(report.get("timeline_conflicts", [])) - len(strong_timeline_conflicts))
            + len(report.get("character_conflicts", []))
            + len(report.get("knowledge_boundary_conflicts", []))
            + len(report.get("open_loop_misalignment", []))
        )
        if high_signal >= 2 or (high_signal >= 1 and medium_signal >= 2):
            return "high"
        if high_signal >= 1 or medium_signal >= 1:
            return "medium"
        return self._normalize_severity(fallback)

    def _normalize_severity(self, value: object) -> str:
        if isinstance(value, str) and value in {"low", "medium", "high"}:
            return value
        return "low"

    def _has_overlap(self, left: str, right: str) -> bool:
        left_terms = self._extract_terms(left)
        right_terms = self._extract_terms(right)
        return bool(left_terms & right_terms)

    def _has_continuation_anchor_signal(self, anchor: str, draft_leading: str) -> bool:
        if self._has_overlap(anchor, draft_leading):
            return True
        anchor_text = self._safe_text(anchor) or ""
        draft_text = self._safe_text(draft_leading) or ""
        if not anchor_text or not draft_text:
            return False

        tension_ready = any(phrase in anchor_text for phrase in ("盯着", "收紧", "攥", "拽住", "没催", "等她自己开口", "终于下定了决心"))
        speech_release = any(
            phrase in draft_text
            for phrase in ("喉结", "咽回去", "松开", "顿了一下", "终于开口", "声音", "低声", "她说", "他说", "“")
        )
        same_props = any(phrase in anchor_text and phrase in draft_text for phrase in ("便签", "纸角", "手指", "目光", "视线"))
        if tension_ready and (speech_release or same_props):
            return True

        sighting_anchor = any(phrase in anchor_text for phrase in ("看见", "忽然", "反光", "军扣", "半埋"))
        freeze_or_observe = any(
            phrase in draft_text for phrase in ("没有动", "呼吸", "侧耳", "蹲下", "探照灯", "光柱", "观察", "先", "停住")
        )
        if sighting_anchor and freeze_or_observe:
            return True

        encounter_anchor = any(phrase in anchor_text for phrase in ("看见", "从办公室出来", "阴影边上", "安全灯坏了", "忽明忽暗"))
        encounter_follow = any(
            phrase in draft_text for phrase in ("反手带上门", "钥匙", "看见她", "还没走", "这么晚", "朝她走了两步", "半张脸", "坏掉的灯")
        )
        return encounter_anchor and encounter_follow

    def _starts_with_anchor_prefix(self, anchor: str, draft: str) -> bool:
        left = self._safe_text(anchor)
        right = self._safe_text(draft)
        if not left or not right:
            return False
        left_prefix = left[:40]
        right_prefix = right[:60]
        if left_prefix and left_prefix in right_prefix:
            return True
        left_terms = self._extract_terms(left[:60])
        right_terms = self._extract_terms(right[:80])
        return bool(left_terms) and len(left_terms & right_terms) >= max(3, len(left_terms) // 2)

    def _get_first_paragraph(self, draft: str) -> str:
        cleaned = draft.strip()
        if not cleaned:
            return ""
        for separator in ("\r\n\r\n", "\n\n"):
            if separator in cleaned:
                cleaned = cleaned.split(separator, 1)[0]
                break
        if "\n" in cleaned:
            cleaned = cleaned.split("\n", 1)[0]
        return cleaned[:220].strip()

    def _get_last_sentence(self, draft: str) -> str:
        cleaned = draft.strip()
        if not cleaned:
            return ""
        cleaned = cleaned.splitlines()[-1].strip() or cleaned
        parts = [item.strip() for item in re.split(r"(?<=[。！？!?])", cleaned) if item.strip()]
        return (parts[-1] if parts else cleaned)[-120:].strip()

    def _starts_with_fragment_connector(self, paragraph: str) -> bool:
        cleaned = self._safe_text(paragraph) or ""
        if not cleaned:
            return False
        return cleaned.startswith(("连着", "却", "而", "但", "只是", "如果", "可", "偏偏"))

    def _ends_with_fragment_connector(self, sentence: str) -> bool:
        cleaned = self._safe_text(sentence) or ""
        if not cleaned:
            return False
        if cleaned.endswith(("如果", "可是", "可", "而", "却", "只是")):
            return True
        if cleaned.startswith(("如果", "可", "而", "却")) and not any(mark in cleaned for mark in ("。", "！", "？", "!", "?")):
            return True
        fragment_markers = ("会不会就是", "如果真是", "可", "不对", "而这一切", "只是")
        if len(cleaned) <= 18 and any(cleaned.startswith(marker) for marker in fragment_markers):
            return True
        if cleaned.endswith(("会不会", "为什么", "怎么会", "究竟")):
            return True
        return False

    def _starts_with_early_recap(self, paragraph: str) -> bool:
        cleaned = self._safe_text(paragraph) or ""
        if len(cleaned) < 40:
            return False
        reasoning_markers = ("如果", "会不会", "为何", "为什么", "看来", "果然", "原来", "不对", "也就是说")
        scene_markers = ("风", "灯", "脚步", "呼吸", "袖", "手", "目光", "巷", "夜", "门", "墙", "地面", "回头", "停住", "看见", "听见")
        reasoning_hits = sum(1 for item in reasoning_markers if item in cleaned)
        scene_hits = sum(1 for item in scene_markers if item in cleaned)
        return reasoning_hits >= 2 and scene_hits <= 1

    def _looks_like_suspense_loop_stall(self, paragraph: str) -> bool:
        cleaned = self._safe_text(paragraph) or ""
        if len(cleaned) < 60:
            return False
        reasoning_markers = ("为什么", "为何", "到底", "究竟", "会不会", "难道", "不安", "预感", "疑惑", "不解", "猜测", "谜团")
        action_markers = ("走", "跑", "停", "看", "听", "推", "拉", "敲", "问", "答", "翻", "摸", "躲", "追", "跃", "拐", "进", "出")
        reasoning_hits = sum(1 for item in reasoning_markers if item in cleaned)
        action_hits = sum(1 for item in action_markers if item in cleaned)
        return reasoning_hits >= 3 and action_hits <= 2

    def _extract_terms(self, value: str) -> set[str]:
        normalized = "".join(ch if ch.isalnum() else " " for ch in value)
        return {item for item in normalized.split() if len(item) >= 2}

    def _open_loop_progressed(self, loop_text: str, draft_content: str, draft_terms: set[str] | None = None) -> bool:
        terms = draft_terms or self._extract_terms(draft_content)
        loop_terms = self._extract_terms(loop_text)
        if loop_terms & terms:
            return True

        cleaned_loop = self._safe_text(loop_text) or ""
        if not cleaned_loop:
            return False

        lowered = cleaned_loop.lower()
        if "保管" in cleaned_loop or "记录由谁" in cleaned_loop:
            return any(
                phrase in draft_content
                for phrase in ("名字也没用", "那个人", "谁去敲门都没用", "纸条", "别查了", "没看过全本")
            )
        if "为何" in cleaned_loop or "为什么" in cleaned_loop or "回避" in cleaned_loop:
            return any(
                phrase in draft_content
                for phrase in ("我以前试过", "后来都不太愿意提", "不告诉你名字", "别查了", "没有否认")
            )
        if "身份" in cleaned_loop or "到底是谁" in cleaned_loop or "有关系" in cleaned_loop or "异常资金" in cleaned_loop:
            return any(
                phrase in draft_content
                for phrase in ("试探", "旁敲侧击", "转开话头", "没有正面回答", "避开", "只说到这里")
            ) or ("是谁" in lowered and "不是" in draft_content)
        if ("保管" in cleaned_loop or "回避" in cleaned_loop) and any(
            phrase in draft_content for phrase in ("档案室", "不碰档案", "门缝", "事故日期", "欠他一条命")
        ):
            return True
        if "军扣" in cleaned_loop or "拖拽痕迹" in cleaned_loop:
            return any(
                phrase in draft_content
                for phrase in ("军扣", "拖痕", "碎石沟", "坡底", "反光", "编号", "坐标", "走向")
            )
        if "匿名资助人" in cleaned_loop or "资金" in cleaned_loop or "资助款" in cleaned_loop:
            return any(
                phrase in draft_content
                for phrase in ("对账", "数字", "财务", "钥匙", "月底", "办公室", "统筹账户", "协调过了")
            )
        return False

    def _is_specific_constraint(self, value: str) -> bool:
        cleaned = self._safe_text(value)
        if not cleaned:
            return False
        if len(cleaned) < 6:
            return False
        if cleaned in {"时间线", "承接", "白天", "清晨", "场景", "第三章", "当前章节"}:
            return False
        return len(self._extract_terms(cleaned)) >= 2

    def _looks_like_identity_boundary(self, value: str) -> bool:
        cleaned = self._safe_text(value) or ""
        return any(term in cleaned for term in ("真实身份", "匿名资助人", "保管人", "幕后人", "真凶", "内鬼", "就是"))

    def _hits_identity_boundary(self, rule_text: str, draft_content: str) -> bool:
        names = [token for token in re.findall(r"[\u4e00-\u9fff]{2,4}", rule_text) if token not in {"直接说出", "真实身份", "匿名资助", "资助人", "保管人", "幕后人"}]
        identity_terms = ("身份", "资助人", "保管人", "幕后人", "匿名", "真凶", "内鬼")
        copula_terms = ("就是", "正是", "原来是", "果然是", "难道是", "是不是")
        for name in names:
            if name not in draft_content:
                continue
            index = draft_content.find(name)
            window = draft_content[max(0, index - 24): index + 32]
            if any(term in window for term in identity_terms) and any(term in window for term in copula_terms):
                return True
        return False

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


continuity_checker_service = ContinuityCheckerService()
