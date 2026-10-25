"""
Pipeline orchestrator — Phase 6
Runs the full analysis pipeline: preprocessing → detection modules (parallel) → scoring.
Persists results to the database via Report + FlaggedSegment models.
"""
import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.pipeline.preprocessing import preprocess_document
from app.pipeline.plagiarism import detect_plagiarism
from app.pipeline.similarity import detect_similarity
from app.pipeline.ai_detection import detect_ai_content
from app.pipeline.manipulation import detect_manipulation
from app.pipeline.scoring import compute_final_score

from app.models.submission import Submission
from app.models.analysis_result import AnalysisResult
from app.models.report import Report, FlaggedSegment

logger = logging.getLogger(__name__)


async def _fetch_corpus(db: AsyncSession, exclude_submission_id: UUID) -> list[dict]:
    """Fetch prior submissions from the database to use as the comparison corpus."""
    result = await db.execute(
        select(Submission)
        .where(
            Submission.status.in_(["clean", "review", "flagged", "completed"]),
            Submission.id != exclude_submission_id,
            Submission.raw_text.isnot(None),
        )
        .order_by(Submission.uploaded_at.desc())
        .limit(100)  # Limit corpus size for performance
    )
    submissions = result.scalars().all()

    corpus = []
    for sub in submissions:
        if sub.raw_text:
            corpus.append({
                "submission_id": str(sub.id),
                "text": sub.raw_text,
                "sentences": [],  # Will be re-segmented on the fly if needed
            })
    return corpus


def _severity_from_confidence(confidence: float) -> str:
    """Map a 0-1 confidence score to a severity label."""
    if confidence >= 0.85:
        return "high"
    elif confidence >= 0.6:
        return "medium"
    return "low"


