#!/usr/bin/env bash
# start.sh — Start the Neural platform backend, platform frontend, and all active agents.
# Reads ports from config.yaml and scans agents/*/metadata.yaml dynamically.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$REPO_ROOT/scripts/pids"

mkdir -p "$PID_DIR"

# ── Load .env (secrets only) ─────────────────────────────────────────────────
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -o allexport
  source "$REPO_ROOT/.env"
  set +o allexport
else
  echo "  [warn] No .env file — using defaults from config.yaml"
fi

# ── Activate virtualenv if present ───────────────────────────────────────────
for activate in \
  "$REPO_ROOT/.venv/Scripts/activate" \
  "$REPO_ROOT/.venv/bin/activate" \
  "$REPO_ROOT/venv/Scripts/activate" \
  "$REPO_ROOT/venv/bin/activate"; do
  if [[ -f "$activate" ]]; then
    source "$activate"
    break
  fi
done

# ── Read config.yaml via Python ───────────────────────────────────────────────
read_config() {
  python -c "
import yaml, sys
c = yaml.safe_load(open('$REPO_ROOT/config.yaml'))
print(c$1)
"
}

PLATFORM_BACKEND_PORT=$(read_config "['ports']['platform_backend']")
PLATFORM_FRONTEND_PORT=$(read_config "['ports']['platform_frontend']")

# ── Port conflict check ───────────────────────────────────────────────────────
python -c "
import sys, yaml
from pathlib import Path

agents_dir = Path('$REPO_ROOT/agents')
seen = {}
conflicts = []

for d in sorted(agents_dir.iterdir()):
    meta_file = d / 'metadata.yaml'
    if not meta_file.exists(): continue
    meta = yaml.safe_load(meta_file.read_text())
    if meta.get('status') == 'template': continue
    for label, port in [('api_port', meta['api_port']), ('frontend_port', meta['frontend_port'])]:
        key = str(port)
        if key in seen:
            conflicts.append(f'Port {port}: {d.name} ({label}) conflicts with {seen[key]}')
        else:
            seen[key] = f'{d.name} ({label})'

if conflicts:
    print('PORT CONFLICTS DETECTED — fix metadata.yaml before starting:')
    for c in conflicts: print(' ', c)
    sys.exit(1)
"

# ── Helper: start a background service ───────────────────────────────────────
start_service() {
  local name="$1"
  local log_file="$2"
  shift 2
  local pid_file="$PID_DIR/${name}.pid"

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "  [skip] $name already running (PID $(cat "$pid_file"))"
    return
  fi

  mkdir -p "$(dirname "$log_file")"
  "$@" >> "$log_file" 2>&1 &
  echo $! > "$pid_file"
  echo "  started $name (PID $!  log: $log_file)"
}

echo ""
echo "=== Neural — Starting platform ==="
echo ""

# ── Platform backend (:5001) ─────────────────────────────────────────────────
start_service "platform-api" "$REPO_ROOT/app/logs/platform-api.log" \
  python -m uvicorn app.main:app --host 0.0.0.0 --port "$PLATFORM_BACKEND_PORT"

# ── Platform frontend (:5000) ────────────────────────────────────────────────
if [[ -f "$REPO_ROOT/frontend/package.json" ]]; then
  if [[ ! -d "$REPO_ROOT/frontend/node_modules" ]]; then
    echo "  Installing platform frontend dependencies ..."
    (cd "$REPO_ROOT/frontend" && npm install >> "$REPO_ROOT/frontend/install.log" 2>&1)
  fi
  start_service "platform-frontend" "$REPO_ROOT/frontend/frontend.log" \
    sh -c "cd '$REPO_ROOT/frontend' && npm run dev -- --port $PLATFORM_FRONTEND_PORT"
fi

echo ""
echo "=== Starting agents ==="
echo ""

# ── Scan and start each active agent ─────────────────────────────────────────
python -c "
import yaml
from pathlib import Path

agents_dir = Path('$REPO_ROOT/agents')
for d in sorted(agents_dir.iterdir()):
    meta_file = d / 'metadata.yaml'
    if not meta_file.exists(): continue
    meta = yaml.safe_load(meta_file.read_text())
    if meta.get('status') in ('template', 'stub'): continue
    print(f\"{d.name}|{meta['name']}|{meta['api_port']}|{meta['frontend_port']}\")
" | while IFS='|' read -r agent_dir name api_port frontend_port; do
  log_file="$REPO_ROOT/agents/$agent_dir/logs/${agent_dir}.log"
  mkdir -p "$REPO_ROOT/agents/$agent_dir/logs"
  start_service "agent-$agent_dir" "$log_file" \
    python "agents/$agent_dir/main.py"
  echo "    $name  API: http://localhost:$api_port  Frontend: http://localhost:$frontend_port"
done

echo ""
echo "  Platform:  http://localhost:$PLATFORM_FRONTEND_PORT"
echo "  Platform API:  http://localhost:$PLATFORM_BACKEND_PORT/api/health"
echo ""
echo "=== All services started. Run ./scripts/stop.sh to stop. ==="
echo ""
