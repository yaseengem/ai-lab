#!/usr/bin/env bash
# stop.sh — Stop all Neural services (platform + all agents).
# Reads which agents are running from scripts/pids/ and metadata.yaml.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$REPO_ROOT/scripts/pids"

# ── Helper: kill by port (fallback when no PID file) ─────────────────────────
kill_by_port() {
  local port="$1"
  local pids
  pids=$(netstat -ano 2>/dev/null | grep ":${port}[[:space:]]" | grep LISTENING | awk '{print $NF}' | sort -u || true)
  for p in $pids; do
    [[ -z "$p" || "$p" == "0" ]] && continue
    taskkill //PID "$p" //F 2>/dev/null && echo "  killed PID $p on port $port" || true
  done
}

# ── Helper: stop one service by PID file ─────────────────────────────────────
stop_service() {
  local name="$1"
  local port="${2:-}"
  local pid_file="$PID_DIR/${name}.pid"

  if [[ ! -f "$pid_file" ]]; then
    if [[ -n "$port" ]]; then
      echo "  [fallback] $name — no PID file, killing port $port"
      kill_by_port "$port"
    else
      echo "  [skip] $name — no PID file"
    fi
    return
  fi

  local pid
  pid=$(cat "$pid_file")

  if ! kill -0 "$pid" 2>/dev/null; then
    echo "  [skip] $name — PID $pid not running"
    rm -f "$pid_file"
    return
  fi

  kill -TERM "$pid" 2>/dev/null || true
  local waited=0
  while kill -0 "$pid" 2>/dev/null && [[ $waited -lt 5 ]]; do
    sleep 1; (( waited++ )) || true
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
  echo "  stopped $name (PID $pid)"
}

echo ""
echo "=== Neural — Stopping services ==="
echo ""

# ── Platform ──────────────────────────────────────────────────────────────────
read_port() {
  python -c "import yaml; c=yaml.safe_load(open('$REPO_ROOT/config.yaml')); print(c$1)" 2>/dev/null || echo ""
}

stop_service "platform-api"      "$(read_port "['ports']['platform_backend']")"
stop_service "platform-frontend" "$(read_port "['ports']['platform_frontend']")"

# ── Agents (by PID files that start with "agent-") ───────────────────────────
if [[ -d "$PID_DIR" ]]; then
  for pid_file in "$PID_DIR"/agent-*.pid; do
    [[ -f "$pid_file" ]] || continue
    name="$(basename "$pid_file" .pid)"
    agent_dir="${name#agent-}"
    meta_file="$REPO_ROOT/agents/$agent_dir/metadata.yaml"
    port=""
    if [[ -f "$meta_file" ]]; then
      port=$(python -c "import yaml; m=yaml.safe_load(open('$meta_file')); print(m['api_port'])" 2>/dev/null || true)
    fi
    stop_service "$name" "$port"
  done
fi

echo ""
echo "=== All services stopped. ==="
echo ""
