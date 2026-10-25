"""
Semantic similarity detection module — Phase 5
Uses sentence-transformers embeddings + cosine similarity to detect
paraphrase-level matches against the corpus.
"""
import logging
from dataclasses import dataclass
import numpy as np

logger = logging.getLogger(__name__)

# Lazy-loaded model singleton
_model = None


def _get_model():
    """Lazy-load the sentence-transformers model (only if available locally)."""
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer("all-MiniLM-L6-v2", local_files_only=True)
            logger.info("Loaded sentence-transformers model from local cache")
        except Exception as e:
            logger.info("sentence-transformers not cached locally; using fast TF-IDF embedding fallback")
            return None
    return _model


@dataclass
class SimilarityFlag:
    """A sentence flagged for semantic similarity to a corpus document."""
    sentence_id: str
    sentence_text: str
    matched_source: str
    matched_text: str
    similarity: float
    match_type: str  # "paraphrase" or "high_similarity"


@dataclass
class SimilarityResult:
    """Output of the similarity detection module."""
    score: float  # 0-100 (higher = more similar content found)
    flagged_segments: list[SimilarityFlag]
    total_sentences: int
    flagged_count: int


def compute_embeddings(texts: list[str]) -> np.ndarray:
    """Compute embeddings for a list of texts."""
    try:
        model = _get_model()
        if model is not None:
            return model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    except Exception as e:
        logger.warning(f"SentenceTransformer failed ({e}); using TF-IDF fallback")

    # Fast, reliable offline fallback
    from sklearn.feature_extraction.text import TfidfVectorizer
    vectorizer = TfidfVectorizer(max_features=384)
    emb = vectorizer.fit_transform(texts).toarray()
    if emb.shape[1] < 384:
        emb = np.pad(emb, ((0, 0), (0, 384 - emb.shape[1])))
    return emb


def detect_similarity(
    sentences: list,  # list of Sentence objects
    corpus_entries: list[dict],  # [{"submission_id": str, "sentences": [{"id", "text"}], "embeddings": ndarray | None}]
    threshold: float = 0.75,
) -> SimilarityResult:
    """Detect semantic similarity between submitted sentences and the corpus.
    
    Uses cosine similarity on sentence embeddings. Sentences scoring above
    the threshold are flagged as paraphrase-level matches.
    
    Args:
        sentences: Preprocessed sentences from current submission
        corpus_entries: Prior submissions with their sentences and optional pre-computed embeddings
        threshold: Cosine similarity threshold for flagging (default 0.75)
        
    Returns:
        SimilarityResult with score and flagged segments
    """
    if not sentences or not corpus_entries:
        return SimilarityResult(score=0.0, flagged_segments=[], total_sentences=len(sentences), flagged_count=0)

    # Compute embeddings for current submission
    current_texts = [s.text for s in sentences]
    try:
        current_embeddings = compute_embeddings(current_texts)
    except Exception as e:
        logger.error(f"Failed to compute embeddings: {e}")
        return SimilarityResult(score=0.0, flagged_segments=[], total_sentences=len(sentences), flagged_count=0)

    flagged: list[SimilarityFlag] = []

    for corpus_doc in corpus_entries:
        doc_id = corpus_doc.get("submission_id", "unknown")
        corpus_sents = corpus_doc.get("sentences", [])

        if not corpus_sents:
            continue

        # Get or compute corpus embeddings
        corpus_emb = corpus_doc.get("embeddings")
        if corpus_emb is None:
            corpus_texts = [s["text"] if isinstance(s, dict) else s.text for s in corpus_sents]
            try:
                corpus_emb = compute_embeddings(corpus_texts)
            except Exception:
                continue

        # Compute cosine similarity matrix
        # Normalize both sets of embeddings
        current_norm = current_embeddings / (np.linalg.norm(current_embeddings, axis=1, keepdims=True) + 1e-8)
        corpus_norm = corpus_emb / (np.linalg.norm(corpus_emb, axis=1, keepdims=True) + 1e-8)
        sim_matrix = current_norm @ corpus_norm.T  # (n_current, n_corpus)

        for i, sentence in enumerate(sentences):
            max_sim_idx = int(np.argmax(sim_matrix[i]))
            max_sim = float(sim_matrix[i][max_sim_idx])

            if max_sim >= threshold:
                matched_sent = corpus_sents[max_sim_idx]
                matched_text = matched_sent["text"] if isinstance(matched_sent, dict) else matched_sent.text

                # Avoid re-flagging the same sentence if already flagged with higher similarity
                existing = [f for f in flagged if f.sentence_id == sentence.id]
                if existing and existing[0].similarity >= max_sim:
                    continue
                elif existing:
                    flagged.remove(existing[0])

                match_type = "high_similarity" if max_sim >= 0.9 else "paraphrase"
                flagged.append(SimilarityFlag(
                    sentence_id=sentence.id,
                    sentence_text=sentence.text,
                    matched_source=doc_id,
                    matched_text=matched_text,
                    similarity=round(max_sim, 3),
                    match_type=match_type,
                ))

    flagged_count = len(flagged)
    total = len(sentences)
    score = round((flagged_count / total) * 100, 1) if total > 0 else 0.0

    logger.info(f"Similarity: {flagged_count}/{total} sentences flagged, score={score}")

    return SimilarityResult(
        score=score,
        flagged_segments=flagged,
        total_sentences=total,
        flagged_count=flagged_count,
    )
