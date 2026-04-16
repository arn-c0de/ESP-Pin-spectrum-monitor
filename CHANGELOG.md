# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2024-04-16

### Security
- Fixed shell injection vulnerability in `start-server.sh` by quoting the `$PORT_ARG` variable.
- Fixed invalid dependency `websockets>=16.0` by updating to `websockets>=16.0`.
- Addressed serial command injection in `ws_server.py` by sanitizing WebSocket inputs.
- Restricted default server binding to `127.0.0.1` to prevent unprotected network exposure.

### Fixed
- Updated `requirements.txt` to use a valid version of the `websockets` package.
- Improved input validation in `flash.sh` to prevent potential directory traversal.
- Optimized `app.js` render loop by caching DOM references and using `ResizeObserver`.

### Changed
- Removed emoji and non-standard formatting from `findings-report.md` for better readability.
- Improved documentation clarity and structure in `findings-report.md`.

### Added
- Added `CHANGELOG.md` to track project changes.
