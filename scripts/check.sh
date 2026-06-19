#!/usr/bin/env bash
# check.sh — Report the status of all AI Lab services.
# Dynamically reads config.yaml, demos/demo0/config.yaml and demos/demo0/agents/*/metadata.yaml.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO0_DIR="$REPO_ROOT/demos/demo0"
PID_DIR="$REPO_ROOT/scripts/pids"

GRN='\033[0;32m'; RED='\033[0;31m'; YLW='\033[1;33m'; CYN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

port_open() { (2>/dev/null >/dev/tcp/localhost/"$1") && return 0 || return 1; }
http_ping()  { curl -sf --max-time 2 "$1" 2>/dev/null; }

ALL_OK=true

check_service() {
  local label="$1" pid_name="$2" port="$3" ping_url="${4:-}"
  local pid_file="$PID_DIR/${pid_name}.pid"
  echo -e "  ${BOLD}${label}${NC}"
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo -e "    Process : ${GRN}UP${NC} (PID $(cat "$pid_file"))"
  else
    echo -e "    Process : ${RED}DOWN${NC}"
    ALL_OK=false
  fi
  if port_open "$port"; then
    echo -e "    Port    : ${GRN}OPEN${NC}   :${CYN}${port}${NC}"
  else
    echo -e "    Port    : ${RED}CLOSED${NC} :${CYN}${port}${NC}"
    ALL_OK=false
  fi
  if [[ -n "$ping_url" ]]; then
    if http_ping "$ping_url" > /dev/null; then
      echo -e "    HTTP    : ${GRN}OK${NC}     $ping_url"
    else
      echo -e "    HTTP    : ${RED}FAIL${NC}   $ping_url"
      ALL_OK=false
    fi
  fi
  echo ""
}

echo ""
echo "=== AI Lab — Service Status =============================================="
echo ""

# ── AI Lab launcher ───────────────────────────────────────────────────────────
LAUNCHER_PORT=$(python -c "import yaml; print(yaml.safe_load(open('$REPO_ROOT/config.yaml'))['launcher_port'])" 2>/dev/null || echo "5000")
check_service "AI Lab Launcher   (:${LAUNCHER_PORT})" "ai-lab-launcher" "$LAUNCHER_PORT"

# ── AI Agents Squad (demo0) ────────────────────────────────────────────────────
SQUAD_BACKEND_PORT=$(python -c "import yaml; print(yaml.safe_load(open('$DEMO0_DIR/config.yaml'))['ports']['platform_backend'])" 2>/dev/null || echo "8002")
SQUAD_FRONTEND_PORT=$(python -c "import yaml; print(yaml.safe_load(open('$DEMO0_DIR/config.yaml'))['ports']['platform_frontend'])" 2>/dev/null || echo "8001")

check_service "Squad API         (:${SQUAD_BACKEND_PORT})"  "squad-api"      "$SQUAD_BACKEND_PORT"  "http://localhost:${SQUAD_BACKEND_PORT}/api/health"
check_service "Squad Marketplace (:${SQUAD_FRONTEND_PORT})" "squad-frontend" "$SQUAD_FRONTEND_PORT"

# ── Agents ────────────────────────────────────────────────────────────────────
python -c "
import yaml
from pathlib import Path

for d in sorted(Path('$DEMO0_DIR/agents').iterdir()):
    meta_file = d / 'metadata.yaml'
    if not meta_file.exists(): continue
    meta = yaml.safe_load(meta_file.read_text())
    if meta.get('status') in ('template', 'stub'): continue
    print(f\"{meta['name']}|agent-{d.name}|{meta['api_port']}|{meta['frontend_port']}\")
" | while IFS='|' read -r name pid_name api_port frontend_port; do
  check_service "$name API         (:${api_port})"      "$pid_name" "$api_port"      "http://localhost:${api_port}/ping"
  check_service "$name Frontend    (:${frontend_port})" "$pid_name" "$frontend_port"
done

echo "=========================================================================="
if [[ "$ALL_OK" == true ]]; then
  echo -e "  ${GRN}${BOLD}All services healthy.${NC}"
else
  echo -e "  ${RED}${BOLD}One or more services are down.${NC}  Run ./scripts/run.sh to start."
fi
echo ""
