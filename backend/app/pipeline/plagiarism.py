"""
Plagiarism detection module — Phase 5 (Grok AI Enhanced)
Detects verbatim and near-exact text overlap against the corpus of prior submissions
using n-gram fingerprinting + Grok AI for intelligent plagiarism pattern analysis.
"""
import hashlib
import json
import re
import logging
from dataclasses import dataclass
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class FlaggedSegment:
    """A segment flagged by the plagiarism detector."""
    sentence_id: str
    sentence_text: str
    matched_source: str
    confidence: float
    match_type: str  # "exact", "near_exact", "paraphrase", or "grok_detected"


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


def _is_grok_configured() -> bool:
    """Check if the Grok API key is set and valid."""
    return bool(settings.GROK_API_KEY and settings.GROK_API_KEY != "your-grok-api-key-here")


async def _grok_plagiarism_analysis(text: str, corpus_texts: list[dict]) -> list[FlaggedSegment]:
    """Use Grok AI to detect paraphrased plagiarism and writing style mimicry.
    
    This catches sophisticated plagiarism that n-gram fingerprinting misses:
    - Paraphrased content
    - Synonym substitution  
    - Structural rearrangement
    - Cross-language plagiarism indicators
    """
    if not _is_grok_configured() or not corpus_texts:
        return []

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            base_url=settings.GROK_BASE_URL,
            api_key=settings.GROK_API_KEY,
            timeout=30.0,
        )

        # Build a compact corpus summary for comparison
        corpus_summary = ""
        for i, doc in enumerate(corpus_texts[:5]):  # Limit to 5 docs for context window
            doc_text = doc.get("text", "")[:800]
            doc_id = doc.get("submission_id", f"doc_{i}")
            corpus_summary += f"\n--- Corpus Document {doc_id} ---\n{doc_text}\n"

        submitted_text = text[:3000]

        response = await client.chat.completions.create(
            model=settings.GROK_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert academic plagiarism detection analyst. Compare the submitted "
                        "document against the provided corpus documents to detect:\n\n"
                        "1. **Paraphrased plagiarism** — same ideas expressed with different words\n"
                        "2. **Mosaic plagiarism** — text stitched from multiple sources\n"
                        "3. **Structural plagiarism** — same argument structure with rewording\n"
                        "4. **Idea plagiarism** — unique concepts taken without attribution\n\n"
                        "If NO corpus documents are available, analyze the text for signs of "
                        "common plagiarism patterns (overly generic academic phrasing, inconsistent "
                        "writing style suggesting copy-paste from multiple sources).\n\n"
                        "Respond with ONLY a valid JSON object:\n"
                        '{"flagged_passages": [{"text": "<flagged excerpt max 200 chars>", '
                        '"confidence": <0.0-1.0>, "match_type": "paraphrase|mosaic|structural", '
                        '"matched_source": "<source doc id or description>", '
                        '"reasoning": "<brief explanation>"}], '
                        '"overall_plagiarism_probability": <0.0-1.0>}'
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"SUBMITTED DOCUMENT:\n{submitted_text}\n\n"
                        f"CORPUS DOCUMENTS FOR COMPARISON:{corpus_summary if corpus_summary else ' (no corpus available — analyze for generic plagiarism patterns)'}"
                    ),
                },
            ],
            temperature=0.1,
            max_tokens=600,
        )

        content = response.choices[0].message.content.strip()
        
        # Parse JSON from response
        if "```" in content:
            match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
            content = match.group(1) if match else content

        # Find the JSON object (might contain nested arrays)
        brace_depth = 0
        json_start = None
        for i, char in enumerate(content):
            if char == '{':
                if brace_depth == 0:
                    json_start = i
                brace_depth += 1
            elif char == '}':
                brace_depth -= 1
                if brace_depth == 0 and json_start is not None:
                    content = content[json_start:i+1]
                    break

        result = json.loads(content)
        flagged_passages = result.get("flagged_passages", [])

        grok_flags = []
        for i, passage in enumerate(flagged_passages):
            conf = float(passage.get("confidence", 0.5))
            if conf >= 0.5:
                grok_flags.append(FlaggedSegment(
                    sentence_id=f"grok_plag_{i}",
                    sentence_text=passage.get("text", "")[:300],
                    matched_source=passage.get("matched_source", "Grok AI analysis"),
                    confidence=round(conf, 3),
                    match_type=passage.get("match_type", "grok_detected"),
                ))

        logger.info(f"Grok plagiarism analysis: {len(grok_flags)} passages flagged")
        return grok_flags

    except json.JSONDecodeError as e:
        logger.warning(f"Grok plagiarism response JSON parse error: {e}")
    except Exception as e:
        logger.warning(f"Grok plagiarism analysis failed: {e}")

    return []


