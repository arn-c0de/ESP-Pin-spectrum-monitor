#!/usr/bin/env bash
# =============================================================================
# flash.sh — Compile & flash firmware to the connected board
#
# Usage:
#   ./flash.sh                          # interactive board + port selection
#   ./flash.sh --board arduino-uno      # skip board selection
#   ./flash.sh --port /dev/ttyACM0      # explicit port
#   ./flash.sh --board esp32            # ESP32 (Rust, espflash)
#   ./flash.sh --list-ports             # show detected serial ports
#   ./flash.sh --help
#
# Required tools per board:
#   arduino-uno  →  arduino-cli    (https://arduino.github.io/arduino-cli/)
#   esp32        →  cargo + espflash  (cargo install espflash)
# =============================================================================
set -euo pipefail

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIRMWARE_DIR="$SCRIPT_DIR/firmware"

# ── Colour helpers ────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m'
    CYAN='\033[0;36m' BOLD='\033[1m'    RESET='\033[0m'
else
    RED='' GREEN='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

info()    { echo -e "${CYAN}[flash]${RESET} $*" >&2; }
ok()      { echo -e "${GREEN}[flash]${RESET} $*" >&2; }
warn()    { echo -e "${YELLOW}[flash]${RESET} $*" >&2; }
die()     { echo -e "${RED}[flash] ERROR:${RESET} $*" >&2; exit 1; }
heading() { echo -e "\n${BOLD}$*${RESET}" >&2; }

# ── Argument parsing ──────────────────────────────────────────────────────────
OPT_BOARD=""
OPT_PORT=""
OPT_LIST=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --board)       OPT_BOARD="$2"; shift 2 ;;
        --port)        OPT_PORT="$2";  shift 2 ;;
        --list-ports)  OPT_LIST=1;     shift   ;;
        --help|-h)
            sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) die "Unknown argument: $1  (try --help)" ;;
    esac
done

# ── Board profiles ────────────────────────────────────────────────────────────
# Each profile defines: SKETCH_DIR, FQBN (arduino-cli) or RUST_TARGET (espflash)
declare -A BOARD_SKETCH_DIR=(
    [arduino-uno]="$FIRMWARE_DIR/arduino-uno/gpio_monitor"
    [esp32]="$FIRMWARE_DIR/esp32"
)
declare -A BOARD_FQBN=(
    [arduino-uno]="arduino:avr:uno"
)
declare -A BOARD_RUST_TARGET=(
    [esp32]="xtensa-esp32-none-elf"
)
declare -A BOARD_LABEL=(
    [arduino-uno]="Arduino Uno"
    [esp32]="ESP32 (Rust)"
)

# ── List ports helper ─────────────────────────────────────────────────────────
list_serial_ports() {
    local ports=()
    # Linux — USB serial only (ttyS* are native UART hardware, not USB devices)
    for g in /dev/ttyUSB* /dev/ttyACM*; do
        [[ -e "$g" ]] && ports+=("$g")
    done
    # macOS — USB serial only
    for g in /dev/cu.usbserial* /dev/cu.usbmodem*; do
        [[ -e "$g" ]] && ports+=("$g")
    done
    printf '%s\n' "${ports[@]:-}"
}

