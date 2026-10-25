"""
Vector store service — Phase 5
Manages the embedding corpus for similarity/plagiarism detection.
Uses in-memory numpy storage for dev; replace with FAISS or pgvector for prod.
"""
import logging
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)


class VectorStore:
    """Simple in-memory vector store for development.

    In production, replace with FAISS or pgvector for persistence
    and efficient approximate nearest-neighbor search.
    """

    def __init__(self):
        self._embeddings: dict[str, np.ndarray] = {}  # submission_id → embedding matrix
        self._sentences: dict[str, list[dict]] = {}    # submission_id → list of {id, text}

    def add(self, submission_id: str, sentences: list[dict], embeddings: np.ndarray):
        """Store embeddings for a submission."""
        self._embeddings[submission_id] = embeddings
        self._sentences[submission_id] = sentences
        logger.info(f"VectorStore: indexed {len(sentences)} sentences for {submission_id}")

    def remove(self, submission_id: str):
        """Remove a submission from the store."""
        self._embeddings.pop(submission_id, None)
        self._sentences.pop(submission_id, None)

    def get_corpus(self, exclude_id: str | None = None) -> list[dict]:
        """Return all stored submissions as corpus entries (excluding the given id).

        Returns list of: {"submission_id", "sentences", "embeddings"}
        """
        corpus = []
        for sid, embs in self._embeddings.items():
            if sid == exclude_id:
                continue
            corpus.append({
                "submission_id": sid,
                "sentences": self._sentences.get(sid, []),
                "embeddings": embs,
            })
        return corpus

    @property
    def size(self) -> int:
        return len(self._embeddings)


# Singleton instance
vector_store = VectorStore()
