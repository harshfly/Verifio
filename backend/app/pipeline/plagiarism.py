"""
Plagiarism detection module — Phase 5
Detects verbatim and near-exact text overlap against the corpus of prior submissions
using n-gram fingerprinting.
"""
import hashlib
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class FlaggedSegment:
    """A segment flagged by the plagiarism detector."""
    sentence_id: str
    sentence_text: str
    matched_source: str
    confidence: float
    match_type: str  # "exact" or "near_exact"


@dataclass
class PlagiarismResult:
    """Output of the plagiarism detection module."""
    score: float  # 0-100 (higher = more plagiarism detected)
    flagged_segments: list[FlaggedSegment]
    total_sentences: int
    flagged_count: int


def _generate_ngrams(text: str, n: int = 4) -> set[str]:
    """Generate word-level n-grams from text."""
    words = text.lower().split()
    if len(words) < n:
        return {" ".join(words)} if words else set()
    return {" ".join(words[i:i+n]) for i in range(len(words) - n + 1)}


def _fingerprint_ngrams(ngrams: set[str]) -> set[str]:
    """Create hash fingerprints from n-grams for efficient comparison."""
    return {hashlib.md5(ng.encode()).hexdigest()[:16] for ng in ngrams}


def detect_plagiarism(
    sentences: list,  # list of Sentence objects from preprocessing
    corpus_texts: list[dict],  # [{"submission_id": str, "text": str, "sentences": [...]}]
) -> PlagiarismResult:
    """Check the submitted document's sentences against the corpus for verbatim/near-exact matches.
    
    Uses n-gram fingerprinting for efficient overlap detection.
    A sentence is flagged if more than 60% of its n-grams match a corpus document.
    
    Args:
        sentences: Preprocessed sentences from the current submission
        corpus_texts: Prior submissions with their text and sentences
        
    Returns:
        PlagiarismResult with score and flagged segments
    """
    if not sentences:
        return PlagiarismResult(score=0.0, flagged_segments=[], total_sentences=0, flagged_count=0)

    # Build corpus fingerprint index: {fingerprint: submission_id}
    corpus_index: dict[str, str] = {}
    for doc in corpus_texts:
        doc_text = doc.get("text", "")
        doc_id = doc.get("submission_id", "unknown")
        ngrams = _generate_ngrams(doc_text, n=4)
        for fp in _fingerprint_ngrams(ngrams):
            corpus_index[fp] = doc_id

    if not corpus_index:
        logger.info("Empty corpus — no plagiarism comparison possible")
        return PlagiarismResult(score=0.0, flagged_segments=[], total_sentences=len(sentences), flagged_count=0)

    flagged: list[FlaggedSegment] = []

    for sentence in sentences:
        sent_ngrams = _generate_ngrams(sentence.text, n=4)
        if not sent_ngrams:
            continue

        sent_fingerprints = _fingerprint_ngrams(sent_ngrams)
        matches = sent_fingerprints & set(corpus_index.keys())
        overlap_ratio = len(matches) / len(sent_fingerprints) if sent_fingerprints else 0

        if overlap_ratio > 0.6:
            # Find the most common matching source
            source_counts: dict[str, int] = {}
            for fp in matches:
                src = corpus_index[fp]
                source_counts[src] = source_counts.get(src, 0) + 1
            top_source = max(source_counts, key=source_counts.get)

            match_type = "exact" if overlap_ratio > 0.9 else "near_exact"
            flagged.append(FlaggedSegment(
                sentence_id=sentence.id,
                sentence_text=sentence.text,
                matched_source=top_source,
                confidence=round(overlap_ratio, 3),
                match_type=match_type,
            ))

    flagged_count = len(flagged)
    total = len(sentences)
    score = round((flagged_count / total) * 100, 1) if total > 0 else 0.0

    logger.info(f"Plagiarism: {flagged_count}/{total} sentences flagged, score={score}")

    return PlagiarismResult(
        score=score,
        flagged_segments=flagged,
        total_sentences=total,
        flagged_count=flagged_count,
    )
