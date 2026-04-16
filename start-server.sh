#!/usr/bin/env bash
# =============================================================================
# start-server.sh — Start the GPIO Monitor backend bridge
#
# Usage:
#   ./start-server.sh                   # auto-detect serial port
#   ./start-server.sh /dev/ttyUSB0      # explicit port
#   ./start-server.sh --help
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

# ── Colour helpers ────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m'
    CYAN='\033[0;36m' BOLD='\033[1m'    RESET='\033[0m'
else
    RED='' GREEN='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

info() { echo -e "${CYAN}[server]${RESET} $*"; }
ok()   { echo -e "${GREEN}[server]${RESET} $*"; }
warn() { echo -e "${YELLOW}[server]${RESET} $*"; }
die()  { echo -e "${RED}[server] ERROR:${RESET} $*" >&2; exit 1; }

# ── Help ──────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

# ── Resolve Python interpreter ────────────────────────────────────────────────
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        PYTHON="$candidate"
        break
    fi
done
[[ -n "$PYTHON" ]] || die "Python 3 not found. Install it and try again."

PY_VERSION=$("$PYTHON" -c "import sys; print(sys.version_info.major)")
[[ "$PY_VERSION" -ge 3 ]] || die "Python 3 required (found: $("$PYTHON" --version))"

# ── Check / activate virtual environment ──────────────────────────────────────
VENV_DIR="$SCRIPT_DIR/.venv"

if [[ ! -d "$VENV_DIR" ]]; then
    warn "Virtual environment not found. Running install.sh first..."
    ./install.sh
fi

source "$VENV_DIR/bin/activate" || die "Failed to activate virtual environment."
PYTHON="python"

info "Python : $(python --version)"

# ── Optional port argument ────────────────────────────────────────────────────
PORT_ARG="${1:-}"

# ── Launch ────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}GPIO Monitor${RESET}"
info "Frontend : http://localhost:8080"
info "WebSocket: ws://localhost:8765"
[[ -n "$PORT_ARG" ]] && info "Port     : $PORT_ARG"
echo

cd "$BACKEND_DIR"
exec "$PYTHON" bridge.py "${PORT_ARG:-}"
