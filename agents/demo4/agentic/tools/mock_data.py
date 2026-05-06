"""
Static mock data for the Settlement Failure Prevention Agent.

All data matches the UC8 spec Section 6.2 test dataset exactly.
Counterparty names, IDs, and trade references are fictitious and for testing only.

Scenario override mechanism:
  call set_session_scenario(session_id, scenario_data) before starting a pipeline.
  call clear_session_scenario(session_id) after it completes.
  Each asyncio.to_thread() wrapper must call set_thread_session(session_id) at the
  start of the thread so tool functions pick up the correct override data.
"""
from __future__ import annotations

import threading
from datetime import date, timedelta

# ── Helpers ──────────────────────────────────────────────────────────────────

def _business_days_ahead(n: int) -> str:
    """Return ISO date string n business days from today."""
    d = date.today()
    count = 0
    while count < n:
        d += timedelta(days=1)
        if d.weekday() < 5:  # Mon-Fri
            count += 1
    return d.isoformat()

T1_DATE = _business_days_ahead(1)
T2_DATE = _business_days_ahead(2)


def _resolve_settlement_date(trade: dict) -> dict:
    """If a trade has no settlement_date or uses 'T+1'/'T+2' as placeholder, resolve it."""
    out = dict(trade)
    sd = out.get("settlement_date", "")
    if not sd or sd in ("T+1", "T+2"):
        window = out.get("settlement_window", "T+1")
        out["settlement_date"] = T1_DATE if window == "T+1" else T2_DATE
    return out


# ── Scenario override mechanism ───────────────────────────────────────────────

_SCENARIO_DATA: dict[str, dict] = {}   # session_id → scenario payload
_THREAD_SESSION = threading.local()    # per-thread session id


def set_session_scenario(session_id: str, scenario: dict) -> None:
    """Register scenario overrides for a session before the pipeline starts."""
    _SCENARIO_DATA[session_id] = scenario


def clear_session_scenario(session_id: str) -> None:
    """Remove scenario overrides after a pipeline completes or fails."""
    _SCENARIO_DATA.pop(session_id, None)


def set_thread_session(session_id: str) -> None:
    """Called inside each asyncio.to_thread() wrapper to bind session to thread."""
    _THREAD_SESSION.session_id = session_id


def _active_scenario() -> dict | None:
    sid = getattr(_THREAD_SESSION, "session_id", None)
    return _SCENARIO_DATA.get(sid) if sid else None


# ── Counterparty profiles ─────────────────────────────────────────────────────

