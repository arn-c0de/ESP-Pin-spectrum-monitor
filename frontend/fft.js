/**
 * fft.js — Cooley-Tukey radix-2 in-place FFT
 *
 * All functions are pure (no side-effects on global state).
 */

// Cache for pre-calculated twiddle factors (sin/cos)
const twiddleCache = new Map();

/**
 * Get or create cached twiddle factors for a given FFT size.
 */
function getTwiddleFactors(n) {
    if (!twiddleCache.has(n)) {
        const factors = new Map();
        for (let len = 2; len <= n; len <<= 1) {
            const ang = -2 * Math.PI / len;
            factors.set(len, {
                wRe: Math.cos(ang),
                wIm: Math.sin(ang)
            });
        }
        twiddleCache.set(n, factors);
    }
    return twiddleCache.get(n);
}

/**
 * In-place radix-2 FFT.
 * @param {Float32Array} re - Real part (modified in place)
 * @param {Float32Array} im - Imaginary part (modified in place), pass zeros for real input
 */
export function fft(re, im) {
    const n = re.length;
    const twiddles = getTwiddleFactors(n);

    // Bit-reversal permutation
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            let t;
            t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }

    // Danielson-Lanczos butterfly
    for (let len = 2; len <= n; len <<= 1) {
        const { wRe, wIm } = twiddles.get(len);

        for (let i = 0; i < n; i += len) {
            let curRe = 1.0, curIm = 0.0;
            const half = len >> 1;

            for (let j = 0; j < half; j++) {
                const uRe = re[i + j];
                const uIm = im[i + j];
                const vRe = re[i + j + half] * curRe - im[i + j + half] * curIm;
                const vIm = re[i + j + half] * curIm + im[i + j + half] * curRe;

                re[i + j]        = uRe + vRe;
                im[i + j]        = uIm + vIm;
                re[i + j + half] = uRe - vRe;
                im[i + j + half] = uIm - vIm;

                const newRe = curRe * wRe - curIm * wIm;
                curIm       = curRe * wIm + curIm * wRe;
                curRe       = newRe;
            }
        }
    }
}

// Cache for pre-calculated Hann window coefficients
const hannWindowCache = new Map();

/**
 * Get or create cached Hann window coefficients for a given size.
 */
function getHannWindow(n) {
    if (!hannWindowCache.has(n)) {
        const window = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
        }
        hannWindowCache.set(n, window);
    }
    return hannWindowCache.get(n);
}

/**
 * Compute single-sided magnitude spectrum with Hann window.
 *
 * @param {Float32Array} samples - Time-domain samples (length = fftSize)
 * @returns {Float32Array} Magnitude array of length fftSize/2
 */
export function computeSpectrum(samples) {
    const n  = samples.length;
    const re = new Float32Array(n);
    const im = new Float32Array(n);

    // Apply cached Hann window
    const window = getHannWindow(n);
    for (let i = 0; i < n; i++) {
        re[i] = samples[i] * window[i];
    }

    fft(re, im);

    // Single-sided magnitude (normalised by n)
    const half = n >> 1;
    const mag  = new Float32Array(half);
    for (let i = 0; i < half; i++) {
        mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / n;
    }
    // Double non-DC bins to preserve energy
    for (let i = 1; i < half; i++) mag[i] *= 2;

    return mag;
}

/**
 * Convert linear magnitude to dBFS.
 * @param {Float32Array} mag
 * @param {number} adcMax - Full-scale value (e.g. 1023 or 4095)
 * @returns {Float32Array}
 */
export function toDb(mag, adcMax) {
    const db = new Float32Array(mag.length);
    for (let i = 0; i < mag.length; i++) {
        const norm = mag[i] / adcMax;
        db[i] = norm > 0 ? 20 * Math.log10(norm) : -120;
    }
    return db;
}

/** Return the nearest power-of-2 that is ≤ n. */
export function prevPow2(n) {
    let p = 1;
    while (p * 2 <= n) p *= 2;
    return p;
}
