#!/usr/bin/env bash
# run.sh — Start the Neural platform and all active agents.
# All service output streams to this terminal. Press Ctrl+C to stop everything.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT_PY="$(cygpath -w "$REPO_ROOT" 2>/dev/null || echo "$REPO_ROOT")"
PID_DIR="$REPO_ROOT/scripts/pids"

mkdir -p "$PID_DIR"

CHILD_PIDS=()

cleanup() {
  echo ""
  echo "=== Neural — Shutting down ==="
  for pid in "${CHILD_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
    taskkill //PID "$pid" //F 2>/dev/null || true
  done
  wait 2>/dev/null || true
  bash "$REPO_ROOT/scripts/stop.sh"
}
trap cleanup EXIT INT TERM

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

cd "$REPO_ROOT"

# ── Read config.yaml via Python ───────────────────────────────────────────────
read_config() {
  python -c "
import yaml, sys
c = yaml.safe_load(open(r'$REPO_ROOT_PY/config.yaml'))
print(c$1)
"
}

PLATFORM_BACKEND_PORT=$(read_config "['ports']['platform_backend']")
PLATFORM_FRONTEND_PORT=$(read_config "['ports']['platform_frontend']")

# ── Port conflict check ───────────────────────────────────────────────────────
python -c "
import sys, yaml
from pathlib import Path

agents_dir = Path(r'$REPO_ROOT_PY/agents')
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

# ── Helper: start a service, write real PID, stream output to terminal ────────
start_service() {
  local name="$1"
  shift
  local pid_file="$PID_DIR/${name}.pid"

  (
    echo $BASHPID > "$pid_file"
    exec "$@"
  ) 2>&1 | sed -u "s/^/[$name] /" &

  # Wait up to 2s for the subshell to write its PID before exec
  local i=0
  while [[ ! -s "$pid_file" ]] && (( i++ < 20 )); do sleep 0.1; done

  local actual_pid
  actual_pid=$(cat "$pid_file" 2>/dev/null || echo "")
  [[ -n "$actual_pid" ]] && CHILD_PIDS+=("$actual_pid")
  echo "  started $name (PID ${actual_pid:-unknown})"
}

echo ""
echo "=== Neural — Starting platform ==="
echo ""

# ── Platform backend (:5001) ─────────────────────────────────────────────────
start_service "platform-api" \
  python -m uvicorn app.main:app --host 0.0.0.0 --port "$PLATFORM_BACKEND_PORT"

# ── Platform frontend (:5000) ────────────────────────────────────────────────
if [[ -f "$REPO_ROOT/frontend/package.json" ]]; then
  if [[ ! -d "$REPO_ROOT/frontend/node_modules" ]]; then
    echo "  Installing platform frontend dependencies ..."
    (cd "$REPO_ROOT/frontend" && npm install)
  fi
  start_service "platform-frontend" \
    sh -c "cd '$REPO_ROOT/frontend' && npm run dev -- --port $PLATFORM_FRONTEND_PORT"
fi

echo ""
echo "=== Starting agents ==="
echo ""

# ── Scan agents — here-string avoids a subshell so CHILD_PIDS stays in scope ──
AGENT_LIST=$(python -c "
import yaml
from pathlib import Path

agents_dir = Path(r'$REPO_ROOT_PY/agents')
for d in sorted(agents_dir.iterdir()):
    meta_file = d / 'metadata.yaml'
    if not meta_file.exists(): continue
    meta = yaml.safe_load(meta_file.read_text())
    if meta.get('status') in ('template', 'stub'): continue
    print(f\"{d.name}|{meta['name']}|{meta['api_port']}|{meta['frontend_port']}\")
")

while IFS='|' read -r agent_dir name api_port frontend_port; do
  [[ -z "$agent_dir" ]] && continue
  start_service "agent-$agent_dir" python "agents/$agent_dir/main.py"
  echo "    $name  API: http://localhost:$api_port  Frontend: http://localhost:$frontend_port"
done <<< "$AGENT_LIST"

echo ""
echo "  Platform:  http://localhost:$PLATFORM_FRONTEND_PORT"
echo "  Platform API:  http://localhost:$PLATFORM_BACKEND_PORT/api/health"
echo ""
echo "=== All services running — press Ctrl+C to stop ==="
echo ""

wait
