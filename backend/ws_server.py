"""
ws_server.py — WebSocket + static HTTP server
WebSocket on port 8765 : real-time data ↔ browser
HTTP      on port 8080 : serves the frontend/ directory
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import TYPE_CHECKING

import websockets
import websockets.exceptions

if TYPE_CHECKING:
    from serial_handler import SerialHandler

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
WS_PORT   = 8765
HTTP_PORT = 8080

# Browser → backend commands and their serial translation
_CMD_MAP = {
    "start":       lambda _:   "START",
    "stop":        lambda _:   "STOP",
    "header":      lambda _:   "HEADER",
    "rate":        lambda m:   f"RATE {m['value']}",
    "pin_enable":  lambda m:   f"PIN+ {m['name']}",
    "pin_disable": lambda m:   f"PIN- {m['name']}",
}


class WSServer:
    def __init__(self, serial: SerialHandler) -> None:
        self.serial  = serial
        self.clients: set = set()
        self.queue   = asyncio.Queue()

    # ── Entry point ────────────────────────────────────────────────────────────

    async def run(self) -> None:
        loop = asyncio.get_event_loop()

        self._start_http_server()
        self.serial.start(self.queue, loop)

        webbrowser.open(f"http://localhost:{HTTP_PORT}")
        print(f"[ws]   WebSocket at ws://localhost:{WS_PORT}")

        async with websockets.serve(self._on_client, "0.0.0.0", WS_PORT):
            await self._broadcast_loop()

    # ── HTTP (static files) ────────────────────────────────────────────────────

    def _start_http_server(self) -> None:
        def _run() -> None:
            os.chdir(FRONTEND_DIR)
            handler = SimpleHTTPRequestHandler
            handler.log_message = lambda *_: None   # suppress request logs
            httpd = HTTPServer(("0.0.0.0", HTTP_PORT), handler)
            print(f"[http] Frontend at http://localhost:{HTTP_PORT}")
            httpd.serve_forever()

        threading.Thread(target=_run, daemon=True, name="http-server").start()

    # ── WebSocket client lifecycle ─────────────────────────────────────────────

    async def _on_client(self, ws) -> None:
        self.clients.add(ws)
        print(f"[ws] Client connected  (total: {len(self.clients)})")

        # Immediately send the current channel list so the UI can bootstrap
        await ws.send(json.dumps({
            "type":     "channels",
            "channels": self.serial.channels,
        }))

        try:
            async for raw in ws:
                self._handle_browser_message(raw)
        except websockets.exceptions.ConnectionClosedError:
            pass
        finally:
            self.clients.discard(ws)
            print(f"[ws] Client disconnected (total: {len(self.clients)})")

    def _handle_browser_message(self, raw: str) -> None:
        """Translate browser JSON commands into serial command strings."""
        try:
            msg  = json.loads(raw)
            cmd  = msg.get("cmd")
            make = _CMD_MAP.get(cmd)
            if make:
                self.serial.send_command(make(msg))
        except (json.JSONDecodeError, KeyError):
            pass

    # ── Broadcast loop ─────────────────────────────────────────────────────────

    async def _broadcast_loop(self) -> None:
        while True:
            msg = await self.queue.get()
            if not self.clients:
                continue
            await asyncio.gather(
                *[c.send(msg) for c in list(self.clients)],
                return_exceptions=True,
            )
