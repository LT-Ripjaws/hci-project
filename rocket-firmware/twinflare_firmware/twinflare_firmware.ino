// Twinflare firmware: one Arduino Uno, two GY-521 rockets, R1 input stream and
// H/B/X/M feedback commands. Contract: Rocket-Game-System-Design.md,
// "Software responsibilities and serial contract".
//
// Wiring (see Twinflare-Physical-Assembly-Tutorial.md):
//   A4/A5 -> converter HV1/HV2; LV1/LV2 -> both GY-521 SDA/SCL
//   P1: 0x68 (AD0->GND), button D2, LED D4      P2: 0x69 (AD0->3.3V), button D3, LED D5
//   D6 -> 680R -> NPN base; buzzer between 5V and collector
//
// Output, 115200 8N1, one line every 20 ms:
//   R1,<seq>,<uptime ms>,<P1 roll centideg>,<P1 fire>,<P1 health>,<P2 roll>,<P2 fire>,<P2 health>
// Input, newline terminated, max 16 bytes per line:
//   H,1 / H,2  flash that LED 200 ms + 100 ms beep     B,1  50 ms beep
//   B,2        200 ms beep                             X    clear all outputs
//   M,1 / M,0  mute / unmute the buzzer (LEDs unaffected)
//
// No debug text is ever printed on the normal stream. Keep rockets still for
// two seconds after reset or after the browser opens the port (which resets
// the Uno) so the gyro bias is measured; health reads 0 during that time.

#include <Wire.h>
#include "TwinflareMpu.h"

// ---- Configuration -------------------------------------------------------
static const uint8_t SENSOR_ADDR[2] = {0x68, 0x69};
static const int8_t ROLL_SIGN[2] = {1, 1};        // set -1 for a player whose right bank reads negative
static const bool MOUNT_INVERTED[2] = {true, true};   // true if the GY-521 chip faces down when the rocket is level
static const bool BANK_ABOUT_Y[2] = {true, true};     // true if the GY-521's X axis runs across the rocket (long side sideways)
static const uint8_t BUTTON_PIN[2] = {2, 3};
static const uint8_t LED_PIN[2] = {4, 5};
static const uint8_t BUZZER_PIN = 6;

static const unsigned long SAMPLE_US = 10000;     // 100 Hz sensor sampling
static const unsigned long FRAME_MS = 20;         // 50 Hz R1 frames
static const unsigned long DEBOUNCE_MS = 20;
static const unsigned long HIT_LED_MS = 200;
static const unsigned long HIT_BEEP_MS = 100;
static const unsigned long COUNTDOWN_BEEP_MS = 50;
static const unsigned long END_BEEP_MS = 200;
static const unsigned long MAX_BEEP_MS = 250;     // merged beeps never run longer than this
static const uint8_t CMD_MAX = 16;

// ---- State ---------------------------------------------------------------
struct Button {
  bool stablePressed;
  bool lastRaw;
  unsigned long lastChangeMs;
};

static twinflare::Sensor sensors[2];
static Button buttons[2];
static unsigned long seq = 0;
static unsigned long lastSampleUs = 0;
static unsigned long lastFrameMs = 0;

static bool ledOn[2] = {false, false};
static unsigned long ledOffAt[2] = {0, 0};
static bool buzzerOn = false;
static unsigned long buzzerOffAt = 0;
static bool muted = false;

static char cmdBuf[CMD_MAX + 1];
static uint8_t cmdLen = 0;
static bool cmdDiscard = false;
static char lineBuf[64];

// ---- Buttons -------------------------------------------------------------
static bool readPressed(uint8_t pin) {
  return digitalRead(pin) == LOW;
}

static void updateButtons(unsigned long nowMs) {
  for (uint8_t i = 0; i < 2; i++) {
    Button &b = buttons[i];
    bool raw = readPressed(BUTTON_PIN[i]);
    if (raw != b.lastRaw) {
      b.lastRaw = raw;
      b.lastChangeMs = nowMs;
    } else if (raw != b.stablePressed && (nowMs - b.lastChangeMs) >= DEBOUNCE_MS) {
      b.stablePressed = raw;
    }
  }
}

// ---- Outputs -------------------------------------------------------------
static void buzzerSet(bool on) {
  buzzerOn = on;
  digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
}

static void ledSet(uint8_t i, bool on) {
  ledOn[i] = on;
  digitalWrite(LED_PIN[i], on ? HIGH : LOW);
}

// Overlapping requests merge into one pulse bounded by MAX_BEEP_MS from now.
static void beep(unsigned long ms, unsigned long nowMs) {
  if (muted) return;
  if (ms > MAX_BEEP_MS) ms = MAX_BEEP_MS;
  unsigned long offAt = nowMs + ms;
  if (!buzzerOn || (long)(offAt - buzzerOffAt) > 0) buzzerOffAt = offAt;
  if ((long)(buzzerOffAt - (nowMs + MAX_BEEP_MS)) > 0) buzzerOffAt = nowMs + MAX_BEEP_MS;
  buzzerSet(true);
}

