/**
 * charts.js — Canvas-based Time Domain and Spectrum Analyzer renderers
 *
 * No external libraries. Two classes:
 *   TimeChart    — oscilloscope-style rolling plot, multiple channels
 *   SpectrumChart — FFT magnitude bar chart (dBFS or linear)
 */

import { computeSpectrum, toDb, prevPow2 } from "./fft.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Scale digital (0/1) samples to LOW=10% / HIGH=90% of adcMax
 * so they appear as a full-height logic signal, not a flat line near 0.
 */
function scaleDigital(samples, adcMax) {
    const lo = adcMax * 0.05;
    const hi = adcMax * 0.90;
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++)
        out[i] = samples[i] ? hi : lo;
    return out;
}

// ── Shared drawing helpers ─────────────────────────────────────────────────────

const PAD   = { top: 16, right: 16, bottom: 36, left: 56 };
const FONT  = "11px 'JetBrains Mono', 'Consolas', monospace";
const GRID  = "#1e2633";
const LABEL = "#8b949e";
const BG    = "#0d1117";

function plotArea(canvas) {
    return {
        x0: PAD.left,
        y0: PAD.top,
        w:  canvas.width  - PAD.left - PAD.right,
        h:  canvas.height - PAD.top  - PAD.bottom,
    };
}

function clearCanvas(ctx, canvas) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGrid(ctx, { x0, y0, w, h }, xDivs, yDivs) {
    ctx.strokeStyle = GRID;
    ctx.lineWidth   = 1;

    for (let i = 0; i <= xDivs; i++) {
        const x = x0 + (i / xDivs) * w;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); ctx.stroke();
    }
    for (let i = 0; i <= yDivs; i++) {
        const y = y0 + (i / yDivs) * h;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke();
    }
}

// ── RingBuffer ─────────────────────────────────────────────────────────────────

export class RingBuffer {
    constructor(size) {
        this.size  = size;
        this.data  = new Float32Array(size);
        this.head  = 0;   // next write index
        this.count = 0;   // total valid samples
    }

    push(v) {
        this.data[this.head] = v;
        this.head  = (this.head + 1) % this.size;
        if (this.count < this.size) this.count++;
    }

    /** Return the last `n` samples in chronological order. */
    last(n) {
        n = Math.min(n, this.count);
        const out   = new Float32Array(n);
        const start = ((this.head - n) % this.size + this.size) % this.size;
        for (let i = 0; i < n; i++) {
            out[i] = this.data[(start + i) % this.size];
        }
        return out;
    }
}

// ── TimeChart ─────────────────────────────────────────────────────────────────

