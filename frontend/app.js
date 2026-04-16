/**
 * app.js — Main application: WebSocket, state, render loop
 *
 * Wires up serial_handler (backend) ↔ charts ↔ UI controls.
 */

import { BOARDS, CHANNEL_COLORS }                                    from "./boards.js";
import { RingBuffer, TimeChart, SpectrumChart }                      from "./charts.js";
import {
    setConnectionStatus, setPortLabel, setSampleRateDisplay,
    buildBoardSelect, buildChannelList, buildRateControls,
    buildWindowControl, buildSpectrumControls, updateSpectrumChannelOptions,
    buildStreamToggle, syncChannelToggles,
} from "./ui.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_URL         = `ws://${location.hostname}:8765`;
const BUFFER_SIZE    = 8192;   // samples per channel
const RECONNECT_MS   = 2000;

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
    board:         BOARDS["arduino-uno"],
    channels:      [],           // string[] from CHANNELS: header (includes "t")
    enabledSet:    new Set(),    // currently enabled channel names
    buffers:       new Map(),    // name → RingBuffer
    colors:        new Map(),    // name → CSS color string
    colorIdx:      0,

    sampleRateHz:  50,           // estimated from incoming timestamps
    _lastTs:       null,         // for sample-rate estimation (EMA)

    timeWindowSec: 5,
    fftSize:       512,
    specChannel:   null,
    useDb:         true,
    streaming:     true,

    ws:            null,
};

// ── Chart instances ───────────────────────────────────────────────────────────

const timeChart = new TimeChart(document.getElementById("time-canvas"));
const specChart = new SpectrumChart(document.getElementById("spectrum-canvas"));

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connect() {
    setConnectionStatus("connecting");
    const ws = new WebSocket(WS_URL);
    state.ws = ws;

    ws.onopen = () => {
        setConnectionStatus("connected");
        // Ask for fresh header in case we reconnected
        sendCmd({ cmd: "header" });
    };

    ws.onclose = () => {
        setConnectionStatus("disconnected");
        setTimeout(connect, RECONNECT_MS);
    };

    ws.onerror = () => {
        setConnectionStatus("error", "WebSocket error");
    };

    ws.onmessage = (ev) => {
        try {
            handleMessage(JSON.parse(ev.data));
        } catch { /* ignore malformed */ }
    };
}

function sendCmd(obj) {
    if (state.ws?.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(obj));
    }
}

// ── Message handling ──────────────────────────────────────────────────────────

function handleMessage(msg) {
    switch (msg.type) {
        case "connected":
            setPortLabel(msg.port);
            break;

        case "disconnected":
            setConnectionStatus("disconnected");
            setPortLabel(null);
            break;

        case "channels":
            onChannelsUpdate(msg.channels);
            break;

        case "data":
            onData(msg.d);
            break;

        case "ack":
            // Optional: could show in a status bar
            break;

        case "error":
            setConnectionStatus("error", msg.msg);
            break;
    }
}

// ── Channel list update ───────────────────────────────────────────────────────

function onChannelsUpdate(channels) {
    state.channels = channels;

    // Assign colours and create buffers for new channels
    for (const name of channels) {
        if (name === "t") continue;
        if (!state.buffers.has(name)) {
            state.buffers.set(name, new RingBuffer(BUFFER_SIZE));
        }
        if (!state.colors.has(name)) {
            state.colors.set(name, CHANNEL_COLORS[state.colorIdx++ % CHANNEL_COLORS.length]);
        }
    }

    // Determine enabled set from board profile defaults (only on first call)
    if (state.enabledSet.size === 0) {
        const profilePins = state.board.pins;
        for (const { name, defaultEnabled } of profilePins) {
            if (channels.includes(name) && defaultEnabled) {
                state.enabledSet.add(name);
            }
        }
        // Fall back: enable all if profile has no match
        if (state.enabledSet.size === 0) {
            channels.filter(n => n !== "t").forEach(n => state.enabledSet.add(n));
        }
    }

    // Default spectrum channel = first enabled channel
    if (!state.specChannel || !channels.includes(state.specChannel)) {
        state.specChannel = channels.find(n => n !== "t") ?? null;
    }

    // Rebuild UI
    buildChannelList(
        channels, state.enabledSet, state.colors,
        (name, enabled) => {
            enabled ? state.enabledSet.add(name) : state.enabledSet.delete(name);
            sendCmd(enabled ? { cmd: "pin_enable", name } : { cmd: "pin_disable", name });
        },
    );
    updateSpectrumChannelOptions(channels, state.specChannel);
}

