"""
Strands tools for the Claims Processing agent.

All tools are decorated with @tool so Strands can register them on the Agent.
Every tool that accepts a case_id validates it against a safe character set to
prevent path traversal attacks.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from strands import tool  # noqa: E402
from commons.logger import get_logger  # noqa: E402

logger = get_logger(__name__)

# ── constants ─────────────────────────────────────────────────────────────────
_AGENT_DIR = Path(__file__).parent.parent  # agents/demo1/
_CASES_DIR = _AGENT_DIR / "data" / "cases"
_CASE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
_MAX_SEARCH_RESULTS = 20


# ── helpers ───────────────────────────────────────────────────────────────────

def _validate_case_id(case_id: str) -> bool:
    """Return True if *case_id* contains only safe characters (alphanumerics, hyphens, underscores).

    Prevents path traversal attacks when the value is used to build file paths.
    """
    return bool(_CASE_ID_RE.match(case_id))


def _case_dir(case_id: str) -> Path:
    """Return the storage directory for a given case."""
    return _CASES_DIR / case_id


def _write_json(path: Path, data: dict) -> str:
    """Atomically write *data* as JSON to *path*, creating parent dirs as needed.

    Returns ``"ok"`` on success so callers can forward the result directly to
    the agent as a tool response.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = str(path) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)
    return "ok"


def _read_json(path: Path) -> dict | str:
    """Read and return the JSON object at *path*.

    Returns a human-readable error string (instead of raising) so the agent
    can include the message in its response when a file is missing or corrupt.
    """
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return f"File not found: {path}"
    except json.JSONDecodeError as e:
        return f"JSON parse error in {path}: {e}"


# ── tools ─────────────────────────────────────────────────────────────────────

