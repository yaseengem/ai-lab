"""Typed settings loaded from config.yaml + environment variables."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel

_REPO_ROOT = Path(__file__).parent.parent
_CONFIG_PATH = _REPO_ROOT / "config.yaml"


class PortRangeConfig(BaseModel):
    start: int
    end: int


class PortsConfig(BaseModel):
    platform_frontend: int
    platform_backend: int
    agent_frontend: PortRangeConfig
    agent_backend: PortRangeConfig


class DefaultsConfig(BaseModel):
    memory_backend: str
    approval_timeout_seconds: int
    bedrock_model_id: str
    aws_region: str


class AppMeta(BaseModel):
    name: str
    description: str


class Settings(BaseModel):
    app: AppMeta
    ports: PortsConfig
    defaults: DefaultsConfig
    repo_root: Path
    agents_dir: Path

    model_config = {"arbitrary_types_allowed": True}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    raw = yaml.safe_load(_CONFIG_PATH.read_text(encoding="utf-8"))
    return Settings(
        app=AppMeta(**raw["app"]),
        ports=PortsConfig(
            platform_frontend=raw["ports"]["platform_frontend"],
            platform_backend=raw["ports"]["platform_backend"],
            agent_frontend=PortRangeConfig(**raw["ports"]["agent_frontend"]),
            agent_backend=PortRangeConfig(**raw["ports"]["agent_backend"]),
        ),
        defaults=DefaultsConfig(**raw["defaults"]),
        repo_root=_REPO_ROOT,
        agents_dir=_REPO_ROOT / "agents",
    )
