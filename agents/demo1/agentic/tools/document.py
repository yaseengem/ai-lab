"""
Document extraction tools — PyPDF for PDFs, plain read for .txt files.

The extract_pdf tool is backed by a DocumentExtractor strategy class.
To swap in Bedrock Data Automation (OCR for scanned/image PDFs), add a new
strategy class and update get_extractor() — no tool or agent code changes needed.
"""
from __future__ import annotations

from pathlib import Path

from strands import tool

_AGENT_DIR = Path(__file__).parent.parent.parent  # agents/demo1/
_SAMPLE_DOCS = _AGENT_DIR / "data" / "dummy" / "sample_documents"
_CASES_DIR = _AGENT_DIR / "data" / "cases"


def _resolve_path(file_path: str) -> Path | None:
    """
    Resolve a file path, checking multiple locations:
    1. Absolute path as given
    2. data/cases/{case_id}/input/{filename}  (uploaded files)
    3. data/dummy/sample_documents/{filename} (demo files)
    """
    p = Path(file_path)
    if p.is_absolute() and p.exists():
        return p
    name = p.name
    sample = _SAMPLE_DOCS / name
    if sample.exists():
        return sample
    return None


# ── Strategy pattern ──────────────────────────────────────────────────────────

class DocumentExtractor:
    """Abstract base — swap implementation without changing the tool interface."""
    def extract(self, file_path: Path) -> str:
        raise NotImplementedError


class PyPDFExtractor(DocumentExtractor):
    """Current implementation: text-based PDF extraction via pypdf."""
    def extract(self, file_path: Path) -> str:
        from pypdf import PdfReader
        reader = PdfReader(str(file_path))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(pages).strip()


class BedrockDataAutomationExtractor(DocumentExtractor):
    """
    Future implementation: OCR for scanned/image PDFs via AWS Bedrock Data Automation.
    Swap in by updating get_extractor() below — no changes to extract_pdf tool needed.
    """
    def extract(self, file_path: Path) -> str:
        raise NotImplementedError(
            "BedrockDataAutomationExtractor not yet implemented. "
            "Add boto3 Bedrock Data Automation call here."
        )


def get_extractor() -> DocumentExtractor:
    """Return the active extractor. Change this to swap strategies."""
    extractor = os.getenv("PDF_EXTRACTOR", "pypdf")
    if extractor == "bedrock":
        return BedrockDataAutomationExtractor()
    return PyPDFExtractor()


# ── Tools ─────────────────────────────────────────────────────────────────────

@tool
def extract_pdf(file_path: str) -> str:
    """
    Extract text content from a PDF file for LLM reasoning.
    Supports uploaded files and sample demo documents by filename.
    Backed by DocumentExtractor strategy — Bedrock Data Automation OCR can be
    plugged in later without changing this tool's signature.

    Args:
        file_path: Path to the PDF file, or just the filename for sample docs
                   (e.g. "physician_report_case1.pdf").

    Returns:
        Extracted text content, or an error message.
    """
    resolved = _resolve_path(file_path)
    if resolved is None:
        return f"ERROR: File not found: {file_path}"
    if resolved.suffix.lower() != ".pdf":
        return f"ERROR: Not a PDF file: {file_path}"
    try:
        extractor = get_extractor()
        text = extractor.extract(resolved)
        if not text:
            return f"WARNING: No text extracted from {file_path} (may be a scanned/image PDF)."
        return text
    except Exception as exc:
        return f"ERROR extracting PDF {file_path}: {exc}"


@tool
def extract_text_file(file_path: str) -> str:
    """
    Read the content of a plain .txt file directly.
    Use this for text-based documents like repair estimates, invoices, or notes.
    Do NOT use extract_pdf for .txt files — use this tool instead.

    Args:
        file_path: Path to the .txt file, or just the filename for sample docs
                   (e.g. "repair_estimate_auto.txt").

    Returns:
        File content as a string, or an error message.
    """
    resolved = _resolve_path(file_path)
    if resolved is None:
        return f"ERROR: File not found: {file_path}"
    if resolved.suffix.lower() != ".txt":
        return f"ERROR: Not a .txt file: {file_path}. Use extract_pdf for PDFs."
    try:
        return resolved.read_text(encoding="utf-8")
    except Exception as exc:
        return f"ERROR reading file {file_path}: {exc}"


@tool
def classify_document(extracted_text: str) -> str:
    """
    Classify a document by type based on its extracted text content.
    Returns one of: physician_report | medical_bill | police_report |
                    repair_estimate | invoice | other

    Args:
        extracted_text: The text extracted from a document via extract_pdf or extract_text_file.

    Returns:
        Document type string.
    """
    text = extracted_text.lower()

    if any(kw in text for kw in [
        "physician", "diagnosis", "icd-", "icd10", "treatment", "prescribed",
        "attending physician", "patient presented", "recommended coverage"
    ]):
        return "physician_report"

    if any(kw in text for kw in [
        "amount due", "total bill", "itemised charges", "itemized charges",
        "cpt ", "medical bill", "invoice date", "invoice no", "billing provider"
    ]):
        return "medical_bill"

    if any(kw in text for kw in [
        "police", "incident report", "officer", "badge", "report number",
        "reporting officer", "police department"
    ]):
        return "police_report"

    if any(kw in text for kw in [
        "repair estimate", "labour", "labor", "parts", "vehicle damage",
        "workshop", "mechanic", "body panel", "estimate no", "total estimate"
    ]):
        return "repair_estimate"

    if any(kw in text for kw in [
        "invoice", "due date", "payment due", "service charge", "receipt"
    ]):
        return "invoice"

    return "other"