async def run_pipeline(
    submission_id: str,
    file_path: str,
    db: AsyncSession,
) -> dict:
    """Execute the full analysis pipeline for a submission.

    1. Preprocess the document (extract text, clean, segment)
    2. Run all four detection modules
    3. Compute weighted final score
    4. Persist Report + FlaggedSegments + AnalysisResults to the database

    Args:
        submission_id: UUID string of the submission
        file_path: Path to the uploaded file on disk
        db: Async database session

    Returns:
        Dict with the complete analysis results
    """
    sub_id = UUID(submission_id) if isinstance(submission_id, str) else submission_id

    # Update status to processing
    result = await db.execute(select(Submission).where(Submission.id == sub_id))
    submission = result.scalars().first()
    if not submission:
        raise ValueError(f"Submission {submission_id} not found")

    submission.status = "processing"
    await db.commit()

    try:
        # ── Step 1: Preprocessing ────────────────────────────────────────
        logger.info(f"[{submission_id}] Starting preprocessing...")
        processed = preprocess_document(file_path, submission_id)

        # Store raw text on the submission for corpus use
        submission.raw_text = processed.clean_text
        await db.commit()

        # ── Step 2: Fetch corpus for comparison ──────────────────────────
        corpus = await _fetch_corpus(db, sub_id)
        logger.info(f"[{submission_id}] Corpus size: {len(corpus)} prior submissions")

        # ── Step 3: Run detection modules ────────────────────────────────
        logger.info(f"[{submission_id}] Running detection modules...")

        plagiarism_result = detect_plagiarism(processed.sentences, corpus)
        similarity_result = detect_similarity(processed.sentences, corpus)
        ai_result = await detect_ai_content(processed.clean_text, processed.sentences)
        manipulation_result = detect_manipulation(processed.metadata)

        # ── Step 4: Compute final score ──────────────────────────────────
        logger.info(f"[{submission_id}] Computing final score...")
        final = compute_final_score(
            plagiarism_score=plagiarism_result.score,
            similarity_score=similarity_result.score,
            ai_detection_score=ai_result.score,
            manipulation_score=manipulation_result.score,
        )

        # ── Step 5: Persist results ──────────────────────────────────────
        logger.info(f"[{submission_id}] Persisting results...")

        # Save individual module results to analysis_results table
        modules_data = [
            ("plagiarism", plagiarism_result.score, {
                "flagged_count": plagiarism_result.flagged_count,
                "total_sentences": plagiarism_result.total_sentences,
                "flagged_segments": [
                    {
                        "sentence_id": f.sentence_id,
                        "sentence_text": f.sentence_text,
                        "matched_source": f.matched_source,
                        "confidence": f.confidence,
                        "match_type": f.match_type,
                    }
                    for f in plagiarism_result.flagged_segments
                ],
            }),
            ("similarity", similarity_result.score, {
                "flagged_count": similarity_result.flagged_count,
                "total_sentences": similarity_result.total_sentences,
                "flagged_segments": [
                    {
                        "sentence_id": f.sentence_id,
                        "sentence_text": f.sentence_text,
                        "matched_source": f.matched_source,
                        "matched_text": f.matched_text,
                        "similarity": f.similarity,
                        "match_type": f.match_type,
                    }
                    for f in similarity_result.flagged_segments
                ],
            }),
            ("ai_detection", ai_result.score, {
                "flagged_count": ai_result.flagged_count,
                "total_paragraphs": ai_result.total_paragraphs,
                "avg_perplexity_signal": ai_result.avg_perplexity_signal,
                "avg_burstiness_signal": ai_result.avg_burstiness_signal,
                "flagged_segments": [
                    {
                        "paragraph_index": f.paragraph_index,
                        "paragraph_text": f.paragraph_text,
                        "ai_probability": f.ai_probability,
                        "reasoning": f.reasoning,
                        "detection_method": f.detection_method,
                    }
                    for f in ai_result.flagged_segments
                ],
            }),
            ("manipulation", manipulation_result.score, {
                "anomaly_count": manipulation_result.anomaly_count,
                "total_checks": manipulation_result.total_checks,
                "anomalies": [
                    {
                        "anomaly_type": f.anomaly_type,
                        "description": f.description,
                        "severity": f.severity,
                        "evidence": f.evidence,
                    }
                    for f in manipulation_result.flagged_anomalies
                ],
            }),
        ]

        for module_name, risk_score, details in modules_data:
            analysis = AnalysisResult(
                submission_id=sub_id,
                module_name=module_name,
                risk_score=risk_score,
                details=details,
            )
            db.add(analysis)

        # Create the Report record
        report = Report(
            submission_id=sub_id,
            authenticity_score=final.authenticity_score,
            plagiarism_score=final.plagiarism_score,
            similarity_score=final.similarity_score,
            ai_detection_score=final.ai_detection_score,
            manipulation_score=final.manipulation_score,
            weight_config_json=final.weights_used,
            status=final.status,
        )
        db.add(report)
        await db.flush()  # Get report.id for foreign keys

        # Create FlaggedSegment records from all modules
        # — Plagiarism flags
        for f in plagiarism_result.flagged_segments:
            db.add(FlaggedSegment(
                report_id=report.id,
                sentence_id=f.sentence_id,
                segment_text=f.sentence_text,
                module="plagiarism",
                severity=_severity_from_confidence(f.confidence),
                matched_source_ref=f.matched_source,
                confidence=f.confidence,
            ))

        # — Similarity flags
        for f in similarity_result.flagged_segments:
            db.add(FlaggedSegment(
                report_id=report.id,
                sentence_id=f.sentence_id,
                segment_text=f.sentence_text,
                module="similarity",
                severity=_severity_from_confidence(f.similarity),
                matched_source_ref=f.matched_source,
                confidence=f.similarity,
            ))

        # — AI detection flags
        for f in ai_result.flagged_segments:
            db.add(FlaggedSegment(
                report_id=report.id,
                sentence_id=None,
                segment_text=f.paragraph_text,
                module="ai_detection",
                severity=_severity_from_confidence(f.ai_probability),
                matched_source_ref=None,
                confidence=f.ai_probability,
            ))

        # — Manipulation flags
        for f in manipulation_result.flagged_anomalies:
            db.add(FlaggedSegment(
                report_id=report.id,
                sentence_id=None,
                segment_text=f.description,
                module="manipulation",
                severity=f.severity,
                matched_source_ref=None,
                confidence=f.severity_weight,
            ))

        # Update submission status and processed_at
        submission.status = final.status  # "clean", "review", or "flagged"
        submission.processed_at = datetime.now(timezone.utc)
        await db.commit()

        logger.info(
            f"[{submission_id}] Pipeline complete — "
            f"score={final.authenticity_score}, status={final.status}"
        )

        return {
            "submission_id": submission_id,
            "status": final.status,
            "authenticity_score": final.authenticity_score,
            "scores": {
                "plagiarism": final.plagiarism_score,
                "similarity": final.similarity_score,
                "ai_detection": final.ai_detection_score,
                "manipulation": final.manipulation_score,
            },
            "breakdown": final.score_breakdown,
        }

    except Exception as e:
        logger.error(f"[{submission_id}] Pipeline failed: {e}", exc_info=True)
        submission.status = "failed"
        submission.processed_at = datetime.now(timezone.utc)
        await db.commit()
        raise
