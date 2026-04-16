"""
ws_server.py — WebSocket + static HTTP server
WebSocket on port 8765 : real-time data ↔ browser
HTTP      on port 8080 : serves the frontend/ directory
"""
from __future__ import annotations

import asyncio
import json
import os
import re
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

        async with websockets.serve(self._on_client, "127.0.0.1", WS_PORT):
            await self._broadcast_loop()

    # ── HTTP (static files) ────────────────────────────────────────────────────

    def _start_http_server(self) -> None:
        def _run() -> None:
            # Custom handler to add security headers and serve from FRONTEND_DIR
            # Using the 'directory' argument available in Python 3.7+
            class CSPHandler(SimpleHTTPRequestHandler):
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

                def end_headers(self):
                    # Add Content Security Policy
                    self.send_header("Content-Security-Policy", 
                                   "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; font-src 'self'")
                    self.send_header("X-Content-Type-Options", "nosniff")
                    self.send_header("X-Frame-Options", "DENY")
                    self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
                    super().end_headers()
            
            handler = CSPHandler
            handler.log_message = lambda *_: None   # suppress request logs
            try:
                self.httpd = HTTPServer(("127.0.0.1", HTTP_PORT), handler)
                print(f"[http] Frontend at http://localhost:{HTTP_PORT}")
                self.httpd.serve_forever()
            except Exception as e:
                print(f"[http] Server stopped: {e}")

        threading.Thread(target=_run, daemon=True, name="http-server").start()

    # ── WebSocket client lifecycle ─────────────────────────────────────────────

    async def _on_client(self, ws) -> None:
        # Check Origin header for CSWH protection
        origin = ws.request_headers.get("Origin")
        if origin and not origin.startswith("http://localhost:") and not origin.startswith("http://127.0.0.1:"):
            print(f"[ws] Rejected connection from unauthorized origin: {origin}")
            return
        
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
                # Sanitize inputs to prevent command injection
                if cmd == "rate":
                    value = str(msg.get("value", "")).replace("\n", "").replace("\r", "")
                    # Use regex to enforce strict numeric format
                    if not re.match(r'^[0-9]+$', value):
                        return
                    msg["value"] = value
                elif cmd in ("pin_enable", "pin_disable"):
                    name = str(msg.get("name", "")).replace("\n", "").replace("\r", "")
                    # Use regex to enforce alphanumeric format
                    if not re.match(r'^[a-zA-Z0-9_]+$', name):
                        return
                    msg["name"] = name
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