COUNTERPARTY_PROFILES = {
    "CP-001": {
        "counterparty_id": "CP-001",
        "name": "Apex Securities (Pty) Ltd",
        "net_obligation_zar": 120_000_000,
        "cis_status": "ACTIVE",
        "lending_balance_pct": 95,
        "last_failure_days_ago": None,
        "jse_watchlist": False,
        "expected_risk_tier": "CRITICAL",
        "credit_rating": "BBB+",
        "margin_call_history_90d": 0,
        "integration_health": "HEALTHY",
        "account_flags": [],
    },
    "CP-002": {
        "counterparty_id": "CP-002",
        "name": "Horizon Brokers Ltd",
        "net_obligation_zar": 48_000_000,
        "cis_status": "ACTIVE",
        "lending_balance_pct": 72,
        "last_failure_days_ago": 3,
        "jse_watchlist": False,
        "expected_risk_tier": "HIGH",
        "credit_rating": "BB",
        "margin_call_history_90d": 2,
        "integration_health": "HEALTHY",
        "account_flags": ["RECENT_FAILURE"],
    },
    "CP-003": {
        "counterparty_id": "CP-003",
        "name": "Summit Asset Managers",
        "net_obligation_zar": 22_000_000,
        "cis_status": "DEGRADED",
        "lending_balance_pct": 88,
        "last_failure_days_ago": None,
        "jse_watchlist": False,
        "expected_risk_tier": "MEDIUM",
        "credit_rating": "A-",
        "margin_call_history_90d": 1,
        "integration_health": "DEGRADED",
        "account_flags": ["CIS_DEGRADED"],
    },
    "CP-004": {
        "counterparty_id": "CP-004",
        "name": "BlueChip Investments CC",
        "net_obligation_zar": 8_500_000,
        "cis_status": "ACTIVE",
        "lending_balance_pct": 100,
        "last_failure_days_ago": None,
        "jse_watchlist": False,
        "expected_risk_tier": "LOW",
        "credit_rating": "AA",
        "margin_call_history_90d": 0,
        "integration_health": "HEALTHY",
        "account_flags": [],
    },
    "CP-005": {
        "counterparty_id": "CP-005",
        "name": "Redline Capital (Pty) Ltd",
        "net_obligation_zar": 35_000_000,
        "cis_status": "ACTIVE",
        "lending_balance_pct": 100,
        "last_failure_days_ago": None,
        "jse_watchlist": True,
        "expected_risk_tier": "CRITICAL",
        "credit_rating": "B+",
        "margin_call_history_90d": 4,
        "integration_health": "HEALTHY",
        "account_flags": ["WATCHLIST"],
        "watchlist_reason": "Regulatory investigation by FSCA",
    },
    "CP-006": {
        "counterparty_id": "CP-006",
        "name": "Cornerstone Fund Managers",
        "net_obligation_zar": 19_000_000,
        "cis_status": "ACTIVE",
        "lending_balance_pct": 82,
        "last_failure_days_ago": None,
        "jse_watchlist": False,
        "expected_risk_tier": "LOW",
        "credit_rating": "A",
        "margin_call_history_90d": 0,
        "integration_health": "HEALTHY",
        "account_flags": [],
    },
    "CP-007": {
        "counterparty_id": "CP-007",
        "name": "TerraFin Brokers Ltd",
        "net_obligation_zar": 55_000_000,
        "cis_status": "CIS_UNAVAILABLE",
        "lending_balance_pct": None,
        "last_failure_days_ago": 7,
        "jse_watchlist": False,
        "expected_risk_tier": "CRITICAL",
        "credit_rating": "UNKNOWN",
        "margin_call_history_90d": None,
        "integration_health": "UNAVAILABLE",
        "account_flags": ["CIS_UNAVAILABLE"],
    },
}


def get_counterparty_profiles() -> dict:
    scenario = _active_scenario()
    if scenario and scenario.get("counterparty_profiles"):
        return scenario["counterparty_profiles"]
    return COUNTERPARTY_PROFILES


# ── Trade dataset ─────────────────────────────────────────────────────────────

