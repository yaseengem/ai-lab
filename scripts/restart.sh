#!/usr/bin/env bash
# restart.sh — Restart all AI Lab services (stop then start)
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== AI Lab — Restarting services ==="
echo ""

bash "$SCRIPTS_DIR/stop.sh"
bash "$SCRIPTS_DIR/run.sh"
