#!/usr/bin/env bash
# run.sh — Start AI Lab: the launcher (:5000) + the AI Agents Squad (demo0).
# All service output streams to this terminal. Press Ctrl+C to stop everything.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT_PY="$(cygpath -w "$REPO_ROOT" 2>/dev/null || echo "$REPO_ROOT")"
DEMO0_DIR="$REPO_ROOT/demos/demo0"
DEMO0_DIR_PY="$(cygpath -w "$DEMO0_DIR" 2>/dev/null || echo "$DEMO0_DIR")"
PID_DIR="$REPO_ROOT/scripts/pids"

mkdir -p "$PID_DIR"

CHILD_PIDS=()

cleanup() {
  echo ""
  echo "=== AI Lab — Shutting down ==="
  for pid in "${CHILD_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
    taskkill //PID "$pid" //T //F 2>/dev/null || true
  done
  wait 2>/dev/null || true
  bash "$REPO_ROOT/scripts/stop.sh"
}
trap cleanup EXIT INT TERM

# ── Load demo0 .env (secrets only) ───────────────────────────────────────────
if [[ -f "$DEMO0_DIR/.env" ]]; then
  set -o allexport
  source "$DEMO0_DIR/.env"
  set +o allexport
else
  echo "  [warn] No demos/demo0/.env file — using defaults from config.yaml"
fi

# ── Python virtualenv: reuse, else create; then activate ─────────────────────
VENV_DIR=""
for candidate in "$REPO_ROOT/.venv" "$REPO_ROOT/venv"; do
  if [[ -d "$candidate" ]]; then VENV_DIR="$candidate"; break; fi
done
if [[ -z "$VENV_DIR" ]]; then
  echo "  No virtualenv found — creating .venv ..."
  python -m venv "$REPO_ROOT/.venv"
  VENV_DIR="$REPO_ROOT/.venv"
fi

if [[ -f "$VENV_DIR/Scripts/activate" ]]; then
  source "$VENV_DIR/Scripts/activate"      # Windows
elif [[ -f "$VENV_DIR/bin/activate" ]]; then
  source "$VENV_DIR/bin/activate"          # POSIX
fi

# ── Install Python deps if not already satisfied ─────────────────────────────
if ! python -c "import fastapi, uvicorn, yaml" 2>/dev/null; then
  echo "  Installing Python dependencies (requirements.txt) ..."
  python -m pip install -q --upgrade pip
  python -m pip install -q -r "$REPO_ROOT/requirements.txt"
fi

cd "$REPO_ROOT"

# ── Read ports ────────────────────────────────────────────────────────────────
LAUNCHER_PORT=$(python -c "import yaml; print(yaml.safe_load(open(r'$REPO_ROOT_PY/config.yaml'))['launcher_port'])")

read_demo0() {
  python -c "
import yaml
c = yaml.safe_load(open(r'$DEMO0_DIR_PY/config.yaml'))
print(c$1)
"
}
SQUAD_BACKEND_PORT=$(read_demo0 "['ports']['platform_backend']")
SQUAD_FRONTEND_PORT=$(read_demo0 "['ports']['platform_frontend']")

# ── Generate the launcher's demos.json from the root config.yaml ──────────────
python -c "
import yaml, json
from pathlib import Path
c = yaml.safe_load(open(r'$REPO_ROOT_PY/config.yaml'))
manifest = {'appName': c['app']['name'], 'tagline': c['app'].get('description', ''), 'demos': c['demos']}
out = Path(r'$REPO_ROOT_PY') / 'frontend' / 'public'
out.mkdir(parents=True, exist_ok=True)
json.dump(manifest, open(out / 'demos.json', 'w'), indent=2)
"

# ── Port conflict check (agents live in demos/demo0/agents) ───────────────────
python -c "
import sys, yaml
from pathlib import Path

agents_dir = Path(r'$DEMO0_DIR_PY/agents')
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
echo "=== AI Lab — Starting platform ==="
echo ""

# ── AI Lab launcher (:LAUNCHER_PORT) ──────────────────────────────────────────
if [[ -f "$REPO_ROOT/frontend/package.json" ]]; then
  if [[ ! -d "$REPO_ROOT/frontend/node_modules" ]]; then
    echo "  Installing AI Lab launcher dependencies ..."
    (cd "$REPO_ROOT/frontend" && npm install)
  fi
  start_service "ai-lab-launcher" \
    sh -c "cd '$REPO_ROOT/frontend' && npm run dev -- --port $LAUNCHER_PORT"
fi

echo ""
echo "=== AI Agents Squad (demo0) ==="
echo ""

# ── Squad backend (:SQUAD_BACKEND_PORT) — runs with cwd = demos/demo0 ─────────
start_service "squad-api" \
  sh -c "cd '$DEMO0_DIR' && exec python -m uvicorn app.main:app --host 0.0.0.0 --port $SQUAD_BACKEND_PORT"

# ── Squad marketplace frontend (:SQUAD_FRONTEND_PORT) ─────────────────────────
if [[ -f "$DEMO0_DIR/frontend/package.json" ]]; then
  if [[ ! -d "$DEMO0_DIR/frontend/node_modules" ]]; then
    echo "  Installing marketplace dependencies ..."
    (cd "$DEMO0_DIR/frontend" && npm install)
  fi
  start_service "squad-frontend" \
    sh -c "cd '$DEMO0_DIR/frontend' && npm run dev -- --port $SQUAD_FRONTEND_PORT"
fi

echo ""
echo "=== Starting agents ==="
echo ""

# ── Scan agents — here-string avoids a subshell so CHILD_PIDS stays in scope ──
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
")

while IFS='|' read -r agent_dir name api_port frontend_port; do
  [[ -z "$agent_dir" ]] && continue
  start_service "agent-$agent_dir" \
    sh -c "cd '$DEMO0_DIR' && exec python agents/$agent_dir/main.py"
  echo "    $name  API: http://localhost:$api_port  Frontend: http://localhost:$frontend_port"
done <<< "$AGENT_LIST"

echo ""
echo "  AI Lab:          http://localhost:$LAUNCHER_PORT"
echo "  AI Agents Squad: http://localhost:$SQUAD_FRONTEND_PORT"
echo "  Squad API:       http://localhost:$SQUAD_BACKEND_PORT/api/health"
echo ""
echo "=== All services running — press Ctrl+C to stop ==="
echo ""

wait
