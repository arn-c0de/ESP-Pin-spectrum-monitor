# ESP Pin Spectrum Monitor

> **Note:** This repository is for private testing and evaluation purposes only.

A real-time GPIO monitoring and spectrum analysis tool for Arduino and ESP32 boards.

**Current Version: 1.0.1**

## Features

- **Real-time GPIO Monitoring**: Visualize analog and digital pin states in real-time
- **Spectrum Analysis**: FFT-based frequency analysis with configurable window sizes
- **Multi-board Support**: Works with Arduino Uno and ESP32 (more boards can be added)
- **Sample Rate Control**: Adjustable sampling rate from 1Hz to 500Hz
- **Digital/Analog Toggle**: Filter to show only digital pins or all channels
- **Web-based Interface**: Modern browser interface with responsive design

## Architecture

```
Arduino/ESP32 → Serial (115200 baud) → Python Bridge → WebSocket → Browser
```

## Quick Start

### 1. Flash the Firmware

```bash
# For Arduino Uno
./flash.sh --board arduino-uno --port /dev/ttyUSB0

# For ESP32
./flash.sh --board esp32 --port /dev/ttyUSB0
```

### 2. Start the Bridge Server

```bash
./start-server.sh
```

This will:
- Auto-detect your serial port
- Install required Python dependencies (pyserial, websockets)
- Start the WebSocket server on port 8765
- Serve the web interface on http://localhost:8080
- Open your browser automatically

### 3. Use the Web Interface

- **Board Selection**: Choose your connected board from the dropdown
- **Sample Rate**: Adjust using slider, preset dropdown, or manual input
- **Time Window**: Control the visible time span (1-30 seconds)
- **Digital Only Toggle**: Show only digital pins or all channels
- **Spectrum Analyzer**: Select channel, FFT size, and dB/linear scale
- **Stream Control**: Pause/resume data streaming

## Protocol

The firmware communicates using a simple CSV-based protocol:

### Firmware → Host
- `CHANNELS:t,A0,A1,...` - Channel header (sent on boot and HEADER command)
- `millis,val1,val2,...` - Sample data (one line per sample)
- `OK:<CMD>` - Command acknowledgment

### Host → Firmware
- `RATE <ms>` - Set sample interval in milliseconds (1-5000)
- `START` - Resume streaming
- `STOP` - Pause streaming
- `HEADER` - Request channel header
- `PIN+ <name>` - Enable a channel
- `PIN- <name>` - Disable a channel

## Project Structure

```
.
├── backend/              # Python bridge server
│   ├── bridge.py         # Main entry point
│   ├── serial_handler.py  # Serial port management
│   └── ws_server.py      # WebSocket + HTTP server
├── firmware/             # Microcontroller firmware
│   ├── arduino-uno/      # Arduino Uno (C++)
│   └── esp32/            # ESP32 (Rust)
├── frontend/             # Web interface
│   ├── app.js            # Main application
│   ├── boards.js         # Board profiles
│   ├── charts.js         # Chart rendering
│   ├── fft.js            # FFT implementation
│   ├── ui.js             # UI components
│   └── index.html        # HTML entry point
├── flash.sh              # Firmware flashing script
└── start-server.sh       # Server startup script
```

## Adding New Boards

To add support for a new board:

1. **Create firmware** that implements the CSV protocol
2. **Add board profile** in `frontend/boards.js`:
   ```javascript
   "my-board": {
       id: "my-board",
       label: "My Board",
       adcMax: 4095,        // ADC resolution
       defaultSampleRate: 50,
       pins: [
           { name: "A0", analog: true, defaultEnabled: true },
           // ... more pins
       ],
   }
   ```
3. **Update flash script** in `flash.sh` with your board's flashing procedure

## Technical Details

### Backend
- **Python 3.7+** required
- Uses **asyncio** for concurrent WebSocket and serial handling
- Auto-detects Arduino/ESP devices by USB descriptor keywords
- Broadcasts real-time data to all connected WebSocket clients

### Frontend
- **Vanilla JavaScript** (no framework dependencies)
- **Canvas-based rendering** for high-performance charts
- **Radix-2 FFT** implementation for spectrum analysis
- **Responsive design** with dark theme

### Firmware
- **Arduino Uno**: C++ with Arduino framework
- **ESP32**: Rust (planned)
- Non-blocking serial command parser
- Configurable sample rate and channel enable/disable

## Requirements

### Software
- Python 3.7+
- pip packages: `pyserial`, `websockets`
- For Arduino: `arduino-cli`
- For ESP32: Rust + `espflash`

### Hardware
- Arduino Uno or compatible board
- ESP32 development board (optional)
- USB cable for programming and data

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please open issues or pull requests for:
- Bug fixes
- New board support
- Feature enhancements
- Documentation improvements

## Troubleshooting

### No serial port detected
- Check USB cable connection
- Try `./flash.sh --list-ports` to see available ports
- Manually specify port: `./start-server.sh /dev/ttyUSB0`

### Browser won't connect
- Check if ports 8080 and 8765 are available
- Try a different browser
- Check browser console for WebSocket errors

### Firmware upload fails
- Ensure correct board is selected in flash script
- Check Arduino IDE board support is installed
- Try pressing reset button during upload

