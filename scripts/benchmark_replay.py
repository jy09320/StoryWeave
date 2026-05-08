#!/usr/bin/env python3
"""
StoryWeave continuation benchmark dataset checker and replay planner.

This first version does not execute live API calls yet.
It validates dataset structure and emits a replay plan/report skeleton
so benchmark samples can be curated before the runner is wired up.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import sys
from time import perf_counter
from typing import Any

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = WORKSPACE_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

DEFAULT_DATASET = Path("backend/app/benchmarks/datasets/continuation/sample.v1.json")
DEFAULT_REPORT_DIR = Path("backend/app/benchmarks/reports")

VARIANT_ENDPOINTS = {
    "baseline": "/api/ai/generate-once",
    "pipeline": "/api/ai/continuation/generate",
    "pipeline-debug": "/api/ai/continuation/debug",
}

_LIVE_IMPORTS: dict[str, Any] | None = None


class DatasetError(Exception):
    pass


@dataclass
class ValidationIssue:
    sample_id: str
    message: str


def load_dataset(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise DatasetError(f"Dataset file not found: {path}")

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DatasetError(f"Invalid JSON in dataset: {exc}") from exc

    if not isinstance(payload, list):
        raise DatasetError("Dataset root must be a JSON array")
    return payload


def require_non_empty_string(sample_id: str, value: Any, field_name: str, issues: list[ValidationIssue]) -> None:
    if not isinstance(value, str) or not value.strip():
        issues.append(ValidationIssue(sample_id, f"`{field_name}` must be a non-empty string"))


def require_list(sample_id: str, value: Any, field_name: str, issues: list[ValidationIssue]) -> None:
    if not isinstance(value, list):
        issues.append(ValidationIssue(sample_id, f"`{field_name}` must be a list"))


def validate_sample(sample: dict[str, Any]) -> list[ValidationIssue]:
    sample_id = str(sample.get("id") or "<missing-id>")
    issues: list[ValidationIssue] = []

    require_non_empty_string(sample_id, sample.get("id"), "id", issues)
    require_non_empty_string(sample_id, sample.get("name"), "name", issues)
    require_non_empty_string(sample_id, sample.get("group"), "group", issues)

    if not isinstance(sample.get("enabled"), bool):
        issues.append(ValidationIssue(sample_id, "`enabled` must be a boolean"))

    project_snapshot = sample.get("project_snapshot")
    if not isinstance(project_snapshot, dict):
        issues.append(ValidationIssue(sample_id, "`project_snapshot` must be an object"))
    else:
        require_non_empty_string(sample_id, project_snapshot.get("project_title"), "project_snapshot.project_title", issues)
        chapters = project_snapshot.get("chapters")
        if not isinstance(chapters, list) or not chapters:
            issues.append(ValidationIssue(sample_id, "`project_snapshot.chapters` must be a non-empty list"))

    request = sample.get("request")
    if not isinstance(request, dict):
        issues.append(ValidationIssue(sample_id, "`request` must be an object"))
    else:
        require_non_empty_string(sample_id, request.get("instruction"), "request.instruction", issues)
        if not isinstance(request.get("text"), str):
            issues.append(ValidationIssue(sample_id, "`request.text` must be a string"))
        require_non_empty_string(sample_id, request.get("model_provider"), "request.model_provider", issues)
        require_non_empty_string(sample_id, request.get("model_id"), "request.model_id", issues)
        if not isinstance(request.get("max_tokens"), int):
            issues.append(ValidationIssue(sample_id, "`request.max_tokens` must be an integer"))

    expectations = sample.get("expectations")
    if not isinstance(expectations, dict):
        issues.append(ValidationIssue(sample_id, "`expectations` must be an object"))
    else:
        require_non_empty_string(sample_id, expectations.get("continuation_anchor"), "expectations.continuation_anchor", issues)
        require_list(sample_id, expectations.get("must_include"), "expectations.must_include", issues)
        require_list(sample_id, expectations.get("must_avoid"), "expectations.must_avoid", issues)

    metadata = sample.get("metadata")
    if not isinstance(metadata, dict):
        issues.append(ValidationIssue(sample_id, "`metadata` must be an object"))
    else:
        require_list(sample_id, metadata.get("failure_modes"), "metadata.failure_modes", issues)

    live_request = sample.get("live_request")
    if live_request is not None:
        if not isinstance(live_request, dict):
            issues.append(ValidationIssue(sample_id, "`live_request` must be an object when present"))
        else:
            require_non_empty_string(sample_id, live_request.get("project_id"), "live_request.project_id", issues)
            chapter_id = live_request.get("chapter_id")
            if chapter_id is not None and not isinstance(chapter_id, str):
                issues.append(ValidationIssue(sample_id, "`live_request.chapter_id` must be a string or null"))
            owner_id = live_request.get("owner_id")
            if owner_id is not None and not isinstance(owner_id, str):
                issues.append(ValidationIssue(sample_id, "`live_request.owner_id` must be a string or null"))

    return issues


def build_replay_plan(
    dataset_path: Path,
    samples: list[dict[str, Any]],
    variants: list[str],
) -> dict[str, Any]:
    enabled_samples = [sample for sample in samples if sample.get("enabled", False)]

    planned_runs: list[dict[str, Any]] = []
    for sample in enabled_samples:
        for variant in variants:
            planned_runs.append(
                {
                    "benchmark_id": sample["id"],
                    "benchmark_name": sample["name"],
                    "variant": variant,
                    "target_endpoint": VARIANT_ENDPOINTS[variant],
                    "status": "planned",
                }
            )

    failure_mode_counts: dict[str, int] = {}
    for sample in enabled_samples:
        for item in sample.get("metadata", {}).get("failure_modes", []):
            if isinstance(item, str) and item.strip():
                failure_mode_counts[item] = failure_mode_counts.get(item, 0) + 1

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "dataset_path": str(dataset_path),
        "enabled_sample_count": len(enabled_samples),
        "variant_count": len(variants),
        "planned_run_count": len(planned_runs),
        "failure_mode_counts": failure_mode_counts,
        "planned_runs": planned_runs,
    }


def build_request_payload(sample: dict[str, Any]) -> dict[str, Any]:
    request = sample["request"]
    live_request = sample.get("live_request") or {}
    return {
        "project_id": live_request["project_id"],
        "chapter_id": live_request.get("chapter_id"),
        "text": request.get("text", ""),
        "instruction": request["instruction"],
        "model_provider": request.get("model_provider"),
        "model_id": request.get("model_id"),
        "temperature": float(request.get("temperature", 0.8)),
        "max_tokens": int(request.get("max_tokens", 2000)),
        "owner_id": live_request.get("owner_id"),
    }


async def execute_live_run(sample: dict[str, Any], variant: str) -> dict[str, Any]:
    live_imports = get_live_imports()
    async_session = live_imports["async_session"]
    ai_service = live_imports["ai_service"]
    continuation_pipeline_service = live_imports["continuation_pipeline_service"]

    if not isinstance(sample.get("live_request"), dict):
        return {
            "benchmark_id": sample["id"],
            "benchmark_name": sample["name"],
            "variant": variant,
            "status": "skipped",
            "reason": "missing live_request mapping",
        }

    payload = build_request_payload(sample)
    started = perf_counter()

    try:
        async with async_session() as db:
            if variant == "baseline":
                content = await ai_service.generate_text(
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
                result = {
                    "final_content": content,
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
            "artifacts": {"request_payload": payload},
        }

    latency_ms = round((perf_counter() - started) * 1000, 2)
    artifacts: dict[str, Any] = {"request_payload": payload}
    if variant == "pipeline-debug":
        artifacts["plan"] = result.get("plan", {})
        artifacts["context_bundle"] = result.get("context_bundle", {})
        artifacts["draft"] = result.get("draft", {})
        artifacts["continuity_report"] = result.get("continuity_report", {})
    elif variant == "pipeline":
        artifacts["continuity_report"] = result.get("continuity_report", {})

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
        },
        "artifacts": artifacts,
    }


async def execute_live_replay(samples: list[dict[str, Any]], variants: list[str], sample_ids: set[str] | None) -> dict[str, Any]:
    enabled_samples = [sample for sample in samples if sample.get("enabled", False)]
    if sample_ids:
        enabled_samples = [sample for sample in enabled_samples if sample.get("id") in sample_ids]

    results: list[dict[str, Any]] = []
    for sample in enabled_samples:
        for variant in variants:
            results.append(await execute_live_run(sample, variant))

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "mode": "live",
        "selected_sample_count": len(enabled_samples),
        "variant_count": len(variants),
        "result_count": len(results),
        "results": results,
    }


def get_live_imports() -> dict[str, Any]:
    global _LIVE_IMPORTS
    if _LIVE_IMPORTS is not None:
        return _LIVE_IMPORTS

    try:
        from app.core.database import async_session  # type: ignore
        from app.services.ai_service import ai_service  # type: ignore
        from app.services.continuation_pipeline_service import continuation_pipeline_service  # type: ignore
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Live replay requires backend Python dependencies. "
            "Install backend deps first, then rerun with --execute-live."
        ) from exc

    _LIVE_IMPORTS = {
        "async_session": async_session,
        "ai_service": ai_service,
        "continuation_pipeline_service": continuation_pipeline_service,
    }
    return _LIVE_IMPORTS


def write_report(report_dir: Path, report: dict[str, Any]) -> Path:
    report_dir.mkdir(parents=True, exist_ok=True)
    filename = f"replay-plan-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    output_path = report_dir / filename
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate StoryWeave benchmark datasets and emit a replay plan.")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET,
        help=f"Path to benchmark dataset JSON. Default: {DEFAULT_DATASET}",
    )
    parser.add_argument(
        "--variant",
        action="append",
        choices=sorted(VARIANT_ENDPOINTS.keys()),
        dest="variants",
        help="Benchmark variant to include. Repeat for multiple variants. Defaults to baseline + pipeline + pipeline-debug.",
    )
    parser.add_argument(
        "--report-dir",
        type=Path,
        default=DEFAULT_REPORT_DIR,
        help=f"Directory for generated replay plan reports. Default: {DEFAULT_REPORT_DIR}",
    )
    parser.add_argument(
        "--no-write",
        action="store_true",
        help="Validate and print the replay plan without writing a report file.",
    )
    parser.add_argument(
        "--execute-live",
        action="store_true",
        help="Execute live benchmark runs through the service layer. Samples without `live_request` will be skipped.",
    )
    parser.add_argument(
        "--sample-id",
        action="append",
        dest="sample_ids",
        help="Restrict execution to one or more benchmark sample ids.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    variants = args.variants or ["baseline", "pipeline", "pipeline-debug"]

    try:
        samples = load_dataset(args.dataset)
    except DatasetError as exc:
        print(f"[benchmark] {exc}")
        return 1

    issues: list[ValidationIssue] = []
    seen_ids: set[str] = set()
    for sample in samples:
        issues.extend(validate_sample(sample))
        sample_id = sample.get("id")
        if isinstance(sample_id, str) and sample_id:
            if sample_id in seen_ids:
                issues.append(ValidationIssue(sample_id, "duplicate benchmark id"))
            seen_ids.add(sample_id)

    if issues:
        print("[benchmark] Dataset validation failed:")
        for issue in issues:
            print(f"  - {issue.sample_id}: {issue.message}")
        return 1

    report = build_replay_plan(args.dataset, samples, variants)
    print("[benchmark] Dataset validation passed")
    print(f"[benchmark] Enabled samples: {report['enabled_sample_count']}")
    print(f"[benchmark] Planned variants: {', '.join(variants)}")
    print(f"[benchmark] Planned runs: {report['planned_run_count']}")

    if report["failure_mode_counts"]:
        print("[benchmark] Failure mode coverage:")
        for key, count in sorted(report["failure_mode_counts"].items()):
            print(f"  - {key}: {count}")

    if args.execute_live:
        try:
            live_report = asyncio.run(execute_live_replay(samples, variants, set(args.sample_ids or [])))
        except RuntimeError as exc:
            print(f"[benchmark] {exc}")
            return 1
        completed = sum(1 for item in live_report["results"] if item["status"] == "completed")
        skipped = sum(1 for item in live_report["results"] if item["status"] == "skipped")
        failed = sum(1 for item in live_report["results"] if item["status"] == "failed")
        print(f"[benchmark] Live execution completed: {completed} completed, {skipped} skipped, {failed} failed")
        if args.no_write:
            print("[benchmark] Live report file skipped (--no-write)")
            return 0
        output_path = write_report(args.report_dir, live_report)
        print(f"[benchmark] Live report written to: {output_path}")
        return 0

    if args.no_write:
        print("[benchmark] Replay plan file skipped (--no-write)")
        return 0

    output_path = write_report(args.report_dir, report)
    print(f"[benchmark] Replay plan written to: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
