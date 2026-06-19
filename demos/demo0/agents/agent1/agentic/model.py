"""Shared Bedrock model factory for Calvin and all sub-agents."""
from __future__ import annotations

import os

from botocore.config import Config
from strands.models import BedrockModel

_DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0"


def get_model() -> BedrockModel:
    """Return a configured BedrockModel instance with retry settings."""
    return BedrockModel(
        model_id=os.getenv("BEDROCK_MODEL_ID", _DEFAULT_MODEL),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        boto_client_config=Config(retries={"max_attempts": 5, "mode": "adaptive"}),
    )
