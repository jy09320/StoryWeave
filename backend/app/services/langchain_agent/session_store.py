"""In-memory conversation session store with TTL-based eviction."""
from __future__ import annotations

import time
from typing import Any

_TTL_SECONDS = 4 * 3600  # 4 hours

# session_id → (messages, last_access_timestamp)
_store: dict[str, tuple[list[Any], float]] = {}


def get_history(session_id: str) -> list[Any]:
    entry = _store.get(session_id)
    if entry is None:
        return []
    messages, ts = entry
    if time.time() - ts > _TTL_SECONDS:
        del _store[session_id]
        return []
    return list(messages)


def save_history(session_id: str, messages: list[Any]) -> None:
    _store[session_id] = (list(messages), time.time())


def clear_history(session_id: str) -> None:
    _store.pop(session_id, None)


def _evict_expired() -> None:
    now = time.time()
    expired = [sid for sid, (_, ts) in _store.items() if now - ts > _TTL_SECONDS]
    for sid in expired:
        del _store[sid]