export class TimeChart {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext("2d");
    }

    /**
     * @param {string[]}                visibleChannels - channel names to draw (excludes "t")
     * @param {Map<string, RingBuffer>} buffers
     * @param {Map<string, string>}     colors          - channel → CSS colour
     * @param {Set<string>}             digitalSet      - channels that output 0/1 only
     * @param {number}                  adcMax
     * @param {number}                  sampleRateHz
     * @param {number}                  timeWindowSec
     */
    render(visibleChannels, buffers, colors, digitalSet, adcMax, sampleRateHz, timeWindowSec) {
        const { ctx, canvas } = this;
        const p = plotArea(canvas);

        clearCanvas(ctx, canvas);
        drawGrid(ctx, p, 10, 8);

        const nSamples = Math.max(2, Math.round(sampleRateHz * timeWindowSec));

        for (const name of visibleChannels) {
            const buf = buffers.get(name);
            if (!buf || buf.count < 2) continue;
            const raw     = buf.last(nSamples);
            // Digital channels (0/1): scale to full Y range so they're clearly visible
            const samples = digitalSet.has(name) ? scaleDigital(raw, adcMax) : raw;
            this._drawSignal(samples, p, adcMax, colors.get(name) ?? "#ffffff");
        }

        this._drawAxes(p, adcMax, timeWindowSec, sampleRateHz);
    }

    _drawSignal(samples, { x0, y0, w, h }, adcMax, color) {
        const { ctx } = this;
        const n     = samples.length;
        const xStep = w / (n - 1);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.lineJoin    = "round";

        for (let i = 0; i < n; i++) {
            const x = x0 + i * xStep;
            const y = y0 + h - (samples[i] / adcMax) * h;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    _drawAxes({ x0, y0, w, h }, adcMax, timeWindowSec, sampleRateHz) {
        const { ctx } = this;
        ctx.fillStyle  = LABEL;
        ctx.strokeStyle = LABEL;
        ctx.lineWidth  = 1;
        ctx.font       = FONT;
        ctx.textAlign  = "right";

        // Y-axis labels (value)
        const yDivs = 4;
        for (let i = 0; i <= yDivs; i++) {
            const val = Math.round((adcMax * (yDivs - i)) / yDivs);
            const y   = y0 + (i / yDivs) * h;
            ctx.fillText(val, x0 - 4, y + 4);
        }

        // X-axis labels (time in seconds)
        ctx.textAlign = "center";
        const xDivs   = 5;
        for (let i = 0; i <= xDivs; i++) {
            const sec = ((i / xDivs) * timeWindowSec - timeWindowSec).toFixed(1);
            const x   = x0 + (i / xDivs) * w;
            ctx.fillText(`${sec}s`, x, y0 + h + 20);
        }

        // Border
        ctx.beginPath();
        ctx.strokeStyle = "#30363d";
        ctx.strokeRect(x0, y0, w, h);
    }
}

// ── SpectrumChart ─────────────────────────────────────────────────────────────

export class SpectrumChart {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext("2d");
    }

    /**
     * @param {{name:string, samples:Float32Array, color:string}[]} channels
     * @param {number}  fftSize
     * @param {number}  sampleRateHz
     * @param {number}  adcMax
     * @param {boolean} useDb
     */
    render(channels, fftSize, sampleRateHz, adcMax, useDb) {
        const { ctx, canvas } = this;
        const p = plotArea(canvas);

        clearCanvas(ctx, canvas);

        if (!channels.length) {
            ctx.fillStyle = LABEL;
            ctx.font      = FONT;
            ctx.textAlign = "center";
            ctx.fillText("No analog channels visible", canvas.width / 2, canvas.height / 2);
            return;
        }

        // Determine actual FFT size from available samples
        const maxSamples = Math.max(...channels.map(c => c.samples.length));
        const actualSize = Math.min(fftSize, prevPow2(maxSamples));
        if (actualSize < 4) {
            ctx.fillStyle = LABEL;
            ctx.font      = FONT;
            ctx.textAlign = "center";
            ctx.fillText("Collecting samples…", canvas.width / 2, canvas.height / 2);
            return;
        }

        drawGrid(ctx, p, 10, 8);

        // Draw each channel overlaid
        for (const { samples, color } of channels) {
            const size  = Math.min(actualSize, prevPow2(samples.length));
            if (size < 4) continue;
            const slice = samples.slice(samples.length - size);
            const mag   = computeSpectrum(slice);
            const data  = useDb ? toDb(mag, adcMax) : mag;
            this._drawLine(data, p, useDb, adcMax, color);
        }

        this._drawAxes(p, sampleRateHz, actualSize, useDb, adcMax);
    }

    // Draw spectrum as a filled line (more readable when channels overlap than solid bars)
    _drawLine(data, { x0, y0, w, h }, useDb, adcMax, color) {
        const { ctx } = this;
        const n    = data.length;
        const yMin = useDb ? -80 : 0;
        const yMax = useDb ?   0 : adcMax / 2;
        const range = yMax - yMin;

        // Filled area under the line
        ctx.beginPath();
        ctx.moveTo(x0, y0 + h);
        for (let i = 0; i < n; i++) {
            const v    = Math.max(yMin, Math.min(yMax, data[i]));
            const norm = (v - yMin) / range;
            const x    = x0 + (i / (n - 1)) * w;
            const y    = y0 + h - norm * h;
            i === 0 ? ctx.lineTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.lineTo(x0 + w, y0 + h);
        ctx.closePath();
        ctx.fillStyle = color + "33";   // very transparent fill
        ctx.fill();

        // Solid line on top
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        for (let i = 0; i < n; i++) {
            const v    = Math.max(yMin, Math.min(yMax, data[i]));
            const norm = (v - yMin) / range;
            const x    = x0 + (i / (n - 1)) * w;
            const y    = y0 + h - norm * h;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    _drawAxes({ x0, y0, w, h }, sampleRateHz, fftSize, useDb, adcMax) {
        const { ctx }  = this;
        ctx.fillStyle  = LABEL;
        ctx.font       = FONT;
        const nyquist  = sampleRateHz / 2;
        const freqStep = nyquist / 5;

        // X-axis: frequency labels
        ctx.textAlign = "center";
        for (let i = 0; i <= 5; i++) {
            const hz = freqStep * i;
            const x  = x0 + (i / 5) * w;
            ctx.fillText(`${hz.toFixed(1)}Hz`, x, y0 + h + 20);
        }

        // Y-axis labels
        ctx.textAlign = "right";
        const yMin = useDb ? -80 : 0;
        const yMax = useDb ?   0 : adcMax / 2;
        const yDivs = 4;
        for (let i = 0; i <= yDivs; i++) {
            const val = yMax - ((yMax - yMin) * i) / yDivs;
            const y   = y0 + (i / yDivs) * h;
            const lbl = useDb ? `${val.toFixed(0)}dB` : val.toFixed(0);
            ctx.fillText(lbl, x0 - 4, y + 4);
        }

        // Border
        ctx.strokeStyle = "#30363d";
        ctx.lineWidth   = 1;
        ctx.strokeRect(x0, y0, w, h);
    }
}