def _default_trades() -> list[dict]:
    return [
        {
            "trade_id": "TRD-2001",
            "counterparty_id": "CP-001",
            "isin": "ZAE000042811",
            "instrument": "Naspers Ltd",
            "settlement_window": "T+1",
            "settlement_date": T1_DATE,
            "side": "SELL",
            "quantity": 50_000,
            "value_zar": 120_000_000,
            "securities_lending_gap": None,
        },
        {
            "trade_id": "TRD-2002",
            "counterparty_id": "CP-002",
            "isin": "ZAE000149478",
            "instrument": "Standard Bank Group",
            "settlement_window": "T+1",
            "settlement_date": T1_DATE,
            "side": "BUY",
            "quantity": 100_000,
            "value_zar": 48_000_000,
            "securities_lending_gap": 0.28,
        },
        {
            "trade_id": "TRD-2003",
            "counterparty_id": "CP-003",
            "isin": "ZAE000015889",
            "instrument": "FirstRand Ltd",
            "settlement_window": "T+2",
            "settlement_date": T2_DATE,
            "side": "SELL",
            "quantity": 25_000,
            "value_zar": 22_000_000,
            "securities_lending_gap": None,
        },
        {
            "trade_id": "TRD-2004",
            "counterparty_id": "CP-004",
            "isin": "ZAE000071080",
            "instrument": "Anglo American Plc",
            "settlement_window": "T+2",
            "settlement_date": T2_DATE,
            "side": "BUY",
            "quantity": 5_000,
            "value_zar": 8_500_000,
            "securities_lending_gap": None,
        },
        {
            "trade_id": "TRD-2005",
            "counterparty_id": "CP-005",
            "isin": "ZAE000067211",
            "instrument": "Sasol Ltd",
            "settlement_window": "T+1",
            "settlement_date": T1_DATE,
            "side": "SELL",
            "quantity": 40_000,
            "value_zar": 35_000_000,
            "securities_lending_gap": None,
        },
        {
            "trade_id": "TRD-2006",
            "counterparty_id": "CP-006",
            "isin": "ZAE000028492",
            "instrument": "MTN Group Ltd",
            "settlement_window": "T+2",
            "settlement_date": T2_DATE,
            "side": "BUY",
            "quantity": 18_000,
            "value_zar": 19_000_000,
            "securities_lending_gap": None,
        },
        {
            "trade_id": "TRD-2007",
            "counterparty_id": "CP-007",
            "isin": "ZAE000042811",
            "instrument": "Naspers Ltd",
            "settlement_window": "T+1",
            "settlement_date": T1_DATE,
            "side": "SELL",
            "quantity": 22_000,
            "value_zar": 55_000_000,
            "securities_lending_gap": None,  # Unknown — CIS unavailable
        },
        {
            "trade_id": "TRD-2008",
            "counterparty_id": "CP-002",
            "isin": "ZAE000149478",
            "instrument": "Standard Bank Group",
            "settlement_window": "T+2",
            "settlement_date": T2_DATE,
            "side": "SELL",
            "quantity": 15_000,
            "value_zar": 12_000_000,
            "securities_lending_gap": None,
        },
    ]


def get_trades() -> list[dict]:
    """Return trades for the current thread's session scenario, or the default dataset."""
    scenario = _active_scenario()
    if scenario and scenario.get("trades"):
        return [_resolve_settlement_date(t) for t in scenario["trades"]]
    return _default_trades()


# ── Market context ────────────────────────────────────────────────────────────

MARKET_CONTEXT = {
    "jse_volatility_index_savi": 28.4,
    "alsi_1day_move_pct": -2.1,
    "security_moves": {
        "ZAE000042811": {"name": "Naspers Ltd", "5day_move_pct": -6.8, "note": "Significant price stress"},
        "ZAE000149478": {"name": "Standard Bank Group", "5day_move_pct": -1.2, "note": "Within normal range"},
        "ZAE000015889": {"name": "FirstRand Ltd", "5day_move_pct": -0.8},
        "ZAE000071080": {"name": "Anglo American Plc", "5day_move_pct": 0.3},
        "ZAE000067211": {"name": "Sasol Ltd", "5day_move_pct": -2.4},
        "ZAE000028492": {"name": "MTN Group Ltd", "5day_move_pct": -1.5},
    },
    "repo_rate_sarb_pct": 8.25,
    "active_jse_market_stress_flag": False,
    "volatility_threshold": 25,
    "elevated_volatility": True,
}


def get_market_context() -> dict:
    scenario = _active_scenario()
    if scenario and scenario.get("market_context"):
        return scenario["market_context"]
    return MARKET_CONTEXT


# ── Historical failure rates ──────────────────────────────────────────────────

HISTORICAL_FAILURES = {
    "CP-001": {"failure_count_90d": 0, "failure_dates": [], "avg_delay_days": 0},
    "CP-002": {
        "failure_count_90d": 1,
        "failure_dates": [(date.today() - timedelta(days=3)).isoformat()],
        "avg_delay_days": 1,
    },
    "CP-003": {"failure_count_90d": 0, "failure_dates": [], "avg_delay_days": 0},
    "CP-004": {"failure_count_90d": 0, "failure_dates": [], "avg_delay_days": 0},
    "CP-005": {"failure_count_90d": 0, "failure_dates": [], "avg_delay_days": 0},
    "CP-006": {"failure_count_90d": 0, "failure_dates": [], "avg_delay_days": 0},
    "CP-007": {"failure_count_90d": None, "failure_dates": None, "avg_delay_days": None, "note": "Data unavailable (CIS_UNAVAILABLE)"},
}