// ── Incoming data ─────────────────────────────────────────────────────────────

function onData(d) {
    // Estimate sample rate from timestamp delta (EMA)
    const ts = d.t;
    if (state._lastTs !== null) {
        const dt = ts - state._lastTs;
        if (dt > 0 && dt < 5000) {
            const measured = 1000 / dt;
            state.sampleRateHz = state.sampleRateHz * 0.95 + measured * 0.05;
            setSampleRateDisplay(state.sampleRateHz);
        }
    }
    state._lastTs = ts;

    // Push values into ring buffers
    for (const [name, val] of Object.entries(d)) {
        if (name === "t") continue;
        state.buffers.get(name)?.push(val);
    }
}

// ── Render loop ───────────────────────────────────────────────────────────────

function resizeCanvases() {
    for (const id of ["time-canvas", "spectrum-canvas"]) {
        const el  = document.getElementById(id);
        const dpr = window.devicePixelRatio ?? 1;
        const w   = el.clientWidth;
        const h   = el.clientHeight;
        if (el.width !== w * dpr || el.height !== h * dpr) {
            el.width  = w * dpr;
            el.height = h * dpr;
            el.getContext("2d").scale(dpr, dpr);
        }
    }
}

function renderLoop() {
    resizeCanvases();

    const active = state.channels.filter(
        n => n !== "t" && state.enabledSet.has(n)
    );

    timeChart.render(
        active,
        state.buffers,
        state.colors,
        state.board.adcMax,
        state.sampleRateHz,
        state.timeWindowSec,
    );

    if (state.specChannel) {
        const buf = state.buffers.get(state.specChannel);
        if (buf && buf.count > 0) {
            specChart.render(
                buf.last(state.fftSize),
                state.fftSize,
                state.sampleRateHz,
                state.board.adcMax,
                state.colors.get(state.specChannel) ?? "#4fc3f7",
                state.useDb,
            );
        }
    }

    requestAnimationFrame(renderLoop);
}

// ── Board change ──────────────────────────────────────────────────────────────

function onBoardChange(boardId) {
    const board = BOARDS[boardId];
    if (!board) return;
    state.board = board;
    state.enabledSet.clear();
    state.buffers.clear();
    state.colors.clear();
    state.colorIdx  = 0;
    state.specChannel = null;
    state._lastTs   = null;
    state.sampleRateHz = board.defaultSampleRate;
    sendCmd({ cmd: "header" });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function init() {
    buildBoardSelect(state.board.id, onBoardChange);

    buildRateControls(state.board.defaultSampleRate, (hz) => {
        sendCmd({ cmd: "rate", value: Math.round(1000 / hz) });
    });

    buildWindowControl(state.timeWindowSec, (sec) => {
        state.timeWindowSec = sec;
    });

    buildSpectrumControls(
        [], state.specChannel, state.fftSize, state.useDb,
        (ch)   => { state.specChannel = ch; },
        (size) => { state.fftSize = size; },
        (db)   => { state.useDb = db; },
    );

    buildStreamToggle(state.streaming, (on) => {
        state.streaming = on;
        sendCmd({ cmd: on ? "start" : "stop" });
    });

    connect();
    requestAnimationFrame(renderLoop);
}

document.addEventListener("DOMContentLoaded", init);