@tool
def document_parser(file_ref: str) -> dict:
    """
    Parse an uploaded claim document (PDF or image) and return its text content.

    Args:
        file_ref: The file reference returned by POST /upload, in the format
                  "{case_id}/{filename}".

    Returns:
        A dict with keys: document_type, raw_text, extracted_fields, file_path.
        Returns an error string if the file cannot be read.
    """
    logger.info("[TOOL] document_parser  file_ref=%s", file_ref)
    # Split file_ref on the first "/" to get case_id and filename
    parts = file_ref.split("/", 1)
    if len(parts) != 2:
        logger.warning("[TOOL] document_parser  invalid_file_ref=%s", file_ref)
        return {"error": f"Invalid file_ref format: '{file_ref}'. Expected '{{case_id}}/{{filename}}'."}

    case_id, filename = parts
    if not _validate_case_id(case_id):
        logger.warning("[TOOL] document_parser  invalid_case_id=%s", case_id)
        return {"error": f"Invalid case_id '{case_id}': only alphanumerics, hyphens, and underscores allowed."}

    file_path = _case_dir(case_id) / "input" / filename
    if not file_path.exists():
        logger.warning("[TOOL] document_parser  file_not_found  path=%s", file_path)
        return {"error": f"File not found: {file_path}"}

    suffix = file_path.suffix.lower()
    raw_text = ""
    document_type = "unknown"

    if suffix == ".pdf":
        document_type = "pdf"
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(file_path))
            pages = [page.extract_text() or "" for page in reader.pages]
            raw_text = "\n\n".join(pages).strip()
        except Exception as e:
            logger.error("[TOOL] document_parser  pdf_parse_error  file=%s error=%s", file_path, e)
            return {"error": f"PDF parsing failed: {e}"}

    elif suffix in (".png", ".jpg", ".jpeg"):
        document_type = "image"
        try:
            from PIL import Image
            img = Image.open(str(file_path))
            raw_text = (
                f"[Image file: {filename}, size {img.width}x{img.height}, mode {img.mode}. "
                "Text extraction from images requires a vision model — "
                "send the file_ref to Bedrock with vision capability for OCR.]"
            )
        except Exception as e:
            logger.error("[TOOL] document_parser  image_read_error  file=%s error=%s", file_path, e)
            return {"error": f"Image read failed: {e}"}

    elif suffix == ".docx":
        document_type = "docx"
        try:
            import zipfile
            from xml.etree import ElementTree as ET
            with zipfile.ZipFile(str(file_path)) as z:
                with z.open("word/document.xml") as xml_file:
                    tree = ET.parse(xml_file)
                    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                    texts = [t.text or "" for t in tree.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")]
                    raw_text = " ".join(texts).strip()
        except Exception as e:
            logger.error("[TOOL] document_parser  docx_parse_error  file=%s error=%s", file_path, e)
            return {"error": f"DOCX parsing failed: {e}"}

    else:
        logger.warning("[TOOL] document_parser  unsupported_suffix=%s  file=%s", suffix, file_path)
        return {"error": f"Unsupported file type: '{suffix}'. Accepted: pdf, png, jpg, jpeg, docx."}

    result = {
        "document_type": document_type,
        "raw_text": raw_text,
        "extracted_fields": {},
        "file_path": str(file_path),
    }

    # Persist extraction result
    _write_json(_case_dir(case_id) / "analysis" / "document_extract.json", result)
    logger.info("[TOOL] document_parser  done  case_id=%s doc_type=%s text_len=%d",
                case_id, document_type, len(raw_text))
    return result


@tool
def read_case_status(case_id: str) -> dict:
    """
    Read the current workflow status of a claim case.

    Args:
        case_id: The case identifier.

    Returns:
        The status.json contents as a dict, or an error string.
    """
    logger.info("[TOOL] read_case_status  case_id=%s", case_id)
    if not _validate_case_id(case_id):
        logger.warning("[TOOL] read_case_status  invalid_case_id=%s", case_id)
        return {"error": f"Invalid case_id: '{case_id}'"}
    result = _read_json(_case_dir(case_id) / "status.json")
    status = result.get("status") if isinstance(result, dict) else result
    logger.info("[TOOL] read_case_status  done  case_id=%s status=%s", case_id, status)
    return result


@tool
def read_case_analysis(case_id: str) -> dict:
    """
    Read the analysis result for a claim case.

    Args:
        case_id: The case identifier.

    Returns:
        The analysis_result.json contents, or an error string.
    """
    logger.info("[TOOL] read_case_analysis  case_id=%s", case_id)
    if not _validate_case_id(case_id):
        logger.warning("[TOOL] read_case_analysis  invalid_case_id=%s", case_id)
        return {"error": f"Invalid case_id: '{case_id}'"}
    result = _read_json(_case_dir(case_id) / "analysis" / "analysis_result.json")
    logger.info("[TOOL] read_case_analysis  done  case_id=%s found=%s", case_id, isinstance(result, dict))
    return result


@tool
def read_decision_log(case_id: str) -> dict:
    """
    Read the decision log for a claim case.

    Args:
        case_id: The case identifier.

    Returns:
        The decision_log.json contents, or an error string.
    """
    logger.info("[TOOL] read_decision_log  case_id=%s", case_id)
    if not _validate_case_id(case_id):
        logger.warning("[TOOL] read_decision_log  invalid_case_id=%s", case_id)
        return {"error": f"Invalid case_id: '{case_id}'"}
    result = _read_json(_case_dir(case_id) / "decisions" / "decision_log.json")
    logger.info("[TOOL] read_decision_log  done  case_id=%s found=%s", case_id, isinstance(result, dict))
    return result


@tool
def search_cases(query: str) -> list:
    """
    Search claims cases by status or date keywords.

    Args:
        query: Free-text query, e.g. "PENDING_HUMAN_APPROVAL" or "2025-01".

    Returns:
        A list of up to 20 matching case summaries.
    """
    logger.info("[TOOL] search_cases  query=%s", query)
    results = []

    if not _CASES_DIR.exists():
        logger.info("[TOOL] search_cases  storage_root_missing  returning_empty")
        return results

    for status_file in _CASES_DIR.glob("*/status.json"):
        try:
            with open(status_file, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue

        # Simple string-match filter across all string values
        searchable = json.dumps(data).lower()
        if query.lower() in searchable:
            results.append({
                "case_id": data.get("case_id", status_file.parent.name),
                "session_id": data.get("session_id", ""),
                "status": data.get("status", ""),
                "updated_at": data.get("updated_at", ""),
            })

        if len(results) >= _MAX_SEARCH_RESULTS:
            break

    results.sort(key=lambda r: r.get("updated_at", ""), reverse=True)
    logger.info("[TOOL] search_cases  done  query=%s results=%d", query, len(results))
    return results


@tool
def write_analysis_result(case_id: str, analysis: dict) -> str:
    """
    Persist the agent's analysis result for a claim case.

    Args:
        case_id: The case identifier.
        analysis: A dict containing the analysis output.

    Returns:
        "ok" on success, or an error string.
    """
    logger.info("[TOOL] write_analysis_result  case_id=%s analysis_keys=%s",
                case_id, list(analysis.keys()) if analysis else [])
    if not _validate_case_id(case_id):
        logger.warning("[TOOL] write_analysis_result  invalid_case_id=%s", case_id)
        return f"Invalid case_id: '{case_id}'"
    analysis["written_at"] = datetime.now(timezone.utc).isoformat()
    result = _write_json(_case_dir(case_id) / "analysis" / "analysis_result.json", analysis)
    logger.info("[TOOL] write_analysis_result  done  case_id=%s result=%s", case_id, result)
    return result


@tool
def write_decision_log(case_id: str, decision: dict) -> str:
    """
    Persist the agent's decision log for a claim case.

    Args:
        case_id: The case identifier.
        decision: A dict containing decision details (outcome, rationale, etc.).

    Returns:
        "ok" on success, or an error string.
    """
    logger.info("[TOOL] write_decision_log  case_id=%s decision_keys=%s",
                case_id, list(decision.keys()) if decision else [])
    if not _validate_case_id(case_id):
        logger.warning("[TOOL] write_decision_log  invalid_case_id=%s", case_id)
        return f"Invalid case_id: '{case_id}'"
    decision["written_at"] = datetime.now(timezone.utc).isoformat()
    result = _write_json(_case_dir(case_id) / "decisions" / "decision_log.json", decision)
    logger.info("[TOOL] write_decision_log  done  case_id=%s result=%s", case_id, result)
    return result
