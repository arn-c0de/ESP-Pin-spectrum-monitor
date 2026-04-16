/**
 * app.js — Main application: WebSocket, state, render loop
 */

import { BOARDS, CHANNEL_COLORS }          from "./boards.js";
import { RingBuffer, TimeChart, SpectrumChart } from "./charts.js";
import {
    setConnectionStatus, setPortLabel, setSampleRateDisplay,
    buildBoardSelect, buildRateControls, buildWindowControl,
    buildStreamToggle, buildTimeLegend, buildDigitalToggle,
} from "./ui.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_URL      = `ws://${location.hostname}:8765`;
const BUFFER_SIZE = 8192;
const RECONNECT_MS = 2000;

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
    board:        BOARDS["arduino-uno"],
    channels:     [],           // string[] from CHANNELS: header (includes "t")
    visibleSet:   new Set(),    // which channels are drawn in the graph (visual only)
    digitalSet:   new Set(),    // which channels are digital (0/1) — for scaling
    buffers:      new Map(),    // name → RingBuffer
    colors:       new Map(),    // name → CSS colour
    colorIdx:     0,

    sampleRateHz: 50,
    _lastTs:      null,

    timeWindowSec: 5,
    fftSize:       512,
    useDb:         true,
    streaming:     true,
    digitalOnly:   false,       // show only digital channels when true

    ws: null,
};

// ── Chart instances ───────────────────────────────────────────────────────────

const timeChart = new TimeChart(document.getElementById("time-canvas"));
const specChart = new SpectrumChart(document.getElementById("spectrum-canvas"));

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connect() {
    setConnectionStatus("connecting");
    const ws = new WebSocket(WS_URL);
    state.ws = ws;

    ws.onopen  = () => { setConnectionStatus("connected"); sendCmd({ cmd: "header" }); };
    ws.onclose = () => { setConnectionStatus("disconnected"); setTimeout(connect, RECONNECT_MS); };
    ws.onerror = () => { setConnectionStatus("error", "WebSocket error"); };
    ws.onmessage = (ev) => {
        try { handleMessage(JSON.parse(ev.data)); } catch { /* ignore malformed */ }
    };
}

function sendCmd(obj) {
    if (state.ws?.readyState === WebSocket.OPEN)
        state.ws.send(JSON.stringify(obj));
}

// ── Message handling ──────────────────────────────────────────────────────────

function handleMessage(msg) {
    switch (msg.type) {
        case "connected":    setPortLabel(msg.port);                    break;
        case "disconnected": setConnectionStatus("disconnected"); setPortLabel(null); break;
        case "channels":     onChannelsUpdate(msg.channels);            break;
        case "data":         onData(msg.d);                             break;
        case "error":        setConnectionStatus("error", msg.msg);     break;
    }
}

// ── Channel list update ───────────────────────────────────────────────────────

function onChannelsUpdate(channels) {
    state.channels = channels;

    // Build digital set from board profile (by pin name convention)
    state.digitalSet.clear();
    for (const p of state.board.pins) {
        if (!p.analog) state.digitalSet.add(p.name);
    }

    // Assign colours and create buffers for newly seen channels
    for (const name of channels) {
        if (name === "t") continue;
        if (!state.buffers.has(name))
            state.buffers.set(name, new RingBuffer(BUFFER_SIZE));
        if (!state.colors.has(name))
            state.colors.set(name, CHANNEL_COLORS[state.colorIdx++ % CHANNEL_COLORS.length]);
        // All incoming channels are visible by default
        state.visibleSet.add(name);
    }

    // Rebuild legend
    buildTimeLegend(channels, state.visibleSet, state.colors, onLegendToggle);
    
    // Update visibility based on digitalOnly setting
    updateChannelVisibility();
}

function updateChannelVisibility() {
    const visible = new Set();
    
    for (const name of state.channels) {
        if (name === "t") continue;
        
        if (state.digitalOnly) {
            // Show only digital channels that are in our digital set
            if (state.digitalSet.has(name)) {
                visible.add(name);
            }
        } else {
            // Show all channels
            visible.add(name);
        }
    }
    
    // If digital only mode and no digital channels visible, show all digital pins from board profile
    if (state.digitalOnly && visible.size === 0) {
        for (const pin of state.board.pins) {
            if (!pin.analog) {
                visible.add(pin.name);
            }
        }
    }
    
    state.visibleSet = visible;
    buildTimeLegend(state.channels, state.visibleSet, state.colors, onLegendToggle);
}

function onLegendToggle(name, visible) {
    if (visible) {
        state.visibleSet.add(name);
        // Send PIN+ command to enable this channel in firmware
        sendCmd({ cmd: "pin_enable", name: name });
    } else {
        state.visibleSet.delete(name);
        // Send PIN- command to disable this channel in firmware
        sendCmd({ cmd: "pin_disable", name: name });
    }
}

// ── Incoming data ─────────────────────────────────────────────────────────────

function onData(d) {
    const ts = d.t;
    if (state._lastTs !== null) {
        const dt = ts - state._lastTs;
        if (dt > 0 && dt < 5000) {
            const hz = 1000 / dt;
            state.sampleRateHz = state.sampleRateHz * 0.95 + hz * 0.05;
            setSampleRateDisplay(state.sampleRateHz);
        }
    }
    state._lastTs = ts;

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

    const visible = state.channels.filter(n => n !== "t" && state.visibleSet.has(n));

    timeChart.render(
        visible,
        state.buffers,
        state.colors,
        state.digitalSet,
        state.board.adcMax,
        state.sampleRateHz,
        state.timeWindowSec,
    );

    // Spectrum: all visible analog channels overlaid
    const specChannels = visible
        .filter(n => !state.digitalSet.has(n))
        .map(n => ({
            name:    n,
            samples: state.buffers.get(n)?.last(state.fftSize) ?? null,
            color:   state.colors.get(n) ?? "#4fc3f7",
        }))
        .filter(c => c.samples !== null);

    specChart.render(
        specChannels,
        state.fftSize,
        state.sampleRateHz,
        state.board.adcMax,
        state.useDb,
    );

    requestAnimationFrame(renderLoop);
}

// ── Board change ──────────────────────────────────────────────────────────────

function onBoardChange(boardId) {
    const board = BOARDS[boardId];
    if (!board) return;
    state.board       = board;
    state.visibleSet.clear();
    state.digitalSet.clear();
    state.buffers.clear();
    state.colors.clear();
    state.colorIdx    = 0;
    state._lastTs     = null;
    state.sampleRateHz = board.defaultSampleRate;
    sendCmd({ cmd: "header" });
}

function onDigitalToggle(digitalOnly) {
    state.digitalOnly = digitalOnly;
    updateChannelVisibility();
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

    // FFT size + dBFS toggle (spectrum channel selector removed — all visible shown)
    document.getElementById("fft-size")
        .addEventListener("change", (e) => { state.fftSize = parseInt(e.target.value, 10); });
    document.getElementById("db-toggle")
        .addEventListener("change", (e) => { state.useDb = e.target.checked; });

    buildStreamToggle(state.streaming, (on) => {
        state.streaming = on;
        sendCmd({ cmd: on ? "start" : "stop" });
    });

    buildDigitalToggle(state.digitalOnly, onDigitalToggle);

    connect();
    requestAnimationFrame(renderLoop);
}

document.addEventListener("DOMContentLoaded", init);
