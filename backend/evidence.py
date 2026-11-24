"""Evidence selection for the analysis agents (pure logic, no I/O).

Instead of blindly truncating the concatenated documents (which silently drops
everything after the first ~18k characters), the agents receive the chunks most
relevant to their task, with a guaranteed minimum from every document.
"""

from typing import Iterable

OVERHEAD = 70  # characters used by the "Source: ..." header of each chunk


def select_chunks(ranked: Iterable[tuple[str, dict]], max_chars: int, per_doc_min: int = 2) -> list[tuple[str, dict]]:
    """Pick chunks in rank order within `max_chars`, ensuring document coverage."""
    ranked = [(t, m) for t, m in ranked if t and t.strip()]
    chosen: list[tuple[str, dict]] = []
    taken: set[int] = set()
    per_file: dict[str, int] = {}
    used = 0

    for idx, (text, meta) in enumerate(ranked):  # pass 1: coverage
        name = meta.get("filename", "")
        if per_file.get(name, 0) >= per_doc_min:
            continue
        cost = len(text) + OVERHEAD
        if used + cost > max_chars:
            continue
        chosen.append((text, meta))
        taken.add(idx)
        per_file[name] = per_file.get(name, 0) + 1
        used += cost

    for idx, (text, meta) in enumerate(ranked):  # pass 2: fill by rank
        if idx in taken:
            continue
        cost = len(text) + OVERHEAD
        if used + cost > max_chars:
            continue
        chosen.append((text, meta))
        used += cost

    chosen.sort(key=lambda item: (item[1].get("filename", ""), item[1].get("chunk_index", 0)))
    return chosen


def format_context(selected: list[tuple[str, dict]]) -> tuple[str, list[dict]]:
    parts = []
    sources: list[dict] = []
    for text, meta in selected:
        filename = meta.get("filename", "Unknown document")
        location = meta.get("location", "Unknown location")
        parts.append(f"Source: {filename} | {location}\nEvidence:\n{text}")
        source = {"filename": filename, "location": location, "chunk_index": meta.get("chunk_index")}
        if source not in sources:
            sources.append(source)
    return "\n\n---\n\n".join(parts), sources
