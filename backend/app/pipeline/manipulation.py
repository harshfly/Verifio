"""
Document manipulation detection module — Phase 5
Analyzes file metadata for anomalies that suggest the document has been
tampered with or fabricated.
"""
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ManipulationFlag:
    """A specific manipulation anomaly detected in the document."""
    anomaly_type: str  # timestamp_mismatch, suspicious_producer, revision_anomaly, etc.
    description: str
    severity: str  # "low", "medium", "high"
    severity_weight: float  # 0.0 to 1.0
    evidence: dict


@dataclass
class ManipulationResult:
    """Output of the manipulation detection module."""
    score: float  # 0-100 (higher = more manipulation detected)
    flagged_anomalies: list[ManipulationFlag]
    total_checks: int
    anomaly_count: int


# ── Known suspicious software patterns ───────────────────────────────────────

SUSPICIOUS_PRODUCERS = [
    "online-convert",
    "smallpdf",
    "ilovepdf",
    "pdf2go",
    "sodapdf",
]

LEGITIMATE_PRODUCERS = [
    "microsoft",
    "libreoffice",
    "google docs",
    "latex",
    "pdflatex",
    "xelatex",
    "adobe",
    "quartz",
    "apple",
]


# ── Anomaly checks ──────────────────────────────────────────────────────────

def _check_timestamp_anomalies(metadata) -> list[ManipulationFlag]:
    """Check for inconsistent creation/modification timestamps."""
    flags = []

    creation = metadata.creation_date
    modification = metadata.modification_date

    if not creation or not modification:
        return flags

    # Try to parse dates (various formats)
    for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "D:%Y%m%d%H%M%S"]:
        try:
            created_dt = datetime.strptime(str(creation)[:19], fmt)
            modified_dt = datetime.strptime(str(modification)[:19], fmt)

            # Modification before creation = suspicious
            if modified_dt < created_dt:
                flags.append(ManipulationFlag(
                    anomaly_type="timestamp_mismatch",
                    description="Modification date is before creation date — possible metadata tampering",
                    severity="high",
                    severity_weight=0.9,
                    evidence={"created": str(creation), "modified": str(modification)},
                ))

            # Very short gap between creation and modification of a large document
            gap = abs((modified_dt - created_dt).total_seconds())
            if gap < 10:
                flags.append(ManipulationFlag(
                    anomaly_type="timestamp_suspicious_gap",
                    description="Creation and modification timestamps are nearly identical — may indicate automated generation",
                    severity="medium",
                    severity_weight=0.5,
                    evidence={"gap_seconds": gap, "created": str(creation), "modified": str(modification)},
                ))

            break  # Successfully parsed
        except (ValueError, TypeError):
            continue

    return flags


def _check_producer_anomalies(metadata) -> list[ManipulationFlag]:
    """Check for suspicious or mismatched producer software."""
    flags = []
    producer = (metadata.producer or "").lower()
    creator = (metadata.creator or "").lower()

    if not producer and not creator:
        return flags

    # Check for known suspicious conversion tools
    for suspicious in SUSPICIOUS_PRODUCERS:
        if suspicious in producer or suspicious in creator:
            flags.append(ManipulationFlag(
                anomaly_type="suspicious_producer",
                description=f"Document was processed by '{producer or creator}' — a file conversion tool often used to strip metadata",
                severity="medium",
                severity_weight=0.6,
                evidence={"producer": metadata.producer, "creator": metadata.creator},
            ))
            break

    # Check for producer/creator mismatch (e.g., created in Word but producer is a converter)
    if producer and creator:
        producer_is_legit = any(lp in producer for lp in LEGITIMATE_PRODUCERS)
        creator_is_legit = any(lp in creator for lp in LEGITIMATE_PRODUCERS)

        if producer_is_legit != creator_is_legit and producer != creator:
            flags.append(ManipulationFlag(
                anomaly_type="producer_creator_mismatch",
                description=f"Producer ('{metadata.producer}') and creator ('{metadata.creator}') don't match — may indicate format conversion or metadata editing",
                severity="low",
                severity_weight=0.3,
                evidence={"producer": metadata.producer, "creator": metadata.creator},
            ))

    return flags


def _check_revision_anomalies(metadata) -> list[ManipulationFlag]:
    """Check for unusual revision counts (DOCX-specific)."""
    flags = []
    raw = metadata.raw or {}
    revision = raw.get("revision", "")

    if not revision:
        return flags

    try:
        rev_count = int(revision)

        # Unusually high revision count for a supposedly original document
        if rev_count > 500:
            flags.append(ManipulationFlag(
                anomaly_type="high_revision_count",
                description=f"Document has {rev_count} revisions — unusually high, may indicate heavy editing or automated modifications",
                severity="low",
                severity_weight=0.3,
                evidence={"revision_count": rev_count},
            ))

        # Exactly 1 revision but claims to have an author = might be a template copy
        if rev_count == 1 and metadata.author:
            flags.append(ManipulationFlag(
                anomaly_type="single_revision_with_author",
                description="Document has exactly 1 revision despite having author metadata — may be copied from a template",
                severity="low",
                severity_weight=0.2,
                evidence={"revision_count": rev_count, "author": metadata.author},
            ))

    except (ValueError, TypeError):
        pass

    return flags


def _check_metadata_stripping(metadata) -> list[ManipulationFlag]:
    """Check if metadata appears to have been intentionally stripped."""
    flags = []

    # Count how many key fields are missing
    missing_fields = 0
    for field in [metadata.author, metadata.creator, metadata.producer,
                  metadata.creation_date, metadata.modification_date]:
        if not field or str(field).strip() in ("", "None", "null"):
            missing_fields += 1

    if missing_fields >= 4:
        flags.append(ManipulationFlag(
            anomaly_type="metadata_stripped",
            description="Most metadata fields are empty — metadata may have been intentionally removed to hide the document's origin",
            severity="medium",
            severity_weight=0.5,
            evidence={"missing_field_count": missing_fields, "total_fields": 5},
        ))

    return flags


# ── Main entry point ─────────────────────────────────────────────────────────

def detect_manipulation(metadata) -> ManipulationResult:
    """Run all manipulation checks on the document's metadata.
    
    Checks for:
    - Timestamp inconsistencies (modification before creation, tiny gaps)
    - Suspicious producer software (conversion tools)
    - Producer/creator mismatches
    - Revision count anomalies
    - Intentional metadata stripping
    
    Args:
        metadata: FileMetadata from the preprocessing stage
        
    Returns:
        ManipulationResult with severity-weighted score and flagged anomalies
    """
    all_flags: list[ManipulationFlag] = []
    total_checks = 0

    # Run each check
    checks = [
        ("timestamps", _check_timestamp_anomalies),
        ("producer", _check_producer_anomalies),
        ("revision", _check_revision_anomalies),
        ("stripping", _check_metadata_stripping),
    ]

    for check_name, check_fn in checks:
        total_checks += 1
        try:
            flags = check_fn(metadata)
            all_flags.extend(flags)
        except Exception as e:
            logger.warning(f"Manipulation check '{check_name}' failed: {e}")

    # Compute score from severity weights
    if all_flags:
        total_weight = sum(f.severity_weight for f in all_flags)
        max_possible = len(all_flags)  # each could be max 1.0
        score = round((total_weight / max(max_possible, 1)) * 100, 1)
        score = min(score, 100.0)
    else:
        score = 0.0

    logger.info(f"Manipulation: {len(all_flags)} anomalies found, score={score}")

    return ManipulationResult(
        score=score,
        flagged_anomalies=all_flags,
        total_checks=total_checks,
        anomaly_count=len(all_flags),
    )