def _ngram_plagiarism_check(
    sentences: list,
    corpus_texts: list[dict],
) -> list[FlaggedSegment]:
    """Original n-gram fingerprinting plagiarism detection."""
    if not sentences:
        return []

    # Build corpus fingerprint index: {fingerprint: submission_id}
    corpus_index: dict[str, str] = {}
    for doc in corpus_texts:
        doc_text = doc.get("text", "")
        doc_id = doc.get("submission_id", "unknown")
        ngrams = _generate_ngrams(doc_text, n=4)
        for fp in _fingerprint_ngrams(ngrams):
            corpus_index[fp] = doc_id

    if not corpus_index:
        return []

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

    return flagged


def detect_plagiarism(
    sentences: list,  # list of Sentence objects from preprocessing
    corpus_texts: list[dict],  # [{"submission_id": str, "text": str, "sentences": [...]}]
) -> PlagiarismResult:
    """Check for plagiarism using n-gram fingerprinting.
    
    This is the synchronous entry point called by the orchestrator.
    For Grok AI-powered analysis, use detect_plagiarism_enhanced() instead.
    """
    if not sentences:
        return PlagiarismResult(score=0.0, flagged_segments=[], total_sentences=0, flagged_count=0)

    flagged = _ngram_plagiarism_check(sentences, corpus_texts)

    flagged_count = len(flagged)
    total = len(sentences)
    score = round((flagged_count / total) * 100, 1) if total > 0 else 0.0

    logger.info(f"Plagiarism (n-gram): {flagged_count}/{total} sentences flagged, score={score}")

    return PlagiarismResult(
        score=score,
        flagged_segments=flagged,
        total_sentences=total,
        flagged_count=flagged_count,
    )


async def detect_plagiarism_enhanced(
    clean_text: str,
    sentences: list,
    corpus_texts: list[dict],
) -> PlagiarismResult:
    """Enhanced plagiarism detection combining n-gram fingerprinting + Grok AI analysis.
    
    This is the async version that leverages Grok AI for paraphrase detection.
    Falls back to n-gram-only when Grok API is not configured.
    """
    if not sentences:
        return PlagiarismResult(score=0.0, flagged_segments=[], total_sentences=0, flagged_count=0)

    # 1. N-gram fingerprinting (always runs)
    ngram_flags = _ngram_plagiarism_check(sentences, corpus_texts)

    # 2. Grok AI analysis (when available)
    grok_flags = []
    if _is_grok_configured():
        logger.info("Running Grok AI-powered plagiarism analysis...")
        grok_flags = await _grok_plagiarism_analysis(clean_text, corpus_texts)

    # 3. Merge and deduplicate flags
    all_flags = ngram_flags.copy()
    existing_texts = {f.sentence_text[:100] for f in ngram_flags}
    for gf in grok_flags:
        # Don't duplicate if n-gram already caught it
        if gf.sentence_text[:100] not in existing_texts:
            all_flags.append(gf)
            existing_texts.add(gf.sentence_text[:100])

    flagged_count = len(all_flags)
    total = len(sentences)
    score = round((flagged_count / total) * 100, 1) if total > 0 else 0.0

    # Cap score at 100
    score = min(score, 100.0)

    method = "n-gram + Grok AI" if grok_flags else "n-gram only"
    logger.info(f"Plagiarism ({method}): {flagged_count}/{total} flagged, score={score}")

    return PlagiarismResult(
        score=score,
        flagged_segments=all_flags,
        total_sentences=total,
        flagged_count=flagged_count,
    )
