"""
Tests for the per-agent state layout, memory layer, awaiting_setup gate, durable
HITL, and backup/restore. Run from demos/demo0 (the import root).

These operate on the agent's real (gitignored) state/ folder and clean it between
tests. No AWS/Bedrock is required — the pipeline is a domain-free skeleton.
"""

from __future__ import annotations

import asyncio
import importlib.util
import shutil

import pytest

from agents.agentx_v2_0.agentic import paths
from agents.agentx_v2_0.agentic.memory_backend import get_memory_store
from agents.agentx_v2_0.apis.service import (
    Service, effective_config, is_configured, load_definition, save_setup,
)


@pytest.fixture(autouse=True)
def clean_state():
    if paths.STATE_DIR.exists():
        shutil.rmtree(paths.STATE_DIR)
    paths.ensure_state_dirs()
    yield
    if paths.STATE_DIR.exists():
        shutil.rmtree(paths.STATE_DIR)


# ── layout ────────────────────────────────────────────────────────────────────

def test_ensure_state_dirs_and_version():
    assert paths.STATE_DIR.is_dir()
    assert paths.VERSION_FILE.read_text(encoding="utf-8").strip() == paths.STATE_SCHEMA_VERSION
    for d in (paths.CONFIG_DIR, paths.MEMORY_DIR, paths.SESSIONS_DIR, paths.DATA_DIR,
              paths.RUNS_DIR, paths.SECRETS_DIR, paths.INDEX_DIR, paths.LOGS_DIR):
        assert d.is_dir(), d


# ── awaiting_setup / config split ───────────────────────────────────────────────

def test_awaiting_setup_then_ready():
    assert not is_configured()
    assert Service.self_check()["status"] == "awaiting_setup"
    save_setup({"hitl_approval": False})
    assert is_configured()
    assert Service.self_check()["status"] in ("ok", "degraded")


def test_definition_present_without_setup():
    # personas/capabilities come from the git-tracked definition, even pre-setup,
    # so the marketplace can render the config form.
    defn = load_definition()
    assert defn.get("personas") and defn.get("capabilities")


def test_effective_config_merge():
    save_setup({"model_id": "m1", "hitl_approval": True,
                "integrations": {"aws_s3": {"connected": True}}})
    eff = effective_config()
    assert eff["defaults"]["model_id"] == "m1"
    assert eff["features"]["hitl_approval"] is True
    assert eff["configured"] is True
    assert any(i["id"] == "aws_s3" and i["connected"] for i in eff["integrations"])


# ── memory layer ────────────────────────────────────────────────────────────────

def test_memory_round_trip():
    s = get_memory_store()
    rule = s.add_rule("Claims over $50k need two approvals")
    s.set_fact("client_acme_risk", "high", source="CASE-1")
    s.add_episode({"run_id": "RUN-X", "outcome": "approved"})

    snap = s.snapshot()
    assert [r["text"] for r in snap["rules"]] == ["Claims over $50k need two approvals"]
    assert snap["facts"]["client_acme_risk"]["value"] == "high"
    assert snap["facts"]["client_acme_risk"]["source"] == "CASE-1"
    assert snap["episodes"][-1]["outcome"] == "approved"

    assert s.remove_rule(rule["id"]) is True
    assert s.get_rules() == []
    assert s.remove_rule("does-not-exist") is False


# ── durable HITL (the restart-survival fix) ──────────────────────────────────────

def test_hitl_paused_run_survives_restart():
    async def scenario():
        save_setup({"hitl_approval": True})

        # process 1: run pauses at the gate, then "crashes"
        svc1 = Service()
        sid = svc1.create_session(persona="admin")["session_id"]
        task = asyncio.create_task(svc1.run_pipeline(sid))
        for _ in range(300):
            await asyncio.sleep(0.01)
            if (svc1.get_session(sid) or {}).get("status") == "awaiting_approval":
                break
        assert (svc1.get_session(sid) or {}).get("status") == "awaiting_approval"
        assert (paths.RUNS_DIR / f"{sid}.json").exists()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        # process 2: restart resumes (not interrupts) the paused run
        svc2 = Service()
        rec = await svc2.recover_on_startup()
        assert rec == {"resumed": 1, "interrupted": 0}
        await asyncio.sleep(0.05)
        assert (svc2.get_session(sid) or {}).get("status") == "awaiting_approval"

        # approving post-restart finalizes the run
        assert svc2.resolve_approval(sid, "approve") is True
        for _ in range(300):
            await asyncio.sleep(0.01)
            if (svc2.get_session(sid) or {}).get("status") == "complete":
                break
        meta = svc2.get_session(sid) or {}
        assert meta.get("status") == "complete" and meta.get("outcome") == "approved"

    asyncio.run(scenario())


def test_queued_run_is_interrupted_not_resumed():
    # A run left 'running' (mid-compute) with no open gate must be interrupted.
    svc = Service()
    sid = svc.create_session(persona="admin")["session_id"]
    svc.set_status(sid, "running")
    rec = asyncio.run(svc.recover_on_startup())
    assert rec == {"resumed": 0, "interrupted": 1}
    assert (svc.get_session(sid) or {}).get("status") == "interrupted"


# ── backup / restore ─────────────────────────────────────────────────────────────

def _load_agent_state_module():
    repo_root = paths.AGENT_DIR.parents[3]  # …/ai-lab
    script = repo_root / "scripts" / "agent_state.py"
    spec = importlib.util.spec_from_file_location("agent_state", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_backup_restore_roundtrip(tmp_path):
    save_setup({"model_id": "m1"})
    get_memory_store().add_rule("keep me")
    (paths.INDEX_DIR / "cache.bin").write_text("rebuildable", encoding="utf-8")

    mod = _load_agent_state_module()
    out = tmp_path / "backup.zip"
    assert mod.backup(paths.AGENT_DIR, out) == 0

    shutil.rmtree(paths.STATE_DIR)
    assert mod.restore(paths.AGENT_DIR, out, force=True) == 0

    # state restored; index/ rebuilt empty (excluded from backup)
    rules = get_memory_store().get_rules()
    assert any(r["text"] == "keep me" for r in rules)
    assert effective_config()["defaults"]["model_id"] == "m1"
    assert paths.INDEX_DIR.is_dir()
    assert not (paths.INDEX_DIR / "cache.bin").exists()
