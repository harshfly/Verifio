"""
Preprocessing pipeline — Phase 3
Extracts text from PDF/DOCX, cleans it, segments into sentences with stable IDs,
and captures raw file metadata.
"""
import re
import hashlib
import unicodedata
from dataclasses import dataclass, field
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class Sentence:
    """A single sentence with a stable ID derived from its position."""
    id: str
    index: int
    text: str


@dataclass
class FileMetadata:
    """Raw metadata extracted from the uploaded file."""
    author: Optional[str] = None
    creator: Optional[str] = None
    producer: Optional[str] = None
    creation_date: Optional[str] = None
    modification_date: Optional[str] = None
    page_count: Optional[int] = None
    word_count: Optional[int] = None
    raw: dict = field(default_factory=dict)


@dataclass
class ProcessedDocument:
    """The complete output of the preprocessing stage."""
    raw_text: str
    clean_text: str
    sentences: list[Sentence]
    metadata: FileMetadata
    file_hash: str


# ── Text extraction ──────────────────────────────────────────────────────────

def extract_text_from_pdf(file_path: str) -> tuple[str, FileMetadata]:
    """Extract text and metadata from a PDF file using pdfplumber.
    Falls back to OCR via pytesseract if extraction yields near-empty text.
    """
    import pdfplumber

    meta = FileMetadata()
    pages_text: list[str] = []

    with pdfplumber.open(file_path) as pdf:
        # Capture metadata
        info = pdf.metadata or {}
        meta.author = info.get("Author")
        meta.creator = info.get("Creator")
        meta.producer = info.get("Producer")
        meta.creation_date = str(info.get("CreationDate", ""))
        meta.modification_date = str(info.get("ModDate", ""))
        meta.page_count = len(pdf.pages)
        meta.raw = {k: str(v) for k, v in info.items()} if info else {}

        for page in pdf.pages:
            text = page.extract_text() or ""
            pages_text.append(text)

    full_text = "\n".join(pages_text).strip()

    # OCR fallback if extraction returned very little text
    if len(full_text) < 50:
        logger.info("PDF text extraction yielded little text, attempting OCR fallback")
        try:
            full_text = _ocr_pdf(file_path)
        except Exception as e:
            logger.warning(f"OCR fallback failed: {e}")

    return full_text, meta


def _ocr_pdf(file_path: str) -> str:
    """OCR fallback for scanned PDFs using pytesseract."""
    try:
        import pytesseract
        from pdf2image import convert_from_path
        images = convert_from_path(file_path)
        texts = [pytesseract.image_to_string(img) for img in images]
        return "\n".join(texts).strip()
    except ImportError:
        logger.warning("pdf2image not installed, OCR fallback unavailable")
        return ""


def extract_text_from_docx(file_path: str) -> tuple[str, FileMetadata]:
    """Extract text and metadata from a DOCX file."""
    from docx import Document

    doc = Document(file_path)
    meta = FileMetadata()

    # Capture core properties
    props = doc.core_properties
    meta.author = props.author
    meta.creator = props.author  # DOCX uses author for creator
    meta.creation_date = str(props.created) if props.created else None
    meta.modification_date = str(props.modified) if props.modified else None
    meta.raw = {
        "author": props.author or "",
        "title": props.title or "",
        "subject": props.subject or "",
        "keywords": props.keywords or "",
        "revision": str(props.revision) if props.revision else "",
        "last_modified_by": props.last_modified_by or "",
    }

    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    full_text = "\n".join(paragraphs)

    return full_text, meta


def extract_text_from_txt(file_path: str) -> tuple[str, FileMetadata]:
    """Extract text from a plain text file."""
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()
    meta = FileMetadata()
    return text, meta


# ── Text cleaning ────────────────────────────────────────────────────────────

def clean_text(raw_text: str) -> str:
    """Normalize and clean extracted text.
    - Normalize unicode
    - De-hyphenate line-wrapped words  
    - Strip common headers/footers patterns
    - Collapse excessive whitespace
    """
    # Unicode normalization
    text = unicodedata.normalize("NFKC", raw_text)

    # De-hyphenate words split across lines (e.g. "knowl-\nedge" → "knowledge")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)

    # Remove common header/footer patterns (page numbers, running headers)
    text = re.sub(r"\n\s*Page\s+\d+\s*(of\s+\d+)?\s*\n", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"\n\s*-\s*\d+\s*-\s*\n", "\n", text)

    # Collapse multiple blank lines into one
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Collapse multiple spaces into one
    text = re.sub(r" {2,}", " ", text)

    return text.strip()


# ── Sentence segmentation ───────────────────────────────────────────────────

def segment_into_sentences(clean_text: str, submission_id: str) -> list[Sentence]:
    """Split clean text into sentences with stable, reproducible IDs.
    
    IDs are derived from the submission_id + sentence index for stability.
    Uses regex segmentation for fast, reliable, offline processing.
    """
    return _regex_segment(clean_text, submission_id)


def _regex_segment(clean_text: str, submission_id: str) -> list[Sentence]:
    """Fallback regex-based sentence segmentation."""
    raw = re.split(r'(?<=[.!?])\s+', clean_text)
    sentences = []
    for idx, sent_text in enumerate(raw):
        sent_text = sent_text.strip()
        if not sent_text or len(sent_text) < 5:
            continue
        stable_id = hashlib.md5(f"{submission_id}:{idx}".encode()).hexdigest()[:12]
        sentences.append(Sentence(id=stable_id, index=idx, text=sent_text))
    return sentences


# ── Main entry point ─────────────────────────────────────────────────────────

def preprocess_document(file_path: str, submission_id: str) -> ProcessedDocument:
    """Run the full preprocessing pipeline on an uploaded file.
    
    1. Extract raw text + metadata based on file type
    2. Clean the text
    3. Segment into sentences with stable IDs
    4. Compute file hash
    """
    file_lower = file_path.lower()

    if file_lower.endswith(".pdf"):
        raw_text, metadata = extract_text_from_pdf(file_path)
    elif file_lower.endswith(".docx"):
        raw_text, metadata = extract_text_from_docx(file_path)
    elif file_lower.endswith(".txt"):
        raw_text, metadata = extract_text_from_txt(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_path}")

    # Clean
    cleaned = clean_text(raw_text)

    # Word count
    metadata.word_count = len(cleaned.split())

    # Segment
    sentences = segment_into_sentences(cleaned, submission_id)

    # File hash
    with open(file_path, "rb") as f:
        file_hash = hashlib.sha256(f.read()).hexdigest()

    logger.info(
        f"Preprocessed {file_path}: {len(sentences)} sentences, "
        f"{metadata.word_count} words"
    )

    return ProcessedDocument(
        raw_text=raw_text,
        clean_text=cleaned,
        sentences=sentences,
        metadata=metadata,
        file_hash=file_hash,
    )
