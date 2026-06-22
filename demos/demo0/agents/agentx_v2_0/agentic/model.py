"""
Bedrock model client for the v2.0 template agent.

Resolution order for the model id:
  1. agent.config.yaml  defaults.model_id  (if set and non-empty)
  2. BEDROCK_MODEL_ID env var
  3. root config.yaml  defaults.bedrock_model_id

Region resolves from AWS_REGION env var, else root config.yaml defaults.aws_region.
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml
from botocore.config import Config
from strands.models import BedrockModel

_AGENT_DIR = Path(__file__).parent.parent
_REPO_ROOT = _AGENT_DIR.parent.parent

_config = yaml.safe_load((_REPO_ROOT / "config.yaml").read_text(encoding="utf-8"))
_DEFAULT_MODEL = _config["defaults"]["bedrock_model_id"]
_DEFAULT_REGION = _config["defaults"]["aws_region"]


def _config_model_id() -> str:
    """Read defaults.model_id from this agent's agent.config.yaml (blank if unset)."""
    try:
        cfg = yaml.safe_load((_AGENT_DIR / "agent.config.yaml").read_text(encoding="utf-8")) or {}
        return str((cfg.get("defaults") or {}).get("model_id") or "").strip()
    except (FileNotFoundError, yaml.YAMLError):
        return ""


def resolve_model_id() -> str:
    """Resolve the effective model id (agent.config.yaml → env → root config default)."""
    return _config_model_id() or os.getenv("BEDROCK_MODEL_ID", _DEFAULT_MODEL)


def get_model() -> BedrockModel:
    """Return a configured BedrockModel instance with retry settings."""
    return BedrockModel(
        model_id=resolve_model_id(),
        region_name=os.getenv("AWS_REGION", _DEFAULT_REGION),
        boto_client_config=Config(retries={"max_attempts": 5, "mode": "adaptive"}),
    )
