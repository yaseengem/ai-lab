"""
Bedrock model client for the v2.0 template agent.

Resolution order for the model id:
  1. state/config/setup.yaml  model_id          (operator override from marketplace)
  2. agent.config.yaml        defaults.model_id  (built-in default)
  3. BEDROCK_MODEL_ID env var
  4. root config.yaml         defaults.bedrock_model_id

Region resolves from AWS_REGION env var, else root config.yaml defaults.aws_region.
"""

from __future__ import annotations

import os

import yaml
from botocore.config import Config
from strands.models import BedrockModel

from .paths import AGENT_DIR, CONFIG_DEF_FILE, SETUP_FILE

_REPO_ROOT = AGENT_DIR.parent.parent

_config = yaml.safe_load((_REPO_ROOT / "config.yaml").read_text(encoding="utf-8"))
_DEFAULT_MODEL = _config["defaults"]["bedrock_model_id"]
_DEFAULT_REGION = _config["defaults"]["aws_region"]


def _yaml_or_empty(path) -> dict:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (FileNotFoundError, yaml.YAMLError):
        return {}


def _config_model_id() -> str:
    """Effective configured model id: setup.yaml override → agent.config.yaml default."""
    setup = _yaml_or_empty(SETUP_FILE)
    if str(setup.get("model_id") or "").strip():
        return str(setup["model_id"]).strip()
    defn = _yaml_or_empty(CONFIG_DEF_FILE)
    return str((defn.get("defaults") or {}).get("model_id") or "").strip()


def resolve_model_id() -> str:
    """Resolve the effective model id (setup → agent.config.yaml → env → root default)."""
    return _config_model_id() or os.getenv("BEDROCK_MODEL_ID", _DEFAULT_MODEL)


def get_model() -> BedrockModel:
    """Return a configured BedrockModel instance with retry settings."""
    return BedrockModel(
        model_id=resolve_model_id(),
        region_name=os.getenv("AWS_REGION", _DEFAULT_REGION),
        boto_client_config=Config(retries={"max_attempts": 5, "mode": "adaptive"}),
    )