static void hit(uint8_t i, unsigned long nowMs) {
  ledSet(i, true);
  ledOffAt[i] = nowMs + HIT_LED_MS;
  beep(HIT_BEEP_MS, nowMs);
}

static void clearOutputs() {
  ledSet(0, false);
  ledSet(1, false);
  buzzerSet(false);
}

static void expireOutputs(unsigned long nowMs) {
  for (uint8_t i = 0; i < 2; i++) {
    if (ledOn[i] && (long)(nowMs - ledOffAt[i]) >= 0) ledSet(i, false);
  }
  if (buzzerOn && (long)(nowMs - buzzerOffAt) >= 0) buzzerSet(false);
}

// ---- Commands from the browser ------------------------------------------
static void handleCommand(const char *cmd, unsigned long nowMs) {
  if (strcmp(cmd, "H,1") == 0) hit(0, nowMs);
  else if (strcmp(cmd, "H,2") == 0) hit(1, nowMs);
  else if (strcmp(cmd, "B,1") == 0) beep(COUNTDOWN_BEEP_MS, nowMs);
  else if (strcmp(cmd, "B,2") == 0) beep(END_BEEP_MS, nowMs);
  else if (strcmp(cmd, "X") == 0) clearOutputs();
  else if (strcmp(cmd, "M,1") == 0) { muted = true; buzzerSet(false); }
  else if (strcmp(cmd, "M,0") == 0) muted = false;
  // Unknown or malformed commands are ignored.
}

static void readCommands(unsigned long nowMs) {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (cmdDiscard) {
      if (c == '\n') cmdDiscard = false;
      continue;
    }
    if (c == '\n') {
      cmdBuf[cmdLen] = '\0';
      if (cmdLen > 0) handleCommand(cmdBuf, nowMs);
      cmdLen = 0;
    } else if (c == '\r') {
      // ignore
    } else if (cmdLen < CMD_MAX) {
      cmdBuf[cmdLen++] = c;
    } else {
      cmdLen = 0;
      cmdDiscard = true;   // overlong line: drop through its newline
    }
  }
}

// ---- Frame output --------------------------------------------------------
static void sendFrame(unsigned long nowMs) {
  int roll[2];
  for (uint8_t i = 0; i < 2; i++) {
    roll[i] = (sensors[i].health == twinflare::HEALTH_OK) ? sensors[i].rollCentideg : 0;
  }
  int n = snprintf(lineBuf, sizeof(lineBuf), "R1,%lu,%lu,%d,%d,%d,%d,%d,%d\n",
                   seq, nowMs,
                   roll[0], buttons[0].stablePressed ? 1 : 0, (int)sensors[0].health,
                   roll[1], buttons[1].stablePressed ? 1 : 0, (int)sensors[1].health);
  if (n <= 0 || n >= (int)sizeof(lineBuf)) return;
  if (Serial.availableForWrite() < n) return;   // never block; the next frame is newer anyway
  Serial.write((const uint8_t *)lineBuf, (size_t)n);
  seq++;
}

// ---- Arduino entry points -------------------------------------------------
void setup() {
  for (uint8_t i = 0; i < 2; i++) {
    pinMode(LED_PIN[i], OUTPUT);
    digitalWrite(LED_PIN[i], LOW);
  }
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  for (uint8_t i = 0; i < 2; i++) {
    pinMode(BUTTON_PIN[i], INPUT_PULLUP);
    bool pressed = readPressed(BUTTON_PIN[i]);
    buttons[i].stablePressed = pressed;
    buttons[i].lastRaw = pressed;
    buttons[i].lastChangeMs = 0;
  }

  Serial.begin(115200);
  twinflare::recoverBus();   // a reset can interrupt a transaction; start from a clean bus
  unsigned long nowMs = millis();
  for (uint8_t i = 0; i < 2; i++) {
    twinflare::resetState(sensors[i], SENSOR_ADDR[i], ROLL_SIGN[i], MOUNT_INVERTED[i], BANK_ABOUT_Y[i]);
    twinflare::configure(sensors[i], nowMs);
  }
}

void loop() {
  unsigned long nowUs = micros();
  unsigned long nowMs = millis();

  readCommands(nowMs);
  updateButtons(nowMs);

  if (nowUs - lastSampleUs >= SAMPLE_US) {
    lastSampleUs = nowUs;
    for (uint8_t i = 0; i < 2; i++) {
      twinflare::retryIfFaulted(sensors[i], nowMs);
      twinflare::sample(sensors[i], nowUs);
    }
  }

  if (nowMs - lastFrameMs >= FRAME_MS) {
    lastFrameMs = nowMs;
    sendFrame(nowMs);
  }

  expireOutputs(nowMs);
}
