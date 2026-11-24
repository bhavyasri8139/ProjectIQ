"""Text embeddings for the knowledge base.

Default: Chroma's built-in ONNX model (all-MiniLM-L6-v2). It runs inside the
Python process, needs no Ollama, and embeds a whole document in about a second.
It is downloaded once (~80 MB) the first time the backend starts.

Alternative: PROJECTIQ_EMBED_PROVIDER=ollama uses `nomic-embed-text` through Ollama.

Each provider writes to its own Chroma collection, because their vectors have
different sizes and cannot be mixed.
"""

import logging
import os
import threading

logger = logging.getLogger("projectiq.embeddings")

PROVIDER = (os.getenv("PROJECTIQ_EMBED_PROVIDER") or "local").strip().lower()
if PROVIDER not in {"local", "ollama"}:
    PROVIDER = "local"

OLLAMA_MODEL = (os.getenv("PROJECTIQ_EMBED_MODEL") or "nomic-embed-text").strip()
MODEL_NAME = OLLAMA_MODEL if PROVIDER == "ollama" else "all-MiniLM-L6-v2"
COLLECTION = "project_documents" if PROVIDER == "ollama" else "project_documents_minilm"
BATCH_SIZE = 64

_local_fn = None
_lock = threading.Lock()


def _local_embed(batch: list[str]) -> list[list[float]]:
    global _local_fn
    with _lock:  # serialised: the model is quick and this avoids first-use races
        if _local_fn is None:
            from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

            _local_fn = DefaultEmbeddingFunction()
        vectors = _local_fn(batch)
    return [[float(x) for x in vector] for vector in vectors]


def _ollama_embed(batch: list[str]) -> list[list[float]]:
    import ollama

    keep_alive = os.getenv("PROJECTIQ_KEEP_ALIVE", "30m")
    return ollama.embed(model=OLLAMA_MODEL, input=batch, keep_alive=keep_alive)["embeddings"]


def embed_texts(texts: list[str], batch_size: int = BATCH_SIZE) -> list[list[float]]:
    if not texts:
        return []
    embed = _ollama_embed if PROVIDER == "ollama" else _local_embed
    out: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        vectors = embed(batch)
        if len(vectors) != len(batch):
            raise RuntimeError("The embedding model returned an unexpected number of vectors.")
        out.extend(vectors)
    return out


def embed_one(text: str) -> list[float]:
    vectors = embed_texts([text])
    if not vectors:
        raise RuntimeError("No embedding was generated.")
    return vectors[0]


def warm_up() -> None:
    """Load (and, the first time, download) the model. Raises if it is unavailable."""
    embed_texts(["warm up"])
