#!/usr/bin/env bash
# check.sh — Report the status of all Neural services.
# Dynamically reads config.yaml and agents/*/metadata.yaml.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
echo "=== Neural — Service Status =============================================="
echo ""

# ── Platform ─────────────────────────────────────────────────────────────────
BACKEND_PORT=$(python -c "import yaml; c=yaml.safe_load(open('$REPO_ROOT/config.yaml')); print(c['ports']['platform_backend'])" 2>/dev/null || echo "5001")
FRONTEND_PORT=$(python -c "import yaml; c=yaml.safe_load(open('$REPO_ROOT/config.yaml')); print(c['ports']['platform_frontend'])" 2>/dev/null || echo "5000")

check_service "Platform API      (:${BACKEND_PORT})"  "platform-api"      "$BACKEND_PORT"  "http://localhost:${BACKEND_PORT}/api/health"
check_service "Platform Frontend (:${FRONTEND_PORT})" "platform-frontend" "$FRONTEND_PORT"

# ── Agents ────────────────────────────────────────────────────────────────────
python -c "
import yaml
from pathlib import Path

for d in sorted(Path('$REPO_ROOT/agents').iterdir()):
    meta_file = d / 'metadata.yaml'
    if not meta_file.exists(): continue
    meta = yaml.safe_load(meta_file.read_text())
    if meta.get('status') in ('template',): continue
    print(f\"{meta['name']}|agent-{d.name}|{meta['api_port']}|{meta['frontend_port']}\")
" | while IFS='|' read -r name pid_name api_port frontend_port; do
  check_service "$name API         (:${api_port})"      "$pid_name" "$api_port"      "http://localhost:${api_port}/ping"
  check_service "$name Frontend    (:${frontend_port})" "$pid_name" "$frontend_port"
done

echo "=========================================================================="
if [[ "$ALL_OK" == true ]]; then
  echo -e "  ${GRN}${BOLD}All services healthy.${NC}"
else
  echo -e "  ${RED}${BOLD}One or more services are down.${NC}  Run ./scripts/start.sh to start."
fi
echo ""
