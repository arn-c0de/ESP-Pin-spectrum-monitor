"""
serial_handler.py — Serial port management
Runs in a background thread; pushes parsed messages to an asyncio Queue.
Accepts command strings to write back to the device.
"""
from __future__ import annotations

import asyncio
import json
import threading
from typing import Optional

import serial
import serial.tools.list_ports

BAUD_RATE = 115_200

# USB-serial chip IDs commonly found on Arduino Unos and ESP boards
_KNOWN_DESCRIPTORS = [
    "arduino", "ch340", "ch341", "cp210", "ftdi",
    "usb serial", "usb-serial", "2341:0043", "2341:0001",
]


def list_ports() -> list[str]:
    return [p.device for p in serial.tools.list_ports.comports()]


def auto_detect_port() -> Optional[str]:
    for p in serial.tools.list_ports.comports():
        combined = (
            (p.description or "") + " " +
            (p.manufacturer or "") + " " +
            (p.hwid or "")
        ).lower()
        if any(kw in combined for kw in _KNOWN_DESCRIPTORS):
            return p.device
    return None


class SerialHandler:
    """
    Spawns a reader thread that:
      1. Opens the serial port.
      2. Parses each line (CHANNELS header, CSV data, OK:* acks).
      3. Pushes JSON-serialised dicts onto ``queue``.

    Call ``send_command(str)`` from any thread to write to the device.
    """

    def __init__(self, port: Optional[str] = None) -> None:
        self.port = port
        self.channels: list[str] = ["t"]
        self._queue: Optional[asyncio.Queue] = None
        self._loop:  Optional[asyncio.AbstractEventLoop] = None
        self._ser:   Optional[serial.Serial] = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    # ── Public API ─────────────────────────────────────────────────────────────

    def start(
        self,
        queue: asyncio.Queue,
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        self._queue = queue
        self._loop  = loop

        if not self.port:
            self.port = auto_detect_port()
        if not self.port:
            available = list_ports()
            raise RuntimeError(
                "No Arduino/ESP device found automatically.\n"
                f"Available ports: {available or ['none']}\n"
                "Pass the port as a command-line argument: python bridge.py /dev/ttyUSB0"
            )

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name="serial-reader")
        self._thread.start()

    def send_command(self, cmd: str) -> None:
        """Write a newline-terminated command to the device (thread-safe)."""
        if self._ser and self._ser.is_open:
            try:
                self._ser.write((cmd.strip() + "\n").encode())
            except serial.SerialException:
                pass

    # ── Internal ───────────────────────────────────────────────────────────────

    def _push(self, msg: dict) -> None:
        """Thread-safe push onto the asyncio queue."""
        asyncio.run_coroutine_threadsafe(
            self._queue.put(json.dumps(msg)),
            self._loop,
        )

    def _run(self) -> None:
        try:
            self._ser = serial.Serial(self.port, BAUD_RATE, timeout=1)
            print(f"[serial] Connected: {self.port} @ {BAUD_RATE}")
            self._push({"type": "connected", "port": self.port})

            while not self._stop_event.is_set():
                raw = self._ser.readline()
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="replace").strip()
                if line:
                    self._handle_line(line)

        except serial.SerialException as exc:
            print(f"[serial] Error: {exc}")
            self._push({"type": "error", "msg": str(exc)})
        finally:
            if self._ser:
                self._ser.close()
            self._push({"type": "disconnected"})

    def _handle_line(self, line: str) -> None:
        if line.startswith("CHANNELS:"):
            self.channels = line[9:].split(",")
            self._push({"type": "channels", "channels": self.channels})

        elif line.startswith("OK:"):
            self._push({"type": "ack", "msg": line})

        else:
            # Expected: CSV data matching current channel list
            parts = line.split(",")
            if len(parts) != len(self.channels):
                return
            try:
                vals = [int(p) for p in parts]
                self._push({
                    "type": "data",
                    "d": dict(zip(self.channels, vals)),
                })
            except ValueError:
                pass