if [[ $OPT_LIST -eq 1 ]]; then
    heading "Available serial ports:"
    mapfile -t PORTS < <(list_serial_ports)
    if [[ ${#PORTS[@]} -eq 0 ]]; then
        warn "No serial ports detected."
    else
        for p in "${PORTS[@]}"; do echo "  $p"; done
    fi
    exit 0
fi


if [[ -z "$OPT_BOARD" ]]; then
    heading "Select board:"
    BOARD_KEYS=("${!BOARD_LABEL[@]}")
    for i in "${!BOARD_KEYS[@]}"; do
        echo -e "  ${BOLD}$((i+1))${RESET}  ${BOARD_LABEL[${BOARD_KEYS[$i]}]}  ${CYAN}(${BOARD_KEYS[$i]})${RESET}" >&2
    done
    echo >&2
    while true; do
        read -rp "  Enter number [1-${#BOARD_KEYS[@]}]: " CHOICE
        if [[ "$CHOICE" =~ ^[0-9]+$ ]] && (( CHOICE >= 1 && CHOICE <= ${#BOARD_KEYS[@]} )); then
            OPT_BOARD="${BOARD_KEYS[$((CHOICE-1))]}"
            break
        fi
        warn "Invalid selection, try again."
    done
fi

# Validate board name
[[ -n "${BOARD_LABEL[$OPT_BOARD]+_}" ]] \
    || die "Unknown board: '$OPT_BOARD'. Available: ${!BOARD_LABEL[*]}"

SKETCH_DIR="${BOARD_SKETCH_DIR[$OPT_BOARD]}"
[[ -d "$SKETCH_DIR" ]] \
    || die "Firmware directory not found: $SKETCH_DIR"

heading "Board : ${BOARD_LABEL[$OPT_BOARD]}"
info "Sketch: $SKETCH_DIR"

# ── Auto-detect port ──────────────────────────────────────────────────────────
detect_port() {
    # Prefer arduino-cli detection (lists all connected boards)
    if command -v arduino-cli &>/dev/null; then
        local cli_ports
        mapfile -t cli_ports < <(
            arduino-cli board list --format text 2>/dev/null \
            | grep -v "^Port\|^No boards\|^$" \
            | awk '{print $1}' \
            | grep -v "^/dev/ttyS[0-9]" || true
        )
        if [[ ${#cli_ports[@]} -gt 0 ]]; then
            printf '%s\n' "${cli_ports[@]}"
            return
        fi
    fi
    # Fall back: scan common serial port paths
    list_serial_ports
}

if [[ -z "$OPT_PORT" ]]; then
    info "Detecting serial ports…"
    mapfile -t DETECTED_PORTS < <(detect_port; true)

    if [[ ${#DETECTED_PORTS[@]} -eq 1 && -n "${DETECTED_PORTS[0]}" ]]; then
        OPT_PORT="${DETECTED_PORTS[0]}"
        info "Port  : $OPT_PORT (auto)"
    elif [[ ${#DETECTED_PORTS[@]} -gt 1 ]]; then
        heading "Select port:"
        for i in "${!DETECTED_PORTS[@]}"; do
            echo -e "  ${BOLD}$((i+1))${RESET}  ${DETECTED_PORTS[$i]}" >&2
        done
        echo >&2
        while true; do
            read -rp "  Enter number [1-${#DETECTED_PORTS[@]}]: " CHOICE
            if [[ "$CHOICE" =~ ^[0-9]+$ ]] && (( CHOICE >= 1 && CHOICE <= ${#DETECTED_PORTS[@]} )); then
                OPT_PORT="${DETECTED_PORTS[$((CHOICE-1))]}"
                break
            fi
            warn "Invalid selection, try again."
        done
    else
        die "No serial port found. Connect the board or use --port /dev/ttyXXX"
    fi
fi

info "Port  : $OPT_PORT"

# ── Flash: Arduino Uno ────────────────────────────────────────────────────────
flash_arduino_uno() {
    command -v arduino-cli &>/dev/null \
        || die "'arduino-cli' not found.\n  Install: https://arduino.github.io/arduino-cli/latest/installation/"

    local fqbn="${BOARD_FQBN[$OPT_BOARD]}"

    # Ensure the Arduino AVR core is installed
    if ! arduino-cli core list 2>/dev/null | grep -q "arduino:avr"; then
        info "Installing Arduino AVR core…"
        arduino-cli core install arduino:avr
    fi

    heading "Compiling…"
    arduino-cli compile \
        --fqbn   "$fqbn" \
        --warnings default \
        "$SKETCH_DIR"

    heading "Uploading…"
    arduino-cli upload \
        --fqbn "$fqbn" \
        --port "$OPT_PORT" \
        "$SKETCH_DIR"
}

# ── Flash: ESP32 (Rust / espflash) ────────────────────────────────────────────
flash_esp32() {
    command -v cargo &>/dev/null \
        || die "'cargo' not found.\n  Install Rust: https://rustup.rs"
    command -v espflash &>/dev/null \
        || die "'espflash' not found.\n  Install: cargo install espflash"

    local target="${BOARD_RUST_TARGET[$OPT_BOARD]}"

    heading "Compiling (release)…"
    (cd "$SKETCH_DIR" && cargo build --release --target "$target")

    heading "Flashing…"
    espflash flash \
        --port  "$OPT_PORT" \
        --monitor \
        "$SKETCH_DIR/target/$target/release/gpio-monitor"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
case "$OPT_BOARD" in
    arduino-uno) flash_arduino_uno ;;
    esp32)       flash_esp32       ;;
    *)           die "No flash handler for board: $OPT_BOARD" ;;
esac

ok "Done. Device is running the new firmware on $OPT_PORT."
