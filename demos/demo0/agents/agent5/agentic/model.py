"""
Bedrock model clients for agent5 (Trianz Concierge).

This agent is cross-modal, so it resolves TWO model ids:

  • TEXT model  — a Strands `BedrockModel` used by the SSE `/chat` path and the
    sales/scheduling sub-agents. Defaults to a Nova text model.
  • SONIC model — Amazon Nova Sonic, driven over the bidirectional Bedrock stream
    by `sonic_session.py` (NOT through Strands). Resolved as a plain id string.

Resolution order (each id), highest priority first:
  1. state/config/setup.yaml   (operator override from the marketplace)
  2. agent.config.yaml         defaults.*  (built-in default)
  3. environment variable
  4. demos/demo0 config.yaml   defaults.*  (squad-wide fallback)

Region resolves from AWS_REGION env var, else the squad config default.
"""

from __future__ import annotations

import os

import yaml
from botocore.config import Config
from strands.models import BedrockModel

from .paths import AGENT_DIR, CONFIG_DEF_FILE, SETUP_FILE

_REPO_ROOT = AGENT_DIR.parent.parent  # demos/demo0

_config = yaml.safe_load((_REPO_ROOT / "config.yaml").read_text(encoding="utf-8"))
_DEFAULT_TEXT_MODEL = _config["defaults"]["bedrock_model_id"]
_DEFAULT_REGION = _config["defaults"]["aws_region"]

# Built-in fallbacks specific to this agent (used only if nothing else resolves).
_FALLBACK_TEXT_MODEL = "us.amazon.nova-pro-v1:0"
_FALLBACK_SONIC_MODEL = "amazon.nova-sonic-v1:0"


def _yaml_or_empty(path) -> dict:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (FileNotFoundError, yaml.YAMLError):
        return {}


def _setup() -> dict:
    return _yaml_or_empty(SETUP_FILE)


def _defaults() -> dict:
    return _yaml_or_empty(CONFIG_DEF_FILE).get("defaults") or {}


# ── text model (chat + sub-agents) ────────────────────────────────────────────

def resolve_model_id() -> str:
    """Resolve the effective TEXT model id (setup → agent.config.yaml → env → squad default)."""
    if str(_setup().get("model_id") or "").strip():
        return str(_setup()["model_id"]).strip()
    if str(_defaults().get("model_id") or "").strip():
        return str(_defaults()["model_id"]).strip()
    return os.getenv("BEDROCK_MODEL_ID") or _DEFAULT_TEXT_MODEL or _FALLBACK_TEXT_MODEL


def resolve_region() -> str:
    """Resolve the effective AWS region (env → squad default)."""
    return os.getenv("AWS_REGION", _DEFAULT_REGION)


def get_text_model() -> BedrockModel:
    """Return a configured Strands BedrockModel for the text chat path + sub-agents."""
    return BedrockModel(
        model_id=resolve_model_id(),
        region_name=resolve_region(),
        boto_client_config=Config(retries={"max_attempts": 5, "mode": "adaptive"}),
    )


# Back-compat: agent.py and service.py import get_model() / resolve_model_id().
get_model = get_text_model


# ── Nova Sonic (voice) ─────────────────────────────────────────────────────────

def resolve_sonic_model_id() -> str:
    """Resolve the effective Nova Sonic model id (setup → agent.config.yaml → env → fallback)."""
    if str(_setup().get("sonic_model_id") or "").strip():
        return str(_setup()["sonic_model_id"]).strip()
    if str(_defaults().get("sonic_model_id") or "").strip():
        return str(_defaults()["sonic_model_id"]).strip()
    return os.getenv("NOVA_SONIC_MODEL_ID") or _FALLBACK_SONIC_MODEL
