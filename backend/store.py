"""Persistent, thread-safe cache for analysis results and pipeline state.

Why this exists: running four LLM agents on a local 3B model takes minutes.
Results are computed once (in the background, right after documents are
indexed), saved to disk, and served instantly to the dashboard afterwards.
"""

import hashlib
import json
import threading
import time
from pathlib import Path
from typing import Any, Optional


def fingerprint_for(document_ids: list[str]) -> str:
    """Stable fingerprint of the set of documents an analysis was built from."""
    joined = "|".join(sorted(document_ids))
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()[:16]


class AnalysisStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.RLock()
        self._data: dict[str, Any] = {"results": {}, "state": self._idle_state()}
        self._load()

    @staticmethod
    def _idle_state() -> dict[str, Any]:
        return {
            "status": "idle",  # idle | running | error
            "stage": None,
            "message": "No analysis has been run yet.",
            "progress": 0,
            "scope": None,
            "started_at": None,
            "finished_at": None,
            "error": None,
            "stage_errors": {},
        }

    # ------------------------------------------------------------ persistence
    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            loaded = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                self._data["results"] = loaded.get("results", {}) or {}
        except (json.JSONDecodeError, OSError):
            pass
        # A server restart means no job is really running any more.
        self._data["state"] = self._idle_state()
        if self._data["results"]:
            self._data["state"]["message"] = "Loaded saved analysis."

    def _save(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        payload = {"results": self._data["results"]}
        tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self.path)

    # ---------------------------------------------------------------- results
    def get_results(self, scope: str) -> Optional[dict[str, Any]]:
        with self._lock:
            result = self._data["results"].get(scope)
            return json.loads(json.dumps(result)) if result else None

    def set_part(self, scope: str, key: str, value: Any, **meta: Any) -> None:
        """Store one part (scope_analysis, risk_analysis, ...) and persist."""
        with self._lock:
            bucket = self._data["results"].setdefault(scope, {"scope": scope})
            bucket[key] = value
            bucket.update(meta)
            bucket["updated_at"] = time.time()
            self._save()

    def set_document(self, scope: str, doc_type: str, value: Any) -> None:
        with self._lock:
            bucket = self._data["results"].setdefault(scope, {"scope": scope})
            bucket.setdefault("documents", {})[doc_type] = value
            bucket["updated_at"] = time.time()
            self._save()

    def clear_scope(self, scope: str) -> None:
        with self._lock:
            self._data["results"].pop(scope, None)
            self._save()

    def drop_document_scope(self, document_id: str) -> None:
        self.clear_scope(document_id)

    # ------------------------------------------------------------------ state
    def get_state(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._data["state"])

    def set_state(self, **fields: Any) -> dict[str, Any]:
        with self._lock:
            self._data["state"].update(fields)
            return dict(self._data["state"])

    def reset_state(self, **fields: Any) -> None:
        with self._lock:
            state = self._idle_state()
            state.update(fields)
            self._data["state"] = state

    # ------------------------------------------------------------- staleness
    def is_stale(self, scope: str, fingerprint: str) -> bool:
        with self._lock:
            bucket = self._data["results"].get(scope)
            if not bucket:
                return True
            return bucket.get("fingerprint") != fingerprint
