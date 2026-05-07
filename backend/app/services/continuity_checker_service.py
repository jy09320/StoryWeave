from __future__ import annotations

import json
import logging
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
3. 不要编造上下文中不存在的设定"""


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
                max_tokens=1100,
                owner_id=request.get("owner_id"),
            )
        except Exception as exc:
            logger.warning("Continuity checker failed, using rule-based report only: %s", exc)
            base_report["check_status"] = "skipped"
            return base_report

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Continuity checker returned invalid JSON, using rule-based report only")
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

        previous_tail = self._safe_text(context_bundle.get("previous_chapter_tail")) or ""
        if previous_tail and draft_content:
            if self._has_overlap(previous_tail[-120:], draft_content[:220]) is False:
                report["timeline_conflicts"].append(
                    {
                        "issue": "承接可能偏弱",
                        "reason": "候选正文开头与上一章结尾缺少明显语义承接。",
                        "evidence": self._clip_text(previous_tail[-120:], limit=120) or "",
                        "suggestion": "检查开头是否需要补一个承接动作、情绪或场景锚点。",
                    }
                )

        for item in plan.get("timeline_constraints") or []:
            if isinstance(item, str) and item and item not in draft_content:
                report["timeline_conflicts"].append(
                    {
                        "issue": "时间线约束未显式体现",
                        "reason": "规划里存在时间/地点约束，但候选正文中未明显出现。",
                        "evidence": item,
                        "suggestion": "确认该约束是否应通过动作、地点或叙述语句显式保留。",
                    }
                )

        open_loops = plan.get("relevant_open_loops") or []
        if open_loops and not any(loop in draft_content for loop in open_loops if isinstance(loop, str)):
            report["open_loop_misalignment"].append(
                {
                    "issue": "相关伏笔未被触及",
                    "reason": "本次规划要求关注的 open loop 在候选正文中没有明显推进痕迹。",
                    "evidence": self._clip_text(" / ".join(str(item) for item in open_loops[:3]), limit=140) or "",
                    "suggestion": "至少补一个关联动作、提及或悬念延续点。",
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
        parts = [
            f"用户任务：{request.get('user_instruction') or ''}",
            "续写计划：",
            json.dumps(plan, ensure_ascii=False),
            "上下文包摘要：",
            json.dumps(
                {
                    "story_memory_summary": context_bundle.get("story_memory_summary"),
                    "current_chapter_summary": context_bundle.get("current_chapter_summary"),
                    "recent_memories": context_bundle.get("recent_memories"),
                    "character_context": context_bundle.get("character_context"),
                    "world_context": context_bundle.get("world_context"),
                    "query_terms": context_bundle.get("query_terms"),
                },
                ensure_ascii=False,
            ),
            "候选正文：",
            self._clip_text(draft_content, limit=3000) or "",
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
        merged["summary"] = llm_report.get("summary") or base_report.get("summary") or ""
        merged["check_status"] = "completed"
        return merged

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

    def _compute_severity(self, report: dict[str, Any], fallback: str | None = None) -> str:
        high_signal = len(report.get("timeline_conflicts", [])) + len(report.get("world_rule_conflicts", []))
        medium_signal = (
            len(report.get("character_conflicts", []))
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
        left_terms = {term for term in left.split() if len(term) >= 2}
        right_terms = {term for term in right.split() if len(term) >= 2}
        return bool(left_terms & right_terms)

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
