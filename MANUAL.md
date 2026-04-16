# ESP Pin Spectrum Monitor - User Manual

## Safety Warning: Voltage Limits

Before connecting any signals to your microcontroller, ensure you stay within the safe operating voltage limits. Exceeding these limits will cause permanent damage to your board.

| Board | Logic Level (Max Voltage) | ADC Resolution |
|:---|:---|:---|
| **Arduino Uno** | **5.0V** | 10-bit (0-1023) |
| **ESP32** | **3.3V** | 12-bit (0-4095) |

**Important Rules:**
- Never connect more than 5V to an Arduino Uno pin.
- Never connect more than 3.3V to an ESP32 pin.
- If your signal is higher than these limits, you must use a voltage divider or level shifter.
- Ensure common ground (GND) is connected between the signal source and the microcontroller.

---

## Quick Start Guide

### 1. Flash the Firmware
Connect your board via USB and run the flash script:

```bash
# For Arduino Uno (example on Linux/macOS)
./flash.sh --board arduino-uno --port /dev/ttyUSB0

# For ESP32 (example on Linux/macOS)
./flash.sh --board esp32 --port /dev/ttyUSB0
```

*Note: Use ./flash.sh --list-ports to find your serial port.*

### 2. Start the Server
Run the startup script to install dependencies and start the interface:

```bash
./start-server.sh
```

The browser will open automatically at http://localhost:8080.

---

## Using the Interface

### Time Domain (Oscilloscope)
- **Visualization**: Shows real-time voltage/logic levels over time.
- **Time Window**: Adjust the slider (1s - 30s) to control how much history is visible.
- **Channel Legend**: Click the colored badges at the top to enable/disable specific pins.

### Spectrum Analyzer (FFT)
- **Visualization**: Shows frequency components of the signal.
- **FFT Size**: Higher values (e.g., 1024) provide better frequency resolution but require more samples.
- **dBFS Toggle**: Switch between linear scale and logarithmic (Decibels) view.

### Controls
- **Sample Rate**: Adjust the speed of data collection (1Hz to 500Hz). 
  - *Tip: According to Nyquist theory, to see a frequency of 50Hz, you need a sample rate of at least 100Hz.*
- **Digital Only**: A filter to hide analog channels and focus on logic signals.
- **Pause/Resume**: Stop the data stream to inspect a specific waveform.

---

## Troubleshooting

- **No Data**: Ensure the correct board is selected in the dropdown menu and the port is connected.
- **Lagging UI**: If the interface feels slow, reduce the sample rate or decrease the FFT size.
- **Waiting for Port**: Check if another program (like Arduino IDE Serial Monitor) is using the port. Only one program can access the serial port at a time.

---

## Protocol Description

The system uses a simple CSV protocol over Serial (115200 baud):
- **Firmware to Host**: millis,val1,val2,... (e.g., 5420,512,1023,0)
- **Host to Firmware**: Commands like RATE 20, START, STOP.
