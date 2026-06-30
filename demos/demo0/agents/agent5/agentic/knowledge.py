"""
Trianz knowledge layer for agent5.

Ingests every file in the git-tracked ``content/`` folder (``.md`` / ``.txt`` /
``.html``) into a lightweight, dependency-free keyword index persisted at
``state/index/knowledge.json`` (rebuildable — excluded from backups). The concierge
calls :func:`search_trianz_knowledge` to ground answers in this content, and the
system prompt is seeded with :func:`overview_text`.

No embeddings / external services: chunks are scored by query-term overlap (a small
TF weighting). This keeps the agent runnable with zero setup; swapping in Bedrock
Titan embeddings later is a drop-in change behind the same tool signature.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from strands import tool

from .paths import CONTENT_DIR, INDEX_DIR

_INDEX_FILE = INDEX_DIR / "knowledge.json"
_CONTENT_GLOBS = ("*.md", "*.txt", "*.html", "*.htm")
_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are",
    "be", "as", "at", "by", "it", "that", "this", "from", "what", "which", "how", "do",
    "does", "can", "you", "your", "our", "we", "i", "about", "tell", "me", "trianz",
}

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_TAG_RE = re.compile(r"<[^>]+>")


def _tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS and len(t) > 1]


def _strip_html(text: str) -> str:
    text = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", text)
    return _TAG_RE.sub(" ", text)


def _title_of(text: str, fallback: str) -> str:
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#"):
            return line.lstrip("#").strip()
        if line:
            return line[:80]
    return fallback


def _chunk(text: str) -> list[str]:
    """Split on blank lines into paragraph-ish chunks, merging tiny ones."""
    raw = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    buf = ""
    for para in raw:
        if len(buf) + len(para) < 400:
            buf = f"{buf}\n\n{para}".strip()
        else:
            if buf:
                chunks.append(buf)
            buf = para
    if buf:
        chunks.append(buf)
    return chunks or ([text.strip()] if text.strip() else [])


def build_index() -> dict:
    """(Re)build the knowledge index from content/ and persist it. Returns the index dict."""
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    docs: list[dict] = []
    files: list[Path] = []
    if CONTENT_DIR.exists():
        for pattern in _CONTENT_GLOBS:
            files.extend(CONTENT_DIR.rglob(pattern))

    for path in sorted(set(files)):
        if path.name.lower() == "readme.md":
            continue
        try:
            raw = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        text = _strip_html(raw) if path.suffix.lower() in (".html", ".htm") else raw
        title = _title_of(text, path.stem)
        rel = path.relative_to(CONTENT_DIR).as_posix()
        for i, chunk in enumerate(_chunk(text)):
            docs.append({
                "source": rel,
                "title": title,
                "chunk_id": f"{rel}#{i}",
                "text": chunk,
                "tokens": _tokenize(chunk),
            })

    index = {"version": 1, "doc_count": len(docs), "file_count": len(set(files)), "docs": docs}
    tmp = str(_INDEX_FILE) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)
    import os
    os.replace(tmp, str(_INDEX_FILE))
    return index


def _load_index() -> dict:
    try:
        return json.loads(_INDEX_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return build_index()


def ensure_index() -> dict:
    """Build the index on boot if absent. Called from FastAPI startup."""
    if not _INDEX_FILE.exists():
        return build_index()
    return _load_index()


def search(query: str, k: int = 4) -> list[dict]:
    """Return the top-k content chunks for a query (by query-term overlap)."""
    index = _load_index()
    q_terms = _tokenize(query)
    if not q_terms or not index.get("docs"):
        return []
    q_set = set(q_terms)
    scored: list[tuple[float, dict]] = []
    for doc in index["docs"]:
        toks = doc.get("tokens") or []
        if not toks:
            continue
        overlap = sum(1 for t in toks if t in q_set)
        if overlap == 0:
            continue
        # Normalise a little by chunk length so long chunks don't always win.
        score = overlap + overlap / (1 + len(toks) / 100.0)
        scored.append((score, doc))
    scored.sort(key=lambda s: s[0], reverse=True)
    return [
        {"title": d["title"], "source": d["source"], "text": d["text"]}
        for _, d in scored[: max(1, k)]
    ]


def overview_text(limit: int = 1200) -> str:
    """Short Trianz overview for the system prompt (prefers 00-overview.*)."""
    index = _load_index()
    overview = [d for d in index.get("docs", []) if d["source"].lower().startswith("00-overview")]
    pool = overview or index.get("docs", [])
    text = "\n\n".join(d["text"] for d in pool[:3])
    return text[:limit].strip()


# ── tool ───────────────────────────────────────────────────────────────────────

@tool
def search_trianz_knowledge(query: str, k: int = 4) -> str:
    """
    Search the Trianz knowledge base (the content/ folder) for passages relevant to a
    question about Trianz's offerings, Concierto platform, services, SI work, or industries.

    Args:
        query: The user's question or topic, e.g. "what is Concierto" or "cloud migration".
        k: Number of passages to return (default 4).

    Returns:
        JSON string: {"count": N, "results": [{"title", "source", "text"}, ...]}.
        Use the returned passages to answer; cite the title. Never invent Trianz facts.
    """
    results = search(query, k)
    return json.dumps({"count": len(results), "results": results}, ensure_ascii=False)
