#!/usr/bin/env python3
"""
bridge.py — GPIO Monitor entry point
Usage:
    python bridge.py               # auto-detect serial port
    python bridge.py /dev/ttyUSB0  # explicit port
    python bridge.py COM3          # Windows
"""
import asyncio
import sys

from serial_handler import SerialHandler, list_ports
from ws_server import WSServer


async def main() -> None:
    port = sys.argv[1] if len(sys.argv) > 1 else None

    if not port:
        print("[bridge] Auto-detecting serial port …")
    else:
        print(f"[bridge] Using port: {port}")

    serial  = SerialHandler(port)
    server  = WSServer(serial)

    try:
        await server.run()
    except RuntimeError as exc:
        print(f"\n[bridge] Fatal: {exc}")
        print("\nAvailable ports:")
        for p in list_ports():
            print(f"  {p}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n[bridge] Stopped.")


if __name__ == "__main__":
    asyncio.run(main())
