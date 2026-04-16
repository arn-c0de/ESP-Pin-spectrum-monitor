# ESP Pin Spectrum Monitor

![Arduino](https://img.shields.io/badge/Arduino-00979D?style=for-the-badge&logo=arduino&logoColor=white)
![ESP32](https://img.shields.io/badge/ESP32-E7352C?style=for-the-badge&logo=espressif&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

> Note: This repository is for private testing and evaluation purposes.

A real-time GPIO monitoring and spectrum analysis tool for Arduino and ESP32 boards. This version includes significant performance optimizations and security hardening.

**Current Version: 1.0.1**

## Features

- **Real-time GPIO Monitoring**: Visualize analog and digital pin states in real-time.
- **Spectrum Analysis**: High-performance FFT-based frequency analysis with LUT optimizations.
- **Multi-board Support**: Native support for Arduino Uno and ESP32.
- **Detailed Instructions**: See the [**User Manual (MANUAL.md)**](./MANUAL.md) for safety limits and usage.
- **Security Hardened**: Protected against CSWH, shell injection, and command injection.
- **Optimized Performance**: Allocation-free rendering pipeline for smooth visualization.

## Architecture

```
Arduino/ESP32 -> Serial (115200 baud) -> Python Bridge -> WebSocket -> Browser
```

## Quick Start

### 1. Installation
The project uses a virtual environment to manage dependencies securely. Run the installation script once:

```bash
./install.sh
```
*Note: This will create a `.venv` directory and install all required Python packages.*

### 2. Flash the Firmware
Connect your board via USB and flash the monitoring firmware:

```bash
# For Arduino Uno
./flash.sh --board arduino-uno --port /dev/ttyUSB0

# For ESP32
./flash.sh --board esp32 --port /dev/ttyUSB0
```

### 3. Start the Bridge Server
Simply run the startup script. It will automatically activate the virtual environment:

```bash
./start-server.sh
```

This will:
- Auto-detect your serial port.
- Start the WebSocket server on port 8765 (Localhost only).
- Serve the web interface on http://localhost:8080.
- Open your browser automatically.

## Project Structure

```
.
├── install.sh            # Automated venv and dependency setup
├── start-server.sh       # Launch bridge and UI (uses venv)
├── flash.sh              # Firmware flashing script
├── MANUAL.md             # Voltage safety and usage guide
├── CHANGELOG.md          # Version history
├── findings-report.md    # Security and code review findings
├── backend/              # Python bridge server
│   ├── bridge.py         # Entry point
│   ├── serial_handler.py # Serial communication
│   ├── ws_server.py      # WebSocket + Secure HTTP server
│   └── requirements.txt  # Python dependencies
├── firmware/             # Microcontroller firmware
│   ├── arduino-uno/      # C++ source for Arduino
│   └── esp32/            # Rust source for ESP32
└── frontend/             # Web interface (Vanilla JS)
    ├── app.js            # Main logic and state
    ├── charts.js         # Optimized canvas rendering
    ├── fft.js            # FFT with LUT optimizations
    └── index.html        # UI structure
```

## Protocol

The firmware communicates using a simple CSV-based protocol:
- **Firmware -> Host**: `millis,val1,val2,...` (one line per sample)
- **Host -> Firmware**: Commands like `RATE <ms>`, `START`, `STOP`.

## Requirements

### Software
- Python 3.7+
- For Arduino: `arduino-cli`
- For ESP32: Rust + `espflash`

### Hardware
- Arduino Uno or compatible board.
- ESP32 development board.
- USB cable for programming and data.

## License

MIT License - see LICENSE file for details.
