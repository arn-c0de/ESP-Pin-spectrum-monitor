/**
 * ui.js — DOM construction and updates
 * Pure functions: receive state/data, return or mutate DOM nodes only.
 * No WebSocket or chart logic here.
 */

import { BOARDS } from "./boards.js";

// ── Connection status ─────────────────────────────────────────────────────────

/** @param {"connecting"|"connected"|"disconnected"|"error"} status */
export function setConnectionStatus(status, detail = "") {
    const el  = document.getElementById("status-badge");
    const dot = document.getElementById("status-dot");
    const map = {
        connecting:   { text: "Connecting…",  cls: "status-connecting"   },
        connected:    { text: detail || "Connected",  cls: "status-connected"    },
        disconnected: { text: "Disconnected", cls: "status-disconnected" },
        error:        { text: detail || "Error",      cls: "status-error"        },
    };
    const { text, cls } = map[status] ?? map.disconnected;
    el.textContent  = text;
    dot.className   = cls;
}

export function setPortLabel(port) {
    const el = document.getElementById("port-label");
    el.textContent = port ?? "";
}

export function setSampleRateDisplay(hz) {
    const el = document.getElementById("rate-display");
    el.textContent = `${hz.toFixed(1)} Hz`;
}

// ── Board selector ─────────────────────────────────────────────────────────────

export function buildBoardSelect(currentBoardId, onBoardChange) {
    const sel = document.getElementById("board-select");
    sel.innerHTML = "";
    for (const board of Object.values(BOARDS)) {
        const opt = document.createElement("option");
        opt.value       = board.id;
        opt.textContent = board.label;
        opt.selected    = board.id === currentBoardId;
        sel.appendChild(opt);
    }
    sel.addEventListener("change", () => onBoardChange(sel.value));
}

// ── Chart legend (time domain) ────────────────────────────────────────────────

/**
 * Build clickable colour-coded badges in the time-domain chart header.
 * Clicking a badge toggles the channel's visibility in the graph.
 *
 * @param {string[]}            channelNames
 * @param {Set<string>}         visibleSet
 * @param {Map<string, string>} colors
 * @param {(name:string, visible:boolean) => void} onToggle
 */
export function buildTimeLegend(channelNames, visibleSet, colors, onToggle) {
    const container = document.getElementById("time-legend");
    container.innerHTML = "";

    for (const name of channelNames) {
        if (name === "t") continue;

        const badge = document.createElement("span");
        badge.className   = "legend-badge";
        badge.dataset.ch  = name;
        badge.title       = `Click to show/hide ${name}`;
        if (!visibleSet.has(name)) badge.classList.add("hidden");

        const dot = document.createElement("span");
        dot.className        = "legend-dot";
        dot.style.background = colors.get(name) ?? "#8b949e";

        badge.appendChild(dot);
        badge.appendChild(document.createTextNode(name));

        badge.addEventListener("click", () => {
            const nowHidden = badge.classList.toggle("hidden");
            onToggle(name, !nowHidden);
        });

        container.appendChild(badge);
    }
}

// ── Rate controls ─────────────────────────────────────────────────────────────

/**
 * Wire up the sample-rate slider + number input.
 * Both stay in sync. Calls onRateChange(ms) when the value changes.
 */
export function buildRateControls(currentHz, onRateChange) {
    const slider = document.getElementById("rate-slider");
    const input  = document.getElementById("rate-input");

    // slider is in Hz
    slider.value = currentHz;
    input.value  = currentHz;

    function emit() {
        const hz = Math.max(1, Math.min(500, parseInt(slider.value, 10)));
        slider.value = hz;
        input.value  = hz;
        onRateChange(hz);
    }

    slider.addEventListener("input",  emit);
    input.addEventListener("change",  () => { slider.value = input.value; emit(); });
}

// ── Time window control ───────────────────────────────────────────────────────

export function buildWindowControl(currentSec, onWindowChange) {
    const slider = document.getElementById("window-slider");
    const label  = document.getElementById("window-label");

    slider.value     = currentSec;
    label.textContent = `${currentSec}s`;

    slider.addEventListener("input", () => {
        label.textContent = `${slider.value}s`;
        onWindowChange(parseInt(slider.value, 10));
    });
}

// ── Spectrum controls ─────────────────────────────────────────────────────────

export function buildSpectrumControls(channelNames, currentChannel, fftSize, useDb,
                                      onChannelChange, onFftSizeChange, onDbToggle) {
    // Channel selector
    const sel = document.getElementById("spectrum-channel");
    sel.innerHTML = "";
    for (const name of channelNames) {
        if (name === "t") continue;
        const opt = document.createElement("option");
        opt.value       = name;
        opt.textContent = name;
        opt.selected    = name === currentChannel;
        sel.appendChild(opt);
    }
    sel.addEventListener("change", () => onChannelChange(sel.value));

    // FFT size selector
    const fftSel = document.getElementById("fft-size");
    fftSel.value = fftSize;
    fftSel.addEventListener("change", () => onFftSizeChange(parseInt(fftSel.value, 10)));

    // dBFS toggle
    const dbChk = document.getElementById("db-toggle");
    dbChk.checked = useDb;
    dbChk.addEventListener("change", () => onDbToggle(dbChk.checked));
}

/** Update only the spectrum channel dropdown options. */
export function updateSpectrumChannelOptions(channelNames, currentChannel) {
    const sel = document.getElementById("spectrum-channel");
    const prev = sel.value;
    sel.innerHTML = "";
    for (const name of channelNames) {
        if (name === "t") continue;
        const opt = document.createElement("option");
        opt.value       = name;
        opt.textContent = name;
        opt.selected    = name === (currentChannel ?? prev);
        sel.appendChild(opt);
    }
}

// ── Stream play/pause button ──────────────────────────────────────────────────

export function buildStreamToggle(streaming, onToggle) {
    const btn = document.getElementById("stream-toggle");
    _syncStreamBtn(btn, streaming);
    btn.addEventListener("click", () => {
        const next = btn.dataset.streaming !== "true";
        _syncStreamBtn(btn, next);
        onToggle(next);
    });
}

function _syncStreamBtn(btn, streaming) {
    btn.dataset.streaming = streaming;
    btn.textContent       = streaming ? "⏸ Pause" : "▶ Resume";
    btn.classList.toggle("btn-paused", !streaming);
}
