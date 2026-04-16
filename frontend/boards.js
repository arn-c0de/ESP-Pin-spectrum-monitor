/**
 * boards.js — Board profiles
 *
 * To add a new board: append an entry to BOARDS.
 * The firmware for that board must speak the same CSV protocol.
 * adcMax must match the board's ADC resolution.
 */

export const BOARDS = {
    "arduino-uno": {
        id:                "arduino-uno",
        label:             "Arduino Uno",
        adcMax:            1023,   // 10-bit ADC
        defaultSampleRate: 50,     // Hz
        pins: [
            { name: "A0",  analog: true,  defaultEnabled: true  },
            { name: "A1",  analog: true,  defaultEnabled: true  },
            { name: "A2",  analog: true,  defaultEnabled: true  },
            { name: "A3",  analog: true,  defaultEnabled: true  },
            { name: "A4",  analog: true,  defaultEnabled: false },
            { name: "A5",  analog: true,  defaultEnabled: false },
            { name: "D2",  analog: false, defaultEnabled: false },
            { name: "D3",  analog: false, defaultEnabled: false },
            { name: "D4",  analog: false, defaultEnabled: false },
            { name: "D5",  analog: false, defaultEnabled: false },
            { name: "D6",  analog: false, defaultEnabled: false },
            { name: "D7",  analog: false, defaultEnabled: false },
            { name: "D8",  analog: false, defaultEnabled: false },
            { name: "D9",  analog: false, defaultEnabled: false },
            { name: "D10", analog: false, defaultEnabled: false },
            { name: "D11", analog: false, defaultEnabled: false },
            { name: "D12", analog: false, defaultEnabled: false },
            { name: "D13", analog: false, defaultEnabled: false },
        ],
    },

    // ── Placeholder: ESP32 (Rust firmware, added later) ───────────────────────
    "esp32": {
        id:                "esp32",
        label:             "ESP32",
        adcMax:            4095,   // 12-bit ADC
        defaultSampleRate: 100,    // Hz
        pins: [
            { name: "GPIO34", analog: true,  defaultEnabled: true  },
            { name: "GPIO35", analog: true,  defaultEnabled: true  },
            { name: "GPIO36", analog: true,  defaultEnabled: true  },
            { name: "GPIO39", analog: true,  defaultEnabled: true  },
            { name: "D2",     analog: false, defaultEnabled: false },
            { name: "D13",    analog: false, defaultEnabled: false },
        ],
    },
};

/** Colour palette — one colour per channel index. */
export const CHANNEL_COLORS = [
    "#4fc3f7",  // blue
    "#81c784",  // green
    "#ffb74d",  // orange
    "#f06292",  // pink
    "#ba68c8",  // purple
    "#4db6ac",  // teal
    "#fff176",  // yellow
    "#ff8a65",  // deep-orange
];
