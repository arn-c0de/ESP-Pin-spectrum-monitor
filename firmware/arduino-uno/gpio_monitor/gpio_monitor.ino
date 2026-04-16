// =============================================================================
// gpio_monitor.ino — Arduino Uno GPIO Monitor
// Board : Arduino Uno (ATmega328P)
// Baud  : 115200
//
// Output protocol (CSV, newline-terminated):
//   CHANNELS:t,A0,A1,...          — sent once on boot and on "HEADER" command
//   <millis>,<val>,<val>,...      — one line per sample
//   OK:<CMD>                      — acknowledgement for commands
//
// Input commands (send from host, newline-terminated):
//   RATE <ms>      — set sample interval in ms  (1 – 5000)
//   START          — resume streaming
//   STOP           — pause streaming
//   HEADER         — re-send the CHANNELS line
//   PIN+ <name>    — enable a channel  (e.g. "PIN+ A4")
//   PIN- <name>    — disable a channel (e.g. "PIN- A4")
// =============================================================================

#include <Arduino.h>

// ── Build-time defaults ───────────────────────────────────────────────────────
#define BAUD_RATE       115200
#define MAX_CHANNELS    16
#define DEFAULT_RATE_MS 20      // 50 Hz

// ── Channel descriptor ────────────────────────────────────────────────────────
struct Channel {
    uint8_t pin;
    char    name[6];   // "A0" … "D13" (max 4 chars + NUL)
    bool    analog;
    bool    enabled;
};

// ── Global state ──────────────────────────────────────────────────────────────
static Channel  ch[MAX_CHANNELS];
static uint8_t  nCh       = 0;
static uint32_t rateMs    = DEFAULT_RATE_MS;
static bool     streaming = true;
static uint32_t lastSample = 0;

// Serial command accumulator
static char    cmdBuf[32];
static uint8_t cmdLen = 0;

// ── Channel registry ─────────────────────────────────────────────────────────
static void addChannel(uint8_t pin, const char* name, bool analog, bool enabled) {
    if (nCh >= MAX_CHANNELS) return;
    ch[nCh].pin     = pin;
    ch[nCh].analog  = analog;
    ch[nCh].enabled = enabled;
    strncpy(ch[nCh].name, name, sizeof(ch[nCh].name) - 1);
    ch[nCh].name[sizeof(ch[nCh].name) - 1] = '\0';
    if (!analog) pinMode(pin, INPUT);
    nCh++;
}

static Channel* findChannel(const char* name) {
    for (uint8_t i = 0; i < nCh; i++)
        if (strncmp(ch[i].name, name, sizeof(ch[i].name)) == 0) return &ch[i];
    return nullptr;
}

// ── Protocol helpers ──────────────────────────────────────────────────────────
static void sendHeader() {
    Serial.print(F("CHANNELS:t"));
    for (uint8_t i = 0; i < nCh; i++) {
        if (!ch[i].enabled) continue;
        Serial.print(',');
        Serial.print(ch[i].name);
    }
    Serial.println();
}

static void sendSample() {
    Serial.print(millis());
    for (uint8_t i = 0; i < nCh; i++) {
        if (!ch[i].enabled) continue;
        Serial.print(',');
        Serial.print(ch[i].analog
            ? analogRead(ch[i].pin)
            : (uint8_t)digitalRead(ch[i].pin));
    }
    Serial.println();
}

// ── Command parser ────────────────────────────────────────────────────────────
static void handleCommand(const char* cmd) {
    if (strncmp(cmd, "RATE ", 5) == 0) {
        long v = atol(cmd + 5);
        if (v >= 1 && v <= 5000) rateMs = (uint32_t)v;
        Serial.println(F("OK:RATE"));

    } else if (strcmp(cmd, "START") == 0) {
        streaming = true;
        lastSample = millis();
        Serial.println(F("OK:START"));

    } else if (strcmp(cmd, "STOP") == 0) {
        streaming = false;
        Serial.println(F("OK:STOP"));

    } else if (strcmp(cmd, "HEADER") == 0) {
        sendHeader();

    } else if (strncmp(cmd, "PIN+ ", 5) == 0) {
        Channel* c = findChannel(cmd + 5);
        if (c) { c->enabled = true;  sendHeader(); }

    } else if (strncmp(cmd, "PIN- ", 5) == 0) {
        Channel* c = findChannel(cmd + 5);
        if (c) { c->enabled = false; sendHeader(); }
    }
}

// ── Arduino lifecycle ─────────────────────────────────────────────────────────
void setup() {
    Serial.begin(BAUD_RATE);

    // Default channel map — Arduino Uno
    // Analog inputs  A0-A3 active by default, A4-A5 available but off
    // Digital inputs D2, D3, D4, D13 active by default
    addChannel(A0,  "A0",  true,  true);
    addChannel(A1,  "A1",  true,  true);
    addChannel(A2,  "A2",  true,  true);
    addChannel(A3,  "A3",  true,  true);
    addChannel(A4,  "A4",  true,  false);
    addChannel(A5,  "A5",  true,  false);
    addChannel(2,   "D2",  false, true);
    addChannel(3,   "D3",  false, true);
    addChannel(4,   "D4",  false, true);
    addChannel(13,  "D13", false, true);

    sendHeader();
}

void loop() {
    // ── Non-blocking Serial read ──────────────────────────────────────────────
    while (Serial.available()) {
        char c = (char)Serial.read();
        if (c == '\n' || c == '\r') {
            if (cmdLen > 0) {
                cmdBuf[cmdLen] = '\0';
                handleCommand(cmdBuf);
                cmdLen = 0;
            }
        } else if (cmdLen < (uint8_t)(sizeof(cmdBuf) - 1)) {
            cmdBuf[cmdLen++] = c;
        }
    }

    // ── Timed sample emission ─────────────────────────────────────────────────
    if (streaming) {
        uint32_t now = millis();
        if (now - lastSample >= rateMs) {
            lastSample = now;
            sendSample();
        }
    }
}
