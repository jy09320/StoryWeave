#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List


VALID_MODES = {"ros1_full", "ros1_mixed", "ros2_full", "ros2_mixed"}


def load_json(path: Path) -> Dict:
    if not path.exists():
        return {}
    try:
        with open(path) as f:
            return json.load(f) or {}
    except Exception:
        return {}


def build_repair_updates(session_dir: Path) -> Dict[str, str]:
    meta = load_json(session_dir / "meta.json")
    task_info = load_json(session_dir / "metadata" / "task_info.json")
    updates: Dict[str, str] = {}

    mode = str(meta.get("mode") or "").strip()
    if mode not in VALID_MODES:
        fallback_mode = str(task_info.get("mode") or "").strip()
        if fallback_mode in VALID_MODES:
            updates["mode"] = fallback_mode

    profile = str(meta.get("profile") or "").strip()
    if not profile:
        fallback_profile = str(task_info.get("profile") or "").strip()
        updates["profile"] = fallback_profile or "unknown"

    return updates


def repair_session(session_dir: Path, dry_run: bool) -> Dict[str, object]:
    updates = build_repair_updates(session_dir)
    if not updates:
        return {"session": session_dir.name, "updated": False, "updates": {}}

    if not dry_run:
        meta_path = session_dir / "meta.json"
        meta = load_json(meta_path)
        meta.update(updates)
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)

    return {"session": session_dir.name, "updated": True, "updates": updates}


def collect_session_dirs(records_dir: Path) -> List[Path]:
    return sorted(
        [
            item
            for item in records_dir.iterdir()
            if item.is_dir() and not item.name.startswith(".")
        ],
        key=lambda path: path.name,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Repair session meta.json files using metadata/task_info.json.")
    parser.add_argument("records_dir", nargs="?", default="/app/records", help="Records root directory")
    parser.add_argument("--apply", action="store_true", help="Write changes back to meta.json")
    args = parser.parse_args()

    records_dir = Path(args.records_dir).resolve()
    if not records_dir.exists():
        print(f"records_dir_not_found {records_dir}")
        return 1

    repaired = 0
    scanned = 0
    for session_dir in collect_session_dirs(records_dir):
        scanned += 1
        result = repair_session(session_dir, dry_run=not args.apply)
        if not result["updated"]:
            continue
        repaired += 1
        action = "would_update" if not args.apply else "updated"
        print(f"{action} {result['session']} {json.dumps(result['updates'], ensure_ascii=True, sort_keys=True)}")

    print(f"scanned={scanned} repaired={repaired} apply={args.apply}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
