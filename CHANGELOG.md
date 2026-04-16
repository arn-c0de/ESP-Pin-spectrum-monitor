# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2024-04-16

### Added
- Created install.sh script for automated virtual environment (venv) and dependency management.
- Created MANUAL.md with hardware voltage limits and detailed usage instructions.
- Implemented Twiddle Factor Look-Up Tables (LUT) in fft.js for significantly improved CPU efficiency.
- Added forEachLast to RingBuffer in charts.js for allocation-free rendering, eliminating GC pauses.

### Security
- Hardened start-server.sh against shell injection via command-line arguments.
- Implemented Origin checks in WebSocket server to prevent Cross-Site WebSocket Hijacking (CSWH).
- Added strict regex-based sanitization for all incoming WebSocket commands.
- Implemented Content Security Policy (CSP) and security headers (HSTS, X-Frame-Options, etc.).
- Restricted server bindings to 127.0.0.1 by default.

### Changed
- Refactored start-server.sh to strictly use the virtual environment.
- Removed os.chdir() from ws_server.py to prevent global process state mutation.
- Removed all emojis from the entire codebase, UI, and documentation for a professional text-only experience.
- Updated README.md with new installation instructions and a link to the manual.

### Fixed
- Corrected board validation regex in flash.sh.
- Fixed memory leaks and excessive allocations in the frontend rendering pipeline.
