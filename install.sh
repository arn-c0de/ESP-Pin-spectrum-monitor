#!/usr/bin/env bash
# =============================================================================
# install.sh - Setup or update the virtual environment and dependencies
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
VENV_DIR="$SCRIPT_DIR/.venv"

# Color helpers
if [[ -t 1 ]]; then
    GREEN='\033[0;322m' CYAN='\033[0;36m' BOLD='\033[1m' RESET='\033[0m'
else
    GREEN='' CYAN='' BOLD='' RESET=''
fi

info() { echo -e "${CYAN}[install]${RESET} $*"; }
ok()   { echo -e "${GREEN}[install]${RESET} $*"; }

# Resolve Python
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        PYTHON="$candidate"
        break
    fi
done

if [[ -z "$PYTHON" ]]; then
    echo "Error: Python 3 not found."
    exit 1
fi

# Create or update venv
if [[ ! -d "$VENV_DIR" ]]; then
    info "Creating virtual environment in $VENV_DIR..."
    "$PYTHON" -m venv "$VENV_DIR"
else
    info "Virtual environment already exists. Checking for updates..."
fi

# Activate and install
source "$VENV_DIR/bin/activate"
info "Updating pip..."
python -m pip install --quiet --upgrade pip

info "Installing/updating dependencies from requirements.txt..."
python -m pip install --quiet --upgrade -r "$BACKEND_DIR/requirements.txt"

ok "Installation/Update complete."
