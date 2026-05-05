"""Bedrock model client — reads model ID from config.yaml defaults."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import yaml
from strands.models import BedrockModel

_REPO_ROOT = Path(__file__).parent.parent.parent.parent
_config = yaml.safe_load((_REPO_ROOT / "config.yaml").read_text(encoding="utf-8"))
_DEFAULT_MODEL = _config["defaults"]["bedrock_model_id"]
_DEFAULT_REGION = _config["defaults"]["aws_region"]


def get_model() -> BedrockModel:
    return BedrockModel(
        model_id=os.getenv("BEDROCK_MODEL_ID", _DEFAULT_MODEL),
        region_name=os.getenv("AWS_REGION", _DEFAULT_REGION),
    )
