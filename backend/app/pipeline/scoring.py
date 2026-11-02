"""
Scoring engine — Phase 6
Combines sub-scores from all detection modules into a final authenticity score
using configurable weights with threshold-based status banding.
"""
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Default weights — must sum to 1.0
DEFAULT_WEIGHTS = {
    "plagiarism": 0.30,
    "similarity": 0.25,
    "ai_detection": 0.25,
    "manipulation": 0.20,
}

# Threshold bands for final status
THRESHOLD_CLEAN = 25       # score < 25 → clean
THRESHOLD_REVIEW = 55      # 25 ≤ score < 55 → review
# score ≥ 55 → flagged


@dataclass
class FinalScore:
    """The combined authenticity assessment."""
    authenticity_score: float    # 0-100 (higher = MORE risk detected)
    plagiarism_score: float
    similarity_score: float
    ai_detection_score: float
    manipulation_score: float
    status: str                  # "clean", "review", or "flagged"
    weights_used: dict
    score_breakdown: dict


def compute_final_score(
    plagiarism_score: float,
    similarity_score: float,
    ai_detection_score: float,
    manipulation_score: float,
    weights: dict | None = None,
) -> FinalScore:
    """Compute the weighted final authenticity score.
    
    Formula:
        final = w_plag * plag + w_sim * sim + w_ai * ai + w_manip * manip
    
    Args:
        plagiarism_score: 0-100 from plagiarism module
        similarity_score: 0-100 from similarity module
        ai_detection_score: 0-100 from AI detection module
        manipulation_score: 0-100 from manipulation module
        weights: Optional custom weights dict (must sum to 1.0)
        
    Returns:
        FinalScore with weighted result and status band
    """
    w = weights or DEFAULT_WEIGHTS

    # Validate weights sum to 1.0 (with tolerance)
    total = sum(w.values())
    if abs(total - 1.0) > 0.01:
        logger.warning(f"Weights sum to {total}, not 1.0 — normalizing")
        w = {k: v / total for k, v in w.items()}

    # Clamp all scores to 0-100
    plag = max(0.0, min(100.0, plagiarism_score))
    sim = max(0.0, min(100.0, similarity_score))
    ai = max(0.0, min(100.0, ai_detection_score))
    manip = max(0.0, min(100.0, manipulation_score))

    # Base weighted sum
    weighted_sum = (
        w["plagiarism"] * plag +
        w["similarity"] * sim +
        w["ai_detection"] * ai +
        w["manipulation"] * manip
    )

    # Dominant Threat Guardrail:
    # If any single dimension has critical or elevated risk (e.g. 75% AI generation),
    # the overall risk must reflect that vulnerability rather than being washed out to ~18%.
    max_threat = max(plag, sim, ai, manip)
    if max_threat >= 55.0:
        final = max(weighted_sum, max_threat * 0.85)
    elif max_threat >= 30.0:
        final = max(weighted_sum, max_threat * 0.70)
    else:
        final = weighted_sum
    final = round(final, 1)

    # Determine status band with explicit guardrails:
    # A submission CANNOT be labeled "clean" if AI is >= 25% or Plagiarism >= 20%
    if final >= THRESHOLD_REVIEW or ai >= 55.0 or plag >= 45.0 or sim >= 55.0 or manip >= 50.0:
        status = "flagged"
    elif final >= THRESHOLD_CLEAN or ai >= 25.0 or plag >= 20.0 or sim >= 30.0 or manip >= 25.0:
        status = "review"
    else:
        status = "clean"

    breakdown = {
        "plagiarism": {"score": plag, "weight": w["plagiarism"], "contribution": round(w["plagiarism"] * plag, 1)},
        "similarity": {"score": sim, "weight": w["similarity"], "contribution": round(w["similarity"] * sim, 1)},
        "ai_detection": {"score": ai, "weight": w["ai_detection"], "contribution": round(w["ai_detection"] * ai, 1)},
        "manipulation": {"score": manip, "weight": w["manipulation"], "contribution": round(w["manipulation"] * manip, 1)},
    }

    logger.info(f"Final score: {final} → status={status}")

    return FinalScore(
        authenticity_score=final,
        plagiarism_score=plag,
        similarity_score=sim,
        ai_detection_score=ai,
        manipulation_score=manip,
        status=status,
        weights_used=w,
        score_breakdown=breakdown,
    )