def get_historical_failures() -> dict:
    scenario = _active_scenario()
    if scenario and scenario.get("historical_failures"):
        return scenario["historical_failures"]
    return HISTORICAL_FAILURES


# ── Securities lending depth ──────────────────────────────────────────────────

LENDING_DEPTH = {
    ("CP-002", "ZAE000149478"): {
        "isin": "ZAE000149478",
        "name": "Standard Bank Group",
        "available_inventory": 72_000,
        "current_borrows": 28_000,
        "required": 100_000,
        "net_available": 72_000,
        "shortfall_pct": 28.0,
    },
    ("CP-007", "ZAE000042811"): {
        "isin": "ZAE000042811",
        "name": "Naspers Ltd",
        "available_inventory": None,
        "current_borrows": None,
        "required": 22_000,
        "net_available": None,
        "shortfall_pct": None,
        "note": "CIS unavailable — cannot verify lending position",
    },
}


def get_lending_depth() -> dict:
    scenario = _active_scenario()
    if scenario and scenario.get("lending_depth"):
        # Scenario stores as list; convert to (cp_id, isin) tuple-keyed dict
        return {
            (entry["counterparty_id"], entry["isin"]): entry
            for entry in scenario["lending_depth"]
        }
    return LENDING_DEPTH


# ── JSE watchlist entries ─────────────────────────────────────────────────────

JSE_WATCHLIST = {
    "CP-005": {
        "active": True,
        "entries": [{
            "entry_date": "2026-04-15",
            "reason": "Regulatory investigation by FSCA — potential market manipulation",
            "severity": "HIGH",
            "review_date": "2026-06-15",
            "ccp_risk_flag": True,
        }],
    },
}


def get_jse_watchlist() -> dict:
    scenario = _active_scenario()
    if scenario and scenario.get("jse_watchlist"):
        return scenario["jse_watchlist"]
    return JSE_WATCHLIST


# ── LOLR capacity ─────────────────────────────────────────────────────────────

LOLR_CAPACITY = {
    "ZAE000042811": {"security": "Naspers Ltd", "available_zar": 200_000_000, "available_units": 83_000},
    "ZAE000149478": {"security": "Standard Bank Group", "available_zar": 80_000_000, "available_units": 166_000},
    "ZAE000015889": {"security": "FirstRand Ltd", "available_zar": 50_000_000, "available_units": 100_000},
    "ZAE000067211": {"security": "Sasol Ltd", "available_zar": 40_000_000, "available_units": 45_000},
}

# ── Strate eligibility ────────────────────────────────────────────────────────

STRATE_ELIGIBILITY = {
    "TRD-2002": {"eligible": True, "max_roll_days": 1, "instrument_type": "EQUITY", "reason": "T+3 → T+4 roll available"},
    "TRD-2003": {"eligible": True, "max_roll_days": 1, "instrument_type": "EQUITY", "reason": "T+3 → T+4 roll available"},
}

# ── Mock LOLR submission responses ────────────────────────────────────────────

LOLR_SUBMISSION_COUNTER = {"count": 0}

def next_lolr_confirmation() -> dict:
    LOLR_SUBMISSION_COUNTER["count"] += 1
    n = LOLR_SUBMISSION_COUNTER["count"]
    return {
        "status": "CONFIRMED",
        "confirmation_id": f"LOLR-TEST-{n:03d}",
        "booking_ref": f"CCP-BK-{n:04d}",
    }

# ── Mock roll submission responses ───────────────────────────────────────────

ROLL_SUBMISSION_COUNTER = {"count": 0}

def next_roll_confirmation() -> dict:
    ROLL_SUBMISSION_COUNTER["count"] += 1
    n = ROLL_SUBMISSION_COUNTER["count"]
    return {
        "status": "ACCEPTED",
        "submission_reference": f"ROLL-TEST-{n:03d}",
        "strate_confirmation_ref": f"STR-CONF-{n:04d}",
    }
