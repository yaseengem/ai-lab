"""
Master Orchestrator for the Settlement Failure Prevention Agent.

Provides create_orchestrator() which returns a Strands Agent that holds all 7
sub-agents as tools. The actual pipeline execution for the demo is driven by
agent_bridge.py (which calls sub-agents directly for step-by-step SSE streaming).
This orchestrator is available for direct LLM-driven orchestration if needed.
"""
from __future__ import annotations

import os
import sys

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from strands import Agent  # noqa: E402

from commons.logger import get_logger  # noqa: E402
from .model import get_model  # noqa: E402
from .prompts import ORCHESTRATOR_SYSTEM_PROMPT  # noqa: E402

# Sub-agents (Agents-as-Tools)
from .sub_agents.data_ingestion import data_ingestion_agent  # noqa: E402
from .sub_agents.risk_scoring import risk_scoring_agent  # noqa: E402
from .sub_agents.counterparty_risk import counterparty_risk_agent  # noqa: E402
from .sub_agents.intervention_decision import intervention_decision_agent  # noqa: E402
from .sub_agents.lolr_execution import lolr_execution_agent  # noqa: E402
from .sub_agents.settlement_roll import settlement_roll_agent  # noqa: E402
from .sub_agents.reporting_audit import reporting_audit_agent  # noqa: E402

logger = get_logger(__name__)

_ALL_TOOLS = [
    data_ingestion_agent,
    risk_scoring_agent,
    counterparty_risk_agent,
    intervention_decision_agent,
    lolr_execution_agent,
    settlement_roll_agent,
    reporting_audit_agent,
]


def create_orchestrator(session_id: str = "") -> Agent:
    """
    Create the Master Orchestrator Agent with all 7 sub-agents as tools.

    The orchestrator is responsible for the end-to-end pipeline sequencing.
    In practice, agent_bridge.py drives the pipeline directly for SSE streaming,
    but this agent is available for interactive/direct use.
    """
    context = f"\n\n=== SESSION: {session_id} ===" if session_id else ""
    agent = Agent(
        model=get_model(),
        system_prompt=ORCHESTRATOR_SYSTEM_PROMPT + context,
        tools=_ALL_TOOLS,
    )
    logger.info("[NEXUS] orchestrator created  session_id=%s tools=%d", session_id, len(_ALL_TOOLS))
    return agent
