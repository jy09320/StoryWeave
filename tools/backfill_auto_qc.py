from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.services.auto_qc_service import (  # noqa: E402
    AUTO_QC_STATUS_ERROR,
    AUTO_QC_STATUS_FAILED,
    AUTO_QC_STATUS_PASSED,
    AUTO_QC_STATUS_RUNNING,
    AUTO_QC_STATUS_UNKNOWN,
    AutoQcService,
)
from backend.services.session_service import SessionService  # noqa: E402
from backend.utils.config_loader import ConfigManager  # noqa: E402


ACTIVE_SESSION_STATUSES = {"recording", "converting"}
KNOWN_QC_STATUSES = {
    AUTO_QC_STATUS_PASSED,
    AUTO_QC_STATUS_FAILED,
    AUTO_QC_STATUS_ERROR,
    AUTO_QC_STATUS_RUNNING,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Auto QC once for existing DAQ recording sessions.",
    )
    parser.add_argument(
        "--records-dir",
        type=Path,
        default=None,
        help="Records directory. Defaults to current record profile output_root.",
    )
    parser.add_argument(
        "--session",
        action="append",
        default=[],
        help="Session name or glob pattern. Can be repeated. Defaults to all sessions.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-run QC even when a session already has a known auto_qc_status.",
    )
    parser.add_argument(
        "--include-active",
        action="store_true",
        help="Also process sessions whose meta status is recording/converting.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print candidate sessions; do not run QC or write metadata.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process at most N candidate sessions. 0 means no limit.",
    )
    return parser.parse_args()


def matches_patterns(name: str, patterns: Iterable[str]) -> bool:
    patterns = [pattern for pattern in patterns if pattern]
    if not patterns:
        return True
    path = Path(name)
    return any(name == pattern or path.match(pattern) for pattern in patterns)


def should_process(meta: dict[str, Any], force: bool, include_active: bool) -> tuple[bool, str]:
    session_status = str(meta.get("status") or "").strip().lower()
    if not include_active and session_status in ACTIVE_SESSION_STATUSES:
        return False, f"skip active status={session_status}"

    qc_status = str(meta.get("auto_qc_status") or AUTO_QC_STATUS_UNKNOWN).strip().lower()
    if not force and qc_status in KNOWN_QC_STATUSES:
        return False, f"skip existing auto_qc_status={qc_status}"

    return True, "candidate"


def main() -> int:
    args = parse_args()
    config_dir = PROJECT_ROOT / "config"
    config_manager = ConfigManager(config_dir=str(config_dir))
    config_manager.load_all()
    session_service = SessionService(config_manager)
    qc_service = AutoQcService(config_manager, session_service)

    records_dir = args.records_dir.resolve() if args.records_dir else session_service.get_records_dir()
    if not records_dir.exists() or not records_dir.is_dir():
        print(f"records dir not found: {records_dir}", file=sys.stderr)
        return 1

    candidates: list[Path] = []
    skipped = 0
    for session_path in sorted(records_dir.iterdir(), key=lambda p: p.name):
        if not session_path.is_dir() or session_path.name.startswith("."):
            continue
        if not matches_patterns(session_path.name, args.session):
            continue

        meta = session_service.resolve_session_meta(session_path)
        ok, reason = should_process(meta, force=args.force, include_active=args.include_active)
        if not ok:
            skipped += 1
            print(f"[skip] {session_path.name}: {reason}")
            continue
        candidates.append(session_path)
        if args.limit > 0 and len(candidates) >= args.limit:
            break

    if args.dry_run:
        print(f"dry-run candidates={len(candidates)} skipped={skipped} records_dir={records_dir}")
        for session_path in candidates:
            print(f"[candidate] {session_path.name}")
        return 0

    counts = {
        AUTO_QC_STATUS_PASSED: 0,
        AUTO_QC_STATUS_FAILED: 0,
        AUTO_QC_STATUS_ERROR: 0,
    }
    for index, session_path in enumerate(candidates, start=1):
        print(f"[{index}/{len(candidates)}] QC {session_path.name} ...", flush=True)
        report = qc_service.run_qc(session_path)
        status = str(report.get("status") or AUTO_QC_STATUS_UNKNOWN)
        counts[status] = counts.get(status, 0) + 1
        print(f"  -> {status}: {report.get('message') or ''}", flush=True)

    print(
        "done "
        f"processed={len(candidates)} skipped={skipped} "
        f"passed={counts.get(AUTO_QC_STATUS_PASSED, 0)} "
        f"failed={counts.get(AUTO_QC_STATUS_FAILED, 0)} "
        f"error={counts.get(AUTO_QC_STATUS_ERROR, 0)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
