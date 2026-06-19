#!/usr/bin/env bash
# check.sh — Report the status of all AI Lab services.
# Dynamically reads config.yaml, demos/demo0/config.yaml and demos/demo0/agents/*/metadata.yaml.
# All service checks run in parallel; output is collected and printed in a stable order.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT_PY="$(cygpath -w "$REPO_ROOT" 2>/dev/null || echo "$REPO_ROOT")"
DEMO0_DIR="$REPO_ROOT/demos/demo0"
DEMO0_DIR_PY="$(cygpath -w "$DEMO0_DIR" 2>/dev/null || echo "$DEMO0_DIR")"
PID_DIR="$REPO_ROOT/scripts/pids"

GRN='\033[0;32m'; RED='\033[0;31m'; YLW='\033[1;33m'; CYN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

port_open() { (2>/dev/null >/dev/tcp/localhost/"$1") && return 0 || return 1; }
http_ping()  { curl -sf --max-time 2 "$1" 2>/dev/null; }

# Each parallel check writes its formatted block to "$WORK_DIR/<idx>.out" and,
# on any failure, touches "$WORK_DIR/<idx>.fail". Printing/aggregation happens
# after all checks complete, so the output stays ordered and deterministic.
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

check_service() {
  local idx="$1" label="$2" pid_name="$3" port="$4" ping_url="${5:-}"
  local pid_file="$PID_DIR/${pid_name}.pid"
  local out="$WORK_DIR/${idx}.out"
  local ok=true

  {
    echo -e "  ${BOLD}${label}${NC}"
    if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      echo -e "    Process : ${GRN}UP${NC} (PID $(cat "$pid_file"))"
    else
      echo -e "    Process : ${RED}DOWN${NC}"
      ok=false
    fi
    if port_open "$port"; then
      echo -e "    Port    : ${GRN}OPEN${NC}   :${CYN}${port}${NC}"
    else
      echo -e "    Port    : ${RED}CLOSED${NC} :${CYN}${port}${NC}"
      ok=false
    fi
    if [[ -n "$ping_url" ]]; then
      if http_ping "$ping_url" > /dev/null; then
        echo -e "    HTTP    : ${GRN}OK${NC}     $ping_url"
      else
        echo -e "    HTTP    : ${RED}FAIL${NC}   $ping_url"
        ok=false
      fi
    fi
    echo ""
  } > "$out"

  [[ "$ok" == true ]] || touch "$WORK_DIR/${idx}.fail"
}

echo ""
echo "=== AI Lab — Service Status =============================================="
echo ""

# ── Resolve ports ─────────────────────────────────────────────────────────────
LAUNCHER_PORT=$(python -c "import yaml; print(yaml.safe_load(open(r'$REPO_ROOT_PY/config.yaml'))['launcher_port'])" 2>/dev/null || echo "5000")
SQUAD_BACKEND_PORT=$(python -c "import yaml; print(yaml.safe_load(open(r'$DEMO0_DIR_PY/config.yaml'))['ports']['platform_backend'])" 2>/dev/null || echo "8002")
SQUAD_FRONTEND_PORT=$(python -c "import yaml; print(yaml.safe_load(open(r'$DEMO0_DIR_PY/config.yaml'))['ports']['platform_frontend'])" 2>/dev/null || echo "8001")

# ── Build the full list of service checks ─────────────────────────────────────
SPECS=()
SPECS+=("AI Lab Launcher   (:${LAUNCHER_PORT})|ai-lab-launcher|${LAUNCHER_PORT}|")
SPECS+=("Squad API         (:${SQUAD_BACKEND_PORT})|squad-api|${SQUAD_BACKEND_PORT}|http://localhost:${SQUAD_BACKEND_PORT}/api/health")
SPECS+=("Squad Marketplace (:${SQUAD_FRONTEND_PORT})|squad-frontend|${SQUAD_FRONTEND_PORT}|")

AGENT_LIST=$(python -c "
import yaml
from pathlib import Path

for d in sorted(Path(r'$DEMO0_DIR_PY/agents').iterdir()):
    meta_file = d / 'metadata.yaml'
    if not meta_file.exists(): continue
    meta = yaml.safe_load(meta_file.read_text())
    if meta.get('status') in ('template', 'stub'): continue
    print(f\"{meta['name']}|agent-{d.name}|{meta['api_port']}|{meta['frontend_port']}\")
")

while IFS='|' read -r name pid_name api_port frontend_port; do
  [[ -z "$name" ]] && continue
  SPECS+=("$name API         (:${api_port})|${pid_name}|${api_port}|http://localhost:${api_port}/ping")
  SPECS+=("$name Frontend    (:${frontend_port})|${pid_name}|${frontend_port}|")
done <<< "$AGENT_LIST"

# ── Run every check in parallel ───────────────────────────────────────────────
idx=0
for spec in "${SPECS[@]}"; do
  IFS='|' read -r label pid_name port ping_url <<< "$spec"
  check_service "$(printf '%04d' "$idx")" "$label" "$pid_name" "$port" "$ping_url" &
  ((idx++))
done
wait

# ── Print collected output in stable (launch) order ───────────────────────────
for out in "$WORK_DIR"/*.out; do
  [[ -f "$out" ]] && cat "$out"
done

# ── Overall health: any *.fail marker means a check failed ────────────────────
ALL_OK=true
shopt -s nullglob
fail_markers=("$WORK_DIR"/*.fail)
(( ${#fail_markers[@]} > 0 )) && ALL_OK=false

echo "=========================================================================="
if [[ "$ALL_OK" == true ]]; then
  echo -e "  ${GRN}${BOLD}All services healthy.${NC}"
else
  echo -e "  ${RED}${BOLD}One or more services are down.${NC}  Run ./scripts/run.sh to start."
fi
echo ""
