#!/usr/bin/env bash
# stop.sh — Force-kill all AI Lab services.
# Kills by PID file first, then by port as fallback.
# Called automatically by run.sh on Ctrl+C, or run standalone from a second terminal.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT_PY="$(cygpath -w "$REPO_ROOT" 2>/dev/null || echo "$REPO_ROOT")"
DEMO0_DIR_PY="$(cygpath -w "$REPO_ROOT/demos/demo0" 2>/dev/null || echo "$REPO_ROOT/demos/demo0")"
PID_DIR="$REPO_ROOT/scripts/pids"

echo ""
echo "=== AI Lab — Stopping services ==="
echo ""

# ── Kill by PID files (written by run.sh) ───────────────────────────────────
if [[ -d "$PID_DIR" ]]; then
  for pid_file in "$PID_DIR"/*.pid; do
    [[ -f "$pid_file" ]] || continue
    local_name="$(basename "$pid_file" .pid)"
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      taskkill //PID "$pid" //T //F 2>/dev/null && echo "  killed $local_name (PID $pid)" || true
      rm -f "$pid_file"
    fi
  done
fi

# ── Kill by port (catches anything that slipped through) ──────────────────────
kill_port() {
  local port="$1"
  local label="${2:-port $port}"
  local pids
  pids=$(netstat -ano 2>/dev/null | grep ":${port}[[:space:]]" | grep LISTENING | awk '{print $NF}' | sort -u || true)
  if [[ -z "$pids" ]]; then
    return
  fi
  for p in $pids; do
    [[ -z "$p" || "$p" == "0" ]] && continue
    taskkill //PID "$p" //T //F 2>/dev/null && echo "  killed $label (PID $p on port $port)" || true
  done
}

# Collect every (port,label) to kill, then fire them all off in parallel.
read_demo0() {
  python -c "import yaml; print(yaml.safe_load(open(r'$DEMO0_DIR_PY/config.yaml'))$1)" 2>/dev/null || echo ""
}

PORT_SPECS=()
# AI Lab launcher
LAUNCHER_PORT=$(python -c "import yaml; print(yaml.safe_load(open(r'$REPO_ROOT_PY/config.yaml'))['launcher_port'])" 2>/dev/null || echo "5000")
PORT_SPECS+=("${LAUNCHER_PORT}|ai-lab-launcher")
# AI Agents Squad (demo0)
PORT_SPECS+=("$(read_demo0 "['ports']['platform_backend']")|squad-api")
PORT_SPECS+=("$(read_demo0 "['ports']['platform_frontend']")|squad-frontend")

AGENT_LIST=$(python -c "
import yaml
from pathlib import Path

agents_dir = Path(r'$DEMO0_DIR_PY/agents')
for d in sorted(agents_dir.iterdir()):
    meta_file = d / 'metadata.yaml'
    if not meta_file.exists(): continue
    meta = yaml.safe_load(meta_file.read_text())
    if meta.get('status') in ('template', 'stub'): continue
    print(f\"{d.name}|{meta['name']}|{meta['api_port']}|{meta['frontend_port']}\")
" 2>/dev/null)

while IFS='|' read -r agent_dir name api_port frontend_port; do
  [[ -z "$agent_dir" ]] && continue
  PORT_SPECS+=("${api_port}|agent-$agent_dir api")
  PORT_SPECS+=("${frontend_port}|agent-$agent_dir frontend")
done <<< "$AGENT_LIST"

# Kill all ports in parallel
for spec in "${PORT_SPECS[@]}"; do
  IFS='|' read -r port label <<< "$spec"
  [[ -z "$port" ]] && continue
  kill_port "$port" "$label" &
done
wait

echo ""
echo "=== Done ==="
echo ""
